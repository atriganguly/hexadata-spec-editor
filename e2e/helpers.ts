import { expect, type Locator, type Page } from '@playwright/test';

export const cell = (page: Page, key: string): Locator => page.locator(`[data-cell="${key}"]`);
export const titleCell = (page: Page) => cell(page, 'field:meta.title');
export const featureItems = (page: Page) => page.locator('[data-edit-item="feature"]');
export const rowItems = (page: Page, column: 0 | 1) =>
  page.locator(`[data-edit-list="rows"][data-column="${column}"] [data-edit-item="row"]`);
export const logoItems = (page: Page) => page.locator('[data-edit-item="logo"]');

/** Opens the app and waits until the first draft is loaded and editable. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(titleCell(page)).toBeVisible();
  // (the text is hidden on phones, but the status element is always there)
  await expect(page.locator('.save-status').first()).toBeAttached();
}

/** Forces a save (Ctrl+S) and waits for the indicator, so a reload sees the change. */
export async function saveNow(page: Page): Promise<void> {
  await page.keyboard.press('Control+s');
  await expect(page.locator('.save-status')).toContainText(/Saved/);
}

export async function replaceText(page: Page, key: string, text: string): Promise<void> {
  const target = cell(page, key);
  await target.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
}

export async function openMenu(page: Page, label: string, item: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

export async function newDraft(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New draft' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New draft' });
  await dialog.getByLabel('Draft name').fill(name);
  await dialog.getByRole('button', { name: /Classic/ }).click();
  await expect(page.getByLabel('Draft name').first()).toHaveValue(name);
}

export const draftCards = (page: Page) => page.locator('.panel--drafts .draft-card');

/** Header undo/redo buttons (a toast can also offer an "Undo" action, so scope to the header). */
export const undoButton = (page: Page) =>
  page.locator('.app-header').getByRole('button', { name: 'Undo' });
export const redoButton = (page: Page) =>
  page.locator('.app-header').getByRole('button', { name: 'Redo' });

const activeCell = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-cell') ?? '');

/** Presses `key` (which moves focus to a NEW cell), waits until the caret has really moved, then types `text`. */
export async function pressThenType(page: Page, key: string, text: string): Promise<void> {
  const before = await activeCell(page);
  await page.keyboard.press(key);
  await expect.poll(() => activeCell(page)).not.toBe(before);
  await page.keyboard.type(text);
}
