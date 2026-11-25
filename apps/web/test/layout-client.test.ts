import { describe, expect, it, vi } from 'vitest';
import { createEmptyContent } from '@hexadata/spec-core';
import { fetchEngineLayout } from '../src/export/layout-client.ts';

const input = { templateId: 'classic', templateVersion: 1, content: createEmptyContent() };

describe('fetchEngineLayout', () => {
  it('posts the document and returns the engine breaks', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ pages: 2, spacers: { r1: 120 }, overflow: false })),
    );
    const layout = await fetchEngineLayout(
      'https://engine.test',
      input,
      new AbortController().signal,
      fetchImpl as unknown as typeof fetch,
    );
    expect(layout).toEqual({ pages: 2, spacers: { r1: 120 }, overflow: false, issues: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://engine.test/v1/layout');
    expect(JSON.parse(String(init.body))).toMatchObject({
      schemaVersion: 1,
      templateId: 'classic',
    });
  });

  it('turns an overflow into a readable problem', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ pages: 11, spacers: {}, overflow: true }));
    const layout = await fetchEngineLayout(
      '',
      input,
      new AbortController().signal,
      fetchImpl as unknown as typeof fetch,
    );
    expect(layout.issues[0]?.message).toMatch(/needs 11 pages/);
  });

  it('throws when the engine does not answer, so the caller keeps its estimate', async () => {
    const fetchImpl = async () => new Response('{}', { status: 503 });
    await expect(
      fetchEngineLayout(
        '',
        input,
        new AbortController().signal,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/503/);
  });
});
