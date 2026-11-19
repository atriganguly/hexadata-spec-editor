import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyContent, rt, type SpecSheetContent } from '@hexadata/spec-core';
import { loadTemplate } from '@hexadata/spec-templates';
import { collectRefs, IdbDraftStore } from '../src/drafts/idb-store.ts';
import { ConflictError, NotFoundError, type AssetRecord } from '../src/drafts/types.ts';

let store: IdbDraftStore;
let counter = 0;

beforeEach(() => {
  counter += 1;
  store = IdbDraftStore.open(`test-db-${counter}`);
});

const sample = async (): Promise<SpecSheetContent> =>
  (await loadTemplate('classic'))!.createDefaults();
const input = async (name = 'Sheet') => ({
  name,
  templateId: 'classic',
  templateVersion: 1,
  content: await sample(),
});
const asset = (hash: string, createdAt = Date.now()): AssetRecord => ({
  hash,
  blob: new Blob(['x'], { type: 'image/webp' }),
  mime: 'image/webp',
  width: 10,
  height: 10,
  bytes: 1,
  createdAt,
});

describe('create / get / list', () => {
  it('stores a draft and returns it with meta', async () => {
    const draft = await store.create(await input('My sheet'));
    expect(draft.revision).toBe(1);
    expect(draft.title).toBe('HD-RS2200 Version : G294');
    const loaded = await store.get(draft.id);
    expect(loaded?.name).toBe('My sheet');
    expect(loaded?.content.keyFeatures).toHaveLength(10);
    expect(await store.get('missing')).toBeUndefined();
  });

  it('lists newest first and without content bodies', async () => {
    const a = await store.create(await input('A'));
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.create(await input('B'));
    const list = await store.list();
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
    expect('content' in list[0]!).toBe(false);
  });

  it('does not alias the caller content (mutating it later cannot corrupt the stored draft)', async () => {
    const content = await sample();
    const draft = await store.create({
      name: 'x',
      templateId: 'classic',
      templateVersion: 1,
      content,
    });
    content.meta.title = rt('mutated');
    expect((await store.get(draft.id))?.content.meta.title).not.toEqual(rt('mutated'));
  });

  it('lists 1000 drafts quickly (list never loads bodies)', async () => {
    const content = createEmptyContent();
    for (let i = 0; i < 1000; i += 1) {
      await store.create({
        name: `Draft ${i}`,
        templateId: 'classic',
        templateVersion: 1,
        content,
      });
    }
    const start = performance.now();
    const list = await store.list();
    const ms = performance.now() - start;
    expect(list).toHaveLength(1000);
    expect(ms).toBeLessThan(1500);
  }, 60_000);
});

