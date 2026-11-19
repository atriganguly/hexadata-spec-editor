import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PluginBuild } from 'esbuild';
import { transform } from 'lightningcss';
import { defineConfig } from 'tsup';

/**
 * Vite-style `import css from './x.css?inline'` for the server bundle: the CSS is minified with lightningcss
 * and inlined as a string. The templates package uses the same import in the editor (Vite) and here.
 */
const inlineCss = {
  name: 'inline-css',
  setup(build: PluginBuild) {
    build.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      // Keep `?inline` on the virtual path: a bare `.css` path would be claimed by esbuild's own CSS loader.
      path: `${resolve(args.resolveDir, args.path.replace(/\?inline$/, ''))}?inline`,
      namespace: 'inline-css',
    }));
    build.onLoad({ filter: /.*/, namespace: 'inline-css' }, (args) => {
      const file = args.path.replace(/\?inline$/, '');
      const { code } = transform({
        filename: file,
        code: readFileSync(file),
        minify: true,
      });
      return { contents: `export default ${JSON.stringify(code.toString())};`, loader: 'js' };
    });
  },
};

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: true,
  // Bundle our workspace packages (TypeScript sources); everything from node_modules stays external.
  noExternal: [/^@hexadata\/spec-/],
  esbuildPlugins: [inlineCss],
});
