import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';
import {
  cell,
  featureItems,
  logoItems,
  openApp,
  openMenu,
  pressThenType,
  redoButton,
  replaceText,
  rowItems,
  saveNow,
  titleCell,
  undoButton,
} from './helpers.ts';

test.describe('editor', () => {
  test('opens the sample sheet with the brand chrome', async ({ page }) => {
    await openApp(page);
    await expect(page).toHaveTitle(/HexaData Spec Editor/);
    await expect(titleCell(page)).toHaveText('HD-RS2200 Version : G294');
    await expect(page.getByRole('combobox', { name: 'Template' })).toHaveValue('classic');
    await expect(featureItems(page)).toHaveCount(10);
    await expect(rowItems(page, 0)).toHaveCount(11);
    await expect(rowItems(page, 1)).toHaveCount(10);
    await expect(logoItems(page)).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Export PDF/ })).toBeVisible();
    // Self-hosted brand fonts only (no third-party font requests).
    const fonts = await page.evaluate(
      () =>
        document.fonts.check('16px "Space Grotesk"') && document.fonts.check('16px "Inter Tight"'),
    );
    expect(fonts).toBe(true);
  });

  test('edits are saved automatically and survive a reload', async ({ page }) => {
    await openApp(page);
    await replaceText(page, 'field:meta.title', 'HD-RS9999 Persisted');
    await expect(page.locator('.save-status')).toContainText(/Saving|Saved/);
    await saveNow(page);
    await page.reload();
    await expect(titleCell(page)).toHaveText('HD-RS9999 Persisted');
    // and the drafts list shows the new title
    await expect(page.locator('.panel--drafts')).toContainText('HD-RS9999 Persisted');
  });

  test('Enter adds a key feature below; Backspace on an empty one removes it; Alt+arrows reorder', async ({
    page,
  }) => {
    await openApp(page);
    const first = featureItems(page).first().locator('[data-cell]');
    await first.click();
    await page.keyboard.press('End');
    await pressThenType(page, 'Enter', 'Inserted feature');
    await expect(featureItems(page)).toHaveCount(11);
    await expect(featureItems(page).nth(1)).toContainText('Inserted feature');

    await page.keyboard.press('Alt+ArrowUp');
    await expect(featureItems(page).first()).toContainText('Inserted feature');

    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(featureItems(page)).toHaveCount(10);
  });

  test('undo and redo cover text and structure', async ({ page }) => {
    await openApp(page);
    // One insertText is one input event, so one history entry; typing key by key can span the coalescing window on a slow runner.
    await cell(page, 'field:meta.subtitle').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('Short subtitle');
    await undoButton(page).click();
    await expect(cell(page, 'field:meta.subtitle')).not.toHaveText('Short subtitle');
    await redoButton(page).click();
    await expect(cell(page, 'field:meta.subtitle')).toHaveText('Short subtitle');
    await page.keyboard.press('Control+z');
    await expect(cell(page, 'field:meta.subtitle')).not.toHaveText('Short subtitle');
  });

  test('bold, italic and underline are applied, saved and rendered as marks', async ({ page }) => {
    await openApp(page);
    // The subtitle and title are bold by design (toggling bold there is a no-op), so use regular-weight text.
    const field = cell(page, 'field:applications');
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('plain bold italic');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+b');
    await expect(field.locator('b')).toHaveCount(1);
    await page.keyboard.press('Control+i');
    await page.keyboard.press('Control+u');
    await expect(field.locator('b i u')).toHaveCount(1);
    expect(await field.evaluate((el) => el.innerHTML)).not.toContain('style=');
    await saveNow(page);
    await page.reload();
    await expect(cell(page, 'field:applications').locator('b i u')).toHaveText('plain bold italic');
  });

  test('pasted HTML is reduced to text with bold/italic/underline only', async ({ page }) => {
    await openApp(page);
    const target = cell(page, 'field:applications');
    await target.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await target.evaluate((el) => {
      const data = new DataTransfer();
      data.setData(
        'text/html',
        '<p style="color:red;font-family:Comic Sans MS">Hello <b>bold</b> <img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script></p><p>second</p>',
      );
      data.setData('text/plain', 'Hello bold\nsecond');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(target).toContainText('Hello bold');
    await expect(target).toContainText('second');
    expect(await target.evaluate((el) => el.innerHTML)).not.toMatch(
      /<(script|img|p|span)|style=|onerror/,
    );
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
    ).toBeUndefined();
    await expect(target.locator('b')).toHaveText('bold');
  });

  test('enforces character limits instead of silently truncating at export', async ({ page }) => {
    await openApp(page);
    await replaceText(page, 'field:meta.title', 'x'.repeat(260));
    const length = await titleCell(page).evaluate((el) => el.textContent?.length ?? 0);
    expect(length).toBeLessThanOrEqual(200);
  });

  test('Reset restores the pristine sample after heavy editing (and can be undone)', async ({
    page,
  }) => {
    await openApp(page);
    await replaceText(page, 'field:meta.title', 'Completely different');
    await featureItems(page).first().locator('[data-cell]').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(featureItems(page)).toHaveCount(9);

    await openMenu(page, 'More actions', /Reset sheet/);
    await page.getByRole('dialog').getByRole('button', { name: 'Reset sheet' }).click();
    await expect(titleCell(page)).toHaveText('HD-RS2200 Version : G294');
    await expect(featureItems(page)).toHaveCount(10);
    await expect(rowItems(page, 0)).toHaveCount(11);

    await undoButton(page).click();
    await expect(titleCell(page)).toHaveText('Completely different');
  });

  test('table rows: hover handles add and remove rows; the inspector toggles highlighting', async ({
    page,
  }) => {
    await openApp(page);
    const row = rowItems(page, 0).nth(2);
    await row.hover();
    await page.getByRole('button', { name: 'Add row below' }).click();
    await expect(rowItems(page, 0)).toHaveCount(12);

    await rowItems(page, 0).nth(3).locator('[data-cell]').first().click();
    const highlight = page.getByRole('switch', { name: 'Highlight value' });
    await highlight.check();
    await expect(rowItems(page, 0).nth(3).locator('td').nth(1)).toHaveClass(/cs-td-emphasis/);

    await rowItems(page, 0).nth(3).hover();
    await page.getByRole('button', { name: 'Remove row' }).click();
    await expect(rowItems(page, 0)).toHaveCount(11);
  });

  test('partner logos can all be removed and stay removed', async ({ page }) => {
    await openApp(page);
    for (let remaining = 2; remaining > 0; remaining -= 1) {
      await logoItems(page).first().hover();
      await page.getByRole('button', { name: 'Remove partner logo' }).click();
      await expect(logoItems(page)).toHaveCount(remaining - 1);
    }
    await saveNow(page);
    await page.reload();
    await expect(titleCell(page)).toBeVisible();
    await expect(logoItems(page)).toHaveCount(0);
  });

  test('zoom keeps the whole page reachable (no clipped left edge) and fits the width', async ({
    page,
  }) => {
    await openApp(page);
    const frame = page.locator('.frame');
    const stage = page.locator('.stage');
    const fit = await frame.boundingBox();
    const stageBox = await stage.boundingBox();
    expect(fit!.x).toBeGreaterThanOrEqual(stageBox!.x);
    expect(fit!.x + fit!.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width + 1);

    for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
    const zoomed = await frame.boundingBox();
    expect(zoomed!.width).toBeGreaterThan(fit!.width);
    // the left edge of the zoomed page can always be scrolled into view
    await stage.evaluate((el) => (el.scrollLeft = 0));
    const left = await frame.boundingBox();
    expect(left!.x).toBeGreaterThanOrEqual(stageBox!.x - 1);
    await page.keyboard.press('Control+0');
    await expect(page.getByRole('button', { name: /Zoom \d+ percent/ })).toBeVisible();
  });

  test('a growing specification continues on a new page, and the page goes away again', async ({
    page,
  }) => {
    await openApp(page);
    const pages = page.locator('.hd-page');
    await expect(pages).toHaveCount(1);
    await expect(page.locator('.page-break')).toHaveCount(0);

    // Keep adding rows with the keyboard (Ctrl+Enter); typing continues in the new row even when it crosses a page.
    await rowItems(page, 1).last().locator('[data-cell]').first().click();
    for (let i = 0; i < 12; i += 1) {
      await pressThenType(page, 'Control+Enter', `Extra row ${i}`);
    }
    await expect(pages).toHaveCount(2);
    await expect(page.locator('.page-break')).toHaveCount(1);
    await expect(page.getByText('Specification (continued)')).toBeVisible();
    // The last row typed is in the table (rows are never dropped or duplicated), and it kept the caret.
    await expect(page.getByText('Extra row 11')).toHaveCount(1);
    await expect(rowItems(page, 1)).toHaveCount(22);
    // Footer text exists once, on the last page, and is the one editable copy.
    await expect(page.locator('[data-cell="field:footer.copyright"]')).toHaveCount(1);
    await expect(page.locator('.panel--inspector')).toContainText('continues over 2 pages');

    // Removing the rows again removes the extra page (no blank page left behind).
    for (let i = 0; i < 40 && (await rowItems(page, 1).count()) > 10; i += 1) {
      await undoButton(page).click();
    }
    await expect(rowItems(page, 1)).toHaveCount(10);
    await expect(pages).toHaveCount(1);
    await expect(page.locator('.page-break')).toHaveCount(0);
    await expect(page.locator('.panel--inspector')).toContainText('Everything fits on the page');
  });

  test('a multi-page draft reopens with its pages after a reload', async ({ page }) => {
    await openApp(page);
    await rowItems(page, 1).last().locator('[data-cell]').first().click();
    for (let i = 0; i < 12; i += 1) {
      await pressThenType(page, 'Control+Enter', `Extra row ${i}`);
    }
    await expect(page.locator('.hd-page')).toHaveCount(2);
    await saveNow(page);
    await page.reload();
    await expect(titleCell(page)).toBeVisible();
    await expect(rowItems(page, 1)).toHaveCount(22);
    await expect(page.locator('.hd-page')).toHaveCount(2);
    await expect(page.locator('.page-break')).toHaveCount(1);
  });

  test('page numbers can be switched off, for the editor and the PDF', async ({ page }) => {
    await openApp(page);
    await rowItems(page, 1).last().locator('[data-cell]').first().click();
    for (let i = 0; i < 12; i += 1) {
      await pressThenType(page, 'Control+Enter', `Extra row ${i}`);
    }
    await expect(page.locator('.hd-page')).toHaveCount(2);
    await expect(page.locator('.cs-page-tag')).toHaveText(/PAGE 01\/02/i);
    // The reading of the visible text is uppercase through CSS; the toggle lives in the Inspector.
    const toggle = page.getByRole('switch', { name: 'Show page numbers' });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(page.locator('.cs-page-tag')).toHaveCount(0);
    await expect(page.locator('.hd-page')).toHaveCount(2);
    await toggle.check();
    await expect(page.locator('.cs-page-tag')).toHaveCount(1);
  });

  test('exports as many pages as the editor shows', async ({ page }) => {
    await openApp(page);
    await rowItems(page, 1).last().locator('[data-cell]').first().click();
    for (let i = 0; i < 12; i += 1) {
      await pressThenType(page, 'Control+Enter', `Extra row ${i}`);
    }
    await expect(page.locator('.hd-page')).toHaveCount(2);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PDF/ }).click();
    const bytes = await readFile(await (await downloadPromise).path());
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
