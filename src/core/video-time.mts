/**
 * Frame indices, playback times, and seeking.
 *
 * # Why this is its own module
 *
 * The same arithmetic appeared in both the video preparation stage and the
 * exporter, and the pieces that had been extracted lived in
 * `video-prep-core.mts`. The exporter importing from a module named for
 * another stage would have been the wrong shape, so what is common to both
 * lives here and the stage modules keep what is theirs.
 *
 * # ONE NUMBER, TWO MEANINGS
 *
 * `0.001` appeared seven times across the two stages and served two entirely
 * different purposes.
 *
 * Four of them kept a seek clear of the very end of the clip. Three of them
 * decided that the player was already close enough to a target to skip the
 * seek. Those are not the same quantity, they are not required to stay equal,
 * and a single constant would have tied them together by accident.
 *
 * They are separate names below. That they happen to hold the same value is
 * a coincidence worth preserving rather than a fact worth encoding.
 */

/**
 * How far short of the end a seek stops.
 *
 * Seeking exactly to `duration` lands past the last decodable frame in
 * several browsers and yields the previous frame or nothing, so the final
 * frame of a clip would not render. One millisecond is what both stages used.
 */
export const FRAME_SEEK_EPSILON_SECONDS = 0.001;

/**
 * How close counts as already there.
 *
 * A seek to where the player already sits fires no `seeked` event in some
 * browsers, so a caller awaiting one would wait forever. Comparing first and
 * resolving immediately is what avoids that, and this is the margin.
 */
export const SEEK_TOLERANCE_SECONDS = 0.001;

/**
 * The playback time of one frame, kept clear of the very end of the clip.
 *
 * No lower clamp, a negative frame index not being something a caller can
 * produce: both callers derive the index from a counter or a scrubber.
 */
export const frameTime = (frameIndex: number, fps: number, duration: number): number =>
    Math.min(frameIndex / fps, duration - FRAME_SEEK_EPSILON_SECONDS);

/**
 * A caller-supplied time, brought inside the clip.
 *
 * Unlike [`frameTime`] this clamps below as well, because its callers take a
 * time from arithmetic that can go negative, such as a loop point stepped
 * backwards past the start.
 *
 * **The lower clamp is applied first and the upper second**, which is the
 * order all four copies used. The consequence is that a clip shorter than
 * [`FRAME_SEEK_EPSILON_SECONDS`] yields a small negative time rather than
 * zero, the upper bound being negative and winning. No media reaches that,
 * a clip under one millisecond having no frames to seek to, and browsers
 * clamp a negative `currentTime` themselves. It is preserved and pinned by a
 * test rather than reordered, because reordering is a behaviour change made
 * for a case that cannot arise.
 */
export const clampSeekTime = (time: number, duration: number): number =>
    Math.min(Math.max(0, time), duration - FRAME_SEEK_EPSILON_SECONDS);

/** Whether the player is already close enough to a target to skip the seek. */
export const isAtTime = (current: number, target: number): boolean =>
    Math.abs(current - target) < SEEK_TOLERANCE_SECONDS;

/**
 * Which duration a seek should be measured against.
 *
 * A caller may know the clip's length better than the element does, the
 * element reporting zero or a non-finite value before enough of the media has
 * loaded. A preferred value wins when it is usable, the element's own is the
 * fallback, and one second is the last resort so that the arithmetic above
 * yields a number rather than NaN.
 */
export const SEEK_DURATION_FALLBACK_SECONDS = 1;

/** Resolve the duration to seek against. */
export const seekDuration = (preferred: number | undefined, elementDuration: number): number => {
    if (preferred !== undefined && preferred > 0) return preferred;
    return elementDuration > 0 ? elementDuration : SEEK_DURATION_FALLBACK_SECONDS;
};

/**
 * Move a frame index by one step, stopping at the ends.
 *
 * Returns the index unchanged at a boundary rather than wrapping, which is
 * what the navigation buttons did with a guard each.
 */
export const stepFrame = (current: number, delta: number, totalFrames: number): number => {
    const next = current + delta;
    if (next < 0 || next > totalFrames - 1) return current;
    return next;
};

/**
 * How many frames a clip of this duration holds at this rate.
 *
 * # The two stages disagreed
 *
 * The video preparation stage rounded and the exporter floored, in two
 * places. Those differ whenever the product's fractional part reaches one
 * half, which real durations do: 9.99 seconds at 30 gives 299 floored and
 * 300 rounded.
 *
 * That was not cosmetic. The handoff carries a frame count from the video
 * stage, the exporter recomputed its own, and the loop range is clamped to
 * the exporter's figure, so a count one lower silently clipped the loop end.
 * The exporter also sets its last-frame field to the count minus one, so
 * flooring made the final real frame unreachable.
 *
 * **Rounding is kept, and flooring is the behaviour change.** A clip of
 * exactly N frames has duration `N / fps`, which floating point can render a
 * hair under, and flooring then discards a frame for no reason. Rounding is
 * also what the handoff's producer already used, so unifying on it leaves the
 * value that crosses the handoff unchanged and moves only the exporter.
 *
 * A half-open interval would want flooring. Nothing here treats the clip as
 * half-open: the count is used to address frames 0 to count minus one.
 */
export const frameCountFromDuration = (duration: number, fps: number): number => {
    if (!Number.isFinite(duration) || !Number.isFinite(fps) || duration <= 0 || fps <= 0) return 0;
    return Math.round(duration * fps);
};
