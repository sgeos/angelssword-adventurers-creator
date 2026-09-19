import { expect, test } from '@playwright/test';
import { PROVIDER_ORDER, VIDEO_PROVIDER_ORDER } from '../../../src/core/providers.mts';


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
    await expect(selector.locator('.seg-btn')).toHaveCount(PROVIDER_ORDER.length);

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

test.describe('H — Video provider selection', () => {
  test('both video providers are offered and the choice persists', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();

    const selector = page.locator('#vgProvider');
    await expect(selector).toBeVisible();
    await expect(selector.locator('.seg-btn')).toHaveCount(VIDEO_PROVIDER_ORDER.length);

    await selector.locator('[data-mode="xai"]').click();
    await expect(selector.locator('[data-mode="xai"]')).toHaveClass(/active/);

    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
    await expect(page.locator('#vgProvider [data-mode="xai"]')).toHaveClass(/active/,
      { timeout: 10_000 });
  });

  test('choosing Grok drives the start, poll and fetch sequence', async ({ page }) => {
    const calls: string[] = [];
    await page.route('**/api/**', async (routeCtx) => {
      const path = new URL(routeCtx.request().url()).pathname;
      calls.push(path);
      if (path === '/api/xai/videos/generations') {
        await routeCtx.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ request_id: 'req-1' }),
        });
        return;
      }
      if (path.startsWith('/api/xai/videos/')) {
        await routeCtx.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ status: 'completed', video: { url: 'https://assets.x.ai/v/a.mp4' } }),
        });
        return;
      }
      if (path === '/api/xai/video-fetch') {
        await routeCtx.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: 'AAAA' }),
        });
        return;
      }
      await routeCtx.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('xai_api_key', 'xai-test');
      localStorage.setItem('video_provider', 'xai');
    });
    await page.reload();

    // The reference image must be on the handoff BEFORE the tab activates.
    // A MutationObserver reads it when the panel gains the active class, so
    // setting it afterwards is too late and the generation refuses.
    await page.waitForFunction(() => window.ASAdventurer !== undefined);
    await page.evaluate(() => {
      const app = window.ASAdventurer;
      if (app !== undefined) app.handoff.spriteBase64 = 'data:image/png;base64,iVBORw0KGgo=';
    });
    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();

    await page.locator('#vgGenerateBtn').click();

    // The poll interval is five seconds, so the sequence needs room to run.
    await expect.poll(() => calls.includes('/api/xai/video-fetch'),
      { timeout: 30_000 }).toBe(true);

    expect(calls).toContain('/api/xai/videos/generations');
    expect(calls.some((p) => p.startsWith('/api/xai/videos/req-1'))).toBe(true);
    expect(calls).not.toContain('/api/video/generate');
  });
});

test.describe('I — ComfyUI provider', () => {
  test('is offered as a third sprite provider', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-sprite-prep"]').click();
    await page.locator('.mode-btn[data-mode="generate"]').click();
    await expect(page.locator('#sgProvider .seg-btn')).toHaveCount(PROVIDER_ORDER.length);
    await expect(page.locator('#sgProvider [data-mode="comfyui"]')).toBeVisible();
  });

  test('its settings live in the page and round-trip through storage', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();

    await expect(page.locator('#settingsComfyUrl')).toBeVisible();
    await page.locator('#settingsComfyUrl').fill('http://192.168.1.50:8188');
    await page.locator('#settingsComfyModel').fill('custom.safetensors');
    await page.locator('#settingsComfySave').click();

    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();
    await expect(page.locator('#settingsComfyUrl')).toHaveValue('http://192.168.1.50:8188');
    await expect(page.locator('#settingsComfyModel')).toHaveValue('custom.safetensors');
  });

  test('choosing SDXL hides the Flux-only encoder fields', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();

    await expect(page.locator('#settingsComfyFluxFields')).toBeVisible();
    await page.locator('#settingsComfyWorkflow [data-mode="sdxl"]').click();
    await expect(page.locator('#settingsComfyFluxFields')).toBeHidden();
    await page.locator('#settingsComfyWorkflow [data-mode="flux"]').click();
    await expect(page.locator('#settingsComfyFluxFields')).toBeVisible();
  });

  test('generates without any API key, queueing a graph and collecting the image', async ({ page }) => {
    const proxied: { path: string; method: string }[] = [];
    // The save node's identifier depends on how many nodes the graph needed,
    // so the mock reads it from the posted graph rather than assuming one.
    let saveNodeId = '';

    await page.route('**/api/comfyui/proxy', async (routeCtx) => {
      const sent: unknown = routeCtx.request().postDataJSON();
      const fields: Record<string, unknown> =
        typeof sent === 'object' && sent !== null ? { ...sent } : {};
      const rawPath = fields['path'];
      const rawMethod = fields['method'];
      const path = typeof rawPath === 'string' ? rawPath : '';
      proxied.push({ path, method: typeof rawMethod === 'string' ? rawMethod : '' });

      if (path === '/prompt') {
        const body = fields['body'];
        const graph = typeof body === 'object' && body !== null && 'prompt' in body
          ? { ...body }.prompt
          : undefined;
        if (typeof graph === 'object' && graph !== null) {
          const nodes: Record<string, unknown> = { ...graph };
          saveNodeId = Object.keys(nodes).find((id) => {
            const node = nodes[id];
            return typeof node === 'object' && node !== null
              && 'class_type' in node && { ...node }.class_type === 'SaveImage';
          }) ?? '';
        }
        await routeCtx.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ prompt_id: 'p-1' }) });
        return;
      }
      if (path.startsWith('/history/')) {
        await routeCtx.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ 'p-1': { outputs: { [saveNodeId]: { images: [
            { filename: 'out.png', subfolder: '', type: 'output' },
          ] } } } }) });
        return;
      }
      if (path.startsWith('/view')) {
        await routeCtx.fulfill({ status: 200, contentType: 'image/png', body: 'PNGDATA' });
        return;
      }
      await routeCtx.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/');
    await page.evaluate(() => {
      // No key of any kind is set. ComfyUI must not demand one.
      localStorage.removeItem('openai_api_key');
      localStorage.removeItem('xai_api_key');
      localStorage.setItem('sprite_provider', 'comfyui');
    });
    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-sprite-prep"]').click();
    await page.locator('.mode-btn[data-mode="generate"]').click();
    await page.locator('#sgCharName').fill('Test Knight');
    await page.locator('#sgGenerateBtn').click();

    await expect.poll(async () => {
      const status = await page.locator('#sgStatus, .toast').allTextContents();
      return { views: proxied.filter((c) => c.path.startsWith('/view')).length,
               paths: proxied.map((c) => c.path), status };
    }, { timeout: 30_000 }).toMatchObject({ views: 1 });

    expect(proxied.some((c) => c.path === '/prompt' && c.method === 'POST')).toBe(true);
    expect(proxied.some((c) => c.path.startsWith('/history/'))).toBe(true);
  });
});

