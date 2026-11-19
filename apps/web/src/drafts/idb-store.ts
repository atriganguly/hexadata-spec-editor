import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  LIMITS,
  newId,
  plainText,
  SCHEMA_VERSION,
  type AssetRef,
  type SpecSheetContent,
} from '@hexadata/spec-core';
import {
  ConflictError,
  NotFoundError,
  type AssetRecord,
  type Draft,
  type DraftMeta,
  type DraftStore,
  type NewDraft,
} from './types.ts';

interface HexaDB extends DBSchema {
  drafts: {
    key: string;
    value: DraftMeta;
    indexes: { updatedAt: number; deletedAt: number };
  };
  bodies: {
    key: string;
    value: { id: string; content: SpecSheetContent };
  };
  assets: {
    key: string;
    value: AssetRecord;
  };
  settings: {
    key: string;
    value: unknown;
  };
}

export const DB_NAME = 'hexadata-spec-editor';
const DB_VERSION = 1;

export function openHexaDb(name = DB_NAME): Promise<IDBPDatabase<HexaDB>> {
  return openDB<HexaDB>(name, DB_VERSION, {
    upgrade(db) {
      const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
      drafts.createIndex('updatedAt', 'updatedAt');
      drafts.createIndex('deletedAt', 'deletedAt');
      db.createObjectStore('bodies', { keyPath: 'id' });
      db.createObjectStore('assets', { keyPath: 'hash' });
      db.createObjectStore('settings');
    },
  });
}

/** `asset:<hash>` references used by a content object, for garbage collection. */
export function collectRefs(content: SpecSheetContent): AssetRef[] {
  const refs = content.partnerLogos.map((logo) => logo.ref);
  if (content.productImage) refs.push(content.productImage);
  return [...new Set(refs.filter((ref) => ref.startsWith('asset:')))];
}

function toMeta(draft: Draft): DraftMeta {
  const { content, ...meta } = draft;
  return {
    ...meta,
    title: plainText(content.meta.title).replace(/\s+/g, ' ').trim().slice(0, LIMITS.title),
    refs: collectRefs(content),
  };
}

/** Aborts a transaction without leaving an unhandled `tx.done` rejection behind. */
function abort(tx: { abort(): void; done: Promise<void> }): void {
  tx.done.catch(() => undefined);
  tx.abort();
}

export class IdbDraftStore implements DraftStore {
  constructor(private readonly dbPromise: Promise<IDBPDatabase<HexaDB>>) {}

  static open(name?: string): IdbDraftStore {
    return new IdbDraftStore(openHexaDb(name));
  }

  async close(): Promise<void> {
    (await this.dbPromise).close();
  }

