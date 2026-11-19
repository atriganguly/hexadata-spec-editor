import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // `?inline` CSS imports (template styles) must contain real CSS, not '' (the Vitest default).
    css: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One headless Chrome at a time keeps memory bounded on small CI runners.
    fileParallelism: false,
  },
});
