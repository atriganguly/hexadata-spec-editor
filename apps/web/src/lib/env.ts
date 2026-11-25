import pkg from '../../package.json';

/**
 * Base URL of the PDF engine, without a trailing slash.
 * - `VITE_API_BASE_URL=https://…` for GitHub Pages / separate hosting,
 * - empty or `/` for the single-container deployment (same origin),
 * - unset in development: the local server.
 */
function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured === undefined || configured === null) {
    return import.meta.env.DEV ? 'http://127.0.0.1:3001' : '';
  }
  return configured.replace(/\/+$/, '');
}

export const API_BASE = resolveApiBase();
export const APP_VERSION: string = pkg.version;
