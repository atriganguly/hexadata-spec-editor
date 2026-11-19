import type { ComponentType } from 'react';
import type { AssetRef, RichText, SpecSheetContent } from '@hexadata/spec-core';

export type TemplateMode = 'edit' | 'print';

/** Parts of the content a template can render. Used to warn before switching to a template that hides some. */
export const SHEET_FIELDS = [
  'meta.headerTitle',
  'meta.title',
  'meta.subtitle',
  'partnerLogos',
  'productImage',
  'keyFeatures',
  'applications',
  'specColumns',
  'footer.url',
  'footer.disclaimer',
  'footer.copyright',
] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];

/** Top-level rich-text fields a template can place with the `Text` slot. */
export type TextField =
  | 'meta.headerTitle'
  | 'meta.title'
  | 'meta.subtitle'
  | 'applications'
  | 'footer.url'
  | 'footer.disclaimer'
  | 'footer.copyright';

/** Address of any rich-text cell. The editor uses it to commit edits to the right place. */
export type TextAddress =
  | { kind: 'field'; field: TextField }
  | { kind: 'feature'; id: string }
  | { kind: 'row'; column: 0 | 1; id: string; part: 'label' | 'value' };

export interface TextCellProps {
  address: TextAddress;
  value: RichText;
  className?: string;
}

/** Official HexaData logo files shipped by `@hexadata/brand` (`dist/logo/<name>.png`). */
export const BRAND_LOGOS = [
  'centered-primary-on-light',
  'centered-primary-on-dark',
  'centered-mono',
  'horizontal-primary-on-light',
  'horizontal-primary-on-dark',
  'horizontal-mono',
  'icon-on-light-256',
  'icon-on-dark-256',
] as const;
export type BrandLogoName = (typeof BRAND_LOGOS)[number];

/** Turns references into loadable URLs. Differs per environment (editor, PDF server). */
export interface AssetUrls {
  /** `builtin:` and `asset:` references. Returns undefined when the asset is not available. */
  asset(ref: AssetRef): string | undefined;
  brandLogo(name: BrandLogoName): string;
}

export interface SheetValue {
  content: SpecSheetContent;
  mode: TemplateMode;
  urls: AssetUrls;
  /** Rich-text cell renderer. Defaults to static, escaped rendering (PDF). The editor injects an editable one. */
  TextCell?: ComponentType<TextCellProps>;
}

export interface PageSpec {
  size: 'A4';
  widthMm: number;
  heightMm: number;
}

export interface ImageSlotSpec {
  widthMm: number;
  heightMm: number;
  fit: 'contain' | 'cover';
}

/** Metadata the editor needs without loading the template code. */
export interface TemplateMeta {
  /** Lowercase slug. Stored in drafts; never change it. */
  id: string;
  /** Increment on breaking layout changes; old versions stay loadable for old drafts. */
  version: number;
  name: string;
  description: string;
  /** Templates sharing a content model can swap content without loss. */
  contentModel: string;
  page: PageSpec;
  imageSlots: {
    productImage: ImageSlotSpec;
    partnerLogo: ImageSlotSpec;
  };
  /** Content parts this template renders. Anything else is kept in the draft but not shown. */
  fields: readonly SheetField[];
  /** Brand colour pairs the template renders as text on a fill. Verified against the brand contrast gate in tests. */
  contrast: ReadonlyArray<{ fg: string; bg: string; min: number; use: string }>;
}

/** The loadable part of a template (kept out of the main bundle until needed). */
export interface TemplateModule {
  Component: ComponentType;
  /** Template-specific CSS. Combined with the shared slot CSS by the consumer. */
  css: string;
  createDefaults(): SpecSheetContent;
}

export interface TemplateEntry extends TemplateMeta {
  load(): Promise<TemplateModule>;
}
