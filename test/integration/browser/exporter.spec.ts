import { readFileSync } from 'node:fs';
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

    // The rate comes from the frames' timestamps rather than from how fast
    // this host decodes, so the two second clip at thirty is sixty frames on
    // any machine. The count used to vary by host and was only bounded here.
    const end = await page.locator('#exEndFrame').inputValue();
    const total = Number(end) + 1;
    expect(total).toBe(60);
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
 * F — The source rate is read from the clip, not assumed.
 *
 * A file dropped here used to be assumed to be thirty frames per second, so a
 * fifteen frame clip was counted as sixty frames with every real frame twice.
 * The rate now comes from the frames' own timestamps.
 */
test.describe('F — The source rate is detected', () => {
    test('counts a clip at fifteen frames per second as thirty frames', async ({ page }) => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
        await page.locator('#exFileInput').setInputFiles(LOOP_CLIP_15FPS);
        await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);

        await expect(page.locator('#exEndFrame')).toHaveValue('29');
        expect(await estimatedFrames(page)).toBe(30);
        await expect(page.locator('#exInfo')).toContainText('15 fps (detected)');
    });

    test('gives two clips of equal length but different rates different counts', async ({ page }) => {
        const counts: number[] = [];
        for (const clip of [LOOP_CLIP, LOOP_CLIP_15FPS]) {
            await page.goto('/');
            await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
            await page.locator('#exFileInput').setInputFiles(clip);
            await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);
            counts.push(Number(await page.locator('#exEndFrame').inputValue()) + 1);
        }
        expect(counts).toEqual([60, 30]);
    });

    test('says the export rate follows the source unless set', async ({ page }) => {
        await loadForExport(page);
        await expect(page.locator('#exInfo')).toContainText('30 fps (matches source)');
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

/**
 * F — Exports at default settings play at the source rate.
 *
 * The output rate field is labelled "0 = match source" and defaults to zero.
 * The TypeScript conversion stopped honouring that, and nothing noticed because
 * no specification exported anything. Measured before the fix on this two
 * second clip: the Graphics Interchange Format export lasted 1.20 seconds with
 * every delay at the two centisecond floor, and the WebM lasted 0.22 seconds.
 */
test.describe('F — Default exports keep the source rate', () => {
    const exportAtDefaults = async (page: Page, mode: string): Promise<{ path: string; elapsedMs: number }> => {
        await page.goto('/');
        await page.locator('.tab-btn[data-tab="tab-exporter"]').click();
        await chooseMode(page, mode);
        await page.locator('#exFileInput').setInputFiles(LOOP_CLIP);
        await expect(page.locator('#exStage3')).not.toHaveClass(/disabled/);
        await expect(page.locator('#exFPS')).toHaveValue('0');

        const started = Date.now();
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 110_000 }),
            page.locator('#exExportBtn').click(),
        ]);
        const elapsedMs = Date.now() - started;
        const path = await download.path();
        return { path, elapsedMs };
    };

    /** Every Graphic Control Extension's delay, in hundredths of a second. */
    const gifDelays = (bytes: Buffer): number[] => {
        const delays: number[] = [];
        let at = bytes.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
        // Each step moves past the match, so the search position only grows
        // and the loop ends when no further extension is found.
        while (at >= 0) {
            delays.push(bytes.readUInt16LE(at + 4));
            at = bytes.indexOf(Buffer.from([0x21, 0xf9, 0x04]), at + 6);
        }
        return delays;
    };

    test('a GIF carries the source rate delay, not the floor', async ({ page }) => {
        test.setTimeout(120_000);
        const total = await loadForExport(page);
        expect(total).toBe(60);
        const { path } = await exportAtDefaults(page, 'normal');
        const delays = gifDelays(readFileSync(path));

        expect(delays.length).toBe(60);
        // Thirty frames per second is 3.33 centiseconds, stored as 3. The
        // shortfall is the format's own drift, not this defect, whose
        // signature was a delay of 2 on every frame.
        expect(new Set(delays)).toEqual(new Set([3]));
    });

    /**
     * A WebM is recorded in real time, so recording sixty frames at thirty per
     * second takes two seconds. The defect recorded it in under half a second.
     * A lower bound on elapsed time can only be met more easily by a slower
     * machine, so this does not become flaky in the direction that would hide
     * the defect.
     */
    test('a WebM takes the clip own duration to record', async ({ page }) => {
        test.setTimeout(120_000);
        const { elapsedMs } = await exportAtDefaults(page, 'adventurer');
        expect(elapsedMs).toBeGreaterThan(1_500);
    });
});
