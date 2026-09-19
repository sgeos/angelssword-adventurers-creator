import { expect, test } from '@playwright/test';

test.describe('C — Static / API proxy smoke', () => {
  test('static assets and CORS headers are available', async ({ request }) => {
    const home = await request.get('/');
    expect(home.ok()).toBeTruthy();
    expect(await home.text()).toMatch(/AS Adventurer/);

    const css = await request.get('/style.css');
    expect(css.ok()).toBeTruthy();

    // Preflight-style CORS on API routes
    const options = await request.fetch('/api/chat', { method: 'OPTIONS' });
    expect(options.status()).toBe(200);
    const allowOrigin = options.headers()['access-control-allow-origin'];
    expect(allowOrigin).toBe('*');
  });

  test('mocked /api/chat test connection from Settings', async ({ page }) => {
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'connected' } }],
        }),
      });
    });

    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();
    await page.locator('#settingsOpenAIKey').fill('sk-mock-test-key');
    await page.locator('#settingsOpenAITest').click();

    await expect(page.locator('#settingsOpenAIStatus .status-msg.success')).toBeVisible({
      timeout: 15_000,
    });

    const saved = await page.evaluate(() => localStorage.getItem('openai_api_key'));
    expect(saved).toBe('sk-mock-test-key');
  });
});
