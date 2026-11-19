import type { AssetRef } from '@hexadata/spec-core';

/**
 * Images that ship with the app. Files live in `src/assets/`; references use `builtin:<id>`.
 * The editor resolves them through Vite (hashed URLs); the PDF server reads them from disk.
 */
export const BUILTIN_ASSETS = {
  'partner-logo-1': { file: 'partner-logo-1.webp', mime: 'image/webp', label: 'Partner logo 1' },
  'partner-logo-2': { file: 'partner-logo-2.webp', mime: 'image/webp', label: 'Partner logo 2' },
  'product-placeholder': {
    file: 'product-placeholder.webp',
    mime: 'image/webp',
    label: 'Product placeholder',
  },
} as const;

export type BuiltinAssetId = keyof typeof BUILTIN_ASSETS;

export function isBuiltinRef(ref: AssetRef): boolean {
  return ref.startsWith('builtin:');
}

/** Returns the builtin id of a reference, or undefined if it is not a known builtin. */
export function builtinId(ref: AssetRef): BuiltinAssetId | undefined {
  if (!isBuiltinRef(ref)) return undefined;
  const id = ref.slice('builtin:'.length);
  return id in BUILTIN_ASSETS ? (id as BuiltinAssetId) : undefined;
}

/** SHA-256 of a user upload, or undefined for builtin references. */
export function assetHash(ref: AssetRef): string | undefined {
  return ref.startsWith('asset:') ? ref.slice('asset:'.length) : undefined;
}
