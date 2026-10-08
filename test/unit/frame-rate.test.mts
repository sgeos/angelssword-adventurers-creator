import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ASSUMED_RATE,
    ASSUMED_SOURCE_FPS,
    describeSourceRate,
    frameRateFromMediaTimes,
    isPlausibleFps,
    sourceRateFrom,
} from '../../src/core/frame-rate.mts';

/** Presentation timestamps for frames `indices` of a clip at `fps`. */
const stamps = (fps: number, indices: readonly number[]): number[] => indices.map((i) => i / fps);
const run = (n: number): number[] => Array.from({ length: n }, (_v, i) => i);

describe('frameRateFromMediaTimes', () => {
    it('reads the common whole rates exactly', () => {
        for (const fps of [12, 15, 16, 24, 25, 30, 50, 60]) {
            assert.equal(frameRateFromMediaTimes(stamps(fps, run(12))), fps, fps.toString());
        }
    });

    /** Wan, through ComfyUI, produces sixteen; the exporter used to assume thirty. */
    it('reads sixteen, which the exporter used to call thirty', () => {
        assert.equal(frameRateFromMediaTimes(stamps(16, run(8))), 16);
    });

    /**
     * Deliberately merged with the neighbouring whole rate. Separating them
     * needs finer timestamps or more samples than a short probe collects, and
     * the cost of merging is about one frame per thirty seconds.
     */
    it('reports a broadcast rate as its neighbouring whole rate', () => {
        assert.equal(frameRateFromMediaTimes(stamps(30000 / 1001, run(12))), 30);
        assert.equal(frameRateFromMediaTimes(stamps(24000 / 1001, run(12))), 24);
    });

    it('keeps a rate that is genuinely fractional', () => {
        assert.equal(frameRateFromMediaTimes(stamps(12.5, run(12))), 12.5);
    });

    /**
     * WebM stores timestamps to the millisecond, so a thirty frame clip's gaps
     * alternate between thirty-three and thirty-four milliseconds. A median gap
     * would report 30.3. Dividing frames by the whole span does not.
     */
    it('is not thrown by timestamps rounded to the millisecond', () => {
        for (const fps of [24, 30, 60]) {
            const rounded = stamps(fps, run(16)).map((t) => Math.round(t * 1000) / 1000);
            assert.equal(frameRateFromMediaTimes(rounded), fps, fps.toString());
        }
    });

    /**
     * THE CASE THE OLD MEASUREMENT GOT WRONG. A host that cannot keep up shows
     * fewer frames than the file holds. Counting them gave nineteen for a
     * thirty frame clip. The timestamps of the frames it did show still sit on
     * the file's own grid, so the gap between two consecutive ones is one frame.
     */
    it('is not lowered by frames a slow host skipped', () => {
        const shown = [0, 1, 3, 4, 7, 8, 9, 12, 15, 16, 20];
        assert.equal(frameRateFromMediaTimes(stamps(30, shown)), 30);
    });

    /** No two shown frames are adjacent, yet gaps of two and three share one. */
    it('recovers the rate when no two shown frames were adjacent', () => {
        assert.equal(frameRateFromMediaTimes(stamps(30, [0, 2, 5, 9, 14])), 30);
    });

    /** The one ambiguity it cannot resolve, pinned so it is not mistaken for a bug. */
    it('cannot tell a host that skipped every other frame from a clip at half the rate', () => {
        assert.equal(frameRateFromMediaTimes(stamps(30, [0, 2, 4, 6, 8])), 15);
    });

    it('does not depend on the order frames were reported in', () => {
        const shuffled = stamps(24, [5, 0, 3, 1, 4, 2, 6]);
        assert.equal(frameRateFromMediaTimes(shuffled), 24);
    });

    it('ignores the same frame reported twice', () => {
        const repeated = stamps(30, [0, 1, 1, 2, 3, 3, 4]);
        assert.equal(frameRateFromMediaTimes(repeated), 30);
    });

    /**
     * One millisecond is twice WebM's worst rounding error. The estimator
     * accepts error up to a tenth of the shortest gap, so a two millisecond
     * error at thirty frames per second, six percent of a frame, is declined;
     * the first version of this test used that and was wrong to.
     */
    it('is not moved by one timestamp a millisecond off', () => {
        const times = stamps(30, run(10));
        times[5] = (times[5] ?? 0) - 0.001;
        assert.equal(frameRateFromMediaTimes(times), 30);
    });

    /** No figure is better than a guess, because a guess is labelled detected. */
    describe('declines rather than guessing', () => {
        it('with nothing, or one frame', () => {
            assert.equal(frameRateFromMediaTimes([]), undefined);
            assert.equal(frameRateFromMediaTimes([0.5]), undefined);
        });

        it('with only one gap between consecutive frames', () => {
            assert.equal(frameRateFromMediaTimes(stamps(30, [0, 1])), undefined);
        });

        it('with only two gaps', () => {
            assert.equal(frameRateFromMediaTimes(stamps(30, [0, 1, 2])), undefined);
        });

        it('when the gaps sit on no common grid', () => {
            assert.equal(frameRateFromMediaTimes([0, 0.031, 0.077, 0.13, 0.171]), undefined);
        });

        it('when the result is not a plausible frame rate', () => {
            assert.equal(frameRateFromMediaTimes([0, 2, 4, 6]), undefined, 'half a frame per second');
            assert.equal(frameRateFromMediaTimes([0, 0.002, 0.004, 0.006]), undefined, 'five hundred');
        });

        it('with timestamps that are not usable numbers', () => {
            assert.equal(frameRateFromMediaTimes([NaN, Infinity, -1]), undefined);
        });
    });
});

describe('sourceRateFrom', () => {
    it('labels a measurement as detected', () => {
        assert.deepEqual(sourceRateFrom(16), { fps: 16, origin: 'detected' });
    });

    it('falls back to the assumption, and says so, when there is none', () => {
        assert.equal(ASSUMED_SOURCE_FPS, 30);
        for (const bad of [undefined, 0, -3, NaN, 1000]) {
            assert.deepEqual(sourceRateFrom(bad), ASSUMED_RATE, String(bad));
        }
        assert.equal(ASSUMED_RATE.origin, 'assumed');
    });
});

describe('describeSourceRate', () => {
    it('always says where the figure came from', () => {
        assert.equal(describeSourceRate({ fps: 29.97, origin: 'detected' }), '29.97 fps (detected)');
        assert.equal(describeSourceRate(ASSUMED_RATE), '30 fps (assumed)');
    });
});

describe('isPlausibleFps', () => {
    it('bounds the figure', () => {
        assert.ok(isPlausibleFps(1) && isPlausibleFps(240));
        assert.ok(!isPlausibleFps(0) && !isPlausibleFps(241) && !isPlausibleFps(NaN));
    });
});
