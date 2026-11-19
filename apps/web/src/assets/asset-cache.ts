import { create } from 'zustand';
import { assetHash } from '@hexadata/spec-templates';
import type { AssetRef } from '@hexadata/spec-core';
import type { DraftStore } from '../drafts/types.ts';

/** Bumps whenever a new image URL becomes available, so the sheet re-renders with it. */
export const useAssetVersion = create<{ version: number }>(() => ({ version: 0 }));

/**
 * Object URLs for uploaded images. Blobs live in IndexedDB (deduplicated by hash); the editor needs
 * synchronous URLs, so they are loaded ahead of time and cached here. Unused URLs are revoked when
 * switching drafts so memory stays flat no matter how many drafts are opened.
 */
export class AssetCache {
  private readonly urls = new Map<string, string>();
  private readonly loading = new Map<string, Promise<void>>();

  constructor(private readonly store: Pick<DraftStore, 'getAsset'>) {}

  urlFor = (ref: AssetRef): string | undefined => {
    const hash = assetHash(ref);
    return hash ? this.urls.get(hash) : undefined;
  };

  /** Loads the images referenced by `refs` that are not cached yet. */
  async ensure(refs: readonly AssetRef[]): Promise<void> {
    const wanted = refs
      .map(assetHash)
      .filter((hash): hash is string => !!hash && !this.urls.has(hash));
    if (wanted.length === 0) return;
    await Promise.all(wanted.map((hash) => this.load(hash)));
    useAssetVersion.setState((state) => ({ version: state.version + 1 }));
  }

  private load(hash: string): Promise<void> {
    let pending = this.loading.get(hash);
    if (!pending) {
      pending = (async () => {
        const record = await this.store.getAsset(hash);
        if (record && !this.urls.has(hash)) this.urls.set(hash, URL.createObjectURL(record.blob));
      })().finally(() => this.loading.delete(hash));
      this.loading.set(hash, pending);
    }
    return pending;
  }

  /** Registers a freshly processed image so it shows immediately. */
  add(hash: string, blob: Blob): void {
    if (!this.urls.has(hash)) this.urls.set(hash, URL.createObjectURL(blob));
    useAssetVersion.setState((state) => ({ version: state.version + 1 }));
  }

  /** Revokes URLs of images no longer referenced by the open draft. */
  retain(refs: readonly AssetRef[]): void {
    const keep = new Set(refs.map(assetHash).filter(Boolean));
    for (const [hash, url] of this.urls) {
      if (!keep.has(hash)) {
        URL.revokeObjectURL(url);
        this.urls.delete(hash);
      }
    }
  }

  get size(): number {
    return this.urls.size;
  }
}
