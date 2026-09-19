import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FRAME_SEEK_EPSILON_SECONDS,
    SEEK_DURATION_FALLBACK_SECONDS,
    SEEK_TOLERANCE_SECONDS,
    clampSeekTime,
    isAtTime,
    seekDuration,
} from '../../src/core/video-time.mts';

/**
 * ONE NUMBER, TWO MEANINGS, and the reason this file exists.
 *
 * `0.001` appeared seven times across the video stage and the exporter. Four
 * kept a seek clear of the end of the clip; three decided the player was
 * already close enough to skip a seek. Those are not the same quantity and
 * are not required to stay equal, so they are two constants.
 *
 * The tests below assert each behaviour against its own constant, so that
 * changing one does not silently require the other to change with it.
 */

describe('the two margins are separate quantities', () => {
    it('holds each under its own name', () => {
        assert.equal(FRAME_SEEK_EPSILON_SECONDS, 0.001);
        assert.equal(SEEK_TOLERANCE_SECONDS, 0.001);
    });

    it('uses each where it belongs, rather than one everywhere', () => {
        // Deliberately not asserting that the two are equal. They happen to
        // be, and nothing should depend on it. What is asserted is that each
        // governs its own behaviour, so changing one moves only that one.
        assert.equal(clampSeekTime(99, 10), 10 - FRAME_SEEK_EPSILON_SECONDS);
        assert.equal(isAtTime(0, SEEK_TOLERANCE_SECONDS / 2), true);
        assert.equal(isAtTime(0, SEEK_TOLERANCE_SECONDS), false);
    });
});

describe('clampSeekTime', () => {
    it('passes a time inside the clip through unchanged', () => {
        assert.equal(clampSeekTime(5, 10), 5);
    });

    it('stops short of the end, so the last frame still decodes', () => {
        assert.equal(clampSeekTime(10, 10), 10 - FRAME_SEEK_EPSILON_SECONDS);
        assert.equal(clampSeekTime(99, 10), 10 - FRAME_SEEK_EPSILON_SECONDS);
    });

    /**
     * The difference from `frameTime`, which has no lower clamp. This one
     * takes a time from arithmetic that can go negative, such as a loop point
     * stepped backwards past the start.
     */
    it('clamps below at zero, unlike frameTime', () => {
        assert.equal(clampSeekTime(-1, 10), 0);
        assert.equal(clampSeekTime(-0.0001, 10), 0);
    });

    /**
     * CHARACTERISATION. The lower clamp is applied first and the upper
     * second, which is the order all four copies used, so a clip shorter than
     * the margin yields a small negative time rather than zero. No media
     * reaches this, a clip under one millisecond having no frames to seek to,
     * and browsers clamp a negative `currentTime` themselves. Pinned rather
     * than reordered, because reordering changes behaviour for a case that
     * cannot arise.
     */
    it('yields a negative time for a clip shorter than the margin', () => {
        const duration = FRAME_SEEK_EPSILON_SECONDS / 2;
        assert.equal(clampSeekTime(0, duration), duration - FRAME_SEEK_EPSILON_SECONDS);
        assert.ok(clampSeekTime(0, duration) < 0);
    });
});

describe('isAtTime', () => {
    it('reports an exact match', () => {
        assert.equal(isAtTime(3, 3), true);
    });

    it('reports a difference inside the tolerance as already there', () => {
        assert.equal(isAtTime(3, 3 + SEEK_TOLERANCE_SECONDS / 2), true);
        assert.equal(isAtTime(3, 3 - SEEK_TOLERANCE_SECONDS / 2), true);
    });

    /**
     * The boundary is asserted at zero rather than at a realistic playback
     * time, and that is not laziness. `3 + 0.001` is not representable, so
     * `Math.abs(3 - (3 + 0.001))` is 0.0009999999999998899, which is inside
     * the tolerance. A boundary test at three seconds measures floating point
     * representation rather than this function.
     *
     * The practical consequence is worth knowing: the tolerance is
     * approximate at real playback positions, and slightly generous. That is
     * the right direction, since the cost of deciding wrongly that the player
     * has arrived is one skipped redraw, while the cost of deciding wrongly
     * that it has not is a wait for an event that never fires.
     */
    it('reports the tolerance itself as not there yet', () => {
        assert.equal(isAtTime(0, SEEK_TOLERANCE_SECONDS), false);
    });

    it('reports a real difference as not there', () => {
        assert.equal(isAtTime(3, 4), false);
    });

    /**
     * WHY THIS CHECK EXISTS. A seek to where the player already sits fires no
     * `seeked` event in some browsers, so a caller awaiting one waits forever.
     * Comparing first and resolving immediately is what avoids that.
     */
    it('is symmetric, the direction of the difference not mattering', () => {
        assert.equal(isAtTime(3, 4), isAtTime(4, 3));
    });
});

describe('seekDuration', () => {
    it('prefers a caller-supplied duration when it is usable', () => {
        assert.equal(seekDuration(7, 10), 7);
    });

    it('falls back to the element when the caller supplies none', () => {
        assert.equal(seekDuration(undefined, 10), 10);
    });

    it('falls back to the element when the caller supplies a useless value', () => {
        assert.equal(seekDuration(0, 10), 10);
        assert.equal(seekDuration(-1, 10), 10);
    });

    /**
     * An element reports zero before enough media has loaded. Without a last
     * resort the arithmetic downstream would produce a negative duration and
     * then a negative seek time.
     */
    it('falls back again when the element knows nothing either', () => {
        assert.equal(seekDuration(undefined, 0), SEEK_DURATION_FALLBACK_SECONDS);
        assert.equal(seekDuration(0, 0), SEEK_DURATION_FALLBACK_SECONDS);
    });

    it('never yields a duration that makes clampSeekTime negative', () => {
        for (const [preferred, element] of [[undefined, 0], [0, 0], [-5, -5]] as const) {
            const duration = seekDuration(preferred, element);
            assert.ok(clampSeekTime(0, duration) >= 0, `${String(preferred)} / ${String(element)}`);
        }
    });
});
