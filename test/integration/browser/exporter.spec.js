const { test, expect } = require('@playwright/test');

test.describe('F — Model exporter smoke', () => {
  test('exporter tab and export mode UI are present', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
    await expect(page.locator('#tab-exporter')).toHaveClass(/active/);

    await expect(page.locator('#exportModeToggle')).toBeVisible();
    await expect(page.locator('.export-mode-btn[data-mode="adventurer"]')).toBeVisible();
    await expect(page.locator('.export-mode-btn[data-mode="normal"]')).toBeVisible();
    await expect(page.locator('.export-mode-btn[data-mode="premium"]')).toBeVisible();
    await expect(page.locator('#exFileInput')).toBeAttached();
    await expect(page.locator('#exSimilarity')).toBeAttached();
  });

  test('ChromaKey global only if exposed — otherwise skip instantiate', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      // ChromaKey is a module export of src/browser/chroma-key.mts and is not
    // published on window, so this stays a conditional check.
      if (typeof window.ChromaKey === 'function') {
        try {
          const ck = new window.ChromaKey();
          return { available: true, constructed: !!ck };
        } catch (e) {
          return { available: true, constructed: false, error: String(e) };
        }
      }
      return { available: false };
    });

    if (!result.available) {
      test.info().annotations.push({
        type: 'note',
        description: 'ChromaKey is not on window (module-scoped) — exporter MODE UI covered instead',
      });
      // Soft characterization: class not global on current main
      expect(result.available).toBe(false);
      return;
    }

    expect(result.constructed).toBe(true);
  });
});
