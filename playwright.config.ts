import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the PRODUCTION builds of both apps (CSP, service worker bundle, minified code),
 * exactly as they ship: the web app (vite preview) talking to the PDF server (real headless Chrome).
 */
const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:3101';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // one headless Chrome per PDF render: keep memory flat on small runners
  workers: 1,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Offline/PWA behaviour is covered separately; here a stale cache must never mask a regression.
    serviceWorkers: 'block',
    colorScheme: 'light',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run build -w @hexadata/spec-pdf-server && node apps/pdf-server/dist/main.js',
      url: `${API}/readyz`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        NODE_ENV: 'production',
        PORT: '3101',
        HOST: '127.0.0.1',
        ALLOWED_ORIGINS: WEB,
        LOG_LEVEL: 'warn',
        RATE_LIMIT_MAX: '500',
        CHROME_NO_SANDBOX: process.platform === 'linux' ? '1' : '0',
      },
    },
    {
      command:
        'npm run build -w @hexadata/spec-web && npm run preview -w @hexadata/spec-web -- --host 127.0.0.1',
      url: WEB,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: { VITE_API_BASE_URL: API },
    },
  ],
});
