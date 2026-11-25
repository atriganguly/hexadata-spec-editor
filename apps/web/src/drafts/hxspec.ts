import {
  checkImage,
  migrateDocument,
  SCHEMA_VERSION,
  type AssetRef,
  type SpecDocument,
} from '@hexadata/spec-core';
import { builtinId, getTemplateMeta } from '@hexadata/spec-templates';
import { APP_VERSION } from '../lib/env.ts';
import { sha256Hex } from '../assets/image-core.ts';
import { collectRefs } from './idb-store.ts';
import type { Draft, DraftStore } from './types.ts';

/**
 * `.hxspec` is a zip: `draft.json` + `assets/<sha256>.<ext>`. It carries everything needed to reopen a draft on
 * another machine. A backup of many drafts is a zip of `.hxspec` files plus `manifest.json`.
 */
export const HXSPEC_FORMAT = 'hexadata-spec-draft';
export const BACKUP_FORMAT = 'hexadata-spec-backup';
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

interface DraftFileJson {
  format: typeof HXSPEC_FORMAT;
  formatVersion: 1;
  exportedAt: string;
  app: string;
  name: string;
  document: SpecDocument;
}

export class ImportError extends Error {
  override name = 'ImportError';
}

export interface ImportResult {
  drafts: Draft[];
  warnings: string[];
}

export const draftFileName = (name: string, id: string): string => {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'draft';
  return `${slug}-${id.slice(0, 8)}.hxspec`;
};

const fflate = () => import('fflate');

/** Serialises one draft (with its uploaded images) to a `.hxspec` archive. */
export async function exportDraft(
  store: Pick<DraftStore, 'getAsset'>,
  draft: Draft,
): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await fflate();
  const json: DraftFileJson = {
    format: HXSPEC_FORMAT,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    app: APP_VERSION,
    name: draft.name,
    document: {
      schemaVersion: SCHEMA_VERSION,
      templateId: draft.templateId,
      templateVersion: draft.templateVersion,
      content: draft.content,
    },
  };
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'draft.json': strToU8(JSON.stringify(json, null, 2)),
  };
  for (const ref of collectRefs(draft.content)) {
    const hash = ref.slice('asset:'.length);
    const record = await store.getAsset(hash);
    if (!record) continue; // reported on import as a missing image
    const ext = EXT[record.mime] ?? 'bin';
    files[`assets/${hash}.${ext}`] = [
      new Uint8Array(await record.blob.arrayBuffer()),
      { level: 0 },
    ];
  }
  return zipSync(files, { level: 6 });
}

/** One archive with every given draft, for backups and moving between machines. */
export async function exportBackup(
  store: Pick<DraftStore, 'getAsset'>,
  drafts: readonly Draft[],
): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await fflate();
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'manifest.json': strToU8(
      JSON.stringify({
        format: BACKUP_FORMAT,
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        app: APP_VERSION,
        count: drafts.length,
      }),
    ),
  };
  for (const draft of drafts) {
    files[`drafts/${draftFileName(draft.name, draft.id)}`] = [
      await exportDraft(store, draft),
      { level: 0 },
    ];
  }
  return zipSync(files, { level: 0 });
}

type Entries = Record<string, Uint8Array>;

/** Uncompressed bytes one import may expand to, shared by a backup and every draft archive inside it. */
const MAX_EXPANDED_BYTES = 4 * MAX_IMPORT_BYTES;

async function unzip(bytes: Uint8Array, budget: { left: number }): Promise<Entries> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ImportError('That file is larger than 50 MB.');
  const { unzipSync } = await fflate();
  const tooMuch = () => new ImportError('That archive expands to too much data.');
  try {
    // Declared sizes come from the zip headers, so they are checked first and the real sizes afterwards.
    const entries = unzipSync(bytes, {
      filter(file) {
        budget.left -= file.originalSize;
        if (budget.left < 0) throw tooMuch();
        return !file.name.includes('..') && !file.name.startsWith('/');
      },
    });
    for (const data of Object.values(entries)) {
      budget.left -= data.byteLength;
      if (budget.left < 0) throw tooMuch();
    }
    return entries;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('That file is not a valid HexaData draft or backup.');
  }
}

function parseJson<T>(entries: Entries, name: string): T {
  const data = entries[name];
  if (!data) throw new ImportError('That file is not a HexaData draft (draft.json is missing).');
  if (data.byteLength > MAX_JSON_BYTES) throw new ImportError('The draft data is too large.');
  try {
    return JSON.parse(new TextDecoder().decode(data)) as T;
  } catch {
    throw new ImportError('The draft data is damaged.');
  }
}