describe('save and revisions', () => {
  it('saves with optimistic concurrency', async () => {
    const draft = await store.create(await input());
    const edited = { ...draft, name: 'Renamed' };
    const saved = await store.save(edited, draft.revision);
    expect(saved.revision).toBe(draft.revision + 1);
    expect(saved.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);
    await expect(store.save(edited, draft.revision)).rejects.toBeInstanceOf(ConflictError);
  });

  it('refreshes title and asset refs from the content', async () => {
    const draft = await store.create(await input());
    const content = structuredClone(draft.content);
    content.meta.title = rt('Brand new title');
    content.productImage = `asset:${'a'.repeat(64)}`;
    const saved = await store.save({ ...draft, content }, draft.revision);
    expect(saved.title).toBe('Brand new title');
    expect(saved.refs).toEqual([`asset:${'a'.repeat(64)}`]);
    expect((await store.list())[0]!.refs).toEqual(saved.refs);
  });

  it('rejects saves of drafts that no longer exist', async () => {
    const draft = await store.create(await input());
    await store.deletePermanently(draft.id);
    await expect(store.save(draft, draft.revision)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('collects asset references without duplicates or builtin ids', async () => {
    const content = await sample();
    content.partnerLogos = [
      { id: '1', ref: `asset:${'b'.repeat(64)}` },
      { id: '2', ref: `asset:${'b'.repeat(64)}` },
      { id: '3', ref: 'builtin:partner-logo-1' },
    ];
    content.productImage = null;
    expect(collectRefs(content)).toEqual([`asset:${'b'.repeat(64)}`]);
  });
});

describe('rename / duplicate', () => {
  it('renames and duplicates', async () => {
    const draft = await store.create(await input('Original'));
    await store.rename(draft.id, 'Renamed');
    expect((await store.get(draft.id))?.name).toBe('Renamed');
    const copy = await store.duplicate(draft.id);
    expect(copy.id).not.toBe(draft.id);
    expect(copy.name).toBe('Renamed (copy)');
    expect(copy.content).toEqual((await store.get(draft.id))!.content);
    await expect(store.rename('missing', 'x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.duplicate('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('trash', () => {
  it('moves drafts to the trash and back without losing content', async () => {
    const draft = await store.create(await input('Keep me'));
    await store.trash(draft.id);
    expect(await store.list()).toHaveLength(0);
    const trash = await store.listTrash();
    expect(trash.map((d) => d.id)).toEqual([draft.id]);
    expect(trash[0]!.deletedAt).toBeTypeOf('number');
    // still loadable (e.g. for preview or restore)
    expect((await store.get(draft.id))?.content.keyFeatures).toHaveLength(10);

    await store.restore(draft.id);
    expect(await store.listTrash()).toHaveLength(0);
    const [restored] = await store.list();
    expect(restored?.id).toBe(draft.id);
    expect(restored?.deletedAt).toBeUndefined();
  });

  it('deletes permanently', async () => {
    const draft = await store.create(await input());
    await store.trash(draft.id);
    await store.deletePermanently(draft.id);
    expect(await store.get(draft.id)).toBeUndefined();
    expect(await store.listTrash()).toHaveLength(0);
  });

  it('purges only drafts trashed longer ago than the retention window', async () => {
    const old = await store.create(await input('old'));
    const recent = await store.create(await input('recent'));
    const live = await store.create(await input('live'));
    await store.trash(old.id);
    await new Promise((r) => setTimeout(r, 30));
    await store.trash(recent.id);
    const removed = await store.purgeTrash(20);
    expect(removed).toBe(1);
    expect((await store.listTrash()).map((d) => d.id)).toEqual([recent.id]);
    expect((await store.list()).map((d) => d.id)).toEqual([live.id]);
    expect(await store.get(old.id)).toBeUndefined();
  });
});

describe('assets and garbage collection', () => {
  it('stores assets content-addressed (first write wins)', async () => {
    const hash = 'c'.repeat(64);
    await store.putAsset(asset(hash, 1000));
    await store.putAsset({ ...asset(hash, 9999), bytes: 42 });
    const loaded = await store.getAsset(hash);
    expect(loaded?.createdAt).toBe(1000);
    expect(loaded?.bytes).toBe(1);
    expect(await store.getAsset('missing')).toBeUndefined();
  });

  it('removes only unreferenced, old-enough assets', async () => {
    const used = 'd'.repeat(64);
    const orphanOld = 'e'.repeat(64);
    const orphanNew = 'f'.repeat(64);
    const inTrash = '1'.repeat(64);
    const day = 24 * 3600_000;
    await store.putAsset(asset(used, Date.now() - 5 * day));
    await store.putAsset(asset(orphanOld, Date.now() - 5 * day));
    await store.putAsset(asset(orphanNew, Date.now()));
    await store.putAsset(asset(inTrash, Date.now() - 5 * day));

    const a = await store.create(await input('uses asset'));
    const contentA = structuredClone(a.content);
    contentA.productImage = `asset:${used}`;
    await store.save({ ...a, content: contentA }, a.revision);

    const b = await store.create(await input('trashed'));
    const contentB = structuredClone(b.content);
    contentB.productImage = `asset:${inTrash}`;
    await store.save({ ...b, content: contentB }, b.revision);
    await store.trash(b.id);

    const removed = await store.collectGarbage(day);
    expect(removed).toBe(1);
    expect(await store.getAsset(orphanOld)).toBeUndefined();
    expect(await store.getAsset(used)).toBeDefined();
    expect(await store.getAsset(orphanNew)).toBeDefined(); // too young
    expect(await store.getAsset(inTrash)).toBeDefined(); // trash still protects its assets
  });
});

describe('settings', () => {
  it('round-trips values', async () => {
    expect(await store.getSetting('lastDraft')).toBeUndefined();
    await store.setSetting('lastDraft', 'abc');
    await store.setSetting('prefs', { zoom: 1.25 });
    expect(await store.getSetting('lastDraft')).toBe('abc');
    expect(await store.getSetting('prefs')).toEqual({ zoom: 1.25 });
  });
});
