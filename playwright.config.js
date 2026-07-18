/**
 * Playwright characterization config for AS Adventurer (GREEN).
 *
 * Note: server.js auto-opens a browser via xdg-open/start/open on listen.
 * There is no OPEN_BROWSER=0 gate on current main — in CI/headless Linux
 * xdg-open typically fails harmlessly. Prefer PORT=3001 for webServer.
 */
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || '3001';
const baseURL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: 'test/integration/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
  },
});
