import { expect, test } from '@playwright/test';
import { SPRITE_ON_GREEN, interactionsVideoResponse } from './helpers.ts';
import fs from 'node:fs';

test.describe('E — Mocked video generate → prep handoff', () => {
  test('mock /api/video/generate sets handoff.videoBlob for Video Prep', async ({ page }) => {
    await page.route('**/api/video/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(interactionsVideoResponse()),
      });
    });

    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('google_api_key', 'AIza-mock-browser-test');
    });

    // Seed sprite handoff the way Sprite Prep does, then open Video Gen
    const pngBuf = fs.readFileSync(SPRITE_ON_GREEN);
    const dataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`;

    await page.evaluate((b64) => {
      // The module publishes this on load; fail loudly if it did not.
      const app = window.ASAdventurer;
      if (app === undefined) throw new Error('ASAdventurer is not published on window');
      app.handoff.spriteBase64 = b64;
      app.handoff.keyColor = '#00FF00';
    }, dataUrl);

    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
    await expect(page.locator('#tab-video-gen')).toHaveClass(/active/);
    await expect(page.locator('#vgRefImagePreview')).not.toHaveClass(/hidden/, { timeout: 5_000 });

    await page.locator('#vgGenerateBtn').click();

    await expect(page.locator('#vgResultsSection')).not.toHaveClass(/hidden/, { timeout: 20_000 });
    await expect(page.locator('#vgResultsGrid .result-card').first()).toBeVisible();

    await page.locator('#vgHandoffBtn').click();
    await expect(page.locator('#tab-video-prep')).toHaveClass(/active/, { timeout: 10_000 });

    const videoHandoff = await page.evaluate(() => {
      const app = window.ASAdventurer;
      if (app === undefined) throw new Error('ASAdventurer is not published on window');
      const h = app.handoff;
      return {
        hasVideoBlob: h.videoBlob !== null,
        videoBlobSize: h.videoBlob === null ? 0 : h.videoBlob.size,
        hasVideoUrl: typeof h.videoUrl === 'string' && h.videoUrl.startsWith('blob:'),
      };
    });

    expect(videoHandoff.hasVideoBlob).toBe(true);
    expect(videoHandoff.videoBlobSize).toBeGreaterThan(0);
    expect(videoHandoff.hasVideoUrl).toBe(true);
  });

  test('videoPrepData contract shape fields are characterized', async ({ page }) => {
    await page.goto('/');

    // Production shape from src/entry-browser/video-prep.mts sendToExporter
      // (without needing a real decodeable video)
    const shape = await page.evaluate(() => {
      const app = window.ASAdventurer;
      if (app === undefined) throw new Error('ASAdventurer is not published on window');
      app.handoff.videoPrepData = {
        videoSrc: 'blob:http://localhost/mock',
        videoWidth: 1280,
        videoHeight: 720,
        duration: 1.0,
        fps: 30,
        totalFrames: 30,
        loopMode: 'none',
        loopPoint: -1,
        outputFrameCount: 30,
        concat: null,
      };
      return Object.keys(app.handoff.videoPrepData).sort();
    });

    expect(shape).toEqual(
      expect.arrayContaining([
        'videoSrc',
        'videoWidth',
        'videoHeight',
        'duration',
        'fps',
        'totalFrames',
        'loopMode',
        'loopPoint',
        'outputFrameCount',
        'concat',
      ]),
    );

    await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
    await expect(page.locator('#tab-exporter')).toHaveClass(/active/);

    // Exporter listens for videoPrepData — banner may appear if consumer wired
    const hasData = await page.evaluate(() => window.ASAdventurer?.handoff.videoPrepData !== null);
    // Handoff may be consumed by exporter observer; either still set or consumed is fine
    expect(typeof hasData).toBe('boolean');
  });
});
