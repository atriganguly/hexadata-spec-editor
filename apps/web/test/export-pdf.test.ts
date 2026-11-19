import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rt } from '@hexadata/spec-core';
import { loadTemplate } from '@hexadata/spec-templates';
import { exportPdf, ExportError, type ExportInput } from '../src/export/export-pdf.ts';
import { IdbDraftStore } from '../src/drafts/idb-store.ts';

let store: IdbDraftStore;
let n = 0;
beforeEach(() => {
  n += 1;
  store = IdbDraftStore.open(`export-db-${n}`);
});

const input = async (): Promise<ExportInput> => ({
  templateId: 'classic',
  templateVersion: 1,
  content: (await loadTemplate('classic'))!.createDefaults(),
});

const pdfResponse = (name = 'sheet.pdf') =>
  new Response(new Blob(['%PDF-1.7 fake']), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${name}"; filename*=UTF-8''${name}`,
    },
  });

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const opts = (fetchImpl: typeof fetch, extra = {}) => ({
  apiBase: 'https://pdf.example.test',
  fetchImpl,
  sleep: async () => undefined,
  ...extra,
});

describe('exportPdf', () => {
  it('posts a multipart document and returns the PDF with the server file name', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      pdfResponse('hd-rs2200.pdf'),
    );
    const result = await exportPdf(await input(), store, opts(fetchImpl as never));
    expect(result.fileName).toBe('hd-rs2200.pdf');
    expect(await result.blob.text()).toContain('%PDF');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://pdf.example.test/v1/render');
    expect(init?.method).toBe('POST');
    const form = init?.body as FormData;
    const doc = JSON.parse(form.get('document') as string);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.templateId).toBe('classic');
    expect(JSON.stringify(doc)).not.toContain('data:');
  });

  it('uploads user images as binary parts named by their reference', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = 'a'.repeat(64);
    await store.putAsset({
      hash,
      blob: new Blob([bytes], { type: 'image/webp' }),
      mime: 'image/webp',
      width: 1,
      height: 1,
      bytes: 3,
      createdAt: 1,
    });
    const data = await input();
    data.content.productImage = `asset:${hash}`;
    const fetchImpl = vi.fn(async (_u: unknown, _i?: RequestInit) => pdfResponse());
    await exportPdf(data, store, opts(fetchImpl as never));
    const form = fetchImpl.mock.calls[0]![1]!.body as FormData;
    const file = form.get(`asset:${hash}`) as File;
    expect(file).toBeInstanceOf(Blob);
    expect(file.size).toBe(3);
  });

  it('refuses to export a sheet whose image is missing from storage', async () => {
    const data = await input();
    data.content.productImage = `asset:${'b'.repeat(64)}`;
    const fetchImpl = vi.fn();
    await expect(exportPdf(data, store, opts(fetchImpl as never))).rejects.toMatchObject({
      code: 'missing-image',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('validates locally before any network call', async () => {
    const data = await input();
    data.content.meta.title = rt('x'.repeat(500));
    const fetchImpl = vi.fn();
    await expect(exportPdf(data, store, opts(fetchImpl as never))).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries once when the engine is busy, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(503, { code: 'BUSY', message: 'busy' }, { 'retry-after': '5' }))
      .mockResolvedValueOnce(pdfResponse());
    const sleep = vi.fn(async () => undefined);
    const result = await exportPdf(await input(), store, opts(fetchImpl as never, { sleep }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5000);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('gives up with a clear message when it stays busy', async () => {
    const fetchImpl = vi.fn(async () => json(503, { code: 'BUSY' }, { 'retry-after': '1' }));
    await expect(exportPdf(await input(), store, opts(fetchImpl as never))).rejects.toMatchObject({
      code: 'busy',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, { code: 'RATE_LIMITED' }, 'rate-limited', /Too many exports/],
    [413, { code: 'PAYLOAD_TOO_LARGE' }, 'too-large', /too large/],
    [403, { code: 'ORIGIN_NOT_ALLOWED' }, 'forbidden', /not allowed/],
    [504, { code: 'RENDER_TIMEOUT' }, 'timeout', /too long/],
    [500, { code: 'RENDER_FAILED' }, 'failed', /could not be generated/],
  ])('maps HTTP %i to a specific error', async (status, body, code, message) => {
    const fetchImpl = vi.fn(async () => json(status, body, { 'retry-after': '12' }));
    const error = await exportPdf(await input(), store, opts(fetchImpl as never)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ExportError);
    expect((error as ExportError).code).toBe(code);
    expect((error as ExportError).message).toMatch(message);
  });

  it('includes the server’s explanation for rejected documents', async () => {
    const fetchImpl = vi.fn(async () =>
      json(422, {
        code: 'INVALID_DOCUMENT',
        message: 'The document is not valid.',
        issues: ['meta.title: too long'],
      }),
    );
    const error = (await exportPdf(await input(), store, opts(fetchImpl as never)).catch(
      (e: unknown) => e,
    )) as ExportError;
    expect(error.code).toBe('invalid');
    expect(error.message).toContain('meta.title: too long');
    expect(error.retryable).toBe(false);
  });

  it('reports an unreachable engine', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(exportPdf(await input(), store, opts(fetchImpl as never))).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('supports cancelling', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      controller.abort();
      init?.signal?.throwIfAborted();
      return pdfResponse();
    });
    await expect(
      exportPdf(await input(), store, opts(fetchImpl as never, { signal: controller.signal })),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('tells the UI when the engine seems to be waking up', async () => {
    vi.useFakeTimers();
    try {
      const phases: string[] = [];
      let release!: () => void;
      const fetchImpl = vi.fn(
        () => new Promise<Response>((resolve) => (release = () => resolve(pdfResponse()))),
      );
      const promise = exportPdf(
        await input(),
        store,
        opts(fetchImpl as never, { onPhase: (p: string) => phases.push(p), wakeAfterMs: 3000 }),
      );
      await vi.advanceTimersByTimeAsync(100);
      expect(phases).toEqual(['rendering']);
      await vi.advanceTimersByTimeAsync(3000);
      expect(phases).toEqual(['rendering', 'waking']);
      release();
      await promise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to a safe file name when the header is odd', async () => {
    const fetchImpl = vi.fn(async () => pdfResponse('../../evil.pdf'));
    const result = await exportPdf(await input(), store, opts(fetchImpl as never));
    expect(result.fileName).toBe('hexadata-datasheet.pdf');
  });
});