test.describe('J — ComfyUI Wan video', () => {
  test('is offered as a third video provider', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
    await expect(page.locator('#vgProvider .seg-btn')).toHaveCount(VIDEO_PROVIDER_ORDER.length);
    await expect(page.locator('#vgProvider [data-mode="comfyui"]')).toBeVisible();
  });

  test('its settings round-trip through storage', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();

    await page.locator('#settingsWanUnet').fill('custom-wan.safetensors');
    await page.locator('#settingsWanGguf').check();
    await page.locator('#settingsComfySave').click();

    await page.reload();
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();
    await expect(page.locator('#settingsWanUnet')).toHaveValue('custom-wan.safetensors');
    await expect(page.locator('#settingsWanGguf')).toBeChecked();
  });

  test('renders a clip without any API key, letterboxing the reference first', async ({ page }) => {
    const proxied: string[] = [];
    let uploadedPng = '';
    let saveNodeId = '';
    let sawWanNode = false;

    await page.route('**/api/comfyui/proxy', async (routeCtx) => {
      const sent: unknown = routeCtx.request().postDataJSON();
      const fields: Record<string, unknown> =
        typeof sent === 'object' && sent !== null ? { ...sent } : {};
      const rawPath = fields['path'];
      const path = typeof rawPath === 'string' ? rawPath : '';
      proxied.push(path);

      if (path === '/upload/image') {
        const body = fields['body'];
        const image = typeof body === 'object' && body !== null && 'image' in body
          ? { ...body }.image : undefined;
        if (typeof image === 'string') uploadedPng = image;
        await routeCtx.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ name: 'ref.png' }) });
        return;
      }
      if (path === '/prompt') {
        const body = fields['body'];
        const graph = typeof body === 'object' && body !== null && 'prompt' in body
          ? { ...body }.prompt : undefined;
        if (typeof graph === 'object' && graph !== null) {
          const nodes: Record<string, unknown> = { ...graph };
          for (const id of Object.keys(nodes)) {
            const node = nodes[id];
            if (typeof node !== 'object' || node === null || !('class_type' in node)) continue;
            const kind = { ...node }.class_type;
            if (kind === 'WanImageToVideo') sawWanNode = true;
            if (kind === 'SaveAnimatedWEBP') saveNodeId = id;
          }
        }
        await routeCtx.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ prompt_id: 'w-1' }) });
        return;
      }
      if (path.startsWith('/history/')) {
        await routeCtx.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ 'w-1': { outputs: { [saveNodeId]: { images: [
            { filename: 'clip.webp', subfolder: '', type: 'output' },
          ] } } } }) });
        return;
      }
      if (path.startsWith('/view')) {
        await routeCtx.fulfill({ status: 200, contentType: 'image/webp', body: 'WEBPDATA' });
        return;
      }
      await routeCtx.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('google_api_key');
      localStorage.removeItem('xai_api_key');
      localStorage.setItem('video_provider', 'comfyui');
    });
    await page.reload();

    await page.waitForFunction(() => window.ASAdventurer !== undefined);
    await page.evaluate(() => {
      const app = window.ASAdventurer;
      // A 2x2 red square, so the letterbox has real dimensions to work with.
      if (app !== undefined) app.handoff.spriteBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
    });
    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
    await page.locator('#vgGenerateBtn').click();

    await expect.poll(() => proxied.some((p) => p.startsWith('/view')),
      { timeout: 40_000 }).toBe(true);

    expect(proxied).toContain('/upload/image');
    expect(proxied).toContain('/prompt');
    expect(sawWanNode).toBe(true);

    // The uploaded frame is the letterboxed canvas, not the original still.
    const dimensions = await page.evaluate(async (src) => new Promise<{ w: number; h: number }>((resolve) => {
      const el = new Image();
      el.onload = (): void => { resolve({ w: el.naturalWidth, h: el.naturalHeight }); };
      el.src = src;
    }), uploadedPng);
    expect(dimensions).toEqual({ w: 832, h: 480 });
  });
});
