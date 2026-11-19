// Production-bundle smoke test: boots `dist/main.js`, waits until the browser is ready, renders a sheet and
// checks the result. Used by CI and by the Docker image check. Run after `npm run build`.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createEmptyContent, rt } from '@hexadata/spec-core';

const port = Number(process.env.SMOKE_PORT ?? 3987);
const base = `http://127.0.0.1:${port}`;

const server = spawn(
  process.execPath,
  [new URL('../dist/main.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      ALLOWED_ORIGINS: 'https://app.example.test',
      LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

let exited = false;
server.once('exit', () => {
  exited = true;
});

async function waitReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error('Server exited during start-up');
    try {
      const res = await fetch(`${base}/readyz`);
      if (res.status === 200) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for /readyz');
}

try {
  await waitReady();

  const content = createEmptyContent();
  content.meta.headerTitle = rt('Smoke test');
  content.meta.title = rt('Smoke Sheet');
  const res = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, templateId: 'classic', templateVersion: 1, content }),
  });
  if (res.status !== 200) throw new Error(`Render failed: ${res.status} ${await res.text()}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  if (header !== '%PDF-') throw new Error(`Not a PDF: ${header}`);
  if (res.headers.get('x-pdf-pages') !== '1') throw new Error('Expected exactly one page');

  const blocked = await fetch(`${base}/v1/render`, {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: '{}',
  });
  if (blocked.status !== 403)
    throw new Error(`Foreign origin should get 403, got ${blocked.status}`);

  console.log(`Smoke test passed: ${bytes.byteLength} byte PDF, foreign origin blocked.`);
} finally {
  server.kill('SIGTERM');
  if (!exited) await once(server, 'exit');
}
