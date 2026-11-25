import { CONTENT_MODEL_SPEC_SHEET } from '@hexadata/spec-core';
import { SHEET_FIELDS, type TemplateEntry } from '../types.ts';

/**
 * Registry entry for "Classic": the original HexaData A4 specification sheet.
 * Metadata only; the heavy parts load on demand.
 */
export const classic: TemplateEntry = {
  id: 'classic',
  version: 1,
  name: 'Classic',
  description:
    'The original HexaData A4 specification sheet with header bar, key features and a two-column spec table.',
  contentModel: CONTENT_MODEL_SPEC_SHEET,
  page: { size: 'A4', widthMm: 210, heightMm: 297 },
  imageSlots: {
    productImage: { widthMm: 80, heightMm: 60, fit: 'contain' },
    partnerLogo: { widthMm: 13.5, heightMm: 13.5, fit: 'contain' },
  },
  // Continuation: slim header (14 mm) + "Specification (continued)" tab + gap. Slim footer: bottom bar + page number tag.
  pagination: { continuationTopMm: 25, slimFooterMm: 13, slimFooterNoNumbersMm: 6 },
  fields: SHEET_FIELDS,
  contrast: [
    { fg: 'obsidian', bg: 'cyan', min: 4.5, use: 'Header title and section tabs on the cyan fill' },
    { fg: 'obsidian', bg: 'white', min: 4.5, use: 'Body, table and footer text' },
    { fg: 'deepBlue', bg: 'white', min: 4.5, use: 'Title and subtitle' },
    { fg: 'midnight', bg: 'white', min: 4.5, use: 'Emphasised table values' },
    { fg: 'white', bg: 'deepBlue', min: 4.5, use: 'Page number tag (brand accent badge)' },
  ],
  load: async () => (await import('./module.ts')).default,
};
