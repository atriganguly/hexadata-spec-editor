import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { zipSync, strToU8, unzipSync } from 'fflate';
import { plainText, rt } from '@hexadata/spec-core';
import { loadTemplate } from '@hexadata/spec-templates';
import {
  exportBackup,
  exportDraft,
  importFile,
  ImportError,
  draftFileName,
} from '../src/drafts/hxspec.ts';
import { IdbDraftStore } from '../src/drafts/idb-store.ts';
import { sha256Hex } from '../src/assets/image-core.ts';

let store: IdbDraftStore;
let n = 0;
beforeEach(() => {
  n += 1;
  store = IdbDraftStore.open(`hx-db-${n}`);
});

async function png(color = 120) {
  return new Uint8Array(
    await sharp({
      create: { width: 30, height: 20, channels: 3, background: { r: color, g: 40, b: 80 } },
    })
      .png()
      .toBuffer(),
  );
}

async function draftWithImage() {
  const template = (await loadTemplate('classic'))!;
  const bytes = await png();
  const hash = await sha256Hex(new Blob([bytes as BlobPart]));
  await store.putAsset({
    hash,
    blob: new Blob([bytes as BlobPart], { type: 'image/png' }),
    mime: 'image/png',
    width: 30,
    height: 20,
    bytes: bytes.byteLength,
    createdAt: Date.now(),
  });
  const content = template.createDefaults();
  content.meta.title = rt('Exported sheet');
  content.productImage = `asset:${hash}`;
  const created = await store.create({
    name: 'Export Me',
    templateId: 'classic',
    templateVersion: 1,
    content,
  });
  return { draft: (await store.get(created.id))!, hash, bytes };
}

describe('draft files', () => {
  it('round-trips a draft with its uploaded image into a NEW draft', async () => {
    const { draft, hash } = await draftWithImage();
    const archive = await exportDraft(store, draft);

    const other = IdbDraftStore.open(`hx-db-other-${n}`);
    const result = await importFile(other, archive);
    expect(result.warnings).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    const imported = result.drafts[0]!;
    expect(imported.id).not.toBe(draft.id);
    expect(imported.name).toBe('Export Me');
    expect(plainText(imported.content.meta.title)).toBe('Exported sheet');
    expect(imported.content.productImage).toBe(`asset:${hash}`);
    expect((await other.getAsset(hash))?.bytes).toBeGreaterThan(0);
    expect(imported.content.keyFeatures).toHaveLength(10);
  });

  it('contains draft.json and the image under assets/', async () => {
    const { draft, hash } = await draftWithImage();
    const entries = unzipSync(await exportDraft(store, draft));
    expect(Object.keys(entries).sort()).toEqual(['draft.json', `assets/${hash}.png`].sort());
    const json = JSON.parse(new TextDecoder().decode(entries['draft.json']));
    expect(json.format).toBe('hexadata-spec-draft');
    expect(json.document.schemaVersion).toBe(1);
  });

  it('imports into the same store without overwriting the original', async () => {
    const { draft } = await draftWithImage();
    const archive = await exportDraft(store, draft);
    await importFile(store, archive);
    await importFile(store, archive);
    expect(await store.list()).toHaveLength(3);
    expect(await store.get(draft.id)).toBeDefined();
  });

  it('removes images that are missing from the archive and says so', async () => {
    const { draft } = await draftWithImage();
    const entries = unzipSync(await exportDraft(store, draft));
    for (const key of Object.keys(entries)) if (key.startsWith('assets/')) delete entries[key];
    const result = await importFile(store, zipSync(entries));
    expect(result.warnings.join(' ')).toMatch(/missing/);
    expect(result.drafts[0]!.content.productImage).toBeNull();
  });

  it('rejects images whose bytes do not match their checksum or are not images', async () => {
    const { draft, hash } = await draftWithImage();
    const entries = unzipSync(await exportDraft(store, draft));
    entries[`assets/${hash}.png`] = await png(10); // different (valid) image under the old hash
    let result = await importFile(store, zipSync(entries));
    expect(result.warnings.join(' ')).toMatch(/checksum/);
    expect(result.drafts[0]!.content.productImage).toBeNull();

    entries[`assets/${hash}.png`] = strToU8('<script>alert(1)</script>');
    result = await importFile(store, zipSync(entries));
    expect(result.warnings.join(' ')).toMatch(/unusable/);
    expect(result.drafts[0]!.content.productImage).toBeNull();
  });

  it('rejects damaged, foreign and hostile files without side effects', async () => {
    const before = (await store.list()).length;
    const cases: Array<[string, Uint8Array]> = [
      ['garbage', new Uint8Array([1, 2, 3, 4])],
      ['not a draft', zipSync({ 'hello.txt': strToU8('hi') })],
      ['wrong format', zipSync({ 'draft.json': strToU8(JSON.stringify({ format: 'nope' })) })],
      ['bad json', zipSync({ 'draft.json': strToU8('{not json') })],
      [
        'unknown template',
        zipSync({
          'draft.json': strToU8(
            JSON.stringify({
              format: 'hexadata-spec-draft',
              formatVersion: 1,
              name: 'x',
              document: {
                schemaVersion: 1,
                templateId: 'ghost',
                templateVersion: 1,
                content: (await loadTemplate('classic'))!.createDefaults(),
              },
            }),
          ),
        }),
      ],
      [
        'invalid content',
        zipSync({
          'draft.json': strToU8(
            JSON.stringify({
              format: 'hexadata-spec-draft',
              formatVersion: 1,
              name: 'x',
              document: {
                schemaVersion: 1,
                templateId: 'classic',
                templateVersion: 1,
                content: { evil: true },
              },
            }),
          ),
        }),
      ],
    ];
    for (const [label, bytes] of cases) {
      await expect(importFile(store, bytes), label).rejects.toBeInstanceOf(ImportError);
    }
    expect((await store.list()).length).toBe(before);
  });

  it('refuses oversized files', async () => {
    await expect(importFile(store, new Uint8Array(51 * 1024 * 1024))).rejects.toThrow(/50 MB/);
  });

  it('sanitises content from the file (HTML in text stays plain text)', async () => {
    const { draft } = await draftWithImage();
    const entries = unzipSync(await exportDraft(store, draft));
    const json = JSON.parse(new TextDecoder().decode(entries['draft.json']));
    json.document.content.meta.title = [[{ t: '<img src=x onerror=alert(1)>' }]];
    entries['draft.json'] = strToU8(JSON.stringify(json));
    const result = await importFile(store, zipSync(entries));
    expect(plainText(result.drafts[0]!.content.meta.title)).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('backups', () => {
  it('exports and restores many drafts', async () => {
    const a = await draftWithImage();
    const template = (await loadTemplate('classic'))!;
    const b = await store.create({
      name: 'Second',
      templateId: 'classic',
      templateVersion: 1,
      content: template.createDefaults(),
    });
    const archive = await exportBackup(store, [a.draft, (await store.get(b.id))!]);

    const other = IdbDraftStore.open(`hx-db-backup-${n}`);
    const result = await importFile(other, archive);
    expect(result.drafts).toHaveLength(2);
    expect((await other.list()).map((d) => d.name).sort()).toEqual(['Export Me', 'Second']);
  });

  it('produces safe, unique file names', () => {
    expect(draftFileName('HD-RS2200 / Rev: 2', 'abcdef12-3456')).toBe(
      'hd-rs2200-rev-2-abcdef12.hxspec',
    );
    expect(draftFileName('日本', 'abcdef12-3456')).toBe('draft-abcdef12.hxspec');
  });
});
