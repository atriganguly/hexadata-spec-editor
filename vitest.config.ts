import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/core', 'packages/templates', 'apps/pdf-server', 'apps/web'],
  },
});
