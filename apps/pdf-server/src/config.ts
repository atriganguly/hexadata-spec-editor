/**
 * Environment configuration. Everything is validated at boot; the process refuses to start on a
 * misconfiguration instead of running with an unsafe default.
 */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

export interface Config {
  production: boolean;
  host: string;
  port: number;
  /** Exact origins (scheme://host[:port]) allowed to call the API from a browser. */
  allowedOrigins: string[];
  /** Serve the built web app from this server (single-container deployment). */
  serveWeb: boolean;
  webDist: string | undefined;
  /** Renders running at the same time. Each one is a browser tab (~80-150 MB). */
  concurrency: number;
  /** Renders allowed to wait. Beyond this the server answers 503 immediately. */
  queueMax: number;
  /** Restart the browser after this many renders to cap memory growth. */
  recycleAfter: number;
  renderTimeoutMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /**
   * Passed to Fastify. Set to the number of proxy hops (e.g. 1 on Render) ONLY when behind a reverse proxy:
   * trusting X-Forwarded-For without one lets clients spoof their IP and dodge the rate limit.
   */
  trustProxy: boolean | number;
  logLevel: LogLevel;
  /** Chrome's sandbox needs kernel features most containers do not grant. See README, "Security model". */
  chromeNoSandbox: boolean;
  /** Launch the browser at boot so the first export is fast. */
  warmOnBoot: boolean;
}

type Env = Record<string, string | undefined>;

const LOG_LEVELS = ['silent', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

function logLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if ((LOG_LEVELS as readonly string[]).includes(value)) return value as LogLevel;
  throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')} (got "${raw}").`);
}

function int(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max} (got "${raw}").`);
  }
  return value;
}

function flag(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new ConfigError(`${name} must be a boolean (got "${env[name]}").`);
}

/** Normalises and validates one origin. Rejects wildcards, paths, queries and credentials. */
export function normalizeOrigin(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '*' || trimmed.includes('*')) {
    throw new ConfigError('ALLOWED_ORIGINS must list exact origins; wildcards are not allowed.');
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConfigError(`ALLOWED_ORIGINS contains an invalid origin: "${trimmed}".`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`ALLOWED_ORIGINS origin must be http(s): "${trimmed}".`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new ConfigError(
      `ALLOWED_ORIGINS must be an origin only (no path/query/credentials): "${trimmed}".`,
    );
  }
  return url.origin;
}

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function parseTrustProxy(raw: string | undefined): boolean | number {
  if (raw === undefined || raw.trim() === '') return false;
  const lowered = raw.trim().toLowerCase();
  if (['true', 'yes', 'on'].includes(lowered)) return true;
  if (['false', 'no', 'off', '0'].includes(lowered)) return false;
  const hops = Number(lowered);
  if (Number.isInteger(hops) && hops >= 1 && hops <= 10) return hops;
  throw new ConfigError(
    `TRUST_PROXY must be true, false or a number of proxy hops (got "${raw}").`,
  );
}

export function loadConfig(env: Env = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const serveWeb = flag(env, 'SERVE_WEB', false);

  const listed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  if (production && listed.length === 0 && !serveWeb) {
    throw new ConfigError(
      'ALLOWED_ORIGINS is required in production (comma-separated exact origins of the web app), unless SERVE_WEB=1 serves the app from this server.',
    );
  }
  const allowedOrigins = [...new Set(listed.length > 0 ? listed : production ? [] : DEV_ORIGINS)];

  const concurrency = int(env, 'RENDER_CONCURRENCY', 2, 1, 8);
  return {
    production,
    host: env.HOST?.trim() || '0.0.0.0',
    port: int(env, 'PORT', 3001, 0, 65535),
    allowedOrigins,
    serveWeb,
    webDist: env.WEB_DIST?.trim() || undefined,
    concurrency,
    queueMax: int(env, 'RENDER_QUEUE_MAX', 8, 0, 100),
    recycleAfter: int(env, 'BROWSER_RECYCLE_AFTER', 200, 1, 100_000),
    renderTimeoutMs: int(env, 'RENDER_TIMEOUT_MS', 20_000, 1000, 120_000),
    rateLimitMax: int(env, 'RATE_LIMIT_MAX', 30, 1, 10_000),
    rateLimitWindowMs: int(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1000, 3_600_000),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    logLevel: logLevel(env.LOG_LEVEL, production ? 'info' : 'debug'),
    chromeNoSandbox: flag(env, 'CHROME_NO_SANDBOX', process.platform === 'linux'),
    warmOnBoot: flag(env, 'WARM_ON_BOOT', true),
  };
}

/**
 * Same-origin requests (web app served by this server) and listed origins are allowed. Requests without an
 * Origin header (curl, server-to-server) carry no browser credentials and are governed by rate limits only.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  config: Config,
): boolean {
  if (origin === undefined) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (config.allowedOrigins.includes(parsed.origin)) return true;
  return config.serveWeb && host !== undefined && parsed.host === host;
}
