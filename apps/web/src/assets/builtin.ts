import {
  BUILTIN_ASSETS,
  builtinId,
  type AssetUrls,
  type BrandLogoName,
  type BuiltinAssetId,
} from '@hexadata/spec-templates';
import centeredDark from '@hexadata/brand/logo/centered-primary-on-dark.png';
import centeredLight from '@hexadata/brand/logo/centered-primary-on-light.png';
import centeredMono from '@hexadata/brand/logo/centered-mono.png';
import horizontalDark from '@hexadata/brand/logo/horizontal-primary-on-dark.png';
import horizontalLight from '@hexadata/brand/logo/horizontal-primary-on-light.png';
import horizontalMono from '@hexadata/brand/logo/horizontal-mono.png';
import iconDark from '@hexadata/brand/logo/icon-on-dark-256.png';
import iconLight from '@hexadata/brand/logo/icon-on-light-256.png';
import type { AssetRef } from '@hexadata/spec-core';

/** Hashed URLs of the images that ship with the app (resolved by Vite at build time). */
const builtinFiles = import.meta.glob('../../../../packages/templates/src/assets/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const builtinUrls = Object.fromEntries(
  (Object.keys(BUILTIN_ASSETS) as BuiltinAssetId[]).map((id) => {
    const file = BUILTIN_ASSETS[id].file;
    const url = Object.entries(builtinFiles).find(([path]) => path.endsWith(`/${file}`))?.[1];
    return [id, url];
  }),
) as Record<BuiltinAssetId, string | undefined>;

/** Official logos from `@hexadata/brand`, served from our own origin (strict CSP, works offline). */
export const brandLogoUrls: Record<BrandLogoName, string> = {
  'centered-primary-on-light': centeredLight,
  'centered-primary-on-dark': centeredDark,
  'centered-mono': centeredMono,
  'horizontal-primary-on-light': horizontalLight,
  'horizontal-primary-on-dark': horizontalDark,
  'horizontal-mono': horizontalMono,
  'icon-on-light-256': iconLight,
  'icon-on-dark-256': iconDark,
};

export function builtinUrl(ref: AssetRef): string | undefined {
  const id = builtinId(ref);
  return id ? builtinUrls[id] : undefined;
}

/** `AssetUrls` for the editor: builtin files, brand logos, and uploaded images from the asset cache. */
export function createEditorUrls(uploaded: (ref: AssetRef) => string | undefined): AssetUrls {
  return {
    asset: (ref) => builtinUrl(ref) ?? uploaded(ref),
    brandLogo: (name) => brandLogoUrls[name],
  };
}
