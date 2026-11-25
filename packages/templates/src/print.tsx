import { renderToStaticMarkup } from 'react-dom/server';
import { SheetProvider } from './slots.tsx';
import type { PageSpec, SheetValue, TemplateModule } from './types.ts';

/**
 * React 19 prepends `<link rel="preload" as="image">` hints for <img> elements. They are useless in a
 * print document (the renderer already serves every image from memory), so they are removed.
 */
const IMAGE_PRELOAD = /<link rel="preload" as="image"[^>]*\/?>/g;

export function stripPreloadHints(html: string): string {
  return html.replace(IMAGE_PRELOAD, '');
}

/**
 * Renders a template to static HTML in print mode. Text is escaped by React: content can never
 * become markup. Server-only (imports react-dom/server); import via `@hexadata/spec-templates/print`.
 */
export function renderSheetHtml(
  template: Pick<TemplateModule, 'Component'>,
  value: Omit<SheetValue, 'mode' | 'TextCell'>,
): string {
  const { Component } = template;
  return stripPreloadHints(
    renderToStaticMarkup(
      <SheetProvider value={{ ...value, mode: 'print' }}>
        <Component />
      </SheetProvider>,
    ),
  );
}

export interface PrintDocumentOptions {
  template: Pick<TemplateModule, 'Component'>;
  page: PageSpec;
  value: Omit<SheetValue, 'mode' | 'TextCell'>;
  /** Plain-text document title (escaped by React). */
  title: string;
  /** Stylesheet URLs, in cascade order. The renderer serves them from memory. */
  stylesheets: readonly string[];
  /** Origin that every sub-resource must come from. The CSP forbids anything else. */
  origin: string;
}

/** Content-Security-Policy for print documents: no scripts, no network except the renderer's own origin. */
export function printCsp(origin: string): string {
  return [
    "default-src 'none'",
    `img-src ${origin}`,
    `font-src ${origin}`,
    `style-src ${origin} 'unsafe-inline'`,
    "script-src 'none'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/**
 * The complete print document: CSP, title, brand + template CSS, an exact `@page` size and the sheet.
 * Built entirely with React, so nothing user-controlled is ever concatenated into markup.
 */
export function renderPrintDocument(options: PrintDocumentOptions): string {
  const { template, page, value, title, stylesheets, origin } = options;
  const { Component } = template;
  const pageCss =
    `@page{size:${page.widthMm}mm ${page.heightMm}mm;margin:0}` +
    // The sheet itself is `pages x page height` tall and clips its own overflow, so the document is exactly that tall.
    `html,body{margin:0;padding:0;width:${page.widthMm}mm;background:transparent}`;
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Security-Policy" content={printCsp(origin)} />
        <title>{title}</title>
        {stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <style>{pageCss}</style>
      </head>
      <body>
        <SheetProvider value={{ ...value, mode: 'print' }}>
          <Component />
        </SheetProvider>
      </body>
    </html>,
  );
  return `<!doctype html>${stripPreloadHints(html)}`;
}
