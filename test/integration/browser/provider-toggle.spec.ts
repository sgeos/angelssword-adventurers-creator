import { expect, test } from '@playwright/test';


/**
 * The provider selector must reach the generation path. An earlier defect in
 * this codebase, the discarded key colour, survived precisely because a
 * branch existed that nothing ever executed.
 */
test.describe('G — Provider selection', () => {
  test('both providers are offered and the choice persists', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-sprite-prep"]').click();
    await page.locator('.mode-btn[data-mode="generate"]').click();

    const selector = page.locator('#sgProvider');
    await expect(selector).toBeVisible();
    await expect(selector.locator('.seg-btn')).toHaveCount(2);

    await selector.locator('[data-mode="xai"]').click();
    await expect(selector.locator('[data-mode="xai"]')).toHaveClass(/active/);

    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-sprite-prep"]').click();
    await page.locator('.mode-btn[data-mode="generate"]').click();
    await expect(page.locator('#sgProvider [data-mode="xai"]')).toHaveClass(/active/,
      { timeout: 10_000 });
  });

  test('the selected provider decides which endpoint generation calls', async ({ page }) => {
    const calls: string[] = [];
    await page.route('**/api/**', async (routeCtx) => {
      calls.push(new URL(routeCtx.request().url()).pathname);
      await routeCtx.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ b64_json: 'aGk=' }] }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('xai_api_key', 'xai-test');
      localStorage.setItem('sprite_provider', 'xai');
    });
    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-sprite-prep"]').click();
    await page.locator('.mode-btn[data-mode="generate"]').click();

    await page.locator('#sgCharName').fill('Test Knight');
    await page.locator('#sgGenerateBtn').click();

    await expect.poll(() => calls.filter((p) => p.startsWith('/api/')).length,
      { timeout: 15_000 }).toBeGreaterThan(0);
    expect(calls).toContain('/api/xai/images/generations');
    expect(calls).not.toContain('/api/generate');
  });

  test('a missing key for the selected provider is reported, and nothing is sent', async ({ page }) => {
    const calls: string[] = [];
    await page.route('**/api/**', async (routeCtx) => {
      calls.push(new URL(routeCtx.request().url()).pathname);
      await routeCtx.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('xai_api_key');
      localStorage.setItem('sprite_provider', 'xai');
    });
    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-sprite-prep"]').click();
    await page.locator('.mode-btn[data-mode="generate"]').click();

    await page.locator('#sgCharName').fill('Test Knight');
    await page.locator('#sgGenerateBtn').click();

    await expect(page.locator('.toast')).toContainText(/Grok API key/i, { timeout: 10_000 });
    expect(calls).not.toContain('/api/xai/images/generations');
  });
});
