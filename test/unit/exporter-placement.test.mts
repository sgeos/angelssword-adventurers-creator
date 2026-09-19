import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SATURATION_MATCH_FLOOR,
    SATURATION_MAX_PERCENT,
    matchedSaturationPercent,
    placeScaled,
} from '../../src/core/exporter-math.mts';

/**
 * `placeScaled` replaced five identical copies, none of which had a test. The
 * preview, the original-mode preview, the reference-match measurement, the
 * WebM recorder and the Graphics Interchange Format encoder each computed it,
 * and each sanitised its inputs the same way immediately beforehand.
 *
 * The assertions below describe what all five did. Where a property is a
 * consequence nobody chose, it says so rather than reading as a requirement.
 */

describe('placeScaled at unit scale', () => {
    it('fills the frame exactly when nothing is scaled or offset', () => {
        assert.deepEqual(placeScaled(640, 480, 1, 0), { dx: 0, dy: 0, sw: 640, sh: 480 });
    });

    it('centres a reduced image', () => {
        assert.deepEqual(placeScaled(640, 480, 0.5, 0), { dx: 160, dy: 120, sw: 320, sh: 240 });
    });

    it('lets an enlarged image overhang on both sides', () => {
        // Negative offsets are correct: the drawn rectangle is larger than the
        // frame, so it starts outside it and the canvas clips.
        assert.deepEqual(placeScaled(100, 100, 2, 0), { dx: -50, dy: -50, sw: 200, sh: 200 });
    });

    it('collapses to nothing at a scale of zero rather than dividing by it', () => {
        // Zero is not positive, so the fallback applies and the frame is full
        // size. This is the sanitising, not a scale of zero being honoured.
        assert.deepEqual(placeScaled(640, 480, 0, 0), { dx: 0, dy: 0, sw: 640, sh: 480 });
    });
});

describe('placeScaled vertical offset', () => {
    it('shifts down for a positive offset and up for a negative one', () => {
        assert.equal(placeScaled(640, 480, 0.5, 30).dy, 150);
        assert.equal(placeScaled(640, 480, 0.5, -30).dy, 90);
    });

    it('does not move the image horizontally', () => {
        assert.equal(placeScaled(640, 480, 0.5, 99).dx, placeScaled(640, 480, 0.5, 0).dx);
    });

    it('does not change the drawn size', () => {
        const offset = placeScaled(640, 480, 0.5, 77);
        const none = placeScaled(640, 480, 0.5, 0);
        assert.equal(offset.sw, none.sw);
        assert.equal(offset.sh, none.sh);
    });

    it('applies the offset after rounding, so it is exact', () => {
        // The offset is added to an already rounded value, so a whole-pixel
        // offset moves the image by exactly that many pixels.
        assert.equal(placeScaled(101, 101, 0.5, 7).dy - placeScaled(101, 101, 0.5, 0).dy, 7);
    });
});

describe('placeScaled sanitising', () => {
    /**
     * Both values come from numeric inputs, so both can arrive as NaN and the
     * scale can arrive as zero or negative. Each of the five call sites did
     * this before computing, and doing it here is why they no longer have to.
     */
    it('falls back to full size for a scale that is not a usable number', () => {
        // Infinity is included deliberately. A number input can yield it from
        // a value too large to represent, and an infinite scale would make
        // every coordinate infinite. `positiveOr` checks finiteness as well as
        // sign, which is what refuses it.
        for (const bad of [NaN, 0, -0, -1, -0.5, Infinity, -Infinity]) {
            assert.deepEqual(placeScaled(640, 480, bad, 0), { dx: 0, dy: 0, sw: 640, sh: 480 },
                String(bad));
        }
    });

    it('falls back to no offset for a value that is not finite', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            assert.equal(placeScaled(640, 480, 0.5, bad).dy, 120, String(bad));
        }
    });

    it('produces no NaN anywhere, which is what the sanitising is for', () => {
        const { dx, dy, sw, sh } = placeScaled(640, 480, NaN, NaN);
        for (const [name, value] of [['dx', dx], ['dy', dy], ['sw', sw], ['sh', sh]] as const) {
            assert.ok(Number.isFinite(value), `${name} must be finite`);
        }
    });
});

describe('placeScaled rounding', () => {
    /**
     * CHARACTERISATION, not a requirement. Each of the four values is rounded
     * independently, which is what the five copies did. The consequence is
     * that an odd scaled size inside an even frame is not centred to the
     * pixel; the remainder falls on one side. Preserved because correcting it
     * shifts every existing export by up to half a pixel.
     */
    it('leaves the remainder on one side when the scaled size is odd', () => {
        const { dx, sw } = placeScaled(100, 100, 0.33, 0);
        assert.equal(sw, 33);
        assert.equal(dx, 34, 'the left margin is 34 and the right is 33');
        assert.equal(100 - sw - dx, 33);
    });

    it('rounds the size and the origin, so both are whole pixels', () => {
        const { dx, dy, sw, sh } = placeScaled(101, 99, 0.777, 0);
        for (const value of [dx, dy, sw, sh]) {
            assert.equal(value, Math.round(value));
        }
    });

    it('handles a zero-sized frame without producing NaN', () => {
        assert.deepEqual(placeScaled(0, 0, 1, 0), { dx: 0, dy: 0, sw: 0, sh: 0 });
    });
});

describe('matchedSaturationPercent', () => {
    it('reports the percentage that scales the output to the reference', () => {
        assert.equal(matchedSaturationPercent(0.5, 0.25), 200);
        assert.equal(matchedSaturationPercent(0.25, 0.5), 50);
        assert.equal(matchedSaturationPercent(0.4, 0.4), 100);
    });

    it('rounds to a whole percent, which is what the slider carries', () => {
        assert.equal(matchedSaturationPercent(0.333, 0.5), 67);
    });

    it('clamps to the slider range rather than exceeding it', () => {
        assert.equal(matchedSaturationPercent(10, 0.01), SATURATION_MAX_PERCENT);
        assert.equal(matchedSaturationPercent(0, 0.5), 0);
    });

    /**
     * WHY THERE IS A FLOOR. Dividing by a near-zero average produces an
     * enormous ratio out of rounding noise, so the exporter declines rather
     * than slamming the slider to its limit. An output with no colour cannot
     * be made to match a reference that has some, and there is no right answer
     * to return.
     */
    it('declines when the output has essentially no saturation to scale', () => {
        assert.equal(matchedSaturationPercent(0.5, 0), undefined);
        assert.equal(matchedSaturationPercent(0.5, SATURATION_MATCH_FLOOR), undefined,
            'the floor itself is not above the floor');
        assert.equal(matchedSaturationPercent(0.5, SATURATION_MATCH_FLOOR / 2), undefined);
    });

    it('acts just above the floor', () => {
        assert.notEqual(matchedSaturationPercent(0.5, SATURATION_MATCH_FLOOR * 2), undefined);
    });

    it('declines for a NaN output average rather than proceeding', () => {
        // NaN fails every ordered comparison, which the guard relies on.
        assert.equal(matchedSaturationPercent(0.5, NaN), undefined);
    });

    it('declines for a negative output average, which cannot be scaled toward', () => {
        assert.equal(matchedSaturationPercent(0.5, -1), undefined);
    });
});
