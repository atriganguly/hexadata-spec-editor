import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderSheetHtml, stripPreloadHints } from '../src/print.tsx';
import { contrastRatio, DEFAULT_PALETTE, type PaletteKey } from '@hexadata/brand';
import {
  createEmptyContent,
  createPartnerLogo,
  migrateDocument,
  parseContent,
  rt,
  type SpecSheetContent,
} from '@hexadata/spec-core';
import {
  BUILTIN_ASSETS,
  builtinId,
  DEFAULT_TEMPLATE_ID,
  getTemplateMeta,
  listTemplates,
  loadTemplate,
  SheetProvider,
  type AssetUrls,
} from '../src/index.ts';

const urls: AssetUrls = {
  asset: (ref) =>
    ref.startsWith('builtin:') ? `https://render.local/builtin/${ref.slice(8)}` : undefined,
  brandLogo: (name) => `https://render.local/brand/${name}.png`,
};

async function renderSheet(content: SpecSheetContent, mode: 'edit' | 'print' = 'print') {
  const template = await loadTemplate('classic');
  if (!template) throw new Error('classic missing');
  if (mode === 'print') return renderSheetHtml(template, { content, urls });
  // Edit mode (editor): same tree, data attributes only.
  const { Component } = template;
  return stripPreloadHints(
    renderToStaticMarkup(
      <SheetProvider value={{ content, mode, urls }}>
        <Component />
      </SheetProvider>,
    ),
  );
}

describe('registry', () => {
  it('lists the Classic template as the default', () => {
    const list = listTemplates();
    expect(list.map((t) => t.id)).toContain('classic');
    expect(DEFAULT_TEMPLATE_ID).toBe('classic');
    const meta = getTemplateMeta('classic');
    expect(meta?.page).toEqual({ size: 'A4', widthMm: 210, heightMm: 297 });
  });

  it('resolves exact versions and rejects unknown ones', async () => {
    expect(getTemplateMeta('classic', 1)?.version).toBe(1);
    expect(getTemplateMeta('classic', 99)).toBeUndefined();
    expect(getTemplateMeta('nope')).toBeUndefined();
    expect(await loadTemplate('nope')).toBeUndefined();
  });

  it('loads component, css and defaults', async () => {
    const template = await loadTemplate('classic');
    expect(typeof template?.Component).toBe('function');
    expect(template?.css).toContain('.cs-sheet');
    expect(template?.createDefaults).toBeTypeOf('function');
  });
});

describe('Classic defaults', () => {
  it('are valid content and migrate-compatible', async () => {
    const template = (await loadTemplate('classic'))!;
    const content = template.createDefaults();
    expect(parseContent(content).ok).toBe(true);
    const doc = { schemaVersion: 1, templateId: 'classic', templateVersion: 1, content };
    expect(migrateDocument(doc).ok).toBe(true);
  });

  it('return fresh objects every call (Reset cannot be poisoned by edits)', async () => {
    const template = (await loadTemplate('classic'))!;
    const a = template.createDefaults();
    const before = JSON.stringify(a);
    a.keyFeatures.pop();
    a.meta.title = rt('changed');
    a.specColumns[0].length = 0;
    a.partnerLogos.push(createPartnerLogo('builtin:partner-logo-1'));
    const b = template.createDefaults();
    expect(JSON.stringify(b)).toBe(before);
    expect(b).not.toBe(a);
    expect(b.specColumns[0]).not.toBe(a.specColumns[0]);
  });

  it('only reference shipped assets, and the type is the ASCII "HexaData" (typo fixed)', async () => {
    const content = (await loadTemplate('classic'))!.createDefaults();
    const refs = [content.productImage, ...content.partnerLogos.map((l) => l.ref)];
    for (const ref of refs) expect(builtinId(ref!)).toBeDefined();
    expect(JSON.stringify(content)).not.toContain('Hexdata');
    expect(Object.keys(BUILTIN_ASSETS)).toEqual([
      'partner-logo-1',
      'partner-logo-2',
      'product-placeholder',
    ]);
  });
});

