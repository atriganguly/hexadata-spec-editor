import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainText, rt } from '@hexadata/spec-core';
import { AssetCache } from '../src/assets/asset-cache.ts';
import { AUTOSAVE_MS, SessionController, useSession } from '../src/drafts/session.ts';
import { IdbDraftStore } from '../src/drafts/idb-store.ts';
import { useDoc } from '../src/store/doc.ts';
import { useUi } from '../src/store/ui.ts';

let store: IdbDraftStore;
let session: SessionController;
let n = 0;

beforeEach(() => {
  n += 1;
  store = IdbDraftStore.open(`session-db-${n}`);
  session = new SessionController(store, new AssetCache(store));
  useDoc.getState().clear();
  useSession.setState({
    drafts: [],
    trash: [],
    currentId: undefined,
    readOnly: false,
    saveStatus: 'idle',
  });
  useUi.setState({ toasts: [], dialog: null });
});

afterEach(() => {
  session.dispose();
  vi.useRealTimers();
});

const doc = () => useDoc.getState();
const title = (text: string) => doc().setText({ kind: 'field', field: 'meta.title' }, rt(text));
const settle = async () => {
  await vi.waitFor(() => expect(useSession.getState().saveStatus).not.toBe('saving'));
};

describe('boot', () => {
  it('creates a first draft from the template defaults on an empty store', async () => {
    await session.boot();
    expect(useSession.getState().booted).toBe(true);
    expect(useSession.getState().drafts).toHaveLength(1);
    expect(doc().name).toBe('Untitled spec sheet');
    expect(doc().content.keyFeatures).toHaveLength(10);
    expect(doc().templateId).toBe('classic');
  });

  it('reopens the draft that was open last', async () => {
    await session.boot();
    const second = await session.createNew({ name: 'Second' });
    await session.open(useSession.getState().drafts.find((d) => d.id !== second.id)!.id);
    const lastId = doc().draftId;

    session.dispose();
    const fresh = new SessionController(store, new AssetCache(store));
    useDoc.getState().clear();
    await fresh.boot();
    expect(doc().draftId).toBe(lastId);
    fresh.dispose();
  });

  it('reports storage failures instead of crashing', async () => {
    const broken = new SessionController(
      { ...store, purgeTrash: () => Promise.reject(new Error('IndexedDB is blocked')) } as never,
      new AssetCache(store),
    );
    await broken.boot();
    expect(useSession.getState().bootError).toMatch(/blocked/);
    broken.dispose();
  });
});

