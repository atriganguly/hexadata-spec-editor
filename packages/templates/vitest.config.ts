import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `?inline` CSS imports must return real CSS in tests (the default replaces CSS with '').
  test: { include: ['test/**/*.test.ts?(x)'], environment: 'node', css: true },
});
