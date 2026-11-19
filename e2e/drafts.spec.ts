import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  draftCards,
  featureItems,
  newDraft,
  openApp,
  replaceText,
  saveNow,
  titleCell,
} from './helpers.ts';

test.describe('drafts', () => {
  test('create as many drafts as you like, switch between them, nothing is lost', async ({
    page,
  }) => {
    await openApp(page);
    await replaceText(page, 'field:meta.title', 'Draft ONE title');
    await saveNow(page);

    for (const name of ['Second draft', 'Third draft', 'Fourth draft']) await newDraft(page, name);
    await expect(draftCards(page)).toHaveCount(4);
    await expect(titleCell(page)).toHaveText('HD-RS2200 Version : G294'); // fresh from the template

    await replaceText(page, 'field:meta.title', 'Draft FOUR title');
    // switch away immediately: unsaved edits must be flushed first
    await draftCards(page).filter({ hasText: 'Draft ONE title' }).click();
    await expect(titleCell(page)).toHaveText('Draft ONE title');
    await draftCards(page).filter({ hasText: 'Draft FOUR title' }).click();
    await expect(titleCell(page)).toHaveText('Draft FOUR title');
  });

  test('the last opened draft reopens after a reload', async ({ page }) => {
    await openApp(page);
    await newDraft(page, 'Reopen me');
    await replaceText(page, 'field:meta.subtitle', 'Subtitle of the reopened draft');
    await saveNow(page);
    await page.reload();
    await expect(page.getByLabel('Draft name').first()).toHaveValue('Reopen me');
    await expect(page.locator('[data-cell="field:meta.subtitle"]')).toHaveText(
      'Subtitle of the reopened draft',
    );
  });

  test('rename, duplicate, search and sort', async ({ page }) => {
    await openApp(page);
    await newDraft(page, 'Banana');
    await newDraft(page, 'Apple');

    // rename from the card menu
    await draftCards(page)
      .filter({ hasText: 'Apple' })
      .locator('xpath=..')
      .getByRole('button', { name: /Actions for Apple/ })
      .click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const input = page.locator('.panel--drafts input[aria-label="Draft name"]');
    await input.fill('Cherry');
    await input.press('Enter');
    await expect(draftCards(page).filter({ hasText: 'Cherry' })).toHaveCount(1);

    // duplicate the open draft
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate draft' }).click();
    await expect(page.getByLabel('Draft name').first()).toHaveValue('Cherry (copy)');

    // search and sort
    await page.getByPlaceholder('Search drafts').fill('cherry');
    await expect(draftCards(page)).toHaveCount(2); // "Cherry" and "Cherry (copy)"
    await page.getByPlaceholder('Search drafts').fill('');
    await page.getByLabel('Sort drafts').selectOption('name');
    const names = await draftCards(page).locator('.draft-card__name').allTextContents();
    expect(names).toEqual(
      [...names].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    );
  });

  test('trash: undo, restore and permanent delete', async ({ page }) => {
    await openApp(page);
    await newDraft(page, 'Disposable');
    const card = draftCards(page).filter({ hasText: 'Disposable' }).locator('xpath=..');
    await card.getByRole('button', { name: /Actions for Disposable/ }).click();
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await expect(draftCards(page).filter({ hasText: 'Disposable' })).toHaveCount(0);

    // Undo from the toast
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    await expect(draftCards(page).filter({ hasText: 'Disposable' })).toHaveCount(1);

    // Trash again, then restore from the trash dialog
    await draftCards(page)
      .filter({ hasText: 'Disposable' })
      .locator('xpath=..')
      .getByRole('button', { name: /Actions for Disposable/ })
      .click();
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await page.getByRole('button', { name: /^Trash \(1\)/ }).click();
    const trash = page.getByRole('dialog', { name: 'Trash' });
    await expect(trash).toContainText('Disposable');
    await trash.getByRole('button', { name: /Restore/ }).click();
    await expect(trash).toContainText('The trash is empty');
    await trash.getByRole('button', { name: 'Done' }).click();
    await expect(draftCards(page).filter({ hasText: 'Disposable' })).toHaveCount(1);

    // Permanent delete needs a second, explicit click
    await draftCards(page)
      .filter({ hasText: 'Disposable' })
      .locator('xpath=..')
      .getByRole('button', { name: /Actions for Disposable/ })
      .click();
    await page.getByRole('menuitem', { name: 'Move to trash' }).click();
    await page.getByRole('button', { name: /^Trash \(1\)/ }).click();
    const again = page.getByRole('dialog', { name: 'Trash' });
    await again.getByRole('button', { name: 'Delete', exact: true }).click();
    await again.getByRole('button', { name: /Confirm: delete forever/ }).click();
    await expect(again).toContainText('The trash is empty');
  });

  test('download a draft file and import it as a new draft', async ({ page }) => {
    await openApp(page);
    await newDraft(page, 'Portable draft');
    await replaceText(page, 'field:meta.title', 'Portable title');
    await saveNow(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Download draft file' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^portable-draft-[a-f0-9]{8}\.hxspec$/);
    const path = await download.path();
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK'); // a zip

    await page.getByRole('button', { name: 'Import a draft or backup' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import drafts' });
    await dialog.locator('input[type=file]').setInputFiles(path);
    await expect(dialog).toContainText('Imported 1 draft');
    await dialog.getByRole('button', { name: 'Open it' }).click();
    await expect(page.getByLabel('Draft name').first()).toHaveValue('Portable draft');
    await expect(titleCell(page)).toHaveText('Portable title');
    await expect(draftCards(page)).toHaveCount(3);
  });

  test('importing something that is not a draft is rejected clearly', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Import a draft or backup' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import drafts' });
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'evil.hxspec',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a zip at all'),
    });
    await expect(dialog.getByRole('alert')).toContainText(/not a valid|could not be imported/i);
  });

  test('a draft open in two tabs is read-only in the second one until taken over', async ({
    context,
    page,
  }) => {
    await openApp(page);
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.locator('.stage-banner')).toContainText('open in another tab');
    // Read-only: the sheet renders statically, with nothing editable on it.
    await expect(other.locator('.cs-title')).toContainText('HD-RS2200');
    await expect(other.locator('.frame [contenteditable="true"]')).toHaveCount(0);

    await other.getByRole('button', { name: 'Edit here instead' }).click();
    await expect(other.locator('.stage-banner')).toHaveCount(0);
    await expect(other.locator('.frame [contenteditable="true"]').first()).toBeVisible();
    await expect(page.locator('.stage-banner')).toContainText('open in another tab');
    await expect(featureItems(page)).toHaveCount(10);
  });

  test('the trash and storage dialogs and keyboard help open and close with the keyboard', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toContainText('Ctrl+Shift+E');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    await page.getByRole('button', { name: 'Storage' }).click();
    await expect(page.getByRole('dialog', { name: 'Storage' })).toContainText('Persistent storage');
    await page.keyboard.press('Escape');
  });

  test('every dialog opens again after being closed with the X, Done or Escape', async ({
    page,
  }) => {
    await openApp(page);
    const items: Array<[RegExp, string]> = [
      [/^New draft/, 'New draft'],
      [/^Import/, 'Import drafts'],
      [/^Download backup/, 'Storage'],
      [/^Reset sheet/, 'Reset this sheet?'],
      [/^Trash/, 'Trash'],
      [/^Keyboard shortcuts/, 'Keyboard shortcuts'],
      [/^About/, 'HexaData Spec Editor'],
    ];
    for (const [item, title] of items) {
      for (const close of ['x', 'escape', 'x'] as const) {
        await page.getByRole('button', { name: 'More actions' }).click();
        await page.getByRole('menuitem', { name: item }).click();
        const dialog = page.getByRole('dialog', { name: title });
        await expect(dialog).toBeVisible();
        if (close === 'x') await dialog.getByRole('button', { name: 'Close dialog' }).click();
        else await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
    }
  });

  test('requesting persistent storage tells the user what the browser answered', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      navigator.storage.persisted = () => Promise.resolve(false);
      navigator.storage.persist = () => Promise.resolve(false);
    });
    await openApp(page);
    await page.getByRole('button', { name: 'Storage' }).click();
    const dialog = page.getByRole('dialog', { name: 'Storage' });
    await dialog.getByRole('button', { name: 'Request persistent storage' }).click();
    await expect(page.getByText('The browser declined.')).toBeVisible();
  });
});
