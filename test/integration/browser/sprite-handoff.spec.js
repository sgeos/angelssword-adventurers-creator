const { test, expect } = require('@playwright/test');
const { SPRITE_ON_GREEN } = require('./helpers');

test.describe('D — Sprite upload + handoff', () => {
  test('upload PNG enables handoff; consumer can read spriteBase64 + keyColor', async ({ page }) => {
    await page.goto('/');

    // Defaults contract before any upload
    const defaults = await page.evaluate(() => {
      const h = window.ASAdventurer?.handoff;
      return h
        ? {
            keys: Object.keys(h).sort(),
            keyColor: h.keyColor,
            spriteBase64: h.spriteBase64,
          }
        : null;
    });
    expect(defaults).not.toBeNull();
    expect(defaults.keys).toEqual(
      expect.arrayContaining([
        'spriteBlob',
        'spriteBase64',
        'spriteCanvas',
        'videoBlob',
        'videoUrl',
        'videoPrepData',
        'keyColor',
      ]),
    );
    expect(defaults.keyColor).toBe('#00FF00');

    await page.locator('#spFileInput').setInputFiles(SPRITE_ON_GREEN);

    // Stages unlock after image load
    await expect(page.locator('#spManualStage2')).not.toHaveClass(/disabled/, { timeout: 10_000 });
    await expect(page.locator('#spManualStage3')).not.toHaveClass(/disabled/);
    await expect(page.locator('#spHandoffBtn')).toBeEnabled();

    await page.locator('#spHandoffBtn').click();

    // Handoff switches to Generate Video
    await expect(page.locator('#tab-video-gen')).toHaveClass(/active/, { timeout: 10_000 });

    const handoff = await page.evaluate(() => {
      const h = window.ASAdventurer.handoff;
      return {
        hasBlob: !!h.spriteBlob,
        hasBase64: typeof h.spriteBase64 === 'string' && h.spriteBase64.length > 20,
        base64Prefix: (h.spriteBase64 || '').slice(0, 30),
        keyColor: h.keyColor,
      };
    });

    expect(handoff.hasBlob).toBe(true);
    expect(handoff.hasBase64).toBe(true);
    expect(handoff.base64Prefix).toMatch(/^data:image\/png;base64,/);
    expect(handoff.keyColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

    // Video-gen should surface the sprite reference from handoff
    await expect(page.locator('#vgRefImagePreview')).not.toHaveClass(/hidden/, { timeout: 5_000 });
    await expect(page.locator('#vgRefFromSprite')).not.toHaveClass(/hidden/);
  });

  test('tabs switch and handoff object remains available', async ({ page }) => {
    await page.goto('/');

    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
    await expect(page.locator('#tab-video-gen')).toHaveClass(/active/);

    await page.locator('.tab-btn[data-tab="tab-video-prep"]').click();
    await expect(page.locator('#tab-video-prep')).toHaveClass(/active/);

    await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
    await expect(page.locator('#tab-exporter')).toHaveClass(/active/);

    const ok = await page.evaluate(() => !!window.ASAdventurer?.handoff);
    expect(ok).toBe(true);
  });
});
