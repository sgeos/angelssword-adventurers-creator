import { frameRateFromMediaTimes, sourceRateFrom, type SourceFrameRate } from "../core/frame-rate.mts";

/**
 * Establish a clip's SOURCE frame rate by watching it play briefly.
 *
 * `requestVideoFrameCallback` reports, for each frame the browser shows, the
 * `mediaTime` it was stamped with in the file. The analysis in
 * `core/frame-rate.mts` turns those stamps into a rate that does not depend on
 * how fast this machine decodes, which is what the method it replaces got
 * wrong.
 *
 * Plays muted, at normal speed, from wherever the element is, and leaves it
 * paused with its muting restored. The caller seeks afterwards, as it must
 * anyway to draw the first frame. Never rejects: a browser without the
 * callback, a refused `play()`, or too few frames all yield the assumed rate,
 * labelled as such.
 */

/** Enough gaps to cancel millisecond rounding, few enough to finish quickly. */
const PROBE_FRAMES = 16;

/** The longest the probe may hold up loading a clip. */
const PROBE_BUDGET_MS = 2000;

export const probeSourceRate = async (video: HTMLVideoElement): Promise<SourceFrameRate> => {
    if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return sourceRateFrom(undefined);

    const times: number[] = [];
    const wasMuted = video.muted;
    video.muted = true;
    video.playbackRate = 1;

    await new Promise<void>((resolve) => {
        let finished = false;
        let handle = 0;
        const finish = (): void => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            video.cancelVideoFrameCallback(handle);
            video.removeEventListener("ended", finish);
            resolve();
        };
        // Each callback either finishes or registers exactly one more, and
        // the timer and the clip ending both finish, so this terminates.
        const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata): void => {
            times.push(metadata.mediaTime);
            if (times.length >= PROBE_FRAMES) finish();
            else handle = video.requestVideoFrameCallback(onFrame);
        };
        const timer = setTimeout(finish, PROBE_BUDGET_MS);
        video.addEventListener("ended", finish);
        handle = video.requestVideoFrameCallback(onFrame);
        video.play().catch(finish);
    });

    video.pause();
    video.muted = wasMuted;
    return sourceRateFrom(frameRateFromMediaTimes(times));
};
