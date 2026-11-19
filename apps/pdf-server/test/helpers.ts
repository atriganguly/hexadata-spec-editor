import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SpecDocument } from '@hexadata/spec-core';
import { loadTemplate } from '@hexadata/spec-templates';
import { loadConfig, type Config } from '../src/config.ts';

export const APP_ORIGIN = 'https://app.example.test';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({
      NODE_ENV: 'test',
      ALLOWED_ORIGINS: APP_ORIGIN,
      WARM_ON_BOOT: '0',
      LOG_LEVEL: 'silent',
      RENDER_CONCURRENCY: '2',
      RENDER_QUEUE_MAX: '4',
      RATE_LIMIT_MAX: '1000',
      CHROME_NO_SANDBOX: process.platform === 'linux' ? '1' : '0',
    }),
    ...overrides,
  };
}

export async function defaultDocument(): Promise<SpecDocument> {
  const template = (await loadTemplate('classic'))!;
  return {
    schemaVersion: 1,
    templateId: 'classic',
    templateVersion: 1,
    content: template.createDefaults(),
  };
}

export async function makePng(width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer();
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export interface MultipartFile {
  field: string;
  bytes: Uint8Array;
  filename?: string;
  type?: string;
}

/** Minimal multipart/form-data encoder (avoids depending on inject-specific FormData support). */
export function multipart(fields: Record<string, string>, files: MultipartFile[] = []) {
  const boundary = `----test${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename ?? 'image.bin'}"\r\nContent-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`,
      ),
      Buffer.from(file.bytes),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export interface PdfInfo {
  pages: number;
  widthPt: number;
  heightPt: number;
  title: string | undefined;
  author: string | undefined;
  producer: string | undefined;
  subject: string | undefined;
  language: string | undefined;
  imageCount: number;
  /** Embedded font names (subset prefix removed). */
  fonts: string[];
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = doc.getPage(0);
  const raw = Buffer.from(bytes).toString('latin1');
  return {
    pages: doc.getPageCount(),
    widthPt: page.getWidth(),
    heightPt: page.getHeight(),
    title: doc.getTitle(),
    author: doc.getAuthor(),
    producer: doc.getProducer(),
    subject: doc.getSubject(),
    language: doc.catalog.get(doc.context.obj('Lang'))?.toString(),
    imageCount: (raw.match(/\/Subtype\s*\/Image/g) ?? []).length,
    fonts: [
      ...new Set(
        [...raw.matchAll(/\/FontName\s*\/(?:[A-Z]{6}\+)?([^\s/>\]]+)/g)].map((match) => match[1]!),
      ),
    ],
  };
}

type PdfJs = typeof PdfjsModule;
let pdfjsPromise: Promise<PdfJs> | undefined;
const loadPdfjs = () => (pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

/** Text of page 1, via pdf.js. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const doc = await task.promise;
    const content = await (await doc.getPage(1)).getTextContent();
    return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  } finally {
    await task.destroy();
  }
}

/** Rasterises page 1 to PNG (scale 1 = 72 dpi). Used by visual checks and golden tests. */
export async function pdfToPng(bytes: Uint8Array, scale = 2): Promise<Buffer> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale });
    const factory = (
      doc as unknown as {
        canvasFactory: { create(w: number, h: number): { canvas: unknown; context: unknown } };
      }
    ).canvasFactory;
    const target = factory.create(viewport.width, viewport.height);
    await page.render({
      canvasContext: target.context as never,
      viewport,
      canvas: target.canvas as never,
    }).promise;
    return (target.canvas as unknown as { toBuffer(type: string): Buffer }).toBuffer('image/png');
  } finally {
    await task.destroy();
  }
}
