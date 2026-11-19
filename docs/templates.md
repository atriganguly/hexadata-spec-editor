# Adding a template

A template is a React component plus a stylesheet. It renders **both** the editor and the PDF, so you write the layout once and it is guaranteed to match. This guide adds a template called `compact` as an example.

## 1. The ground rules

- Place content **only** through slots (`packages/templates/src/slots.tsx`). Never render content text yourself, never add editing UI, never branch on edit/print mode in markup.
- Style with the brand tokens: `var(--hd-cyan)`, `var(--hd-obsidian)`, `var(--hd-font-display)`, ... A printed sheet is fixed light paper, so use the **raw palette tokens** (not the light/dark roles). Allowed text/background pairs are listed in the brand's `contrast.json` (for example Obsidian on Cyan, Deep Blue on White; **never white on cyan**). Declare every pair you use in the template metadata; a test checks them against the brand's contrast maths.
- No hex or `rgb()` colours in CSS (a test fails if you add one). Use the brand font families; weights 400-700 exist.
- Use real physical units (`mm`, `pt`) for the print geometry. The sheet is an absolutely sized element (for A4: `210mm x 297mm`) with `overflow: hidden`.
- Include a scoped reset: `.my-sheet, .my-sheet * { box-sizing: border-box; }`, explicit `line-height`, `list-style`, `margin`, `padding` on every element that browsers or the app's base styles would otherwise style. The editor's CSS framework and the print document must not change your layout.

## 2. Files

```
packages/templates/src/compact/
  entry.ts       registry entry (metadata only, loads module.ts lazily)
  module.ts      exports { Component, css, createDefaults }
  Compact.tsx    the template component
  styles.css     the template's CSS
  defaults.ts    createCompactDefaults(): returns FRESH content every call
```

### entry.ts

```ts
import { CONTENT_MODEL_SPEC_SHEET } from '@hexadata/spec-core';
import { SHEET_FIELDS, type TemplateEntry } from '../types.ts';

export const compact: TemplateEntry = {
  id: 'compact', // lowercase slug, stored in drafts: never change it
  version: 1, // bump for breaking layout changes; keep the old entry for old drafts
  name: 'Compact',
  description: 'One-column datasheet with a larger product image.',
  contentModel: CONTENT_MODEL_SPEC_SHEET,
  page: { size: 'A4', widthMm: 210, heightMm: 297 },
  imageSlots: {
    productImage: { widthMm: 120, heightMm: 70, fit: 'contain' }, // sizes the editor's image pipeline
    partnerLogo: { widthMm: 14, heightMm: 14, fit: 'contain' },
  },
  fields: SHEET_FIELDS.filter((f) => f !== 'applications'), // what it renders: the rest is kept, not shown
  contrast: [{ fg: 'obsidian', bg: 'white', min: 4.5, use: 'Body text' }],
  load: async () => (await import('./module.ts')).default,
};
```

### module.ts

```ts
import type { TemplateModule } from '../types.ts';
import { Compact } from './Compact.tsx';
import css from './styles.css?inline';
import { createCompactDefaults } from './defaults.ts';

const module: TemplateModule = { Component: Compact, css, createDefaults: createCompactDefaults };
export default module;
```

### Compact.tsx

```tsx
import { BrandLogo, Features, PartnerLogos, ProductImage, SpecTable, Text } from '../slots.tsx';

export function Compact() {
  return (
    <div className="ct-sheet" data-template="compact">
      <Text field="meta.title" className="ct-title" />
      <ProductImage className="ct-product" />
      <Features className="ct-list" itemClassName="ct-item" />
      <div data-hd-flow="">
        <SpecTable
          column={0}
          className="ct-table"
          labelClassName="ct-label"
          emphasisClassName="ct-emph"
        />
      </div>
      <BrandLogo name="horizontal-primary-on-light" className="ct-mark" fixed />
    </div>
  );
}
```

`data-hd-flow` marks flowing content and `data-hd-fixed` (or `fixed` on `BrandLogo`) marks absolutely positioned content; the editor warns when they collide or when a flow element runs past the page.

### defaults.ts

Return a **new** object each call (`createEmptyContent()` plus your sample data). Never export a shared constant: a shared object is how the old editor's Reset got poisoned by earlier edits.

## 3. Register it

`packages/templates/src/registry.ts`:

```ts
import { compact } from './compact/entry.ts';
const ENTRIES: readonly TemplateEntry[] = [classic, compact];
```

That is all the editor needs: the template dropdown, "New draft" cards, switching (with a warning when the target hides filled-in content), PDF export and code-splitting pick it up from the registry.

## 4. Test it

Copy `packages/templates/test/classic.test.tsx` and adapt: defaults valid and fresh, print rendering contains the content and no editor attributes, hostile text is escaped, edit and print markup differ only by `data-edit-*`, CSS has no raw colours, declared contrast pairs are allowed. Then run `npm test` and `npm run test:e2e` (the parity test compares the editor with the PDF; add one for your template if its geometry is new).

## 5. Different content model?

If your template needs fields the shared `spec-sheet@1` model does not have, put them in `content.extras` (string/number/boolean values, validated and kept when switching templates) or, for a genuinely different structure, introduce a new content model: see "Changing the content model" in `AGENTS.md`.