describe('Classic rendering (print mode)', () => {
  it('renders the default sheet with content, logos and the official brand mark', async () => {
    const template = (await loadTemplate('classic'))!;
    const html = await renderSheet(template.createDefaults());
    expect(html).toContain('HexaData Server System');
    expect(html).toContain('HD-RS2200 Version : G294');
    expect(html).toContain('Key Features');
    expect(html).toContain('Specification');
    expect(html).toContain('https://render.local/builtin/product-placeholder');
    expect(html).toContain('https://render.local/brand/centered-primary-on-light.png');
    expect((html.match(/cs-logo"/g) ?? []).length).toBe(2);
    expect(html).toContain('cs-td-emphasis');
  });

  it('has no editor artefacts', async () => {
    const template = (await loadTemplate('classic'))!;
    const html = await renderSheet(template.createDefaults());
    expect(html).not.toMatch(/contenteditable|data-edit|button|<input/i);
  });

  it('escapes hostile content: it appears as text, never as elements', async () => {
    const content = (await loadTemplate('classic'))!.createDefaults();
    const attack = '<script>alert(1)</script><img src="http://169.254.169.254/x" onerror="y">';
    content.meta.title = rt(attack);
    content.keyFeatures[0]!.text = rt(attack);
    content.specColumns[0][0]!.value = rt(attack);
    content.footer.url = rt(attack);
    const html = await renderSheet(content);
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<img[^>]*169\.254/);
    expect(html).not.toContain('onerror="');
    expect(html.match(/<img /g)).toHaveLength(2 + 1 + 1); // 2 partner logos + product + brand mark, nothing injected
    expect(html).toContain('&lt;script&gt;');
  });

  it('removing every partner logo leaves none in the output', async () => {
    const content = (await loadTemplate('classic'))!.createDefaults();
    content.partnerLogos = [];
    const html = await renderSheet(content);
    expect(html).not.toContain('cs-logo"');
    expect(html).not.toContain('partner-logo');
  });

  it('omits missing images in print but keeps the slot in the editor', async () => {
    const content = createEmptyContent();
    expect(await renderSheet(content, 'print')).not.toContain('data-edit-image');
    const editHtml = await renderSheet(content, 'edit');
    expect(editHtml).toContain('data-edit-image="product"');
    expect(editHtml).toContain('data-edit-list="features"');
  });

  it('edit mode adds only data attributes, never changes the structure', async () => {
    const content = (await loadTemplate('classic'))!.createDefaults();
    const strip = (html: string) =>
      html
        .replace(/ data-(edit-[a-z]+|id|column|empty)="[^"]*"/g, '')
        .replace(/ data-empty=""/g, '');
    expect(strip(await renderSheet(content, 'edit'))).toBe(await renderSheet(content, 'print'));
  });
});

describe('Classic brand discipline', () => {
  const css = readFileSync(new URL('../src/classic/styles.css', import.meta.url), 'utf8');

  it('contains no raw colours: tokens only', () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(noComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(noComments).not.toMatch(/\brgba?\(|\bhsla?\(/);
    expect(noComments).not.toMatch(/:\s*(white|black|red|blue|grey|gray)\b/);
  });

  it('puts Obsidian text on the cyan fill (white on cyan is a forbidden brand pair)', () => {
    for (const selector of ['.cs-header-title', '.cs-tab']) {
      const block =
        css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(block, selector).toContain('color: var(--hd-obsidian)');
    }
  });

  it('declares only contrast pairs the brand allows, and they meet their minimum ratio', () => {
    const allowed = new Set([
      'obsidian/cyan',
      'obsidian/white',
      'deepBlue/white',
      'midnight/white',
    ]);
    for (const pair of getTemplateMeta('classic')!.contrast) {
      expect(allowed.has(`${pair.fg}/${pair.bg}`), `${pair.fg}/${pair.bg}`).toBe(true);
      const ratio = contrastRatio(
        DEFAULT_PALETTE[pair.fg as PaletteKey],
        DEFAULT_PALETTE[pair.bg as PaletteKey],
      );
      expect(ratio, `${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(pair.min);
    }
  });

  it('keeps the original A4 geometry', () => {
    for (const fragment of [
      'width: 210mm',
      'height: 297mm',
      'height: 14mm',
      'padding: 0 12mm',
      'font-size: 24pt',
      'font-size: 20pt',
      'clip-path: polygon(0 0, calc(100% - 4mm) 0, 100% 100%, 0 100%)',
      'margin-left: -2mm',
      'width: 80mm',
      'height: 60mm',
      'width: 13.5mm',
      'bottom: 8mm',
      'margin-bottom: -8mm',
      'height: 4mm',
    ]) {
      expect(css, fragment).toContain(fragment);
    }
  });
});

describe('template switching helpers', () => {
  it('lists filled-in fields a target template would hide (nothing is deleted)', async () => {
    const { fieldsInUse, hiddenFieldsAfterSwitch } = await import('../src/index.ts');
    const content = (await loadTemplate('classic'))!.createDefaults();
    expect(fieldsInUse(content)).toContain('keyFeatures');
    expect(fieldsInUse(createEmptyContent())).toEqual([]);
    const target = { fields: ['meta.title', 'keyFeatures'] as const };
    const hidden = hiddenFieldsAfterSwitch(content, target);
    expect(hidden).toContain('specColumns');
    expect(hidden).toContain('productImage');
    expect(hidden).not.toContain('keyFeatures');
    expect(hiddenFieldsAfterSwitch(content, getTemplateMeta('classic')!)).toEqual([]);
  });
});
