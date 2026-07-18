const { test, expect } = require('@playwright/test');

test.describe('B — Settings localStorage', () => {
  test('openai_api_key and google_api_key round-trip via Settings UI', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();
    await expect(page.locator('#tab-settings')).toHaveClass(/active/);

    await page.locator('#settingsOpenAIKey').fill('sk-test-openai-characterization');
    await page.locator('#settingsOpenAISave').click();

    await page.locator('#settingsGoogleKey').fill('AIza-test-google-characterization');
    await page.locator('#settingsGoogleSave').click();

    const stored = await page.evaluate(() => ({
      openai: localStorage.getItem('openai_api_key'),
      google: localStorage.getItem('google_api_key'),
    }));

    expect(stored.openai).toBe('sk-test-openai-characterization');
    expect(stored.google).toBe('AIza-test-google-characterization');

    // Reload — settings init should restore into inputs
    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();
    await expect(page.locator('#settingsOpenAIKey')).toHaveValue('sk-test-openai-characterization');
    await expect(page.locator('#settingsGoogleKey')).toHaveValue('AIza-test-google-characterization');
  });
});
