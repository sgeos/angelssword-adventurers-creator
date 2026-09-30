import { expect, test, type Page } from '@playwright/test';
import { LOOP_CLIP } from './helpers';

/**
 * M — The loop controls.
 *
 * Every property here was a defect the operator reported rather than one
 * imagined for the occasion.
 *
 * A single button set only the end, so every loop began at frame zero. When it
 * became two buttons, one end still had to be chosen before the other. And a
 * loop whose end preceded its start was refused outright, which lost every
 * loop whose best matching pair straddles the clip's own end, playback being
 * circular.
 *
 * None of that is reachable from a unit test. The arithmetic is covered in
 * `video-prep-loop.test.mts`; what is covered here is that the buttons are
 * wired to it, which is the layer where all three defects actually lived.
 */

/**
 * Load the clip and report how many frames the stage decided it has.
 *
 * The count is READ rather than assumed, and deliberately so. The clip is two
 * seconds at thirty frames per second, so sixty, but the stage does not read
 * the rate from the container: it plays the clip at four times speed for half
 * a second and divides the frames the browser reports decoding by the elapsed
 * media time. A machine that cannot decode that fast reports fewer, and
 * headless Chromium reports nineteen frames per second for this clip.
 *
 * Asserting sixty here would therefore test the host's decoder rather than the
 * loop controls. The weakness is real and recorded in docs/decisions/OPEN.md;
 * it is not what this file is for.
 */
const loadClip = async (page: Page): Promise<number> => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-video-prep"]').click();
    await expect(page.locator('#tab-video-prep')).toHaveClass(/active/);
    await page.locator('#vpFileInput').setInputFiles(LOOP_CLIP);
    await expect(page.locator('#vpVideoInfo')).toContainText('Frames:');

    // The scrubber's maximum is the last frame index, which is the count the
    // rest of the stage works from.
    const max = await page.locator('#vpScrubber').getAttribute('max');
    const total = Number(max) + 1;
    expect(total).toBeGreaterThan(30);
    return total;
};

/**
 * Move the scrubber to a frame the way a drag would.
 *
 * A range input clamps a value above its maximum without complaint, which
 * would leave a test asserting a frame it never reached. Reading the value
 * back turns that into a failure.
 */
const scrubTo = async (page: Page, frame: number): Promise<void> => {
    const scrubber = page.locator('#vpScrubber');
    await scrubber.evaluate((node, value) => {
        if (!(node instanceof HTMLInputElement)) return;
        node.value = String(value);
        node.dispatchEvent(new Event('input', { bubbles: true }));
    }, frame);
    await expect(scrubber).toHaveValue(String(frame));
};

const setStart = async (page: Page, frame: number): Promise<void> => {
    await scrubTo(page, frame);
    await page.locator('#vpSetLoopStartBtn').click();
};

const setEnd = async (page: Page, frame: number): Promise<void> => {
    await scrubTo(page, frame);
    await page.locator('#vpSetLoopEndBtn').click();
};

