import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import { expect, type Page } from '@playwright/test';
import { createRow, type SpecSheetContent } from '@hexadata/spec-core';
import { createClassicDefaults } from '../packages/templates/src/classic/defaults.ts';

/** A draft whose spec rows have unique, short labels (`A-01`, `B-07`...) so pages can be compared by label. */
export function draftContent(
  left: Array<{ lines: number }>,
  right: Array<{ lines: number }>,
): SpecSheetContent {
  const content = createClassicDefaults();
  const make = (prefix: string, rows: Array<{ lines: number }>) =>
    rows.map((row, i) =>
      createRow(
        `${prefix}-${String(i + 1).padStart(2, '0')}`,
        Array.from({ length: row.lines }, (_, n) => `line ${n + 1}`).join('\n'),
      ),
    );
  content.specColumns = [make('A', left), make('B', right)];
  return content;
}

/** The `.hxspec` archive the app imports (same format as "Download draft file"). */
export function hxspec(name: string, content: SpecSheetContent): Buffer {
  const json = {
    format: 'hexadata-spec-draft',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    app: 'e2e',
    name,
    document: { schemaVersion: 1, templateId: 'classic', templateVersion: 1, content },
  };
  return Buffer.from(zipSync({ 'draft.json': strToU8(JSON.stringify(json)) }));
}

/** Imports a draft through the UI and opens it. */
export async function importDraft(page: Page, name: string, content: SpecSheetContent) {
  await page.getByRole('button', { name: 'Import a draft or backup' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import drafts' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: `${name}.hxspec`,
    mimeType: 'application/zip',
    buffer: hxspec(name, content),
  });
  await dialog.getByRole('button', { name: 'Open it' }).click();
  await expect(page.getByLabel('Draft name').first()).toHaveValue(name);
}

/** Row labels the editor puts on each page, per page index (rows after a page-break spacer start a new page). */
export async function editorPages(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const pages: string[][] = [];
    document.querySelectorAll('[data-hd-flow] table').forEach((table) => {
      let index = 0;
      table.querySelectorAll('tr').forEach((tr) => {
        if (tr.hasAttribute('data-hd-gap')) {
          index += 1;
          return;
        }
        const label = tr.querySelector('td')?.textContent?.trim() ?? '';
        (pages[index] ??= []).push(label);
      });
    });
    return pages;
  });
}

/** Text of every page of a PDF, whitespace removed. */
export async function pdfPageTexts(path: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), verbosity: 0 });
  try {
    const doc = await task.promise;
    const out: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      out.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join('')
          .replace(/\s+/g, ''),
      );
    }
    return out;
  } finally {
    await task.destroy();
  }
}
