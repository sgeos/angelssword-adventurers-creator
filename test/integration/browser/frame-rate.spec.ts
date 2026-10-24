import { expect, test, type Page } from '@playwright/test';
import { LOOP_CLIP_15FPS } from './helpers';

/**
 * O — The source rate across Video Prep and the exporter.
 *
 * Three paths used to decide a clip's frame rate, and one clip had sixty frames
 * in one stage and thirty-eight in another. The rate is now read from the
 * frames' own timestamps by one probe, and Video Prep hands its figure to the
 * exporter, which adopts it when it was measured rather than measuring again.
 *
 * The exporter's own detection is covered in `exporter.spec.ts`. This file
 * covers the other two halves: Video Prep detecting a rate other than thirty,
 * and the exporter adopting the figure it is handed.
 */

/** Load the fifteen frame clip into Video Prep and wait for its probe. */
const loadIntoVideoPrep = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-video-prep"]').click();
    await expect(page.locator('#tab-video-prep')).toHaveClass(/active/);
    await page.locator('#vpFileInput').setInputFiles(LOOP_CLIP_15FPS);
    await expect(page.locator('#vpVideoInfo')).toContainText('Frames:');
};

/**
 * Remove the one facility the probe measures with.
 *
 * Without `requestVideoFrameCallback` the probe cannot measure, and reports the
 * assumed thirty frames per second, labelled as assumed. That makes measuring
 * and adopting tell apart on a clip whose measured and handed rates would
 * otherwise agree. The removal is read back, so a browser where it did not take
 * fails here rather than passing on a probe that still works.
 */
const disableProbe = async (page: Page): Promise<void> => {
    const remaining = await page.evaluate(() => {
        Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
        return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    });
    expect(remaining).toBe(false);
};

test.describe('O — Video Prep detects the source rate', () => {
    /**
     * Thirty frames per second is both the assumed rate and the rate of the
     * other fixture, so only a clip at another rate shows that the stage
     * measured. The clip is two seconds at fifteen, so thirty frames, and the
     * scrubber's maximum is the last frame index.
     */
    test('reports a clip at fifteen frames per second as fifteen', async ({ page }) => {
        await loadIntoVideoPrep(page);
        await expect(page.locator('#vpVideoInfo')).toContainText('15 fps (detected)');
        await expect(page.locator('#vpVideoInfo')).toContainText('Frames: 30');
        await expect(page.locator('#vpScrubber')).toHaveAttribute('max', '29');
    });
});

test.describe('O — The exporter adopts the rate Video Prep measured', () => {
    /**
     * The control for the test below. With the probe disabled, a clip dropped
     * straight on the exporter is reported at the assumed rate. Were this to
     * read fifteen, the disabling would not be working and the adoption test
     * would prove nothing.
     */
    test('reports the assumed rate when it has to measure and cannot', async ({ page }) => {
        await page.goto('/');
        await disableProbe(page);
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
        await page.locator('#exFileInput').setInputFiles(LOOP_CLIP_15FPS);
        await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);

        await expect(page.locator('#exInfo')).toContainText('30 fps (assumed)');
        await expect(page.locator('#exEndFrame')).toHaveValue('59');
    });

    /**
     * Video Prep measures fifteen, then the probe is disabled before the
     * handoff. An exporter that measured again would report thirty, assumed,
     * and sixty frames, which is what the control above shows it does when
     * left to itself.
     */
    test('takes the measured rate from the handoff instead of measuring again', async ({ page }) => {
        await loadIntoVideoPrep(page);
        await expect(page.locator('#vpVideoInfo')).toContainText('15 fps (detected)');
        await disableProbe(page);

        await page.locator('#vpHandoffBtn').click();
        await expect(page.locator('#tab-exporter')).toHaveClass(/active/);
        await expect(page.locator('#exFromVideoPrep')).not.toHaveClass(/hidden/);
        await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);

        await expect(page.locator('#exInfo')).toContainText('15 fps (detected)');
        await expect(page.locator('#exInfo')).toContainText('Frames: 30');
        await expect(page.locator('#exEndFrame')).toHaveValue('29');
    });
});
