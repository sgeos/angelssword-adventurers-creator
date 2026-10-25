import { expect, test } from '@playwright/test';

test.describe('C — Static / API proxy smoke', () => {
  test('static assets are available and no other origin is granted the API', async ({ request }) => {
    const home = await request.get('/');
    expect(home.ok()).toBeTruthy();
    expect(await home.text()).toMatch(/AS Adventurer/);

    const css = await request.get('/style.css');
    expect(css.ok()).toBeTruthy();

    // The page calls /api from its own origin, so a preflight from another
    // origin is granted nothing. Upstream granted every origin; see SECURITY.md.
    const options = await request.fetch('/api/chat', {
      method: 'OPTIONS',
      headers: { Origin: 'https://elsewhere.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(options.headers()['access-control-allow-origin']).toBeUndefined();
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
