import { expect, test, type Page } from '@playwright/test';

/**
 * P — The layout the port to Tamagui and TanStack Start had to preserve.
 *
 * Every property here broke at least once during the port, and none was
 * caught by the specifications that existed, because they assert behaviour and
 * these are presentation. Each was found by comparing the page with the build
 * before the port, by eye or by measuring.
 *
 * - The tabs collapsed onto one another when a Tamagui group made each button
 *   a size container.
 * - The stage's two columns became one when Tamagui's rules came after the
 *   grid's in the head and won the tie.
 * - The default prompt gained indentation from the converted markup.
 * - Every last form row gained a margin the stylesheet had removed, because
 *   Tamagui has no last-child selector.
 * - React reported a hydration mismatch on every load, recovered, and threw the
 *   prerendered shell away.
 *
 * One more is a guard rather than a regression. The mobile application's web
 * view showed the mode selector clipping a label at 384 pixels. The page
 * itself does not, with its fonts or without them, so the cause lies in the
 * web view, and this records that the page's own narrow layout is sound.
 */

const box = async (page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> => {
    const found = await page.locator(selector).boundingBox();
    if (found === null) throw new Error(`${selector} is not rendered`);
    return found;
};

test.describe('P — Layout preserved by the port', () => {
    test('the tabs sit side by side, in pipeline order, without overlapping', async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.goto('/');
        const ids = ['tab-sprite-prep', 'tab-video-gen', 'tab-video-prep', 'tab-exporter', 'tab-settings'];
        let rightEdge = -1;
        for (const id of ids) {
            const tab = await box(page, `.tab-btn[data-tab="${id}"]`);
            expect(tab.width).toBeGreaterThan(60);
            expect(tab.x).toBeGreaterThanOrEqual(rightEdge);
            rightEdge = tab.x + tab.width;
        }
    });

    test('the preview sits beside the stage at desktop width', async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.goto('/');
        const stage = await box(page, '#spManualStage1');
        const preview = await box(page, '#spCanvasContainer');
        expect(preview.x).toBeGreaterThan(stage.x + stage.width);
        expect(Math.abs(preview.y - stage.y)).toBeLessThan(120);
    });

    test('the preview stacks below the stage on a narrower window', async ({ page }) => {
        await page.setViewportSize({ width: 1000, height: 900 });
        await page.goto('/');
        const stage = await box(page, '#spManualStage1');
        const preview = await box(page, '#spCanvasContainer');
        expect(preview.y).toBeGreaterThan(stage.y + stage.height);
    });

    test('the default prompt starts each paragraph at the margin', async ({ page }) => {
        await page.goto('/');
        for (const id of ['#vgPrompt', '#vgKeyframePrompt']) {
            const text = await page.locator(id).inputValue();
            expect(text.startsWith('Locked-off Position Static Camera.')).toBe(true);
            for (const line of text.split('\n')) expect(line).toBe(line.trimStart());
            expect(text).toContain('\n\n[Constraints]:');
        }
    });

    test('the last row in a panel has no margin below it', async ({ page }) => {
        await page.goto('/');
        // The stages mount just after hydration, a moment after the load event,
        // so wait for the field before reading the page directly.
        await page.locator('#spZoom').waitFor({ state: 'attached' });
        // Three rows in the key colour panel; only the last loses its margin.
        const margins = await page.evaluate(() => {
            const zoom = document.getElementById('spZoom');
            const offset = document.getElementById('spOffset');
            const rowOf = (el: HTMLElement | null): Element | null => el?.closest('.form-row') ?? null;
            const style = (el: Element | null): string => (el === null ? 'missing' : getComputedStyle(el).marginBottom);
            return { last: style(rowOf(zoom)), earlier: style(rowOf(offset)) };
        });
        expect(margins).toEqual({ last: '0px', earlier: '16px' });
    });

    test('the mode buttons fit their labels at a phone\'s width', async ({ page }) => {
        // The width of the Galaxy A16's web view, where the clipping was seen.
        await page.setViewportSize({ width: 384, height: 800 });
        await page.goto('/');
        await page.locator('#spritePrepMode .mode-btn').first().waitFor({ state: 'visible' });
        const fits = await page.evaluate(() => {
            const selector = document.getElementById('spritePrepMode');
            if (selector === null) return ['the selector is missing'];
            const outer = selector.getBoundingClientRect();
            const problems: string[] = [];
            for (const button of selector.querySelectorAll('.mode-btn')) {
                const edge = button.getBoundingClientRect();
                const label = button.textContent.trim();
                if (button.scrollWidth > button.clientWidth) problems.push(`${label} overflows its button`);
                if (edge.right > outer.right + 0.5 || edge.left < outer.left - 0.5) problems.push(`${label} extends past the selector`);
            }
            if (document.documentElement.scrollWidth > window.innerWidth) problems.push('the page scrolls sideways');
            return problems;
        });
        expect(fits).toEqual([]);
    });

    test('loads without an error or a warning in the console', async ({ page }) => {
        const reports: string[] = [];
        page.on('pageerror', (error) => { reports.push(`pageerror: ${error.message}`); });
        page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') reports.push(`${message.type()}: ${message.text()}`);
        });
        await page.goto('/');
        await expect(page.locator('.tab-btn.active')).toBeVisible();
        // Hydration reports arrive after the first render; give them a moment.
        await page.waitForTimeout(500);
        expect(reports).toEqual([]);
    });
});
