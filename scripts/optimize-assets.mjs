// Asset optimiser for shipped template images.
//
//   node scripts/optimize-assets.mjs <source-image> [width]
//
// Re-encodes <source-image> as a WebP next to it (same name, .webp), never enlarging, default width 1200 px
// (an 80 x 60 mm slot at 300 dpi needs ~945 px). Move the result into packages/templates/src/assets/, keep it
// under the performance budget (`npm run budgets`) and register new ids in packages/templates/src/assets.ts.
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { parse } from 'node:path';

const [src, widthArg] = process.argv.slice(2);
const width = Number(widthArg ?? 1200);
if (!src || !Number.isInteger(width) || width < 1) {
  console.error('Usage: node scripts/optimize-assets.mjs <source-image> [width]');
  process.exit(1);
}

const { dir, name } = parse(src);
const out = `${dir ? `${dir}/` : ''}${name}.webp`;
if (out === src) {
  console.error('The source is already a .webp: rename it first so it is not overwritten.');
  process.exit(1);
}
await sharp(src)
  .resize({ width, withoutEnlargement: true })
  .webp({ quality: 88, alphaQuality: 95, effort: 6 })
  .toFile(out);
const meta = await sharp(out).metadata();
console.log(
  out,
  `${meta.width}x${meta.height}`,
  'alpha:',
  meta.hasAlpha,
  `${Math.round(statSync(out).size / 1024)} KB`,
);
