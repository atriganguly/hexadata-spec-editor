import type { Page } from 'puppeteer';
import type { VirtualFile } from './assets.ts';

/** Virtual origin the print document lives on. Requests to any other origin are blocked. */
export const RENDER_ORIGIN = 'https://render.local';
export const DOCUMENT_PATH = '/document.html';

export interface Sandbox {
  /** Requests the page attempted to anything that is not served from memory. */
  blocked: string[];
}

/**
 * Cuts the page off from the network. Every request is answered from `files` (plus the document itself) or
 * aborted. There is no outbound network access, so even markup that somehow escaped escaping could not read
 * internal services or exfiltrate data. Aborted requests are recorded for logging and tests.
 */
export async function installSandbox(
  page: Page,
  lookup: (pathname: string) => VirtualFile | undefined,
  extraHeaders: (pathname: string) => Record<string, string> | undefined = () => undefined,
): Promise<Sandbox> {
  const sandbox: Sandbox = { blocked: [] };
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let url: URL | undefined;
    try {
      url = new URL(request.url());
    } catch {
      url = undefined;
    }
    const file = url && url.origin === RENDER_ORIGIN ? lookup(url.pathname) : undefined;
    if (!url || !file) {
      sandbox.blocked.push(request.url().slice(0, 200));
      void request.abort('blockedbyclient').catch(() => undefined);
      return;
    }
    void request
      .respond({
        status: 200,
        contentType: file.type,
        headers: { 'Cache-Control': 'no-store', ...extraHeaders(url.pathname) },
        body: file.body,
      })
      .catch(() => undefined);
  });
  return sandbox;
}
