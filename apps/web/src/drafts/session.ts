import { create } from 'zustand';
import { LIMITS } from '@hexadata/spec-core';
import { DEFAULT_TEMPLATE_ID, getTemplateMeta, loadTemplate } from '@hexadata/spec-templates';
import type { AssetCache } from '../assets/asset-cache.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';
import { draftFileName, exportBackup, exportDraft, importFile } from './hxspec.ts';
import {
  ConflictError,
  type Draft,
  type DraftMeta,
  type DraftStore,
  type StorageStats,
} from './types.ts';

export const TRASH_RETENTION_MS = 30 * 24 * 3600_000;
export const AUTOSAVE_MS = 600;
const ASSET_GC_MIN_AGE_MS = 24 * 3600_000;
const LAST_DRAFT_KEY = 'lastDraftId';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SessionState {
  booted: boolean;
  bootError: string | undefined;
  drafts: DraftMeta[];
  trash: DraftMeta[];
  currentId: string | undefined;
  saveStatus: SaveStatus;
  saveError: string | undefined;
  lastSavedAt: number | undefined;
  /** True when another tab is editing the open draft: this tab cannot change it. */
  readOnly: boolean;
  storage: StorageStats;
}

export const useSession = create<SessionState>()(() => ({
  booted: false,
  bootError: undefined,
  drafts: [],
  trash: [],
  currentId: undefined,
  saveStatus: 'idle',
  saveError: undefined,
  lastSavedAt: undefined,
  readOnly: false,
  storage: { usage: undefined, quota: undefined, persisted: undefined },
}));

const patch = (partial: Partial<SessionState>) => useSession.setState(partial);

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)
  );
}

/**
 * Connects the open document to storage: loads and creates drafts, autosaves, keeps one editing tab per
 * draft (Web Locks), keeps other tabs' lists fresh (BroadcastChannel) and guards against data loss.
 */
export class SessionController {
  private persisted: Draft | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | undefined;
  private releaseLock: (() => void) | undefined;
  private channel: BroadcastChannel | undefined;
  private loading = false;
  private asked = false;
  private bootPromise: Promise<void> | undefined;
  /** Serialises open/create/switch so two of them can never interleave (React StrictMode calls boot twice). */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly unsubscribe: () => void;

