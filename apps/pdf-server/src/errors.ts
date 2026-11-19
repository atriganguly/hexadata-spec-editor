/** Error codes returned to clients as `{ code, message }`. Messages never contain internals. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'ORIGIN_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INVALID_DOCUMENT'
  | 'UNKNOWN_TEMPLATE'
  | 'MISSING_ASSET'
  | 'INVALID_ASSET'
  | 'RATE_LIMITED'
  | 'BUSY'
  | 'RENDER_TIMEOUT'
  | 'RENDER_FAILED';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues?: string[];
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { issues?: string[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.issues = options.issues;
    this.headers = options.headers;
  }
}

/** Queue is full or the server is shutting down. Clients may retry after a short delay. */
export const busy = (message = 'The PDF engine is busy. Please try again in a few seconds.') =>
  new HttpError(503, 'BUSY', message, { headers: { 'Retry-After': '5' } });

export const renderTimeout = () =>
  new HttpError(504, 'RENDER_TIMEOUT', 'Rendering took too long. Simplify the sheet or try again.');

export const renderFailed = () =>
  new HttpError(500, 'RENDER_FAILED', 'The PDF could not be generated. Please try again.');
