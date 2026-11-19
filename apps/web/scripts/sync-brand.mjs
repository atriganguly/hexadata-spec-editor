// Copies the official logo files the app serves directly (favicons, PWA icons, header logo) from the vendored
// @hexadata/brand package into public/brand/logo. Generated; git-ignored. Runs before dev and build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const brandRoot = dirname(require.resolve('@hexadata/brand/package.json'));
const from = join(brandRoot, 'dist', 'logo');
const to = new URL('../public/brand/logo/', import.meta.url);
mkdirSync(to, { recursive: true });

const files = [
  'favicon.ico',
  'favicon-32.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'horizontal-primary-on-light.png',
  'horizontal-primary-on-dark.png',
];
for (const file of files) copyFileSync(join(from, file), new URL(file, to));
console.log(`Synced ${files.length} brand logo files to public/brand/logo`);