test.describe('M — Loop controls', () => {
    test('reports the clip it was given, not a default', async ({ page }) => {
        await loadClip(page);
        // Resolution and duration come from the container and are exact. The
        // frame rate is estimated by playing the clip, so it is not asserted.
        await expect(page.locator('#vpVideoInfo')).toContainText('160 × 90');
        await expect(page.locator('#vpVideoInfo')).toContainText('2.00s');
    });

    /**
     * THE FIRST DEFECT. One button set the end alone, so a start could not be
     * chosen at all and every loop ran from zero.
     */
    test('sets a start that is not frame zero', async ({ page }) => {
        const total = await loadClip(page);
        await setStart(page, 12);
        await expect(page.locator('#vpLoopInfo')).toContainText('12');
        // The end defaults to the last frame, which the load sets.
        await expect(page.locator('#vpVideoInfo')).toContainText(`Frames 12 → ${(total - 1).toString()}`);
    });

    test('sets an end independently of the start', async ({ page }) => {
        await loadClip(page);
        await setStart(page, 10);
        await setEnd(page, 28);
        await expect(page.locator('#vpVideoInfo')).toContainText('Frames 10 → 28');
    });

    /**
     * THE SECOND DEFECT. Either end must be choosable first. Setting the end
     * before the start is the natural order when shortening a loop from the
     * back, and it used to be the order that did not work.
     */
    test('accepts the end before the start, reaching the same loop', async ({ page }) => {
        await loadClip(page);
        await setEnd(page, 28);
        await setStart(page, 10);
        await expect(page.locator('#vpVideoInfo')).toContainText('Frames 10 → 28');
    });

    /**
     * THE THIRD DEFECT. Playback is circular, so an end before a start is a
     * loop crossing the seam: the tail of the clip and then its head. It is a
     * valid loop and must not be refused.
     */
    test('accepts a loop that crosses the seam', async ({ page }) => {
        const total = await loadClip(page);
        const start = total - 10;
        await setStart(page, start);
        await setEnd(page, 10);

        await expect(page.locator('#vpVideoInfo')).toContainText(`Frames ${start.toString()} → 10`);
        // The readout marks the wrap, the two ends alone reading as a mistake.
        await expect(page.locator('#vpLoopInfo')).toContainText('↻');
        // Preview stays available, which is what refusal used to take away.
        await expect(page.locator('#vpPreviewLoopBtn')).toBeEnabled();
    });

    /**
     * A wrapping loop is shorter than the clip, so a count taken as
     * `end - start` would be negative and a count over the whole clip would be
     * sixty. Eleven is what circular counting gives, and asserting the number
     * distinguishes the three.
     */
    test('counts a seam-crossing loop the short way round', async ({ page }) => {
        const total = await loadClip(page);
        // Ten frames before the end, round to frame ten: twenty-one frames
        // counted the short way, whatever the clip's length.
        await setStart(page, total - 10);
        await setEnd(page, 10);
        await expect(page.locator('#vpVideoInfo')).toContainText('Output Frames: 21');
    });

    /**
     * The panel and the readout beside it used to disagree here: the panel
     * tested a plain subtraction, which is negative across the seam, so it hid
     * the loop that the readout called valid.
     */
    test('shows the loop in both places, or in neither', async ({ page }) => {
        const total = await loadClip(page);
        for (const [start, end] of [[10, 30], [total - 10, 10]] as const) {
            await setStart(page, start);
            await setEnd(page, end);
            await expect(page.locator('#vpLoopInfo')).not.toBeEmpty();
            await expect(page.locator('#vpVideoInfo')).toContainText('Loop:');
        }
    });

    test('refuses a loop too short to be one, and says why', async ({ page }) => {
        await loadClip(page);
        await setStart(page, 20);
        await setEnd(page, 20);
        await expect(page.locator('#vpLoopInfo')).toContainText('frame');
        await expect(page.locator('#vpPreviewLoopBtn')).toBeDisabled();
        // Clearing remains available, that being the state most likely to want it.
        await expect(page.locator('#vpClearLoopBtn')).toBeEnabled();
    });

    test('clearing forgets the loop and disables preview', async ({ page }) => {
        await loadClip(page);
        await setStart(page, 10);
        await setEnd(page, 28);
        await page.locator('#vpClearLoopBtn').click();

        await expect(page.locator('#vpLoopInfo')).toBeEmpty();
        await expect(page.locator('#vpVideoInfo')).not.toContainText('Loop:');
        await expect(page.locator('#vpPreviewLoopBtn')).toBeDisabled();
        await expect(page.locator('#vpClearLoopBtn')).toBeDisabled();
    });

    test('a loop survives being moved end-first after it was set', async ({ page }) => {
        await loadClip(page);
        await setStart(page, 5);
        await setEnd(page, 28);
        await setEnd(page, 25);
        await expect(page.locator('#vpVideoInfo')).toContainText('Frames 5 → 25');
        await setStart(page, 20);
        await expect(page.locator('#vpVideoInfo')).toContainText('Frames 20 → 25');
    });
});