/** Imports one `.hxspec` archive as a NEW draft (never overwrites an existing one). */
async function importOne(
  store: Pick<DraftStore, 'create' | 'putAsset'>,
  entries: Entries,
  warnings: string[],
): Promise<Draft> {
  const file = parseJson<Partial<DraftFileJson>>(entries, 'draft.json');
  if (file.format !== HXSPEC_FORMAT || file.formatVersion !== 1) {
    throw new ImportError('That file is not a HexaData draft.');
  }
  const migrated = migrateDocument(file.document);
  if (!migrated.ok)
    throw new ImportError(`The draft could not be read: ${migrated.issues[0] ?? 'invalid data'}`);
  const document = migrated.value;
  if (!getTemplateMeta(document.templateId, document.templateVersion)) {
    throw new ImportError(
      `This draft uses the template "${document.templateId}" (v${document.templateVersion}), which this version of the editor does not have.`,
    );
  }

  // Verify every image: real image type, within limits, and the bytes must match their hash reference.
  const available = new Map<
    string,
    { bytes: Uint8Array; mime: string; width: number; height: number }
  >();
  for (const [name, bytes] of Object.entries(entries)) {
    const match = /^assets\/([a-f0-9]{64})\.[a-z0-9]+$/.exec(name);
    if (!match) continue;
    const checked = checkImage(bytes);
    if (!checked.ok) {
      warnings.push(`Skipped an unusable image (${checked.reason})`);
      continue;
    }
    if ((await sha256Hex(new Blob([bytes as BlobPart]))) !== match[1]) {
      warnings.push('Skipped an image whose contents do not match its checksum.');
      continue;
    }
    available.set(match[1]!, {
      bytes,
      mime: checked.info.mime,
      width: checked.info.width,
      height: checked.info.height,
    });
  }

  const content = structuredClone(document.content);
  const missing = new Set<AssetRef>();
  const isAvailable = (ref: AssetRef) => !ref.startsWith('asset:') || available.has(ref.slice(6));
  for (const ref of collectRefs(content)) if (!isAvailable(ref)) missing.add(ref);
  // Shipped images this editor does not know would make the PDF engine reject the sheet: treat them as missing.
  const shown = [...content.partnerLogos.map((logo) => logo.ref), content.productImage ?? ''];
  for (const ref of shown) if (ref.startsWith('builtin:') && !builtinId(ref)) missing.add(ref);
  if (missing.size > 0) {
    warnings.push(
      `${missing.size} image${missing.size === 1 ? ' was' : 's were'} missing from the file and removed.`,
    );
    if (content.productImage && missing.has(content.productImage)) content.productImage = null;
    content.partnerLogos = content.partnerLogos.filter((logo) => !missing.has(logo.ref));
  }

  const now = Date.now();
  for (const ref of collectRefs(content)) {
    const hash = ref.slice(6);
    const image = available.get(hash)!;
    await store.putAsset({
      hash,
      blob: new Blob([image.bytes as BlobPart], { type: image.mime }),
      mime: image.mime,
      width: image.width,
      height: image.height,
      bytes: image.bytes.byteLength,
      createdAt: now,
    });
  }

  return store.create({
    name: typeof file.name === 'string' && file.name.trim() ? file.name : 'Imported draft',
    templateId: document.templateId,
    templateVersion: document.templateVersion,
    content,
  });
}

/**
 * Imports a `.hxspec` draft or a backup archive. Everything is validated first; nothing from the file is
 * trusted (schema, limits, image types and checksums are all re-checked).
 */
export async function importFile(
  store: Pick<DraftStore, 'create' | 'putAsset'>,
  bytes: Uint8Array,
): Promise<ImportResult> {
  const budget = { left: MAX_EXPANDED_BYTES };
  const entries = await unzip(bytes, budget);
  const warnings: string[] = [];

  if (entries['manifest.json']) {
    const manifest = parseJson<{ format?: string }>(entries, 'manifest.json');
    if (manifest.format !== BACKUP_FORMAT)
      throw new ImportError('That file is not a HexaData backup.');
    const drafts: Draft[] = [];
    for (const [name, data] of Object.entries(entries)) {
      if (!/^drafts\/[^/]+\.hxspec$/.test(name)) continue;
      try {
        drafts.push(await importOne(store, await unzip(data, budget), warnings));
      } catch (error) {
        warnings.push(
          `${name.replace('drafts/', '')}: ${error instanceof Error ? error.message : 'failed'}`,
        );
      }
    }
    if (drafts.length === 0) throw new ImportError('No drafts could be imported from that backup.');
    return { drafts, warnings };
  }

  return { drafts: [await importOne(store, entries, warnings)], warnings };
}
