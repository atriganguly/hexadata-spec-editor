import { describe, expect, it } from 'vitest';
import { ConfigError, isOriginAllowed, loadConfig, normalizeOrigin } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses safe development defaults', () => {
    const config = loadConfig({});
    expect(config.production).toBe(false);
    expect(config.port).toBe(3001);
    expect(config.concurrency).toBe(2);
    expect(config.allowedOrigins).toContain('http://localhost:5173');
    expect(config.trustProxy).toBe(false);
  });

  it('refuses to start in production without an origin allow-list', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: ' , ' })).toThrow(
      ConfigError,
    );
  });

  it('allows production without a list only when serving the web app itself', () => {
    expect(loadConfig({ NODE_ENV: 'production', SERVE_WEB: '1' }).allowedOrigins).toEqual([]);
    expect(
      loadConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://a.example/, https://b.example',
      }).allowedOrigins,
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('rejects wildcards, paths and non-http origins', () => {
    for (const bad of [
      '*',
      'https://*.example.com',
      'https://a.example/path',
      'ftp://a.example',
      'nope',
      'https://u:p@a.example',
    ]) {
      expect(() => normalizeOrigin(bad), bad).toThrow(ConfigError);
    }
    expect(normalizeOrigin('HTTPS://App.Example:443/')).toBe('https://app.example');
  });

  it('validates numbers and booleans', () => {
    expect(() => loadConfig({ RENDER_CONCURRENCY: '0' })).toThrow(ConfigError);
    expect(() => loadConfig({ RENDER_CONCURRENCY: '99' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ SERVE_WEB: 'maybe' })).toThrow(ConfigError);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(ConfigError);
    expect(loadConfig({ RENDER_CONCURRENCY: '3', WARM_ON_BOOT: 'off' })).toMatchObject({
      concurrency: 3,
      warmOnBoot: false,
    });
  });

  it('parses TRUST_PROXY', () => {
    expect(loadConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(loadConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(() => loadConfig({ TRUST_PROXY: 'everyone' })).toThrow(ConfigError);
  });
});

describe('isOriginAllowed', () => {
  const config = loadConfig({ ALLOWED_ORIGINS: 'https://app.example' });
  const web = loadConfig({ NODE_ENV: 'production', SERVE_WEB: '1' });

  it('allows requests without an Origin header', () => {
    expect(isOriginAllowed(undefined, 'api.example', config)).toBe(true);
  });

  it('allows listed origins only', () => {
    expect(isOriginAllowed('https://app.example', 'api.example', config)).toBe(true);
    expect(isOriginAllowed('https://evil.example', 'api.example', config)).toBe(false);
    expect(isOriginAllowed('http://app.example', 'api.example', config)).toBe(false);
    expect(isOriginAllowed('null', 'api.example', config)).toBe(false);
    expect(isOriginAllowed('garbage', 'api.example', config)).toBe(false);
  });

  it('allows the same origin when the web app is served from here', () => {
    expect(isOriginAllowed('https://specs.example', 'specs.example', web)).toBe(true);
    expect(isOriginAllowed('https://evil.example', 'specs.example', web)).toBe(false);
    expect(isOriginAllowed('https://specs.example', 'specs.example', config)).toBe(false);
  });
});