  async list(): Promise<DraftMeta[]> {
    const all = await (await this.dbPromise).getAll('drafts');
    return all
      .filter((meta) => meta.deletedAt === undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listTrash(): Promise<DraftMeta[]> {
    const all = await (await this.dbPromise).getAllFromIndex('drafts', 'deletedAt');
    return all.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  }

  async get(id: string): Promise<Draft | undefined> {
    const db = await this.dbPromise;
    const tx = db.transaction(['drafts', 'bodies'], 'readonly');
    const [meta, body] = await Promise.all([
      tx.objectStore('drafts').get(id),
      tx.objectStore('bodies').get(id),
    ]);
    await tx.done;
    return meta && body ? { ...meta, content: body.content } : undefined;
  }

  async create(input: NewDraft): Promise<Draft> {
    const now = Date.now();
    const draft: Draft = {
      id: newId(),
      name: input.name.slice(0, LIMITS.draftName),
      title: '',
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      refs: [],
      content: structuredClone(input.content),
    };
    const meta = toMeta(draft);
    const db = await this.dbPromise;
    const tx = db.transaction(['drafts', 'bodies'], 'readwrite');
    tx.objectStore('drafts').put(meta);
    tx.objectStore('bodies').put({ id: draft.id, content: draft.content });
    await tx.done;
    return { ...meta, content: draft.content };
  }

  async save(draft: Draft, expectedRevision: number): Promise<Draft> {
    const db = await this.dbPromise;
    const tx = db.transaction(['drafts', 'bodies'], 'readwrite');
    const drafts = tx.objectStore('drafts');
    const current = await drafts.get(draft.id);
    if (!current) {
      abort(tx);
      throw new NotFoundError();
    }
    if (current.revision !== expectedRevision) {
      abort(tx);
      throw new ConflictError();
    }
    const next: Draft = {
      ...draft,
      name: draft.name.slice(0, LIMITS.draftName),
      schemaVersion: SCHEMA_VERSION,
      createdAt: current.createdAt,
      deletedAt: current.deletedAt,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    };
    const meta = toMeta(next);
    drafts.put(meta);
    tx.objectStore('bodies').put({ id: draft.id, content: next.content });
    await tx.done;
    return { ...meta, content: next.content };
  }

  async rename(id: string, name: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('drafts', 'readwrite');
    const meta = await tx.store.get(id);
    if (!meta) {
      abort(tx);
      throw new NotFoundError();
    }
    await tx.store.put({
      ...meta,
      name: name.slice(0, LIMITS.draftName),
      updatedAt: Date.now(),
      revision: meta.revision + 1,
    });
    await tx.done;
  }

  async duplicate(id: string): Promise<Draft> {
    const source = await this.get(id);
    if (!source) throw new NotFoundError();
    return this.create({
      name: `${source.name} (copy)`.slice(0, LIMITS.draftName),
      templateId: source.templateId,
      templateVersion: source.templateVersion,
      content: source.content,
    });
  }

  async trash(id: string): Promise<void> {
    await this.mutateMeta(id, (meta) => ({ ...meta, deletedAt: Date.now() }));
  }

  async restore(id: string): Promise<void> {
    await this.mutateMeta(id, (meta) => {
      const { deletedAt: _removed, ...rest } = meta;
      return { ...rest, updatedAt: Date.now() };
    });
  }

  private async mutateMeta(id: string, change: (meta: DraftMeta) => DraftMeta): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('drafts', 'readwrite');
    const meta = await tx.store.get(id);
    if (!meta) {
      abort(tx);
      throw new NotFoundError();
    }
    const next = change(meta);
    await tx.store.put({ ...next, revision: meta.revision + 1 });
    await tx.done;
  }

  async deletePermanently(id: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['drafts', 'bodies'], 'readwrite');
    tx.objectStore('drafts').delete(id);
    tx.objectStore('bodies').delete(id);
    await tx.done;
  }

  async purgeTrash(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const trashed = await this.listTrash();
    const expired = trashed.filter((meta) => (meta.deletedAt ?? Infinity) <= cutoff);
    for (const meta of expired) await this.deletePermanently(meta.id);
    return expired.length;
  }

  async getAsset(hash: string): Promise<AssetRecord | undefined> {
    return (await this.dbPromise).get('assets', hash);
  }

  async putAsset(asset: AssetRecord): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('assets', 'readwrite');
    // Content-addressed: an existing record is identical, keep it (and its original createdAt).
    if (!(await tx.store.get(asset.hash))) await tx.store.put(asset);
    await tx.done;
  }

  async collectGarbage(minAgeMs: number): Promise<number> {
    const db = await this.dbPromise;
    const referenced = new Set<string>();
    for (const meta of await db.getAll('drafts')) {
      for (const ref of meta.refs) referenced.add(ref.replace(/^asset:/, ''));
    }
    const cutoff = Date.now() - minAgeMs;
    const tx = db.transaction('assets', 'readwrite');
    let removed = 0;
    let cursor = await tx.store.openCursor();
    while (cursor) {
      const asset = cursor.value;
      if (!referenced.has(asset.hash) && asset.createdAt <= cutoff) {
        await cursor.delete();
        removed += 1;
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return removed;
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await (await this.dbPromise).get('settings', key)) as T | undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await (await this.dbPromise).put('settings', value, key);
  }
}
