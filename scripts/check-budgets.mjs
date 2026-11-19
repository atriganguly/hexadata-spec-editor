// Performance budgets for the web app. Fails the build when a limit is exceeded, so "fast and light" is enforced,
// not just intended. Run after `npm run build`.
//
//  - initial JavaScript (entry + everything index.html preloads), gzip:   <= 130 KB
//  - stylesheet(s) loaded by index.html, gzip:                            <= 30 KB
//  - any embedded image (data: URI) in JS / CSS / HTML:                    <= 2 KB   (no base64 blobs in bundles)
//  - single image asset in dist/assets:                                    <= 250 KB
//  - PDF server bundle (main.js, excluding sourcemaps):                    <= 100 KB
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'apps/web/dist');
const KB = 1024;

const limits = {
  initialJs: 130 * KB,
  css: 30 * KB,
  dataUri: 2 * KB,
  image: 250 * KB,
  serverBundle: 100 * KB,
};

if (!existsSync(join(dist, 'index.html'))) {
  console.error('apps/web/dist not found. Run `npm run build` first.');
  process.exit(1);
}

const failures = [];
const rows = [];
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

function record(label, actual, limit, extra = '') {
  const ok = actual <= limit;
  rows.push(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${kb(actual).padStart(10)} / ${kb(limit).padStart(9)} ${extra}`,
  );
  if (!ok) failures.push(`${label}: ${kb(actual)} exceeds ${kb(limit)}`);
}

// ---------- what index.html loads up front ----------
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const resolve = (ref) => join(dist, ref.replace(/^\.?\//, ''));
const jsFiles = [...new Set(refs.filter((r) => r.endsWith('.js')))].map(resolve);
const cssFiles = [...new Set(refs.filter((r) => r.endsWith('.css')))].map(resolve);

record(
  'Initial JavaScript (gzip)',
  jsFiles.reduce((sum, f) => sum + gz(f), 0),
  limits.initialJs,
  `(${jsFiles.length} files)`,
);
record(
  'Stylesheets (gzip)',
  cssFiles.reduce((sum, f) => sum + gz(f), 0),
  limits.css,
  `(${cssFiles.length} files)`,
);

// ---------- walk dist ----------
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}
const files = walk(dist);

let biggestData = 0;
let biggestDataFile = '';
for (const file of files.filter((f) => /\.(js|css|html)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g)) {
    if (match[0].length > biggestData) {
      biggestData = match[0].length;
      biggestDataFile = relative(dist, file);
    }
  }
}
record(
  'Largest embedded data: image',
  biggestData,
  limits.dataUri,
  biggestDataFile ? `(${biggestDataFile})` : '',
);

const images = files.filter(
  (f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f) && f.includes(`${join(dist, 'assets')}`),
);
const biggestImage = images.reduce(
  (best, f) => (statSync(f).size > statSync(best).size ? f : best),
  images[0] ?? '',
);
if (biggestImage)
  record(
    'Largest image asset',
    statSync(biggestImage).size,
    limits.image,
    `(${relative(dist, biggestImage)})`,
  );

// ---------- service worker present ----------
if (!existsSync(join(dist, 'sw.js'))) failures.push('dist/sw.js is missing (offline support).');
else
  rows.push(
    `ok   Service worker                    present (${files.filter((f) => /workbox|sw\.js$/.test(f) && !f.endsWith('.map')).length} files)`,
  );

// ---------- PDF server bundle ----------
const server = join(root, 'apps/pdf-server/dist/main.js');
if (existsSync(server))
  record('PDF server bundle (main.js)', statSync(server).size, limits.serverBundle);

console.log(rows.join('\n'));
if (failures.length > 0) {
  console.error(`\nBudget check failed:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nAll budgets met.');
