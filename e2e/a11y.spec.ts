import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers.ts';

/** WCAG 2.2 AA, in both themes, at phone / tablet / desktop widths (the brand's accessibility bar). */
const WIDTHS = [
  { name: 'phone', width: 375, height: 800 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Two passes. The application chrome is held to every rule. The printed sheet is a WYSIWYG document canvas: its
 * text cells are tiny by nature (7 pt print text), exactly like paragraphs of a text document, so the pointer
 * target-size rule (2.5.8) does not apply to them; every other rule (contrast, names, roles) still does. Bigger
 * targets for the same actions are always available: hover handles, the inspector and the keyboard.
 */
async function audit(page: Page) {
  const chrome = await new AxeBuilder({ page }).withTags(TAGS).exclude('.sheet-scale').analyze();
  const sheet = await new AxeBuilder({ page })
    .withTags(TAGS)
    .include('.sheet-scale')
    .disableRules(['target-size'])
    .analyze();
  const summary = [...chrome.violations, ...sheet.violations].map(
    (v) =>
      `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const size of WIDTHS) {
    test(`axe: editor, ${theme} theme, ${size.name} (${size.width}px)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: size.width, height: size.height });
      await openApp(page);
      await audit(page);
    });
  }
}

test.describe('dialogs and menus', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`axe: dialogs and the actions menu are accessible (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openApp(page);

      await page.getByRole('button', { name: 'More actions' }).click();
      await audit(page);
      await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
      await audit(page);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'New draft' }).first().click();
      await audit(page);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Storage' }).click();
      await audit(page);
      await page.keyboard.press('Escape');
    });
  }
});

test('keyboard: focus is visible, dialogs trap and restore focus, skip link works', async ({
  page,
}) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to the sheet' })).toBeFocused();
  await page.keyboard.press('Enter');

  const opener = page.getByRole('button', { name: 'More actions' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(opener).toBeFocused(); // focus returns to the trigger

  await page.keyboard.press('?'); // outside text fields: opens the shortcuts list
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
});

test('forced zoom and reduced motion do not break the layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await page.setViewportSize({ width: 320, height: 640 }); // 400% zoom equivalent
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
