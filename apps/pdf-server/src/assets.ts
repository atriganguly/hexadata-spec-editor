import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN_ASSETS,
  BRAND_LOGOS,
  type BrandLogoName,
  type BuiltinAssetId,
} from '@hexadata/spec-templates';

export interface VirtualFile {
  body: Buffer;
  type: string;
}

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export const mimeFor = (file: string): string =>
  MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';

/** Where the shipped template images live: next to the bundle (production) or in the workspace (dev, tests). */
function findBuiltinDir(): string {
  const candidates = [
    new URL('./assets/', import.meta.url),
    new URL('../dist/assets/', import.meta.url),
    new URL('../../../packages/templates/src/assets/', import.meta.url),
  ].map((url) => fileURLToPath(url));
  const found = candidates.find((dir) => existsSync(join(dir, 'partner-logo-1.webp')));
  if (!found) throw new Error(`Template assets not found. Looked in: ${candidates.join(', ')}`);
  return found;
}

/**
 * Everything the headless browser may load, held in memory. Loaded once at boot: brand tokens and fonts,
 * the shipped template images and the official logos. Nothing is fetched from the network.
 */
export class AssetStore {
  readonly brandCss: VirtualFile;
  readonly brandFontsCss: VirtualFile;
  readonly brandFonts = new Map<string, VirtualFile>();
  private readonly builtinDir = findBuiltinDir();
  private readonly builtinCache = new Map<BuiltinAssetId, VirtualFile>();
  private readonly logoCache = new Map<BrandLogoName, VirtualFile>();
  private readonly brandRoot: string;

  constructor() {
    const require = createRequire(import.meta.url);
    const cssPath = require.resolve('@hexadata/brand/css');
    const fontsCssPath = require.resolve('@hexadata/brand/fonts.css');
    this.brandRoot = dirname(dirname(cssPath)); // .../dist
    this.brandCss = { body: readFileSync(cssPath), type: MIME['.css']! };
    this.brandFontsCss = { body: readFileSync(fontsCssPath), type: MIME['.css']! };

    const fontsDir = join(dirname(fontsCssPath), 'fonts');
    for (const file of readdirSync(fontsDir)) {
      if (!file.endsWith('.woff2')) continue;
      this.brandFonts.set(file, {
        body: readFileSync(join(fontsDir, file)),
        type: MIME['.woff2']!,
      });
    }
    if (this.brandFonts.size === 0) throw new Error('No brand fonts found in @hexadata/brand.');
  }

  builtin(id: BuiltinAssetId): VirtualFile {
    let file = this.builtinCache.get(id);
    if (!file) {
      const meta = BUILTIN_ASSETS[id];
      file = { body: readFileSync(join(this.builtinDir, meta.file)), type: meta.mime };
      this.builtinCache.set(id, file);
    }
    return file;
  }

  brandLogo(name: BrandLogoName): VirtualFile {
    if (!(BRAND_LOGOS as readonly string[]).includes(name))
      throw new Error(`Unknown brand logo "${name}".`);
    let file = this.logoCache.get(name);
    if (!file) {
      file = {
        body: readFileSync(join(this.brandRoot, 'logo', `${name}.png`)),
        type: MIME['.png']!,
      };
      this.logoCache.set(name, file);
    }
    return file;
  }
}
