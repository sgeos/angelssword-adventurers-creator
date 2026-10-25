import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_CACHE_BUDGET_BYTES, cacheFrameSize } from '../../src/core/video-prep-core.mts';

/**
 * The size Video Prep caches each frame at. The property that matters is the
 * budget: the cache's total never exceeds it, whatever the clip, because a
 * full-size cache of a long clip exhausted a phone. The other is that the
 * clips the pipeline is built around are unaffected.
 */
const total = (frames: number, size: { width: number; height: number }): number => frames * size.width * size.height * 4;

describe('cacheFrameSize', () => {
    it('keeps a two second 720p clip at full size', () => {
        assert.deepEqual(cacheFrameSize(60, 1280, 720), { width: 1280, height: 720 });
    });

    it('scales a twenty second 720p clip down to fit the budget, on both axes alike', () => {
        const size = cacheFrameSize(600, 1280, 720);
        assert.ok(total(600, size) <= FRAME_CACHE_BUDGET_BYTES);
        assert.ok(size.width < 1280 && size.width > 300, `width ${size.width.toString()}`);
        assert.ok(Math.abs(size.width / size.height - 1280 / 720) < 0.01);
    });

    it('never exceeds the budget across clip lengths and sizes', () => {
        for (const frames of [1, 2, 59, 60, 61, 300, 600, 1800, 10_000]) {
            for (const [w, h] of [[160, 90], [1280, 720], [1920, 1080], [3840, 2160], [720, 1280]] as const) {
                const size = cacheFrameSize(frames, w, h);
                // Within budget, or at the one pixel floor, below which it cannot go.
                assert.ok(total(frames, size) <= FRAME_CACHE_BUDGET_BYTES || (size.width === 1 && size.height === 1),
                    `${frames.toString()} frames at ${w.toString()}x${h.toString()}`);
                assert.ok(size.width >= 1 && size.height >= 1);
            }
        }
    });

    it('takes an explicit budget, with the boundary inclusive', () => {
        assert.deepEqual(cacheFrameSize(1, 10, 10, 400), { width: 10, height: 10 });
        assert.deepEqual(cacheFrameSize(1, 10, 10, 399), { width: 9, height: 9 });
    });

    it('bottoms out at one pixel rather than zero', () => {
        assert.deepEqual(cacheFrameSize(1_000_000, 1920, 1080, 1024), { width: 1, height: 1 });
    });

    it('yields a one pixel frame for invalid input instead of throwing', () => {
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.deepEqual(cacheFrameSize(bad, 1280, 720), { width: 1, height: 1 });
            assert.deepEqual(cacheFrameSize(60, bad, 720), { width: 1, height: 1 });
            assert.deepEqual(cacheFrameSize(60, 1280, 720, bad), { width: 1, height: 1 });
        }
    });
});
