/**
 * The source frame rate of a clip, and where the figure came from.
 *
 * THREE QUANTITIES, KEPT APART. This module is about the first only.
 *
 * 1. The SOURCE rate: how many frames per second the clip was encoded at. It
 *    maps a frame number to a time, so it governs scrubbing, loop points,
 *    frame selection and preview pacing. It is a property of the file.
 * 2. The EXPORT rate: how fast an exported file plays. A user choice, which
 *    defaults to the source rate. See `resolveExportFps` in exporter-math.
 * 3. The PLAYBACK rate this machine can sustain right now. A property of the
 *    host, not the file, and used for nothing.
 *
 * The defect this replaces measured the third and used it as the first. It
 * played the clip at four times speed for half a second and divided decoded
 * frames by elapsed time, so a host that could not keep up reported a lower
 * rate than the file had: nineteen frames per second for a thirty frame clip
 * in headless Chromium. The exporter, meanwhile, assumed thirty for any file
 * dropped on it, so one clip had two frame counts depending on its route.
 *
 * The replacement reads the presentation timestamp of each frame the browser
 * shows. Those timestamps come from the file, so the gap between two
 * consecutive frames is one frame's duration however slowly they arrive.
 */

/** Used when the rate cannot be established. A convention, not a measurement. */
export const ASSUMED_SOURCE_FPS = 30;

/** Rates outside this range are treated as a failed measurement. */
export const MIN_PLAUSIBLE_FPS = 1;
export const MAX_PLAUSIBLE_FPS = 240;

/**
 * The largest number of frames the shortest gap may span. A host that skipped
 * every frame between two shown ones still leaves gaps whose common unit is one
 * frame, and this bounds the search for that unit.
 */
const MAX_FRAMES_IN_SHORTEST_GAP = 4;

/**
 * A gap counts as a whole number of units when within this fraction of one.
 *
 * It bounds the timestamp error tolerated at a tenth of the shortest gap.
 * WebM's millisecond rounding, at most half a millisecond, stays inside that
 * up to about two hundred frames per second.
 */
const UNIT_TOLERANCE = 0.1;

/** At least this many gaps are needed before a figure is trusted. */
export const MIN_GAPS = 3;

/** Timestamps closer than this are the same frame reported twice. */
const SAME_FRAME_SECONDS = 1 / (MAX_PLAUSIBLE_FPS * 4);

/**
 * A rate within this fraction of a whole number is reported as that number.
 *
 * Five tenths of a percent, which deliberately merges 29.97 into 30, 23.976
 * into 24 and 59.94 into 60. Telling them apart needs either more samples than
 * a short probe collects or timestamps finer than WebM's millisecond. The cost
 * is about one frame of drift per thirty seconds of clip, which a tool for
 * clips of a few seconds can bear.
 */
const WHOLE_RATE_TOLERANCE = 0.005;

export type FrameRateOrigin = "detected" | "assumed";

export interface SourceFrameRate {
    readonly fps: number;
    readonly origin: FrameRateOrigin;
}

export const ASSUMED_RATE: SourceFrameRate = { fps: ASSUMED_SOURCE_FPS, origin: "assumed" };

/** Whether a figure could be a frame rate at all. */
export const isPlausibleFps = (fps: number): boolean =>
    Number.isFinite(fps) && fps >= MIN_PLAUSIBLE_FPS && fps <= MAX_PLAUSIBLE_FPS;

/**
 * A frame rate from the presentation timestamps of frames as they were shown.
 *
 * The timestamps come from the file, so every gap between two shown frames is
 * a whole number of frames, however many the host skipped. The estimate is the
 * largest unit that every gap is a whole multiple of, refined by dividing the
 * frames spanned by the time spanned. Using the whole span is what cancels the
 * millisecond rounding of WebM timestamps, which in isolation make a thirty
 * frame clip's gaps alternate between thirty-three and thirty-four
 * milliseconds.
 *
 * Returns `undefined` rather than guessing when the samples cannot support a
 * figure: too few gaps, gaps on no common grid, or a result outside the
 * plausible range. The caller then falls back to `ASSUMED_RATE` and says so.
 *
 * Two cases it cannot resolve, documented rather than hidden. A host that
 * skipped exactly every other frame throughout looks like a clip at half the
 * rate. A clip with a variable frame rate has no single answer.
 *
 * Bounded: one sort, then at most `MAX_FRAMES_IN_SHORTEST_GAP` passes over the
 * gaps.
 */
export const frameRateFromMediaTimes = (times: readonly number[]): number | undefined => {
    const ordered = times.filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);

    const gaps: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
        const current = ordered[i];
        const previous = ordered[i - 1];
        if (current === undefined || previous === undefined) continue;
        const gap = current - previous;
        if (gap > SAME_FRAME_SECONDS) gaps.push(gap);
    }
    if (gaps.length < MIN_GAPS) return undefined;

    const shortest = Math.min(...gaps);
    for (let frames = 1; frames <= MAX_FRAMES_IN_SHORTEST_GAP; frames++) {
        const unit = shortest / frames;
        let steps = 0;
        let span = 0;
        let fits = true;
        for (const gap of gaps) {
            const multiple = Math.round(gap / unit);
            if (multiple < 1 || Math.abs(gap / unit - multiple) > UNIT_TOLERANCE) {
                fits = false;
                break;
            }
            steps += multiple;
            span += gap;
        }
        if (!fits) continue;

        const raw = steps / span;
        const whole = Math.round(raw);
        const fps = Math.abs(raw - whole) <= whole * WHOLE_RATE_TOLERANCE ? whole : Math.round(raw * 1000) / 1000;
        return isPlausibleFps(fps) ? fps : undefined;
    }
    return undefined;
};

/** A measurement, or the assumption if there is none, labelled either way. */
export const sourceRateFrom = (measured: number | undefined): SourceFrameRate =>
    measured !== undefined && isPlausibleFps(measured) ? { fps: measured, origin: "detected" } : ASSUMED_RATE;

/** For display: "30 fps (detected)", "29.97 fps (assumed)". */
export const describeSourceRate = (rate: SourceFrameRate): string =>
    `${rate.fps.toString()} fps (${rate.origin})`;
