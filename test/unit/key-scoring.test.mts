import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeImageData, solid, type Pixel } from '../helpers/image-data.mts';
import {
    DANGER_DELTA_E,
    HISTOGRAM_BITS,
    KEY_COLORS,
    MIN_ANALYSIS_PIXELS,
    OPAQUE_ALPHA_MIN,
    SCORE_AVG_WEIGHT,
    SCORE_MIN_WEIGHT,
    rgbToLab,
    scoreKeyColors,
} from '../../src/core/sprite-prep-core.mts';

/**
 * The advanced key analysis, which had never been tested. It was ninety lines
 * inside a click handler, and every constant in it was unexplained: a six-bit
 * histogram, an alpha threshold, a minimum pixel count, a distance below
 * which a colour is endangered, and a pair of scoring weights.
 *
 * The assertions below pin each of them, and where a property is a
 * consequence of how it was written rather than something chosen, they say so.
 */

const GREEN: Pixel = [0, 255, 0, 255];
const MAGENTA: Pixel = [255, 0, 255, 255];
const SKIN: Pixel = [230, 180, 150, 255];
const BLUE: Pixel = [0, 0, 255, 255];

/** A region large enough to be analysed at all. */
const region = (pixel: Pixel): ReturnType<typeof solid> => solid(16, 16, pixel);

/** CIE76 distance, the measure the scoring uses. */
const deltaE = (a: readonly [number, number, number], b: readonly [number, number, number]): number => {
    const x = rgbToLab(a[0], a[1], a[2]);
    const y = rgbToLab(b[0], b[1], b[2]);
    return Math.sqrt((x.L - y.L) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2);
};

describe('scoreKeyColors refuses a region it cannot judge', () => {
    it('refuses fewer opaque pixels than the minimum', () => {
        assert.equal(MIN_ANALYSIS_PIXELS, 100);
        // 9x11 is 99 pixels, one short.
        assert.equal(scoreKeyColors(solid(9, 11, SKIN)), undefined);
    });

    it('accepts exactly the minimum', () => {
        assert.equal(scoreKeyColors(solid(10, 10, SKIN))?.length, KEY_COLORS.length);
    });

    it('refuses a large region that is mostly transparent', () => {
        // Every pixel below the alpha threshold, so nothing counts.
        assert.equal(scoreKeyColors(solid(64, 64, [230, 180, 150, 0])), undefined);
    });

    it('counts a pixel at the alpha threshold and not one below it', () => {
        assert.equal(OPAQUE_ALPHA_MIN, 128);
        const atThreshold = solid(10, 10, [230, 180, 150, OPAQUE_ALPHA_MIN]);
        const belowThreshold = solid(10, 10, [230, 180, 150, OPAQUE_ALPHA_MIN - 1]);
        assert.notEqual(scoreKeyColors(atThreshold), undefined);
        assert.equal(scoreKeyColors(belowThreshold), undefined);
    });

    it('refuses an empty region', () => {
        assert.equal(scoreKeyColors(makeImageData(0, 0, () => SKIN)), undefined);
    });
});

describe('scoreKeyColors ranks by separation', () => {
    it('returns one entry per candidate, carrying the candidate itself', () => {
        const results = scoreKeyColors(region(SKIN));
        // assert.equal narrows through its `asserts actual is T` signature.
        assert.equal(results?.length, KEY_COLORS.length);
        assert.deepEqual(
            [...results].map((r) => r.hex).sort(),
            [...KEY_COLORS].map((k) => k.hex).sort(),
        );
    });

    it('orders best first', () => {
        const results = scoreKeyColors(region(SKIN)) ?? [];
        for (let i = 1; i < results.length; i++) {
            assert.ok(
                (results[i - 1]?.score ?? 0) >= (results[i]?.score ?? 0),
                `entry ${i.toString()} must not outrank its predecessor`,
            );
        }
    });

    /**
     * THE POINT OF THE WHOLE ANALYSIS. A subject that is largely one colour
     * must not be keyed against that colour, and the ranking is what says so.
     */
    it('ranks a key colour last when the subject is made of it', () => {
        const results = scoreKeyColors(region(GREEN)) ?? [];
        assert.equal(results[results.length - 1]?.hex.toUpperCase(), '#00FF00',
            'green must be the worst choice for a green subject');
    });

    it('ranks a key colour well when the subject is far from it', () => {
        const results = scoreKeyColors(region(GREEN)) ?? [];
        assert.notEqual(results[0]?.hex.toUpperCase(), '#00FF00');
    });

    it('changes its verdict when the subject changes', () => {
        const green = scoreKeyColors(region(GREEN)) ?? [];
        const magenta = scoreKeyColors(region(MAGENTA)) ?? [];
        assert.notEqual(green[0]?.hex, magenta[0]?.hex,
            'a green subject and a magenta subject want different key colours');
        assert.equal(magenta[magenta.length - 1]?.hex.toUpperCase(), '#FF00FF');
    });
});

