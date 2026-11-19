import { isEmpty, type SpecSheetContent } from '@hexadata/spec-core';
import type { SheetField, TemplateMeta } from './types.ts';

/** Content parts that currently hold something. */
export function fieldsInUse(content: SpecSheetContent): SheetField[] {
  const used: SheetField[] = [];
  if (!isEmpty(content.meta.headerTitle)) used.push('meta.headerTitle');
  if (!isEmpty(content.meta.title)) used.push('meta.title');
  if (!isEmpty(content.meta.subtitle)) used.push('meta.subtitle');
  if (content.partnerLogos.length > 0) used.push('partnerLogos');
  if (content.productImage) used.push('productImage');
  if (content.keyFeatures.length > 0) used.push('keyFeatures');
  if (!isEmpty(content.applications)) used.push('applications');
  if (content.specColumns.some((rows) => rows.length > 0)) used.push('specColumns');
  if (!isEmpty(content.footer.url)) used.push('footer.url');
  if (!isEmpty(content.footer.disclaimer)) used.push('footer.disclaimer');
  if (!isEmpty(content.footer.copyright)) used.push('footer.copyright');
  return used;
}

/** Filled-in parts the target template would not show. They stay in the draft; nothing is deleted. */
export function hiddenFieldsAfterSwitch(
  content: SpecSheetContent,
  target: Pick<TemplateMeta, 'fields'>,
): SheetField[] {
  return fieldsInUse(content).filter((field) => !target.fields.includes(field));
}

const LABELS: Record<SheetField, string> = {
  'meta.headerTitle': 'Header title',
  'meta.title': 'Title',
  'meta.subtitle': 'Subtitle',
  partnerLogos: 'Partner logos',
  productImage: 'Product image',
  keyFeatures: 'Key features',
  applications: 'Applications',
  specColumns: 'Specification tables',
  'footer.url': 'Footer link',
  'footer.disclaimer': 'Footer disclaimer',
  'footer.copyright': 'Footer copyright',
};

export const fieldLabel = (field: SheetField): string => LABELS[field];
