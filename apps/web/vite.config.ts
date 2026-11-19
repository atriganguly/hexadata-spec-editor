import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { DEFAULT_PALETTE } from '@hexadata/brand';

/**
 * Production-only: a Content-Security-Policy <meta> (GitHub Pages cannot send headers) and preload hints for the
 * two Latin brand fonts the first paint needs. `connect-src` lists the PDF engine origin only.
 */
function securityAndPreload(apiBase: string): Plugin {
  const api = apiBase.startsWith('http') ? new URL(apiBase).origin : "'self'";
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${api}`.trim(),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'hd-security-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags: HtmlTagDescriptor[] = [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
            injectTo: 'head-prepend',
          },
        ];
        for (const fileName of Object.keys(ctx.bundle ?? {})) {
          if (/(space-grotesk|inter-tight)-latin-wght-normal.*\.woff2$/.test(fileName)) {
            tags.push({
              tag: 'link',
              attrs: {
                rel: 'preload',
                as: 'font',
                type: 'font/woff2',
                crossorigin: '',
                href: `./${fileName}`,
              },
              injectTo: 'head',
            });
          }
        }
        return tags;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = env.VITE_API_BASE_URL || '';

  return {
    // Relative base: works on localhost, GitHub Pages sub-paths and behind any reverse proxy.
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      securityAndPreload(apiBase),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false, // registered by src/app/pwa.ts (update prompt, never a forced reload)
        manifest: {
          name: 'HexaData Spec Editor',
          short_name: 'Spec Editor',
          description: 'Create and export HexaData A4 specification sheets.',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: DEFAULT_PALETTE.obsidian,
          theme_color: DEFAULT_PALETTE.obsidian,
          icons: [
            { src: 'brand/logo/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'brand/logo/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'brand/logo/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,png,webp,ico}'],
          // The PDF engine is never cached: exports always go to the network.
          navigateFallbackDenylist: [/\/v1\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      target: 'es2023',
      sourcemap: true,
      chunkSizeWarningLimit: 400,
      rollupOptions: {
        output: {
          // Keep the editor shell small; heavy, rarely-used code loads on demand.
          manualChunks: undefined,
        },
      },
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    worker: { format: 'es' },
  };
});
