// One-off asset optimiser: re-encodes the oversized product placeholder for print use.
// 80 x 60 mm slot at 300 dpi needs ~945 px wide; 1200 px keeps headroom.
import sharp from 'sharp';
import { statSync } from 'node:fs';

const src = 'packages/templates/src/classic/assets/product-placeholder.png';
const out = 'packages/templates/src/classic/assets/product-placeholder.webp';
await sharp(src)
  .resize({ width: 1200, withoutEnlargement: true })
  .webp({ quality: 88, alphaQuality: 95, effort: 6 })
  .toFile(out);
const meta = await sharp(out).metadata();
console.log(
  out,
  meta.width + 'x' + meta.height,
  'alpha:',
  meta.hasAlpha,
  Math.round(statSync(out).size / 1024) + ' KB',
);
