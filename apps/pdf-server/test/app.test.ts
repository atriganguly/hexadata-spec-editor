import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createContent, richTextOf } from './fixtures.ts';
import { PDF_AUTHOR, PDF_PRODUCER } from '../src/metadata.ts';
import { buildApp } from '../src/app.ts';
import type { BrowserPool } from '../src/browser-pool.ts';
import {
  APP_ORIGIN,
  defaultDocument,
  inspectPdf,
  makePng,
  multipart,
  pdfText,
  sha256,
  testConfig,
} from './helpers.ts';

let app: FastifyInstance;
let pool: BrowserPool;

beforeAll(async () => {
  ({ app, pool } = await buildApp(testConfig()));
});
afterAll(async () => {
  await app.close();
});

const post = (payload: object | string, extra: { origin?: string } = {}) => {
  const form = multipart({
    document: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return app.inject({
    method: 'POST',
    url: '/v1/render',
    payload: form.payload,
    headers: { ...form.headers, ...(extra.origin ? { origin: extra.origin } : {}) },
  });
};

describe('health', () => {
  it('reports liveness and readiness', async () => {
    expect((await app.inject('/healthz')).json()).toEqual({ status: 'ok' });
    await pool.warm();
    const ready = await app.inject('/readyz');
    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe('ready');
  });

  it('answers unknown routes with a JSON 404', async () => {
    const res = await app.inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('POST /v1/render', () => {
  it('renders the default Classic sheet to a one-page A4 PDF with real metadata and brand fonts', async () => {
    const res = await post(await defaultDocument());
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('hd-rs2200-version-g294.pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeTruthy();

    const bytes = new Uint8Array(res.rawPayload);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');

    const info = await inspectPdf(bytes);
    expect(info.pages).toBe(1);
    expect(res.headers['x-pdf-pages']).toBe('1');
    expect(info.widthPt).toBeCloseTo(595.28, 0);
    expect(info.heightPt).toBeCloseTo(841.89, 0);
    expect(info.title).toBe('HD-RS2200 Version : G294');
    expect(info.author).toBe(PDF_AUTHOR);
    expect(info.producer).toBe(PDF_PRODUCER);
    expect(info.subject).toContain('Specification');
    expect(info.fonts.some((name) => /Space-?Grotesk/i.test(name))).toBe(true);
    expect(info.fonts.some((name) => /Inter-?Tight/i.test(name))).toBe(true);
    // Only brand fonts are embedded: no fallback system font crept in.
    expect(info.fonts.every((name) => /Space-?Grotesk|Inter-?Tight/i.test(name))).toBe(true);
    // 2 partner logos + product + brand mark
    expect(info.imageCount).toBeGreaterThanOrEqual(4);

    const text = await pdfText(bytes);
    expect(text).toContain('HexaData Server System');
    expect(text).toMatch(/key features/i); // tabs are upper-cased by CSS
    expect(text).toContain('HexaData Management Console');
    expect(text).not.toContain('Hexdata');
  });

  it('also accepts a plain JSON body when no uploads are needed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: await defaultDocument(),
    });
    expect(res.statusCode).toBe(200);
    expect((await inspectPdf(new Uint8Array(res.rawPayload))).pages).toBe(1);
  });

  it('keeps one page even when content is huge (overflow is clipped, never a 2nd page)', async () => {
    const doc = await defaultDocument();
    const longText = richTextOf('line\n'.repeat(55));
    doc.content.specColumns[0].forEach((row) => {
      row.value = longText;
    });
    const res = await post(doc);
    expect(res.statusCode).toBe(200);
    expect((await inspectPdf(new Uint8Array(res.rawPayload))).pages).toBe(1);
  });

  it('renders hostile text as literal text and makes no outbound request', async () => {
    const attack =
      '<script>alert(1)</script><img src="http://169.254.169.254/x"><iframe src="https://evil.example">';
    const doc = await defaultDocument();
    doc.content = createContent(doc.content, attack);
    const res = await post(doc);
    expect(res.statusCode).toBe(200);
    const text = await pdfText(new Uint8Array(res.rawPayload));
    expect(text).toContain('<script>alert(1)</script>');
    expect(text).toContain('169.254.169.254');
  });

  it('embeds an uploaded image referenced by its content hash', async () => {
    const png = await makePng();
    const ref = `asset:${sha256(png)}`;
    const doc = await defaultDocument();
    doc.content.productImage = ref;
    const form = multipart({ document: JSON.stringify(doc) }, [
      { field: ref, bytes: png, type: 'image/png' },
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: form.payload,
      headers: form.headers,
    });
    expect(res.statusCode).toBe(200);
    expect((await inspectPdf(new Uint8Array(res.rawPayload))).pages).toBe(1);
  });

  it('removing every partner logo leaves none in the PDF (regression: old server resurrected them)', async () => {
    const withLogos = await post(await defaultDocument());
    const doc = await defaultDocument();
    doc.content.partnerLogos = [];
    const without = await post(doc);
    const a = await inspectPdf(new Uint8Array(withLogos.rawPayload));
    const b = await inspectPdf(new Uint8Array(without.rawPayload));
    expect(b.imageCount).toBeLessThan(a.imageCount);
  });
});

describe('validation', () => {
  it('rejects invalid documents with readable issues', async () => {
    const doc = await defaultDocument();
    (doc.content as unknown as { evil: number }).evil = 1;
    doc.content.meta.title = [[{ t: 'x'.repeat(500) }]];
    const res = await post(doc);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_DOCUMENT');
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it('rejects unknown templates', async () => {
    const doc = await defaultDocument();
    doc.templateId = 'does-not-exist';
    const res = await post(doc);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('UNKNOWN_TEMPLATE');
  });

  it('rejects data/http image references (no URLs are ever fetched)', async () => {
    const doc = await defaultDocument();
    for (const bad of [
      'data:image/png;base64,AAAA',
      'http://169.254.169.254/',
      'https://evil.example/x.png',
      'file:///etc/passwd',
    ]) {
      doc.content.productImage = bad;
      const res = await post(doc);
      expect(res.statusCode, bad).toBe(422);
    }
  });

  it('rejects missing, malformed and unsupported requests', async () => {
    expect((await post('{not json')).statusCode).toBe(400);
    const noDoc = multipart({ other: 'x' });
    const missing = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: noDoc.payload,
      headers: noDoc.headers,
    });
    expect(missing.statusCode).toBe(400);
    const text = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: 'hello',
      headers: { 'content-type': 'text/plain' },
    });
    expect(text.statusCode).toBe(415);
    expect(text.json().code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a missing referenced upload', async () => {
    const doc = await defaultDocument();
    doc.content.productImage = `asset:${'a'.repeat(64)}`;
    const res = await post(doc);
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('MISSING_ASSET');
  });

  it('verifies upload checksums, real image types and sizes', async () => {
    const png = await makePng();
    const doc = await defaultDocument();

    // wrong hash
    const wrong = `asset:${'b'.repeat(64)}`;
    doc.content.productImage = wrong;
    let form = multipart({ document: JSON.stringify(doc) }, [{ field: wrong, bytes: png }]);
    let res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: form.payload,
      headers: form.headers,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_ASSET');

    // correct hash, but not an image (HTML pretending to be one)
    const html = Buffer.from('<script>alert(1)</script>');
    const htmlRef = `asset:${sha256(html)}`;
    doc.content.productImage = htmlRef;
    form = multipart({ document: JSON.stringify(doc) }, [
      { field: htmlRef, bytes: html, type: 'image/png' },
    ]);
    res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: form.payload,
      headers: form.headers,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_ASSET');

    // too large
    const big = Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]);
    const bigRef = `asset:${sha256(big)}`;
    doc.content.productImage = bigRef;
    form = multipart({ document: JSON.stringify(doc) }, [{ field: bigRef, bytes: big }]);
    res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: form.payload,
      headers: form.headers,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('PAYLOAD_TOO_LARGE');

    // file part with an arbitrary name
    form = multipart({ document: JSON.stringify(await defaultDocument()) }, [
      { field: 'evil', bytes: png },
    ]);
    res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: form.payload,
      headers: form.headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an oversized JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/render',
      payload: JSON.stringify({ pad: 'x'.repeat(300 * 1024) }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('origin policy and CORS', () => {
  it('rejects browsers calling from an origin that is not allowed', async () => {
    const res = await post(await defaultDocument(), { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ORIGIN_NOT_ALLOWED');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const health = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://evil.example' },
    });
    expect(health.statusCode).toBe(403);
  });

  it('allows the configured origin and answers preflights', async () => {
    const ok = await post(await defaultDocument(), { origin: APP_ORIGIN });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(ok.headers['access-control-expose-headers']).toContain('Content-Disposition');
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/render',
      headers: {
        origin: APP_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
  });

  it('sends strict security headers', async () => {
    const res = await app.inject('/healthz');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('limits', () => {
  it('rate-limits renders per client and tells them when to retry', async () => {
    const { app: limited } = await buildApp(testConfig({ rateLimitMax: 2 }));
    try {
      const call = () =>
        limited.inject({ method: 'POST', url: '/v1/render', payload: { nope: true } });
      expect((await call()).statusCode).toBe(422);
      expect((await call()).statusCode).toBe(422);
      const blocked = await call();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      // Health checks are never rate limited.
      for (let i = 0; i < 5; i += 1)
        expect((await limited.inject('/healthz')).statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it('sheds load with 503 + Retry-After instead of queueing without bound', async () => {
    const { app: busy } = await buildApp(testConfig({ concurrency: 1, queueMax: 0 }));
    try {
      const doc = JSON.stringify(await defaultDocument());
      const send = () => {
        const form = multipart({ document: doc });
        return busy.inject({
          method: 'POST',
          url: '/v1/render',
          payload: form.payload,
          headers: form.headers,
        });
      };
      const results = await Promise.all([send(), send(), send()]);
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toContain(200);
      expect(codes).toContain(503);
      const rejected = results.find((r) => r.statusCode === 503)!;
      expect(rejected.json().code).toBe('BUSY');
      expect(rejected.headers['retry-after']).toBe('5');
    } finally {
      await busy.close();
    }
  });

  it('times out slow renders with 504 and stays usable afterwards', async () => {
    const { app: slow } = await buildApp(testConfig({ renderTimeoutMs: 1 }));
    try {
      const form = multipart({ document: JSON.stringify(await defaultDocument()) });
      const res = await slow.inject({
        method: 'POST',
        url: '/v1/render',
        payload: form.payload,
        headers: form.headers,
      });
      expect(res.statusCode).toBe(504);
      expect(res.json().code).toBe('RENDER_TIMEOUT');
    } finally {
      await slow.close();
    }
  });

  it('recycles the browser after the configured number of renders', async () => {
    const { app: recycling, pool: p } = await buildApp(
      testConfig({ recycleAfter: 2, concurrency: 1 }),
    );
    try {
      const doc = await defaultDocument();
      for (let i = 0; i < 3; i += 1) {
        const form = multipart({ document: JSON.stringify(doc) });
        const res = await recycling.inject({
          method: 'POST',
          url: '/v1/render',
          payload: form.payload,
          headers: form.headers,
        });
        expect(res.statusCode).toBe(200);
      }
      expect(p.stats.rendersSinceLaunch).toBeLessThanOrEqual(2);
    } finally {
      await recycling.close();
    }
  });
});
