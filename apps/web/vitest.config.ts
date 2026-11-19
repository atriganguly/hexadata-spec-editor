import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    // Node by default (real Blob, structuredClone, crypto). DOM tests opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
    css: true,
    setupFiles: ['test/setup.ts'],
    testTimeout: 15_000,
  },
});
