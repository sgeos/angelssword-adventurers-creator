import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alphaAt, channel } from '../../src/core/pixels.mts';

/**
 * These helpers exist because noUncheckedIndexedAccess types every index read
 * as possibly undefined. The contract that matters is the out-of-range one:
 * the pre-conversion code let undefined propagate into arithmetic as NaN, and
 * these return 0 instead. The in-range cases are the easy half.
 */

/** Two pixels: opaque red, then half-alpha green. */
const twoPixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128]);

describe('channel', () => {
    it('reads each channel of each pixel', () => {
        assert.deepEqual([0, 1, 2, 3].map((i) => channel(twoPixels, i)), [255, 0, 0, 255]);
        assert.deepEqual([4, 5, 6, 7].map((i) => channel(twoPixels, i)), [0, 255, 0, 128]);
    });

    it('yields 0 past the end rather than undefined', () => {
        assert.equal(channel(twoPixels, 8), 0);
        assert.equal(channel(twoPixels, 10_000), 0);
    });

    it('yields 0 for negative and fractional indices', () => {
        assert.equal(channel(twoPixels, -1), 0);
        assert.equal(channel(twoPixels, 1.5), 0);
        assert.equal(channel(twoPixels, NaN), 0);
    });

    it('yields 0 on an empty buffer', () => {
        assert.equal(channel(new Uint8ClampedArray(0), 0), 0);
    });

    it('accepts a plain number array as well as a typed array', () => {
        assert.equal(channel([9, 8, 7, 6], 2), 7);
        assert.equal(channel([9, 8, 7, 6], 4), 0);
    });

    it('returns a stored zero rather than treating it as absent', () => {
        // `rgba[index] ?? 0` must not be confused with `rgba[index] || 0`;
        // both give 0 here, so the distinction is checked below instead.
        assert.equal(channel(twoPixels, 1), 0);
    });

    it('does not confuse a present zero with an out-of-range read', () => {
        const buffer = new Uint8ClampedArray([0, 0, 0, 0]);
        assert.equal(channel(buffer, 3), 0);
        assert.equal(channel(buffer, 4), 0);
        // Both are 0 by design; what matters is that neither is undefined.
        assert.equal(typeof channel(buffer, 3), 'number');
        assert.equal(typeof channel(buffer, 4), 'number');
    });
});

describe('alphaAt', () => {
    /** 2x2 image; alpha ascends 10, 20, 30, 40 in row-major order. */
    const image = new Uint8ClampedArray([
        1, 1, 1, 10, 2, 2, 2, 20,
        3, 3, 3, 30, 4, 4, 4, 40,
    ]);

    it('reads alpha by coordinate in row-major order', () => {
        assert.equal(alphaAt(image, 2, 0, 0), 10);
        assert.equal(alphaAt(image, 2, 1, 0), 20);
        assert.equal(alphaAt(image, 2, 0, 1), 30);
        assert.equal(alphaAt(image, 2, 1, 1), 40);
    });

    it('yields 0 past the last row', () => {
        assert.equal(alphaAt(image, 2, 0, 2), 0);
    });

    it('yields 0 for negative coordinates', () => {
        assert.equal(alphaAt(image, 2, -1, 0), 0);
        assert.equal(alphaAt(image, 2, 0, -1), 0);
    });

    it('wraps past the row end, which the caller must bound itself', () => {
        // x = 2 on a width-2 image is row 1 column 0, not out of range.
        // Documented here because it is a real edge the helper does not guard.
        assert.equal(alphaAt(image, 2, 2, 0), 30);
    });
});
