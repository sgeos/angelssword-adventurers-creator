import { expect, test, type Page } from '@playwright/test';
import { LOOP_CLIP, LOOP_CLIP_15FPS, toggleSwitch } from './helpers';

/**
 * F — The model exporter's controls.
 *
 * This file used to hold two tests. One asserted that a list of controls was
 * present, which would pass against a page whose every control was inert. The
 * other checked whether `ChromaKey` was on `window`, found it was not, and
 * asserted that it was not: a test that would begin failing if someone
 * correctly exported the class, and that established nothing about the
 * exporter either way. Both are replaced here rather than kept alongside.
 *
 * The exporter is where the extracted arithmetic ends up. `MODE_LIMITS`,
 * `estimateExportBytes`, `buildExportFrameList`, `strideFromSkip` and
 * `lockedDimension` all have unit tests, and none had a test that it was
 * connected to the control meant to drive it. Both defects found by browser
 * coverage so far lived in exactly that gap.
 *
 * Every assertion below is written so that disconnecting the control it
 * exercises makes it fail.
 */

/** Open the exporter with the clip loaded, and report its frame count. */
const loadForExport = async (page: Page): Promise<number> => {
    await page.goto('/');
    await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
    await expect(page.locator('#tab-exporter')).toHaveClass(/active/);
    await page.locator('#exFileInput').setInputFiles(LOOP_CLIP);

    // The later stages enable only once a clip has decoded.
    await expect(page.locator('#exStage2')).not.toHaveClass(/disabled/);
    await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);

    // Read the count rather than assume sixty. The frame rate is estimated by
    // playing the clip, so the count depends on the host's decoder; that is a
    // recorded defect and not this file's subject.
    const end = await page.locator('#exEndFrame').inputValue();
    const total = Number(end) + 1;
    expect(total).toBeGreaterThan(30);
    return total;
};

const chooseMode = async (page: Page, mode: string): Promise<void> => {
    await page.locator(`.export-mode-btn[data-mode="${mode}"]`).click();
};

/** The frame count the estimate reports. */
const estimatedFrames = async (page: Page): Promise<number> => {
    const text = await page.locator('#exEstFrames').textContent();
    const match = /(-?\d+)/.exec(text ?? '');
    expect(match).not.toBeNull();
    return Number(match?.[1]);
};

const setField = async (page: Page, id: string, value: string): Promise<void> => {
    const field = page.locator(`#${id}`);
    await field.fill(value);
    await field.dispatchEvent('change');
    // A number input silently rejects a value outside its bounds, which would
    // leave the test asserting against a figure never entered.
    await expect(field).toHaveValue(value);
};

test.describe('F — Export mode limits reach the page', () => {
    test('shows the format each mode produces', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();

        await chooseMode(page, 'adventurer');
        await expect(page.locator('#exModeLimits')).toContainText('WEBM');
        await expect(page.locator('#exEstFormat')).toContainText('WEBM');

        await chooseMode(page, 'normal');
        await expect(page.locator('#exModeLimits')).toContainText('GIF');
        await expect(page.locator('#exEstFormat')).toContainText('GIF');
    });

    test('shows each mode own frame and resolution ceiling', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();

        await chooseMode(page, 'normal');
        await expect(page.locator('#exModeLimits')).toContainText('120');
        await expect(page.locator('#exModeLimits')).toContainText('1000×1000');

        await chooseMode(page, 'premium');
        await expect(page.locator('#exModeLimits')).toContainText('600');
        await expect(page.locator('#exModeLimits')).toContainText('4000×4000');
    });

    /**
     * The unbounded mode holds `Infinity`, which has no useful rendering as a
     * number. Asserting the word is the point: a naive conversion would show
     * "Infinity" or "NaN" here, and both have reached interfaces before.
     */
    test('names the unbounded mode rather than printing a number for it', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
        await chooseMode(page, 'adventurer');

        const limits = page.locator('#exModeLimits');
        await expect(limits).toContainText('Unlimited');
        await expect(limits).not.toContainText('Infinity');
        await expect(limits).not.toContainText('NaN');
    });
});

