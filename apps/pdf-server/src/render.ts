import {
  LIMITS,
  plainText,
  type AssetRef,
  type SpecDocument,
  type SpecSheetContent,
} from '@hexadata/spec-core';
import {
  assetHash,
  builtinId,
  computePagination,
  loadTemplate,
  measureLayout,
  mmToPx,
  paginationGeometry,
  slotCss,
  type AssetUrls,
  type BrandLogoName,
  type PaginationState,
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

/** Where the sheet breaks across pages, as decided by the engine (the single authority for page breaks). */
export interface EngineLayout {
  pages: number;
  spacers: Record<string, number>;
  /** More pages than allowed, or a row taller than a page. */
  overflow: boolean;
}

export interface RenderResult {
  /** Empty for a layout-only request. */
  pdf: Uint8Array;
  layout: EngineLayout;
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
  /** Measure and paginate only: no PDF. Images the request does not carry are replaced by same-size placeholders. */
  layoutOnly?: boolean;
  log?: { warn(obj: object, msg: string): void };
}

function referencedAssets(content: SpecSheetContent): AssetRef[] {
  const refs = content.partnerLogos.map((logo) => logo.ref);
  if (content.productImage) refs.push(content.productImage);
  return refs;
}

/** A 1 x 1 PNG, the stand-in for uploaded images in layout-only requests. */
const PLACEHOLDER_PNG: VirtualFile = {
  body: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
    'base64',
  ),
  type: 'image/png',
};

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
    if (
      ref.startsWith('builtin:') ? !builtin : !hash || (!uploads.has(ref) && !options.layoutOnly)
    ) {
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
      if (!hash) return undefined;
      const path = `/asset/${hash}`;
      if (!upload) {
        // Layout only: the image sizes are fixed by the template, so a 1 px stand-in lays out identically.
        if (!options.layoutOnly) return undefined;
        files.set(path, PLACEHOLDER_PNG);
        return RENDER_ORIGIN + path;
      }
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
  const buildDocument = (pagination?: PaginationState): VirtualFile => ({
    body: Buffer.from(
      renderPrintDocument({
        template,
        page: template.page,
        value: { content: doc.content, urls, pagination },
        title,
        origin: RENDER_ORIGIN,
        stylesheets: ['/brand/hexadata.css', '/brand/fonts.css', '/slots.css', '/template.css'].map(
          (path) => RENDER_ORIGIN + path,
        ),
      }),
      'utf8',
    ),
    type: 'text/html; charset=utf-8',
  });
  let documentFile = buildDocument();
  let pagesNeeded = 1;
  let layout: EngineLayout = { pages: 1, spacers: {}, overflow: false };

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

        const load = async () => {
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
        };
        await load();

        // Pagination: measure the single-flow sheet in this very browser, decide where rows break (the same
        // function the editor uses), and render again with the page breaks. Most sheets need one page: no second pass.
        const measured = await page.evaluate(measureLayout, null, mmToPx(template.page.widthMm));
        if (measured) {
          const result = computePagination(
            measured,
            paginationGeometry(template, doc.content, LIMITS.maxPages),
          );
          layout = { pages: result.pages, spacers: result.spacers, overflow: result.overflow };
          if (options.layoutOnly) return new Uint8Array(0);
          if (result.overflow) {
            throw new HttpError(
              422,
              'TOO_MANY_PAGES',
              `The sheet needs more than ${LIMITS.maxPages} pages. Shorten the specification.`,
            );
          }
          pagesNeeded = result.pages;
          if (result.pages > 1) {
            documentFile = buildDocument({ pages: result.pages, spacers: result.spacers });
            await load();
          }
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

  if (options.layoutOnly) {
    return {
      pdf: raw,
      layout,
      title,
      pagesRendered: layout.pages,
      droppedPages: 0,
      blockedRequests: blocked,
      durationMs: Math.round(performance.now() - started),
    };
  }

  const finalized = await finalizePdf(raw, { title, keywords: [template.name] }, pagesNeeded).catch(
    (error: unknown) => {
      options.log?.warn({ err: error }, 'PDF post-processing failed');
      throw renderFailed();
    },
  );

  return {
    pdf: finalized.pdf,
    layout,
    title,
    pagesRendered: finalized.pages - finalized.droppedPages,
    droppedPages: finalized.droppedPages,
    blockedRequests: blocked,
    durationMs: Math.round(performance.now() - started),
  };
}
