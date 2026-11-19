import {
  plainText,
  type AssetRef,
  type SpecDocument,
  type SpecSheetContent,
} from '@hexadata/spec-core';
import {
  assetHash,
  builtinId,
  loadTemplate,
  slotCss,
  type AssetUrls,
  type BrandLogoName,
} from '@hexadata/spec-templates';
import { printCsp, renderPrintDocument } from '@hexadata/spec-templates/print';
import type { AssetStore, VirtualFile } from './assets.ts';
import type { BrowserPool } from './browser-pool.ts';
import { HttpError, renderFailed, renderTimeout } from './errors.ts';
import { finalizePdf } from './metadata.ts';
import { DOCUMENT_PATH, installSandbox, RENDER_ORIGIN } from './sandbox.ts';

export interface Upload {
  bytes: Uint8Array;
  mime: string;
}

export interface RenderRequest {
  document: SpecDocument;
  /** Verified uploads, keyed by their `asset:<sha256>` reference. */
  uploads: ReadonlyMap<AssetRef, Upload>;
}

export interface RenderResult {
  pdf: Uint8Array;
  /** Plain-text title (document property and basis of the file name). */
  title: string;
  pagesRendered: number;
  droppedPages: number;
  /** Requests the browser attempted to other origins. Always empty for well-formed documents. */
  blockedRequests: string[];
  durationMs: number;
}

export interface RenderOptions {
  timeoutMs: number;
  log?: { warn(obj: object, msg: string): void };
}

function referencedAssets(content: SpecSheetContent): AssetRef[] {
  const refs = content.partnerLogos.map((logo) => logo.ref);
  if (content.productImage) refs.push(content.productImage);
  return refs;
}

function cssFile(css: string): VirtualFile {
  return { body: Buffer.from(css, 'utf8'), type: 'text/css; charset=utf-8' };
}

/** Plain-text title: collapsed whitespace, never empty. */
export function documentTitle(content: SpecSheetContent): string {
  return (
    plainText(content.meta.title).replace(/\s+/g, ' ').trim() || 'HexaData Specification Sheet'
  );
}

/**
 * Renders a validated document to a single-page PDF.
 *
 * Isolation (defence in depth):
 *  1. Markup comes only from React renders of the template; user text is escaped.
 *  2. The document carries a CSP with `script-src 'none'` and no network sources except the virtual origin.
 *  3. Request interception answers every request from memory and aborts anything else: the browser has no
 *     network access at all.
 *  4. Each render runs in its own browser context, closed afterwards.
 */
export async function renderPdf(
  pool: BrowserPool,
  assets: AssetStore,
  request: RenderRequest,
  options: RenderOptions,
): Promise<RenderResult> {
  const started = performance.now();
  const { document: doc, uploads } = request;

  const template = await loadTemplate(doc.templateId, doc.templateVersion);
  if (!template) {
    throw new HttpError(
      422,
      'UNKNOWN_TEMPLATE',
      `Unknown template "${doc.templateId}" version ${doc.templateVersion}.`,
    );
  }

  // Resolve every asset before touching the browser: missing ones are the client's mistake (422).
  for (const ref of referencedAssets(doc.content)) {
    const builtin = builtinId(ref);
    const hash = assetHash(ref);
    if (ref.startsWith('builtin:') ? !builtin : !hash || !uploads.has(ref)) {
      throw new HttpError(422, 'MISSING_ASSET', `Image "${ref}" is not available.`);
    }
  }

  const files = new Map<string, VirtualFile>();
  files.set('/brand/hexadata.css', assets.brandCss);
  files.set('/brand/fonts.css', assets.brandFontsCss);
  for (const [name, file] of assets.brandFonts) files.set(`/brand/fonts/${name}`, file);
  files.set('/slots.css', cssFile(slotCss));
  files.set('/template.css', cssFile(template.css));

  const urls: AssetUrls = {
    asset(ref) {
      const builtin = builtinId(ref);
      if (builtin) {
        const path = `/builtin/${builtin}`;
        files.set(path, assets.builtin(builtin));
        return RENDER_ORIGIN + path;
      }
      const hash = assetHash(ref);
      const upload = hash ? uploads.get(ref) : undefined;
      if (!hash || !upload) return undefined;
      const path = `/asset/${hash}`;
      files.set(path, { body: Buffer.from(upload.bytes), type: upload.mime });
      return RENDER_ORIGIN + path;
    },
    brandLogo(name: BrandLogoName) {
      const path = `/brand/logo/${name}.png`;
      files.set(path, assets.brandLogo(name));
      return RENDER_ORIGIN + path;
    },
  };

  const title = documentTitle(doc.content);
  const html = renderPrintDocument({
    template,
    page: template.page,
    value: { content: doc.content, urls },
    title,
    origin: RENDER_ORIGIN,
    stylesheets: ['/brand/hexadata.css', '/brand/fonts.css', '/slots.css', '/template.css'].map(
      (path) => RENDER_ORIGIN + path,
    ),
  });
  const documentFile: VirtualFile = {
    body: Buffer.from(html, 'utf8'),
    type: 'text/html; charset=utf-8',
  };

  let blocked: string[] = [];

  const raw = await pool
    .run(async (context) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        void context.close().catch(() => undefined); // aborts every pending page operation at once
      }, options.timeoutMs);

      try {
        const page = await context.newPage();
        const sandbox = await installSandbox(
          page,
          (path) => (path === DOCUMENT_PATH ? documentFile : files.get(path)),
          (path): Record<string, string> =>
            path === DOCUMENT_PATH ? { 'Content-Security-Policy': printCsp(RENDER_ORIGIN) } : {},
        );
        blocked = sandbox.blocked;

        await page.goto(RENDER_ORIGIN + DOCUMENT_PATH, {
          waitUntil: 'load',
          timeout: options.timeoutMs,
        });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const brokenImages = await page.evaluate(
          () =>
            Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0)
              .length,
        );
        if (brokenImages > 0) {
          throw new HttpError(422, 'INVALID_ASSET', 'One of the images could not be decoded.');
        }

        return await page.pdf({
          preferCSSPageSize: true,
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          timeout: options.timeoutMs,
        });
      } catch (error) {
        if (timedOut) throw renderTimeout();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    })
    .catch((error: unknown) => {
      if (error instanceof HttpError) throw error;
      options.log?.warn({ err: error }, 'Render failed');
      throw renderFailed();
    });

  if (blocked.length > 0) options.log?.warn({ blocked }, 'Blocked outbound requests during render');

  const finalized = await finalizePdf(raw, { title, keywords: [template.name] }).catch(
    (error: unknown) => {
      options.log?.warn({ err: error }, 'PDF post-processing failed');
      throw renderFailed();
    },
  );

  return {
    pdf: finalized.pdf,
    title,
    pagesRendered: finalized.pages,
    droppedPages: finalized.droppedPages,
    blockedRequests: blocked,
    durationMs: Math.round(performance.now() - started),
  };
}