  constructor(
    readonly store: DraftStore,
    private readonly assets: AssetCache,
  ) {
    this.unsubscribe = useDoc.subscribe((state, previous) => {
      if (this.loading || !state.ready || state.revision === previous.revision) return;
      if (state.draftId !== this.persisted?.id || useSession.getState().readOnly) return;
      this.schedule(AUTOSAVE_MS);
    });
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('hd-drafts');
      this.channel.onmessage = () => void this.refreshLists();
    }
  }

  /* ---------- lifecycle ---------- */

  boot(): Promise<void> {
    this.bootPromise ??= this.doBoot();
    return this.bootPromise;
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doBoot(): Promise<void> {
    try {
      await this.store.purgeTrash(TRASH_RETENTION_MS);
      await this.refreshLists();
      const last = await this.store.getSetting<string>(LAST_DRAFT_KEY);
      const { drafts } = useSession.getState();
      const target = drafts.find((d) => d.id === last) ?? drafts[0];
      if (target) await this.openInternal(target.id);
      else await this.createNewInternal();
      patch({ booted: true, bootError: undefined });
      void this.refreshStorage();
      // Orphaned images are cleaned up when the browser is idle, never on the critical path.
      const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
        .requestIdleCallback;
      (idle ?? ((cb: () => void) => setTimeout(cb, 3000)))(
        () => void this.store.collectGarbage(ASSET_GC_MIN_AGE_MS),
      );
    } catch (error) {
      patch({
        booted: true,
        bootError:
          error instanceof Error
            ? error.message
            : 'Drafts could not be opened. Your browser may be blocking storage (private mode?).',
      });
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.channel?.close();
    if (this.timer) clearTimeout(this.timer);
    this.releaseLock?.();
  }

  /* ---------- opening and creating ---------- */

  open(id: string): Promise<void> {
    return this.exclusive(async () => {
      if (this.persisted?.id === id && !useSession.getState().readOnly) return;
      await this.openInternal(id);
    });
  }

  private async openInternal(id: string): Promise<void> {
    await this.flush();
    this.loading = true;
    try {
      const draft = await this.store.get(id);
      if (!draft) throw new Error('Draft not found.');
      this.releaseLock?.();
      this.releaseLock = undefined;
      const acquired = await this.acquireLock(id);
      await this.assets.ensure(draft.refs);
      this.assets.retain(draft.refs);
      this.persisted = draft;
      useDoc.getState().load({
        draftId: draft.id,
        name: draft.name,
        templateId: draft.templateId,
        templateVersion: draft.templateVersion,
        content: draft.content,
      });
      useUi.getState().select(null);
      patch({
        currentId: draft.id,
        readOnly: !acquired,
        saveStatus: 'idle',
        saveError: undefined,
        lastSavedAt: draft.updatedAt,
      });
      await this.store.setSetting(LAST_DRAFT_KEY, draft.id);
      useUi.getState().announce(`Opened ${draft.name}${acquired ? '' : ' (read only)'}`);
    } finally {
      this.loading = false;
    }
  }

  createNew(options: { templateId?: string; name?: string } = {}): Promise<Draft> {
    return this.exclusive(() => this.createNewInternal(options));
  }

  private async createNewInternal(
    options: { templateId?: string; name?: string } = {},
  ): Promise<Draft> {
    const templateId = options.templateId ?? DEFAULT_TEMPLATE_ID;
    const template = await loadTemplate(templateId);
    if (!template) throw new Error(`Unknown template "${templateId}".`);
    const draft = await this.store.create({
      name: options.name ?? 'Untitled spec sheet',
      templateId: template.id,
      templateVersion: template.version,
      content: template.createDefaults(),
    });
    await this.refreshLists();
    await this.openInternal(draft.id);
    this.notifyOthers();
    return draft;
  }

  /* ---------- actions on drafts ---------- */

  duplicate(id: string): Promise<void> {
    return this.exclusive(async () => {
      if (id === this.persisted?.id) await this.flush();
      const copy = await this.store.duplicate(id);
      await this.refreshLists();
      await this.openInternal(copy.id);
      this.notifyOthers();
      useUi.getState().toast(`Duplicated as “${copy.name}”`, { tone: 'success' });
    });
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim().slice(0, LIMITS.draftName) || 'Untitled spec sheet';
    if (id === this.persisted?.id) {
      useDoc.getState().setName(trimmed);
      return;
    }
    await this.store.rename(id, trimmed);
    await this.refreshLists();
    this.notifyOthers();
  }

  trashDraft(id: string): Promise<void> {
    return this.exclusive(async () => {
      const wasOpen = id === this.persisted?.id;
      if (wasOpen) await this.flush();
      await this.store.trash(id);
      await this.refreshLists();
      if (wasOpen) {
        const next = useSession.getState().drafts[0];
        if (next) await this.openInternal(next.id);
        else await this.createNewInternal();
      }
      this.notifyOthers();
      const name = this.nameOf(id);
      useUi.getState().toast(`Moved “${name}” to the trash`, {
        action: { label: 'Undo', run: () => void this.restore(id) },
      });
    });
  }

  async restore(id: string): Promise<void> {
    await this.store.restore(id);
    await this.refreshLists();
    this.notifyOthers();
    useUi.getState().toast('Draft restored', { tone: 'success' });
  }

  async deletePermanently(id: string): Promise<void> {
    await this.store.deletePermanently(id);
    await this.refreshLists();
    this.notifyOthers();
    void this.refreshStorage();
  }

  async emptyTrash(): Promise<void> {
    for (const meta of useSession.getState().trash) await this.store.deletePermanently(meta.id);
    await this.refreshLists();
    this.notifyOthers();
    void this.store.collectGarbage(0).then(() => this.refreshStorage());
  }

  async switchTemplate(templateId: string): Promise<void> {
    const meta = getTemplateMeta(templateId);
    if (!meta) return;
    useDoc.getState().setTemplate(meta.id, meta.version);
    useUi.getState().announce(`Template changed to ${meta.name}`);
  }

  /* ---------- files ---------- */

  async exportCurrentDraft(): Promise<{ bytes: Uint8Array; fileName: string } | undefined> {
    const draft = await this.currentSnapshot();
    if (!draft) return undefined;
    return {
      bytes: await exportDraft(this.store, draft),
      fileName: draftFileName(draft.name, draft.id),
    };
  }

  /** A draft file for any draft, without opening it (the open draft is exported with its unsaved edits). */
  async exportDraftById(id: string): Promise<{ bytes: Uint8Array; fileName: string } | undefined> {
    if (id === this.persisted?.id) return this.exportCurrentDraft();
    const draft = await this.store.get(id);
    if (!draft) return undefined;
    return {
      bytes: await exportDraft(this.store, draft),
      fileName: draftFileName(draft.name, draft.id),
    };
  }

  async exportEverything(): Promise<{ bytes: Uint8Array; count: number } | undefined> {
    await this.flush();
    const metas = useSession.getState().drafts;
    const drafts: Draft[] = [];
    for (const meta of metas) {
      const draft = await this.store.get(meta.id);
      if (draft) drafts.push(draft);
    }
    if (drafts.length === 0) return undefined;
    return { bytes: await exportBackup(this.store, drafts), count: drafts.length };
  }

  async importBytes(
    bytes: Uint8Array,
  ): Promise<{ count: number; warnings: string[]; firstId?: string }> {
    const result = await importFile(this.store, bytes);
    await this.refreshLists();
    this.notifyOthers();
    void this.refreshStorage();
    return {
      count: result.drafts.length,
      warnings: result.warnings,
      firstId: result.drafts[0]?.id,
    };
  }

  /* ---------- multi-tab ---------- */

  /** Becomes the editing tab for the open draft, taking it over from another tab. */
  takeOver(): Promise<void> {
    return this.exclusive(() => this.takeOverInternal());
  }

  private async takeOverInternal(): Promise<void> {
    const id = this.persisted?.id;
    if (!id) return;
    this.releaseLock?.();
    this.releaseLock = undefined;
    await this.acquireLock(id, true);
    const fresh = await this.store.get(id);
    if (fresh) {
      this.loading = true;
      try {
        this.persisted = fresh;
        useDoc.getState().load({
          draftId: fresh.id,
          name: fresh.name,
          templateId: fresh.templateId,
          templateVersion: fresh.templateVersion,
          content: fresh.content,
        });
      } finally {
        this.loading = false;
      }
    }
    patch({ readOnly: false, saveStatus: 'idle', saveError: undefined });
  }

  private acquireLock(id: string, steal = false): Promise<boolean> {
    const locks = (typeof navigator !== 'undefined' ? navigator.locks : undefined) as
      LockManager | undefined;
    if (!locks) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      locks
        .request(`hd-draft:${id}`, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise<void>((release) => {
            this.releaseLock = release;
          });
        })
        .catch(() => {
          // Another tab took the lock over: this tab becomes read-only.
          if (this.persisted?.id === id) patch({ readOnly: true });
        });
    });
  }

  /* ---------- saving ---------- */

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    patch({ saveStatus: 'saving', saveError: undefined });
    this.timer = setTimeout(() => void this.persist(), delay);
  }

  /** Saves immediately (Ctrl+S, before switching drafts, when the tab is hidden). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      await this.persist();
    }
    await this.saving;
  }

  retry = (): Promise<void> => this.persist();

  private persist(): Promise<void> {
    this.timer = undefined;
    this.saving = (this.saving ?? Promise.resolve()).then(() => this.doPersist());
    return this.saving;
  }

  private async doPersist(): Promise<void> {
    const base = this.persisted;
    const doc = useDoc.getState();
    if (!base || !doc.ready || doc.draftId !== base.id || useSession.getState().readOnly) return;
    const revisionAtStart = doc.revision;
    patch({ saveStatus: 'saving' });
    try {
      const saved = await this.store.save(
        {
          ...base,
          name: doc.name ?? base.name,
          templateId: doc.templateId ?? base.templateId,
          templateVersion: doc.templateVersion ?? base.templateVersion,
          content: doc.content,
        },
        base.revision,
      );
      this.persisted = saved;
      const { content: _content, ...meta } = saved;
      patch({
        drafts: [meta, ...useSession.getState().drafts.filter((d) => d.id !== meta.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
        lastSavedAt: saved.updatedAt,
        saveStatus: useDoc.getState().revision === revisionAtStart ? 'saved' : 'saving',
        saveError: undefined,
      });
      if (useDoc.getState().revision !== revisionAtStart) this.schedule(AUTOSAVE_MS);
      this.notifyOthers();
      void this.askForPersistentStorage();
    } catch (error) {
      if (error instanceof ConflictError) {
        patch({
          readOnly: true,
          saveStatus: 'error',
          saveError: 'This draft was changed in another tab.',
        });
        return;
      }
      patch({
        saveStatus: 'error',
        saveError: isQuotaError(error)
          ? 'Storage is full. Export a backup and delete some drafts to free space.'
          : 'Your latest changes could not be saved. They are still in this tab.',
      });
    }
  }

  /* ---------- lists, stats ---------- */

  async refreshLists(): Promise<void> {
    const [drafts, trash] = await Promise.all([this.store.list(), this.store.listTrash()]);
    patch({ drafts, trash });
  }

  async refreshStorage(): Promise<void> {
    try {
      const estimate = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      patch({ storage: { usage: estimate?.usage, quota: estimate?.quota, persisted } });
    } catch {
      /* Storage API unavailable */
    }
  }

  private async askForPersistentStorage(): Promise<void> {
    if (this.asked) return;
    this.asked = true;
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* best effort */
    }
    void this.refreshStorage();
  }

  private notifyOthers(): void {
    this.channel?.postMessage({ type: 'changed' });
  }

  private nameOf(id: string): string {
    const { drafts, trash } = useSession.getState();
    return [...drafts, ...trash].find((d) => d.id === id)?.name ?? 'draft';
  }

  /** The open draft with unsaved changes applied (for export). */
  async currentSnapshot(): Promise<Draft | undefined> {
    await this.flush();
    const doc = useDoc.getState();
    const base = this.persisted;
    if (!base || !doc.ready) return undefined;
    return {
      ...base,
      name: doc.name ?? base.name,
      templateId: doc.templateId ?? base.templateId,
      templateVersion: doc.templateVersion ?? base.templateVersion,
      content: doc.content,
    };
  }
}