test.describe('F — The output estimate follows its controls', () => {
    test('reports nothing until a clip is loaded', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
        await expect(page.locator('#exEstFrames')).toContainText('--');
        await expect(page.locator('#exEstSize')).toContainText('--');
    });

    test('reports the whole clip once one is loaded', async ({ page }) => {
        const total = await loadForExport(page);
        expect(await estimatedFrames(page)).toBe(total);
        await expect(page.locator('#exEstSize')).not.toContainText('--');
    });

    /** THE FRAME RANGE. A narrower range must produce fewer frames. */
    test('follows the frame range', async ({ page }) => {
        await loadForExport(page);
        await setField(page, 'exStartFrame', '10');
        await setField(page, 'exEndFrame', '19');
        // Inclusive of both ends.
        expect(await estimatedFrames(page)).toBe(10);

        await setField(page, 'exEndFrame', '14');
        expect(await estimatedFrames(page)).toBe(5);
    });

    /**
     * THE FRAME SKIP. Zero means every frame, so the step is the skip plus
     * one; that off-by-one is what `strideFromSkip` exists for, and a control
     * wired to the raw value would divide by zero or drop everything.
     */
    test('follows the frame skip, where zero means every frame', async ({ page }) => {
        await loadForExport(page);
        await setField(page, 'exStartFrame', '0');
        await setField(page, 'exEndFrame', '19');
        expect(await estimatedFrames(page)).toBe(20);

        await setField(page, 'exFrameSkip', '1');
        expect(await estimatedFrames(page)).toBe(10);

        await setField(page, 'exFrameSkip', '3');
        expect(await estimatedFrames(page)).toBe(5);
    });

    /**
     * An inverted range is not empty and not an error. The frame selection
     * wraps, the same circular model the loop controls use, so an end before a
     * start means the tail of the clip followed by its head.
     *
     * I expected zero here and asserted it. The count came back as the clip
     * minus nine, which is the wrap, and the code is right: making the
     * exporter refuse what Video Prep accepts would lose every range that
     * straddles the clip's own end.
     */
    test('wraps an inverted range rather than selecting nothing', async ({ page }) => {
        const total = await loadForExport(page);
        await setField(page, 'exStartFrame', '20');
        await setField(page, 'exEndFrame', '10');

        // Frames 20 to the end, then 0 to 10 inclusive.
        expect(await estimatedFrames(page)).toBe(total - 20 + 11);
    });

    /**
     * The size estimate depends on the format, and the two formats differ
     * enough per frame that the same frames give a different figure. A control
     * that changed the label without recomputing would pass a format assertion
     * and fail this one.
     */
    test('recomputes the size when the mode changes the format', async ({ page }) => {
        await loadForExport(page);
        await setField(page, 'exStartFrame', '0');
        await setField(page, 'exEndFrame', '29');

        await chooseMode(page, 'adventurer');
        const webm = await page.locator('#exEstSize').textContent();

        await chooseMode(page, 'normal');
        const gif = await page.locator('#exEstSize').textContent();

        expect(webm).not.toBe(gif);
        expect(gif).not.toContain('--');
    });
});

/**
 * F — What the frame count rests on, which is not the file.
 *
 * Found while writing the range assertions above. The exporter reported sixty
 * frames for a clip that Video Prep reported as thirty-eight, the same clip in
 * both cases, and the reason is that the two stages establish the rate by
 * different means and neither reads it from the container.
 *
 * A file dropped on the exporter is assumed to be thirty frames per second,
 * marked in the source as a default assumption. Video Prep measures by playing
 * the clip, which under-reports on a host that cannot decode in real time.
 * A clip arriving by handoff carries Video Prep's figure, so the exporter
 * gives two different answers for one clip depending on how it arrived.
 *
 * Characterised rather than corrected. The reasoning for not changing
 * detection unilaterally, and what would decide it, is in
 * docs/decisions/OPEN.md.
 */
