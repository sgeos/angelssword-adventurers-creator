import { expect, test, type Page } from '@playwright/test';

/**
 * N — Framing and art style.
 *
 * Both selectors were added late and neither had coverage. They are
 * remembered between sessions, which is the part worth testing: a choice that
 * silently fails to persist produces a sprite in the wrong shape or the wrong
 * style, and nothing announces it.
 *
 * Asserting that a click highlights a button would establish almost nothing,
 * so every persistence assertion here reloads the page first.
 *
 * The framing also decides the canvas the provider is asked for, which is the
 * consequence the operator hit: full body was being requested on a landscape
 * canvas, leaving the character in a column of empty space.
 */

/**
 * Open Sprite Prep and switch to generation.
 *
 * The stage opens in manual upload mode, so the generation panel carrying
 * these two selectors is hidden. Switching is not optional, and the first
 * version of this file omitted it: the default-value test still passed,
 * because reading an attribute works perfectly well on a hidden element.
 * That is the weak assertion this file is supposed to avoid.
 */
const openSpritePrep = async (page: Page): Promise<void> => {
    await page.goto('/');
    await expect(page.locator('#tab-sprite-prep')).toHaveClass(/active/);
    await page.locator('#spritePrepMode .mode-btn[data-mode="generate"]').click();
    await expect(page.locator('#spriteGenerateMode')).not.toHaveClass(/hidden/);
};

/** Reload, and come back to the panel the selectors live on. */
const reloadToSpritePrep = async (page: Page): Promise<void> => {
    await page.reload();
    await expect(page.locator('#tab-sprite-prep')).toHaveClass(/active/);
    await page.locator('#spritePrepMode .mode-btn[data-mode="generate"]').click();
    await expect(page.locator('#spriteGenerateMode')).not.toHaveClass(/hidden/);
};

const choose = async (page: Page, selector: string, mode: string): Promise<void> => {
    await page.locator(`#${selector} .mode-btn[data-mode="${mode}"]`).click();
    await expect(page.locator(`#${selector} .mode-btn[data-mode="${mode}"]`)).toHaveClass(/active/);
};

const activeMode = async (page: Page, selector: string): Promise<string | null> =>
    page.locator(`#${selector} .mode-btn.active`).getAttribute('data-mode');

test.describe('N — Framing and art style', () => {
    test('starts on the documented defaults', async ({ page }) => {
        await openSpritePrep(page);
        expect(await activeMode(page, 'sgFraming')).toBe('bust');
        expect(await activeMode(page, 'sgStyle')).toBe('anime');
    });

    test('marks exactly one framing and one style at a time', async ({ page }) => {
        await openSpritePrep(page);
        await choose(page, 'sgFraming', 'fullBody');
        await expect(page.locator('#sgFraming .mode-btn.active')).toHaveCount(1);
        await choose(page, 'sgStyle', 'pixel');
        await expect(page.locator('#sgStyle .mode-btn.active')).toHaveCount(1);
    });

    /** THE PROPERTY THE STORAGE EXISTS FOR. */
    test('remembers the framing across a reload', async ({ page }) => {
        await openSpritePrep(page);
        await choose(page, 'sgFraming', 'fullBody');

        await reloadToSpritePrep(page);
        expect(await activeMode(page, 'sgFraming')).toBe('fullBody');
    });

    test('remembers the art style across a reload', async ({ page }) => {
        await openSpritePrep(page);
        await choose(page, 'sgStyle', 'claymation');

        await reloadToSpritePrep(page);
        expect(await activeMode(page, 'sgStyle')).toBe('claymation');
    });

    test('remembers the two independently', async ({ page }) => {
        await openSpritePrep(page);
        await choose(page, 'sgFraming', 'fullBody');
        await choose(page, 'sgStyle', 'reference');

        await reloadToSpritePrep(page);
        expect(await activeMode(page, 'sgFraming')).toBe('fullBody');
        expect(await activeMode(page, 'sgStyle')).toBe('reference');
    });

    /**
     * Storage is editable by hand and survives a version of the application
     * that named its modes differently. An unrecognised value must fall back
     * to the default rather than leave nothing selected or be applied blindly.
     */
    test('falls back to the default for a stored value it does not recognise', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.setItem('sprite_framing', 'torso-and-a-half');
            localStorage.setItem('sprite_style', 'daguerreotype');
        });
        await reloadToSpritePrep(page);

        expect(await activeMode(page, 'sgFraming')).toBe('bust');
        expect(await activeMode(page, 'sgStyle')).toBe('anime');
        await expect(page.locator('#sgFraming .mode-btn.active')).toHaveCount(1);
    });
});

/**
 * What the framing actually causes. The selector is only worth having if it
 * reaches the request, and the shape of that request is the thing the operator
 * saw go wrong.
 */
test.describe('N — Framing reaches the request', () => {
    /** Capture the body of the sprite request without letting it leave. */
    const captureRequest = async (page: Page): Promise<() => unknown> => {
        let captured: unknown = undefined;
        await page.route('**/api/generate', async (route) => {
            captured = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [{ b64_json: '' }] }),
            });
        });
        return () => captured;
    };

    const generateWith = async (page: Page, framing: string, style?: string): Promise<void> => {
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.setItem('openai_api_key', 'sk-mock-browser-test');
        });
        await reloadToSpritePrep(page);
        await choose(page, 'sgFraming', framing);
        if (style !== undefined) await choose(page, 'sgStyle', style);
        // A name is required and its absence is reported as a toast, so
        // omitting it stops the flow before any request and looks exactly
        // like a request that was never made.
        await page.locator('#sgCharName').fill('Mirrime');
        await page.locator('#sgCharDesc').fill('a witch in a wide brimmed hat');
        await page.locator('#sgGenerateBtn').click();
    };

    test('asks for a portrait canvas for a full body', async ({ page }) => {
        const body = await captureRequest(page);
        await generateWith(page, 'fullBody');
        await expect.poll(() => body()).toBeTruthy();

        const sent = body();
        expect(sent).toMatchObject({ size: '1024x1536' });
    });

    test('asks for a landscape canvas for a bust', async ({ page }) => {
        const body = await captureRequest(page);
        await generateWith(page, 'bust');
        await expect.poll(() => body()).toBeTruthy();

        expect(body()).toMatchObject({ size: '1536x1024' });
    });

    /**
     * The two framings must not merely differ in the canvas: the prompt has to
     * say what is being framed, or the model fills a portrait canvas with a
     * bust.
     */
    test('says which framing it wants in the prompt', async ({ page }) => {
        const body = await captureRequest(page);
        await generateWith(page, 'fullBody');
        await expect.poll(() => body()).toBeTruthy();

        const sent = body();
        const prompt = sent !== null && typeof sent === 'object' && 'prompt' in sent
            ? String(sent.prompt) : '';
        expect(prompt.toLowerCase()).toContain('full body');
    });

    test('carries the chosen art style into the prompt', async ({ page }) => {
        const body = await captureRequest(page);
        await generateWith(page, 'bust', 'claymation');
        await expect.poll(() => body()).toBeTruthy();

        const sent = body();
        const prompt = sent !== null && typeof sent === 'object' && 'prompt' in sent
            ? String(sent.prompt) : '';
        expect(prompt.toLowerCase()).toContain('clay');
    });
});
