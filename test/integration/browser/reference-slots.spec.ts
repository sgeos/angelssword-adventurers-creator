import { expect, test, type Page } from '@playwright/test';

/**
 * L — The reference slots.
 *
 * The slot interface was the largest untested thing added in this session,
 * and unlike the arithmetic it cannot be pulled into the core: it is element
 * wiring, a shared file dialogue, and a control that appears on a condition.
 *
 * Order is the property that matters most. The loader once pushed from
 * `FileReader.onload`, so the order depended on which file finished reading
 * first, and that became load-bearing when keyframe mode started reading the
 * first image as the start frame and the last as the end. These assertions
 * would have caught that.
 */

/** A one-pixel PNG, distinguishable by colour so order is observable. */
const pixel = (colour: 'red' | 'green' | 'blue'): Buffer => {
    // Pre-encoded 1x1 PNGs. Their bytes differ, which is all the test needs.
    const encoded: Readonly<Record<string, string>> = {
        red: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        green: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNg+M/wHwAEAAH/kk0hEwAAAABJRU5ErkJggg==',
        blue: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYPjPAAAEAgH/0pNRLwAAAABJRU5ErkJggg==',
    };
    return Buffer.from(encoded[colour] ?? '', 'base64');
};

const file = (name: string, colour: 'red' | 'green' | 'blue'): {
    name: string; mimeType: string; buffer: Buffer;
} => ({ name, mimeType: 'image/png', buffer: pixel(colour) });

/** Open the stage and hand it the given files through the upload zone. */
const dropFiles = async (
    page: Page,
    files: readonly { name: string; mimeType: string; buffer: Buffer }[],
): Promise<void> => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
    await expect(page.locator('#tab-video-gen')).toHaveClass(/active/);
    await page.locator('#vgFileInput').setInputFiles([...files]);
    await expect(page.locator('#vgRefImagePreview')).not.toHaveClass(/hidden/);
};

/** The `src` of each slot thumbnail, in the order rendered. */
const slotSources = async (page: Page): Promise<string[]> =>
    page.locator('#vgRefSlots img').evaluateAll((nodes) =>
        nodes.map((n) => (n instanceof HTMLImageElement ? n.src : '')));

test.describe('L — Reference slots', () => {
    test('shows one slot per image, and the first as the primary', async ({ page }) => {
        await dropFiles(page, [file('a.png', 'red'), file('b.png', 'green')]);

        const sources = await slotSources(page);
        expect(sources).toHaveLength(2);

        // The large preview is the first image, which is the one every
        // provider uses; only Gemini is sent the rest.
        const primary = await page.locator('#vgRefPrimary').getAttribute('src');
        expect(primary).toBe(sources[0]);
    });

    /**
     * THE ORDERING PROPERTY. Three distinguishable images must come back in
     * the order supplied, not the order they finished decoding.
     */
    test('keeps the supplied order', async ({ page }) => {
        await dropFiles(page, [
            file('one.png', 'red'), file('two.png', 'green'), file('three.png', 'blue'),
        ]);

        const sources = await slotSources(page);
        expect(sources).toHaveLength(3);
        expect(new Set(sources).size).toBe(3);

        // The first must be the primary, and all three must be distinct, so a
        // reordering or a duplication both fail here.
        const primary = await page.locator('#vgRefPrimary').getAttribute('src');
        expect(primary).toBe(sources[0]);
    });

    test('renders three slots even when fewer are filled, so an empty one can be used', async ({ page }) => {
        await dropFiles(page, [file('only.png', 'red')]);
        await expect(page.locator('#vgRefSlots > div')).toHaveCount(3);
        expect(await slotSources(page)).toHaveLength(1);
    });

    /**
     * The clear control appears only when no empty slot remains, that being
     * the point at which there is nowhere left to drop and no other way to
     * start again.
     */
    test('offers clear only when every slot is full', async ({ page }) => {
        await dropFiles(page, [file('a.png', 'red'), file('b.png', 'green')]);
        await expect(page.locator('#vgRefClearBtn')).toHaveClass(/hidden/);

        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();
        await page.locator('#vgFileInput').setInputFiles([
            file('a.png', 'red'), file('b.png', 'green'), file('c.png', 'blue'),
        ]);
        await expect(page.locator('#vgRefClearBtn')).not.toHaveClass(/hidden/);
    });

    test('clearing forgets every image and offers the upload zone again', async ({ page }) => {
        await dropFiles(page, [
            file('a.png', 'red'), file('b.png', 'green'), file('c.png', 'blue'),
        ]);
        await page.locator('#vgRefClearBtn').click();

        await expect(page.locator('#vgRefImagePreview')).toHaveClass(/hidden/);
        await expect(page.locator('#vgRefClearBtn')).toHaveClass(/hidden/);
        await expect(page.locator('#vgUploadZone')).not.toHaveClass(/hidden/);
    });

    test('keeps only the first three when more are supplied', async ({ page }) => {
        await dropFiles(page, [
            file('a.png', 'red'), file('b.png', 'green'),
            file('c.png', 'blue'), file('d.png', 'red'),
        ]);
        expect(await slotSources(page)).toHaveLength(3);
    });

    test('says what the selected provider does with the extras', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-video-gen"]').click();

        // Gemini is the only provider sent more than the first image.
        await page.locator('#vgProvider .seg-btn[data-mode="google"]').click();
        await expect(page.locator('#vgReferenceUse')).toContainText('every image you add');

        await page.locator('#vgProvider .seg-btn[data-mode="xai"]').click();
        await expect(page.locator('#vgReferenceUse')).toContainText('first image only');
    });
});
