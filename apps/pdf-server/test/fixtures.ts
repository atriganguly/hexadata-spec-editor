import { rt, type RichText, type SpecSheetContent } from '@hexadata/spec-core';

export const richTextOf = (text: string): RichText => rt(text);

/** Copy of `content` with `text` injected into every text field that accepts it. */
export function createContent(content: SpecSheetContent, text: string): SpecSheetContent {
  const copy = structuredClone(content);
  copy.meta.title = rt(text);
  copy.meta.subtitle = rt(text);
  copy.keyFeatures[0]!.text = rt(text);
  copy.applications = rt(text);
  copy.specColumns[0][0]!.value = rt(text);
  copy.specColumns[1][0]!.label = rt(text);
  copy.footer.url = rt(text);
  return copy;
}
