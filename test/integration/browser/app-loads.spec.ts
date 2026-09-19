import { expect, test } from '@playwright/test';
import { TAB_IDS } from './helpers.ts';

test.describe('A — App loads', () => {
  test('homepage shows brand and five pipeline tabs', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.brand-name')).toContainText('AS Adventurer');
    await expect(page.getByRole('button', { name: /Sprite Prep/i })).toBeVisible();

    for (const tabId of TAB_IDS) {
      await expect(page.locator(`.tab-btn[data-tab="${tabId}"]`)).toBeVisible();
    }

    await expect(page.locator('#tab-sprite-prep')).toHaveClass(/active/);
    await expect(page.locator('#spFileInput')).toBeAttached();
  });
});