describe('scoreKeyColors measures', () => {
    it('reports the nearest subject colour as minDist', () => {
        const results = scoreKeyColors(region(SKIN)) ?? [];
        const blue = results.find((r) => r.hex.toUpperCase() === '#0000FF');
        // A uniform subject has one histogram bucket, so the nearest and the
        // average distance are the same measurement.
        assert.equal(blue?.minDist, blue?.avgDist);
    });

    it('agrees with a CIE76 distance computed independently', () => {
        // The subject colour is quantised to its bucket floor before the
        // distance is taken, which the expectation reproduces.
        const shift = 8 - HISTOGRAM_BITS;
        const bucketFloor = (c: number): number => (c >> shift) << shift;
        const quantised: readonly [number, number, number] = [
            bucketFloor(SKIN[0]), bucketFloor(SKIN[1]), bucketFloor(SKIN[2]),
        ];
        const results = scoreKeyColors(region(SKIN)) ?? [];
        for (const result of results) {
            const expected = deltaE([result.r, result.g, result.b], quantised);
            assert.equal(result.minDist, Math.round(expected * 10) / 10, result.hex);
        }
    });

    it('scores as the documented weighted combination', () => {
        const results = scoreKeyColors(region(SKIN)) ?? [];
        assert.equal(SCORE_MIN_WEIGHT + SCORE_AVG_WEIGHT, 1);
        for (const r of results) {
            const expected = r.minDist * SCORE_MIN_WEIGHT + r.avgDist * SCORE_AVG_WEIGHT;
            // The score rounds the unrounded inputs, so allow a tenth either
            // way rather than asserting on the rounded ones.
            assert.ok(Math.abs(r.score - expected) <= 0.1, `${r.hex}: ${r.score.toString()}`);
        }
    });

    it('reports every subject pixel as endangered when the subject is the key colour', () => {
        const results = scoreKeyColors(region(GREEN)) ?? [];
        const green = results.find((r) => r.hex.toUpperCase() === '#00FF00');
        assert.equal(green?.dangerPercent, 100);
        assert.ok(green.minDist < DANGER_DELTA_E);
    });

    it('reports no endangered pixels when every subject colour is far away', () => {
        const results = scoreKeyColors(region(GREEN)) ?? [];
        const best = results[0];
        assert.equal(best?.dangerPercent, 0);
        assert.ok(best.minDist >= DANGER_DELTA_E);
    });

    it('weights the average by pixel count, not by bucket count', () => {
        // Three quarters skin, one quarter green. The average must sit nearer
        // the skin, which is what weighting by count means.
        const mixed = makeImageData(16, 16, (x) => (x < 4 ? GREEN : SKIN));
        const results = scoreKeyColors(mixed) ?? [];
        const green = results.find((r) => r.hex.toUpperCase() === '#00FF00');
        assert.ok(green !== undefined);
        assert.equal(green.dangerPercent, 25, 'a quarter of the pixels are the key colour');
        assert.ok(green.avgDist > green.minDist,
            'the average is pulled away from the nearest by the majority colour');
    });

    it('reports every measurement to one decimal place', () => {
        for (const r of scoreKeyColors(region(SKIN)) ?? []) {
            for (const value of [r.minDist, r.avgDist, r.dangerPercent, r.score]) {
                assert.equal(value, Math.round(value * 10) / 10);
            }
        }
    });
});

describe('scoreKeyColors histogram', () => {
    /**
     * CHARACTERISATION. A bucket is identified by its floor, not its centre,
     * so a channel of 255 is measured as 252. Every reconstructed colour is
     * biased dark by up to three levels. Preserved because correcting it moves
     * every score.
     */
    it('measures a bucket by its floor, biasing every colour slightly dark', () => {
        assert.equal(HISTOGRAM_BITS, 6);
        const top = scoreKeyColors(region([255, 255, 255, 255])) ?? [];
        const floor = scoreKeyColors(region([252, 252, 252, 255])) ?? [];
        assert.deepEqual(
            top.map((r) => [r.hex, r.minDist]),
            floor.map((r) => [r.hex, r.minDist]),
            '255 and 252 fall in one bucket and are measured identically',
        );
    });

    it('collapses near colours, so gradient noise does not change the verdict', () => {
        const noisy = makeImageData(16, 16, (x, y) => [
            230 + ((x + y) % 4) - 2, 180 + ((x * y) % 4) - 2, 150, 255,
        ]);
        const uniform = region(SKIN);
        assert.equal(scoreKeyColors(noisy)?.[0]?.hex, scoreKeyColors(uniform)?.[0]?.hex);
    });

    it('handles a subject of many distinct colours without losing any', () => {
        // Every pixel a different colour, spread across the space.
        const varied = makeImageData(16, 16, (x, y) => [x * 16, y * 16, (x * y) % 256, 255]);
        const results = scoreKeyColors(varied);
        assert.equal(results?.length, KEY_COLORS.length);
        const total = results.reduce((sum, r) => sum + r.dangerPercent, 0);
        assert.ok(total > 0, 'a subject covering the space must endanger some key colour');
    });

    it('ignores a transparent pixel entirely, rather than counting it as black', () => {
        const withHoles = makeImageData(16, 16, (x) => (x < 8 ? BLUE : [0, 0, 0, 0]));
        const solidHalf = solid(8, 16, BLUE);
        assert.deepEqual(
            scoreKeyColors(withHoles)?.map((r) => r.score),
            scoreKeyColors(solidHalf)?.map((r) => r.score),
        );
    });
});
