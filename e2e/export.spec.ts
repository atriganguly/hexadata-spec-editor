import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';
import { openApp, replaceText, saveNow } from './helpers.ts';

test.describe('PDF export', () => {
  test('exports a one-page A4 PDF with real metadata, named after the title', async ({ page }) => {
    await openApp(page);
    await replaceText(page, 'field:meta.title', 'HD-RS1234 Export Test');
    await saveNow(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PDF/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('hd-rs1234-export-test.pdf');

    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 0);
    expect(pdf.getTitle()).toBe('HD-RS1234 Export Test');
    expect(pdf.getProducer()).toBe('HexaData Spec Editor');
    await expect(
      page.getByRole('status').filter({ hasText: /Downloaded hd-rs1234-export-test\.pdf/ }),
    ).toBeVisible();
  });

  test('shows progress while exporting and cannot start twice', async ({ page }) => {
    await openApp(page);
    await page.route('**/v1/render', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    const button = page.getByRole('button', { name: /Export PDF|Exporting/ });
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    await expect(page.getByRole('button', { name: /Exporting/ })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await page.getByRole('button', { name: /Exporting/ }).click(); // second click is ignored
    await downloadPromise;
    await expect(page.getByRole('button', { name: /Export PDF/ })).toHaveAttribute(
      'aria-busy',
      'false',
    );
  });

  test('an unreachable engine gives a specific message and a working retry', async ({ page }) => {
    await openApp(page);
    await page.route('**/v1/render', (route) => route.abort('connectionrefused'));
    await page.getByRole('button', { name: /Export PDF/ }).click();
    const alert = page.getByRole('alert').filter({ hasText: /could not be reached/ });
    await expect(alert).toBeVisible();

    await page.unroute('**/v1/render');
    const downloadPromise = page.waitForEvent('download');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await downloadPromise;
  });

  test('a busy engine is retried once automatically', async ({ page }) => {
    await openApp(page);
    let calls = 0;
    await page.route('**/v1/render', async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({
          status: 503,
          headers: {
            'retry-after': '1',
            'access-control-allow-origin': '*',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ code: 'BUSY', message: 'busy' }),
        });
      } else await route.continue();
    });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PDF/ }).click();
    await downloadPromise;
    expect(calls).toBe(2);
  });

  test('exports with an image that the user uploaded', async ({ page }) => {
    await openApp(page);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
      'base64',
    );
    await page.locator('[data-edit-image="product"]').hover();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Replace product image' }).click();
    (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('[data-edit-image="product"]')).toHaveAttribute('src', /^blob:/);
    await saveNow(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export PDF/ }).click();
    const bytes = await readFile(await (await downloadPromise).path());
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);

    // survives a reload (stored content-addressed in IndexedDB)
    await page.reload();
    await expect(page.locator('[data-edit-image="product"]')).toHaveAttribute('src', /^blob:/);
  });

  test('rejects files that are not images with a clear message', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-edit-image="product"]').hover();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Replace product image' }).click();
    (await chooser).setFiles({
      name: 'evil.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<script>alert(1)</script>'),
    });
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /could not be read as an image|could not be processed/ }),
    ).toBeVisible();
    await expect(page.locator('[data-edit-image="product"]')).not.toHaveAttribute('src', /^blob:/);
  });
});