describe('autosave', () => {
  it('saves edits after a short pause, without exporting anything', async () => {
    await session.boot();
    const id = doc().draftId!;
    title('Autosaved title');
    expect(useSession.getState().saveStatus).toBe('saving');
    await vi.waitFor(
      async () =>
        expect(plainText((await store.get(id))!.content.meta.title)).toBe('Autosaved title'),
      {
        timeout: AUTOSAVE_MS * 5,
      },
    );
    await settle();
    expect(useSession.getState().saveStatus).toBe('saved');
    expect(useSession.getState().drafts[0]!.title).toBe('Autosaved title');
  });

  it('debounces bursts of edits into one save', async () => {
    await session.boot();
    const spy = vi.spyOn(store, 'save');
    for (const text of ['a', 'ab', 'abc', 'abcd']) title(text);
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    await settle();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('flush() saves immediately (Ctrl+S, tab hidden)', async () => {
    await session.boot();
    const id = doc().draftId!;
    title('Flushed');
    await session.flush();
    expect(plainText((await store.get(id))!.content.meta.title)).toBe('Flushed');
    expect(useSession.getState().saveStatus).toBe('saved');
  });

  it('persists renames and template metadata', async () => {
    await session.boot();
    const id = doc().draftId!;
    await session.rename(id, '  Renamed sheet  ');
    await session.flush();
    expect((await store.get(id))!.name).toBe('Renamed sheet');
    expect(useSession.getState().drafts[0]!.name).toBe('Renamed sheet');
  });

  it('keeps edits made while a save is in flight', async () => {
    await session.boot();
    const id = doc().draftId!;
    title('first');
    const flushing = session.flush();
    title('second');
    await flushing;
    await session.flush();
    await vi.waitFor(async () =>
      expect(plainText((await store.get(id))!.content.meta.title)).toBe('second'),
    );
  });

  it('does not lose changes when switching drafts quickly', async () => {
    await session.boot();
    const first = doc().draftId!;
    title('Unsaved edit in draft one');
    await session.createNew({ name: 'Two' }); // switches away immediately
    expect(plainText((await store.get(first))!.content.meta.title)).toBe(
      'Unsaved edit in draft one',
    );
  });

  it('reports save errors and lets the user retry', async () => {
    await session.boot();
    const original = store.save.bind(store);
    vi.spyOn(store, 'save').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    title('x');
    await session.flush();
    expect(useSession.getState().saveStatus).toBe('error');
    expect(useSession.getState().saveError).toMatch(/Storage is full/);
    vi.spyOn(store, 'save').mockImplementation(original);
    await session.retry();
    expect(useSession.getState().saveStatus).toBe('saved');
  });

  it('goes read-only when another tab changed the draft (revision conflict)', async () => {
    await session.boot();
    const id = doc().draftId!;
    await store.rename(id, 'Changed elsewhere'); // bumps the stored revision behind our back
    title('mine');
    await session.flush();
    expect(useSession.getState().readOnly).toBe(true);
    expect(useSession.getState().saveError).toMatch(/another tab/);
    expect((await store.get(id))!.name).toBe('Changed elsewhere');
  });
});

describe('draft management', () => {
  it('creates, switches and lists unlimited drafts', async () => {
    await session.boot();
    for (let i = 0; i < 12; i += 1) await session.createNew({ name: `Draft ${i}` });
    expect(useSession.getState().drafts).toHaveLength(13);
    const target = useSession.getState().drafts.at(-1)!;
    await session.open(target.id);
    expect(doc().draftId).toBe(target.id);
  });

  it('duplicates the open draft including unsaved edits', async () => {
    await session.boot();
    title('Original title');
    await session.duplicate(doc().draftId!);
    expect(doc().name).toBe('Untitled spec sheet (copy)');
    expect(plainText(doc().content.meta.title)).toBe('Original title');
  });

  it('trashing the open draft opens another and offers Undo', async () => {
    await session.boot();
    const first = doc().draftId!;
    await session.createNew({ name: 'Keep' });
    await session.open(first);
    await session.trashDraft(first);
    expect(doc().draftId).not.toBe(first);
    expect(useSession.getState().trash.map((d) => d.id)).toEqual([first]);
    const toast = useUi.getState().toasts.at(-1)!;
    expect(toast.action?.label).toBe('Undo');
    toast.action!.run();
    await vi.waitFor(() => expect(useSession.getState().trash).toHaveLength(0));
    expect(useSession.getState().drafts.map((d) => d.id)).toContain(first);
  });

  it('trashing the only draft creates a fresh one', async () => {
    await session.boot();
    const only = doc().draftId!;
    await session.trashDraft(only);
    expect(doc().draftId).not.toBe(only);
    expect(useSession.getState().drafts).toHaveLength(1);
  });

  it('empties the trash permanently', async () => {
    await session.boot();
    await session.createNew({ name: 'Doomed' });
    await session.trashDraft(doc().draftId!);
    expect(useSession.getState().trash).toHaveLength(1);
    await session.emptyTrash();
    expect(useSession.getState().trash).toHaveLength(0);
  });

  it('renames other drafts directly in storage', async () => {
    await session.boot();
    const other = await session.createNew({ name: 'Other' });
    const current = useSession.getState().drafts.find((d) => d.id !== other.id)!;
    await session.rename(current.id, 'Renamed other');
    expect((await store.get(current.id))!.name).toBe('Renamed other');
  });
});

describe('import / export through the session', () => {
  it('exports the open draft (with unsaved edits) and imports it back as a new draft', async () => {
    await session.boot();
    title('Portable');
    const exported = await session.exportCurrentDraft();
    expect(exported?.fileName).toMatch(/^untitled-spec-sheet-[a-f0-9]{8}\.hxspec$/);
    const result = await session.importBytes(exported!.bytes);
    expect(result.count).toBe(1);
    expect(useSession.getState().drafts).toHaveLength(2);
  });

  it('exports a backup of all drafts', async () => {
    await session.boot();
    await session.createNew({ name: 'B' });
    const backup = await session.exportEverything();
    expect(backup?.count).toBe(2);
  });
});
