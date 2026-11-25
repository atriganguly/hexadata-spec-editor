import { useEffect } from 'react';
import type { SpecSheetContent } from '@hexadata/spec-core';
import { API_BASE } from '../lib/env.ts';
import { issuesFor, type SheetLayout } from '../editor/layout.ts';
import { useDoc } from '../store/doc.ts';
import { useUi } from '../store/ui.ts';

interface EngineAnswer {
  pages: number;
  spacers: Record<string, number>;
  overflow: boolean;
}

/** Asks the PDF engine where the sheet breaks across pages. Throws on any failure (the caller keeps its estimate). */
export async function fetchEngineLayout(
  apiBase: string,
  input: { templateId: string; templateVersion: number; content: SpecSheetContent },
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SheetLayout> {
  const response = await fetchImpl(`${apiBase}/v1/layout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, ...input }),
    signal,
  });
  if (!response.ok) throw new Error(`Layout request failed (${response.status}).`);
  const answer = (await response.json()) as EngineAnswer;
  return { ...answer, issues: issuesFor(answer) };
}

const DEBOUNCE_MS = 350;

/**
 * Makes the PDF engine the single authority for page breaks. After the sheet changes (debounced), the engine is asked
 * where the rows break; its answer replaces the editor's own estimate, so the pages the editor shows are the pages the
 * export produces, whatever this browser does with text. The local measurement stays as the instant preview and as the
 * fallback when the engine is unreachable, asleep or busy.
 */
export function useEngineLayout(): void {
  const ready = useDoc((state) => state.ready);
  const content = useDoc((state) => state.content);
  const templateId = useDoc((state) => state.templateId);
  const templateVersion = useDoc((state) => state.templateVersion);

  useEffect(() => {
    if (!ready || !templateId || templateVersion === undefined) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchEngineLayout(API_BASE, { templateId, templateVersion, content }, controller.signal)
        .then((layout) => {
          const ui = useUi.getState();
          ui.setEngine({ content, templateId, templateVersion, layout });
          ui.setLayout(layout);
        })
        .catch(() => undefined); // offline, busy or asleep: the local estimate stays
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, content, templateId, templateVersion]);
}