test.describe('F — The assumed frame rate', () => {
    test('assumes thirty frames per second, and so miscounts a clip at fifteen', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
        await page.locator('#exFileInput').setInputFiles(LOOP_CLIP_15FPS);
        await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);

        // Two seconds at fifteen frames per second is thirty frames. The
        // exporter says sixty, because it assumed the rate.
        await expect(page.locator('#exEndFrame')).toHaveValue('59');
        expect(await estimatedFrames(page)).toBe(60);
    });

    test('is not reading the rate from the file, which the two clips show', async ({ page }) => {
        const counts: number[] = [];
        for (const clip of [LOOP_CLIP, LOOP_CLIP_15FPS]) {
            await page.goto('/');
            await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
            await page.locator('#exFileInput').setInputFiles(clip);
            await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);
            counts.push(Number(await page.locator('#exEndFrame').inputValue()) + 1);
        }
        // Same duration, half the rate, and the same count reported for both.
        expect(counts[0]).toBe(counts[1]);
    });
});

/**
 * The lock is one of five styled switches in the page, so the flip lives in
 * the shared helpers. The first version of these tests called `check()` on the
 * hidden input, which cannot be clicked, and passed anyway because the lock
 * defaults to on: the call was a no-op that left the state the test wanted.
 */
const toggleAspectLock = async (page: Page): Promise<void> => {
    await toggleSwitch(page, 'exAspectLock');
};

test.describe('F — The aspect lock', () => {
    test('is on by default, the ratio being the usual intent', async ({ page }) => {
        await loadForExport(page);
        await expect(page.locator('#exAspectLock')).toBeChecked();
    });

    /**
     * The clip is 160 by 90, so the ratio is nine sixteenths. Asserting the
     * computed number rather than merely that it changed is what distinguishes
     * a working lock from one that writes something arbitrary.
     */
    test('derives the height from the width while locked', async ({ page }) => {
        await loadForExport(page);
        await expect(page.locator('#exAspectLock')).toBeChecked();

        await setField(page, 'exWidth', '320');
        await expect(page.locator('#exHeight')).toHaveValue('180');

        await setField(page, 'exWidth', '640');
        await expect(page.locator('#exHeight')).toHaveValue('360');
    });

    test('derives the width from the height while locked', async ({ page }) => {
        await loadForExport(page);
        await expect(page.locator('#exAspectLock')).toBeChecked();

        await setField(page, 'exHeight', '450');
        await expect(page.locator('#exWidth')).toHaveValue('800');
    });

    test('leaves the other dimension alone once unlocked', async ({ page }) => {
        await loadForExport(page);
        await toggleAspectLock(page);
        await expect(page.locator('#exAspectLock')).not.toBeChecked();

        const before = await page.locator('#exHeight').inputValue();
        await setField(page, 'exWidth', '320');
        await expect(page.locator('#exHeight')).toHaveValue(before);
    });

    test('resumes deriving when locked again', async ({ page }) => {
        await loadForExport(page);
        await toggleAspectLock(page);
        await setField(page, 'exWidth', '320');
        await toggleAspectLock(page);
        await expect(page.locator('#exAspectLock')).toBeChecked();

        await setField(page, 'exWidth', '640');
        await expect(page.locator('#exHeight')).toHaveValue('360');
    });
});

test.describe('F — Filename presets', () => {
    /**
     * A clip is loaded first because the presets live in the export stage,
     * which is disabled until one is. Without it the button never settles
     * enough to be clicked and the failure reads as an unstable element rather
     * than as a precondition, which cost a spec run to work out.
     */
    test('a preset reaches the filename field', async ({ page }) => {
        await loadForExport(page);

        await page.locator('.filename-preset-btn[data-preset="Intro"]').click();
        await expect(page.locator('#exFilename')).toHaveValue(/Intro/);

        await page.locator('.filename-preset-btn[data-preset="Outro"]').click();
        await expect(page.locator('#exFilename')).toHaveValue(/Outro/);
    });

    test('marks the chosen preset, and only that one', async ({ page }) => {
        await loadForExport(page);
        await page.locator('.filename-preset-btn[data-preset="Intro"]').click();
        await expect(page.locator('#exFilenamePresets .filename-preset-btn.active')).toHaveCount(1);
        await expect(page.locator('.filename-preset-btn[data-preset="Intro"]')).toHaveClass(/active/);

        await page.locator('.filename-preset-btn[data-preset="Outro"]').click();
        await expect(page.locator('#exFilenamePresets .filename-preset-btn.active')).toHaveCount(1);
        await expect(page.locator('.filename-preset-btn[data-preset="Intro"]')).not.toHaveClass(/active/);
    });
});
