import { expect, test } from '@playwright/test';
import { openApp } from './helpers.ts';
import { draftContent, editorPages, importDraft, pdfPageTexts } from './pagination.ts';

/**
 * The editor and the exported PDF must break the specification across pages at exactly the same rows, whatever the
 * browser does with text. The `chromium-min-font` project runs this in a Chromium that enforces a minimum font size,
 * which inflates the sheet's small print.
 */
const rows = (count: number, lines: number) => Array.from({ length: count }, () => ({ lines }));

const DRAFTS = [
  { name: 'Short rows', left: rows(30, 2), right: rows(12, 2) },
  { name: 'Tall rows', left: [...rows(6, 2), ...rows(2, 14), ...rows(10, 3)], right: rows(14, 4) },
  {
    name: 'Gap at the bottom',
    left: [...rows(8, 3), { lines: 20 }, ...rows(8, 2)],
    right: rows(10, 5),
  },
  { name: 'Three pages', left: rows(40, 5), right: rows(40, 4) },
];

for (const draft of DRAFTS) {
  test(`editor and PDF break pages at the same rows: ${draft.name}`, async ({ page }) => {
    await openApp(page);
    await importDraft(page, draft.name, draftContent(draft.left, draft.right));
    await page.evaluate(() => document.fonts.ready);

    // Wait for the editor's layout to settle: the page count must stop changing.
    let last = -1;
    await expect
      .poll(async () => {
        const count = await page.locator('.hd-page').count();
        const stable = count === last;
        last = count;
        return stable;
      })
      .toBe(true);

    const mine = await editorPages(page);
    const pageCount = await page.locator('.hd-page').count();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PDF/ }).click();
    const texts = await pdfPageTexts(await (await downloadPromise).path());

    expect(texts.length, 'page count').toBe(pageCount);
    mine.forEach((labels, index) => {
      for (const label of labels) {
        expect(texts[index], `row ${label} should be on PDF page ${index + 1}`).toContain(label);
        if (index > 0) {
          expect(texts[index - 1], `row ${label} must not be on PDF page ${index}`).not.toContain(
            label,
          );
        }
      }
    });
  });
}
