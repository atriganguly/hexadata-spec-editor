import type { SpecSheetContent } from '@hexadata/spec-core';

/** Light record shown in lists (never contains the content body, so listing thousands of drafts stays cheap). */
export interface DraftMeta {
  id: string;
  name: string;
  /** Plain-text title of the sheet, for display and search. */
  title: string;
  templateId: string;
  templateVersion: number;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  /** Set when the draft is in the trash. */
  deletedAt?: number;
  /** Incremented on every save; used for optimistic concurrency. */
  revision: number;
  /** `asset:<sha256>` references used by the content (for garbage collection and export). */
  refs: string[];
}

export interface Draft extends DraftMeta {
  content: SpecSheetContent;
}

export interface AssetRecord {
  hash: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  thumb?: Blob;
}

export interface StorageStats {
  usage: number | undefined;
  quota: number | undefined;
  persisted: boolean | undefined;
}

export type NewDraft = Pick<Draft, 'name' | 'templateId' | 'templateVersion' | 'content'>;

export class ConflictError extends Error {
  override name = 'ConflictError';
  constructor(message = 'This draft was changed in another tab.') {
    super(message);
  }
}

export class NotFoundError extends Error {
  override name = 'NotFoundError';
  constructor(message = 'Draft not found.') {
    super(message);
  }
}

/**
 * Persistence boundary. The editor only talks to this interface, so a server/cloud implementation can replace
 * IndexedDB later without touching UI code.
 */
export interface DraftStore {
  list(): Promise<DraftMeta[]>;
  listTrash(): Promise<DraftMeta[]>;
  get(id: string): Promise<Draft | undefined>;
  create(input: NewDraft): Promise<Draft>;
  /** Writes the draft if the stored revision equals `expectedRevision`; throws ConflictError otherwise. */
  save(draft: Draft, expectedRevision: number): Promise<Draft>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string): Promise<Draft>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  deletePermanently(id: string): Promise<void>;
  /** Removes trashed drafts older than `olderThanMs`. Returns how many were removed. */
  purgeTrash(olderThanMs: number): Promise<number>;

  getAsset(hash: string): Promise<AssetRecord | undefined>;
  putAsset(asset: AssetRecord): Promise<void>;
  /** Removes assets no draft references (and older than `minAgeMs`). Returns how many were removed. */
  collectGarbage(minAgeMs: number): Promise<number>;

  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;
}
