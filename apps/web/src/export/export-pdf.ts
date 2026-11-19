import { parseDocument, SCHEMA_VERSION, type SpecSheetContent } from '@hexadata/spec-core';
import { collectRefs } from '../drafts/idb-store.ts';
import type { DraftStore } from '../drafts/types.ts';

export type ExportErrorCode =
  | 'invalid'
  | 'missing-image'
  | 'unreachable'
  | 'busy'
  | 'rate-limited'
  | 'too-large'
  | 'forbidden'
  | 'timeout'
  | 'cancelled'
  | 'failed';

/** An export failure with a message that can be shown to the user as-is. */
export class ExportError extends Error {
  override name = 'ExportError';
  constructor(
    readonly code: ExportErrorCode,
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

export interface ExportInput {
  templateId: string;
  templateVersion: number;
  content: SpecSheetContent;
}

export interface ExportOptions {
  apiBase: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onPhase?(phase: 'rendering' | 'waking'): void;
  /** Show the "waking up" message if the engine has not answered after this long (cold starts on free hosting). */
  wakeAfterMs?: number;
  timeoutMs?: number;
  /** Seam for tests: wait before retrying a busy server. */
  sleep?(ms: number): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_WAKE_MS = 3_000;
const MAX_RETRY_WAIT_S = 10;

interface ApiError {
  code?: string;
  message?: string;
  issues?: string[];
}

async function readError(response: Response): Promise<ApiError> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return {};
  }
}

function fileNameFrom(response: Response, fallback: string): string {
  const header = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  return name && /^[\w.\- ]{1,100}$/.test(name) ? name : fallback;
}

/**
 * Sends the sheet to the PDF engine and returns the PDF.
 *
 * The document is validated first (no round trip for invalid data), uploaded images travel as binary parts named
 * by their SHA-256 (the server re-verifies them), a busy server is retried once, and every failure becomes an
 * `ExportError` with a clear, specific message instead of a generic "something went wrong".
 */
export async function exportPdf(
  input: ExportInput,
  store: Pick<DraftStore, 'getAsset'>,
  options: ExportOptions,
): Promise<{ blob: Blob; fileName: string }> {
  const parsed = parseDocument({
    schemaVersion: SCHEMA_VERSION,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    content: input.content,
  });
  if (!parsed.ok) {
    throw new ExportError(
      'invalid',
      `This sheet cannot be exported: ${parsed.issues[0] ?? 'invalid content'}.`,
      false,
    );
  }

  const form = new FormData();
  form.append('document', JSON.stringify(parsed.value));
  for (const ref of collectRefs(input.content)) {
    const record = await store.getAsset(ref.slice('asset:'.length));
    if (!record) {
      throw new ExportError(
        'missing-image',
        'An image of this sheet is missing from this browser’s storage. Replace it and try again.',
        false,
      );
    }
    form.append(ref, record.blob, 'image');
  }

  const doFetch = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  ]);

  options.onPhase?.('rendering');
  const wake = setTimeout(
    () => options.onPhase?.('waking'),
    options.wakeAfterMs ?? DEFAULT_WAKE_MS,
  );

  try {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await doFetch(`${options.apiBase}/v1/render`, {
          method: 'POST',
          body: form,
          signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw new ExportError('cancelled', 'Export cancelled.', false);
        if (
          error instanceof DOMException &&
          (error.name === 'TimeoutError' || error.name === 'AbortError')
        ) {
          throw new ExportError(
            'timeout',
            'The PDF engine took too long to answer. Please try again.',
          );
        }
        throw new ExportError(
          'unreachable',
          'The PDF engine could not be reached. Check your connection (a sleeping server can take up to a minute to wake) and try again.',
        );
      }

      if (response.ok) {
        const blob = await response.blob();
        return { blob, fileName: fileNameFrom(response, 'hexadata-datasheet.pdf') };
      }

      const body = await readError(response);
      if (response.status === 503 && attempt === 0) {
        const wait = Math.min(MAX_RETRY_WAIT_S, Number(response.headers.get('retry-after')) || 3);
        await sleep(wait * 1000);
        continue;
      }
      switch (response.status) {
        case 503:
          throw new ExportError(
            'busy',
            'The PDF engine is busy right now. Please try again in a few seconds.',
          );
        case 429: {
          const wait = Number(response.headers.get('retry-after'));
          throw new ExportError(
            'rate-limited',
            wait > 0
              ? `Too many exports. Please wait ${wait} seconds and try again.`
              : 'Too many exports. Please wait a moment.',
          );
        }
        case 413:
          throw new ExportError(
            'too-large',
            'The sheet’s images are too large to export. Use smaller images.',
            false,
          );
        case 403:
          throw new ExportError(
            'forbidden',
            'This site is not allowed to use the PDF engine. Contact the administrator.',
            false,
          );
        case 504:
          throw new ExportError(
            'timeout',
            'Rendering took too long. Try again, or simplify the sheet.',
          );
        case 422:
          throw new ExportError(
            'invalid',
            body.message
              ? `${body.message}${body.issues?.[0] ? ` (${body.issues[0]})` : ''}`
              : 'The PDF engine rejected this sheet.',
            false,
          );
        default:
          throw new ExportError('failed', 'The PDF could not be generated. Please try again.');
      }
    }
  } finally {
    clearTimeout(wake);
  }
}

/** Starts a file download in the browser and releases the temporary URL afterwards. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Wakes a sleeping engine (free hosting) while the user is still editing. Fire and forget. */
export function warmEngine(apiBase: string, fetchImpl: typeof fetch = fetch): void {
  void fetchImpl(`${apiBase}/healthz`, { method: 'GET', cache: 'no-store' }).catch(() => undefined);
}
