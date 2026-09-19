import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FRAME_SEEK_EPSILON_SECONDS,
    LOOP_MODE_LABELS,
    frameTime,
    getOutputFrameCount,
    loopSummary,
    stepFrame,
} from '../../src/core/video-prep-core.mts';

/**
 * Arithmetic that was tangled with the video stage's Document Object Model
 * work and therefore untested. None of it needs a video element; all of it
 * decides what the user is shown and what the export produces.
 */

describe('loopSummary agrees with getOutputFrameCount', () => {
    /**
     * THIS IS THE POINT OF THE EXTRACTION. The stage computed the same count
     * from a different formula, `loopPoint * 2` against
     * `n + max(0, n - 2)`. They agreed, and nothing kept them agreeing. This
     * asserts the agreement across the range the control permits, so a change
     * to either expression fails here rather than silently disagreeing with
     * the panel.
     */
    it('matches the old inline formula for every loop point the control allows', () => {
        for (let loopPoint = 2; loopPoint <= 60; loopPoint++) {
            const totalFrames = loopPoint + 10;
            assert.equal(
                loopSummary('pingpong', loopPoint, totalFrames).outputFrames,
                loopPoint * 2,
                `pingpong at ${loopPoint.toString()}`,
            );
            assert.equal(
                loopSummary('reverse', loopPoint, totalFrames).outputFrames,
                loopPoint + 1,
                `reverse at ${loopPoint.toString()}`,
            );
            assert.equal(
                loopSummary('none', loopPoint, totalFrames).outputFrames,
                loopPoint + 1,
                `none at ${loopPoint.toString()}`,
            );
        }
    });

    it('defers to getOutputFrameCount rather than recomputing', () => {
        for (const mode of ['none', 'reverse', 'pingpong']) {
            assert.equal(
                loopSummary(mode, 7, 40).outputFrames,
                getOutputFrameCount({ loopPoint: 7, loopMode: mode, totalFrames: 40 }),
                mode,
            );
        }
    });

    it('reports the whole clip when no loop point is set', () => {
        assert.equal(loopSummary('pingpong', 1, 40).outputFrames, 40);
        assert.equal(loopSummary('none', 0, 40).outputFrames, 40);
    });
});

describe('loopSummary labels', () => {
    it('names the endpoints on the control', () => {
        assert.equal(loopSummary('pingpong', 5, 40).label, 'Ping-Pong: 0 → 5 → 0');
        assert.equal(loopSummary('reverse', 5, 40).label, 'Reverse: 5 → 0');
        assert.equal(loopSummary('none', 5, 40).label, 'Forward: 0 → 5');
    });

    it('names the mode in the panel, from the one table', () => {
        assert.equal(loopSummary('pingpong', 5, 40).modeLabel, LOOP_MODE_LABELS.pingpong);
        assert.equal(loopSummary('reverse', 5, 40).modeLabel, LOOP_MODE_LABELS.reverse);
        assert.equal(loopSummary('none', 5, 40).modeLabel, LOOP_MODE_LABELS.none);
    });

    it('falls back to the raw value for a mode it does not know', () => {
        // The mode arrives from a data attribute, so nothing constrains it.
        // Showing it unchanged is better than showing "undefined".
        const summary = loopSummary('sideways', 5, 40);
        assert.equal(summary.modeLabel, 'sideways');
        assert.equal(summary.label, 'Forward: 0 → 5', 'an unknown mode behaves as forward');
    });
});

describe('frameTime', () => {
    it('converts an index to seconds at the given rate', () => {
        assert.equal(frameTime(0, 30, 10), 0);
        assert.equal(frameTime(30, 30, 10), 1);
        assert.equal(frameTime(15, 30, 10), 0.5);
    });

    it('never reaches the very end of the clip', () => {
        // Seeking exactly to `duration` lands past the last decodable frame in
        // several browsers, so the final frame would not render.
        const duration = 10;
        assert.equal(frameTime(1_000, 30, duration), duration - FRAME_SEEK_EPSILON_SECONDS);
        assert.ok(frameTime(300, 30, duration) < duration);
    });

    it('clamps rather than extrapolating past the clip', () => {
        assert.equal(frameTime(99_999, 30, 5), 5 - FRAME_SEEK_EPSILON_SECONDS);
    });
});

describe('stepFrame', () => {
    it('moves by the given delta', () => {
        assert.equal(stepFrame(5, 1, 40), 6);
        assert.equal(stepFrame(5, -1, 40), 4);
    });

    it('stops at the first frame rather than going negative', () => {
        assert.equal(stepFrame(0, -1, 40), 0);
    });

    it('stops at the last frame rather than running past it', () => {
        assert.equal(stepFrame(39, 1, 40), 39);
        assert.equal(stepFrame(38, 1, 40), 39, 'the last index is totalFrames minus one');
    });

    it('does not wrap, which is what the two guarded buttons did', () => {
        assert.equal(stepFrame(0, -5, 40), 0);
        assert.equal(stepFrame(39, 5, 40), 39);
    });

    it('holds still for an empty clip rather than producing an index', () => {
        assert.equal(stepFrame(0, 1, 0), 0);
        assert.equal(stepFrame(0, -1, 0), 0);
    });
});
