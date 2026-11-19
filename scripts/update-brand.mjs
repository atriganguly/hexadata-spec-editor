// Updates the vendored @hexadata/brand package.
//
//   npm run brand:update -- <version> [source]
//
// `source` is a local .tgz (e.g. produced by `npm pack` in the brand repository) or an https URL; by default the
// GitHub release asset for <version> is downloaded. The tarball is stored in vendor/ and every workspace that
// depends on it is pointed at the new file. Then run `npm install` and `npm run check`.
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const [version, source] = process.argv.slice(2);

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    'Usage: npm run brand:update -- <version> [path-or-url-to-tarball]\nExample: npm run brand:update -- 2.2.0',
  );
  process.exit(1);
}

const fileName = `hexadata-brand-${version}.tgz`;
const target = join(root, 'vendor', fileName);
const from =
  source ??
  `https://github.com/atriganguly/hexadata-brand/releases/download/v${version}/${fileName}`;

if (/^https:\/\//.test(from)) {
  console.log(`Downloading ${from}`);
  const response = await fetch(from);
  if (!response.ok) {
    console.error(`Download failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
} else if (existsSync(from)) {
  copyFileSync(from, target);
} else {
  console.error(`Source not found: ${from}`);
  process.exit(1);
}

for (const old of readdirSync(join(root, 'vendor'))) {
  if (/^hexadata-brand-.*\.tgz$/.test(old) && old !== fileName) rmSync(join(root, 'vendor', old));
}

const manifests = [
  'apps/web/package.json',
  'apps/pdf-server/package.json',
  'packages/templates/package.json',
];
for (const manifest of manifests) {
  const path = join(root, manifest);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  let changed = false;
  for (const section of ['dependencies', 'devDependencies']) {
    if (json[section]?.['@hexadata/brand']) {
      json[section]['@hexadata/brand'] = `file:../../vendor/${fileName}`;
      changed = true;
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

console.log(`Vendored ${fileName}.\nNext: npm install && npm run check`);
console.log(
  'Brand changes are visual changes: review the editor in light and dark, and re-check the template contrast tests.',
);
