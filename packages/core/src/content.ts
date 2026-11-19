import { newId } from './ids.ts';
import { rt } from './richtext.ts';
import type { KeyFeature, PartnerLogo, SpecRow, SpecSheetContent } from './schema.ts';

/** An empty, valid spec-sheet content object. Always returns fresh objects (never shared state). */
export function createEmptyContent(): SpecSheetContent {
  return {
    meta: { headerTitle: [], title: [], subtitle: [] },
    partnerLogos: [],
    productImage: null,
    keyFeatures: [],
    applications: [],
    specColumns: [[], []],
    footer: { url: [], disclaimer: [], copyright: [] },
    extras: {},
  };
}

export function createRow(label = 'New Label', value = 'New Value', emphasis = false): SpecRow {
  return { id: newId(), label: rt(label), value: rt(value), emphasis };
}

export function createFeature(text = 'New Key Feature'): KeyFeature {
  return { id: newId(), text: rt(text) };
}

export function createPartnerLogo(ref: string): PartnerLogo {
  return { id: newId(), ref };
}

/** Deep copy of plain JSON-like content (structuredClone is available in Node 17+ and browsers). */
export function cloneContent(content: SpecSheetContent): SpecSheetContent {
  return structuredClone(content);
}
