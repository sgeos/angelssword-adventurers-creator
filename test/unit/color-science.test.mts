import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rgbToLab } from '../../src/core/sprite-prep-core.mts';
import { averageSaturation } from '../../src/core/exporter-math.mts';

/**
 * Both functions were module-private inside stage modules until this change,
 * so neither had ever been executed by a test. They are the kind of code that
 * fails silently: a wrong constant yields output that looks plausible.
 */

/**
 * Published CIE L*a*b* values for sRGB under a D65 white point, 2-degree
 * observer. These come from the colour-space definition, NOT from what this
 * implementation returns — a test seeded from the implementation can only
 * freeze a bug, never catch one.
 */
type LabCase = readonly [string, readonly [number, number, number], readonly [number, number, number]];
const CIE_REFERENCE: readonly LabCase[] = [
    ['white', [255, 255, 255], [100, 0, 0]],
    ['black', [0, 0, 0], [0, 0, 0]],
    ['red', [255, 0, 0], [53.2408, 80.0925, 67.2032]],
    ['green', [0, 255, 0], [87.7347, -86.1827, 83.1793]],
    ['blue', [0, 0, 255], [32.2970, 79.1875, -107.8602]],
    ['mid grey', [128, 128, 128], [53.5850, 0, 0]],
];

/**
 * The implementation uses the truncated sRGB matrix (0.4124 rather than
 * 0.4124564) and the 7.787 / 0.008856 approximations to the CIE piecewise
 * function. Measured worst-case deviation from the reference above is 0.017.
 * 0.05 leaves room for that while still catching a wrong constant, which
 * would move a result by whole units — the just-noticeable difference in this
 * space is around 1.0, so this is far tighter than perceptual relevance.
 */
const LAB_TOLERANCE = 0.05;

describe('rgbToLab', () => {
    for (const [name, rgb, expected] of CIE_REFERENCE) {
        it(`matches the published value for ${name}`, () => {
            const [r, g, b] = rgb;
            const got = rgbToLab(r, g, b);
            const [eL, ea, eb] = expected;
            assert.ok(Math.abs(got.L - eL) < LAB_TOLERANCE, `L: got ${got.L.toString()}, want ${eL.toString()}`);
            assert.ok(Math.abs(got.a - ea) < LAB_TOLERANCE, `a: got ${got.a.toString()}, want ${ea.toString()}`);
            assert.ok(Math.abs(got.b - eb) < LAB_TOLERANCE, `b: got ${got.b.toString()}, want ${eb.toString()}`);
        });
    }

    it('puts neutral greys on the achromatic axis', () => {
        for (const v of [32, 64, 96, 160, 200]) {
            const lab = rgbToLab(v, v, v);
            assert.ok(Math.abs(lab.a) < LAB_TOLERANCE, `grey ${v.toString()} has a=${lab.a.toString()}`);
            assert.ok(Math.abs(lab.b) < LAB_TOLERANCE, `grey ${v.toString()} has b=${lab.b.toString()}`);
        }
    });

    it('increases L monotonically with brightness', () => {
        const ls = [0, 32, 64, 128, 192, 255].map((v) => rgbToLab(v, v, v).L);
        for (let i = 1; i < ls.length; i++) {
            assert.ok((ls[i] ?? 0) > (ls[i - 1] ?? 0), `L not increasing at index ${i.toString()}`);
        }
    });

    it('exercises the linear segment below the 0.04045 transfer threshold', () => {
        // 10/255 is under the threshold, so it takes the /12.92 branch rather
        // than the power curve. Without a case here that branch is never run.
        const lab = rgbToLab(10, 10, 10);
        assert.ok(lab.L > 0 && lab.L < 5, `expected a very dark L, got ${lab.L.toString()}`);
        assert.ok(Math.abs(lab.a) < LAB_TOLERANCE);
    });

    it('separates opposing hues along the expected axes', () => {
        // a is the green-red axis, b the blue-yellow axis.
        assert.ok(rgbToLab(255, 0, 0).a > 0, 'red should be +a');
        assert.ok(rgbToLab(0, 255, 0).a < 0, 'green should be -a');
        assert.ok(rgbToLab(255, 255, 0).b > 0, 'yellow should be +b');
        assert.ok(rgbToLab(0, 0, 255).b < 0, 'blue should be -b');
    });
});

/** Build an RGBA buffer by repeating one pixel. */
function fill(count: number, r: number, g: number, b: number, a: number): Uint8ClampedArray {
    const buf = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) {
        buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = a;
    }
    return buf;
}

/** Concatenate pixel runs into one buffer. */
function concat(...parts: readonly Uint8ClampedArray[]): Uint8ClampedArray {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8ClampedArray(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

const GREEN_KEY = { r: 0, g: 255, b: 0 };

describe('averageSaturation', () => {
    it('yields 0 when no pixel qualifies', () => {
        assert.equal(averageSaturation(new Uint8ClampedArray(0), GREEN_KEY), 0);
        // Fully transparent, and the default path requires alpha >= 200.
        assert.equal(averageSaturation(fill(4, 200, 100, 100, 0), GREEN_KEY), 0);
    });

    it('reports full saturation for a pure hue away from the key', () => {
        // Pure red at mid luminance: HSL saturation is 1.
        const sat = averageSaturation(fill(4, 255, 0, 0, 255), GREEN_KEY);
        assert.ok(Math.abs(sat - 1) < 1e-9, `expected 1, got ${sat.toString()}`);
    });

    it('reports 0 for a neutral grey, which has no saturation', () => {
        assert.equal(averageSaturation(fill(4, 128, 128, 128, 255), GREEN_KEY), 0);
    });

    it('skips near-black and near-white, where saturation is meaningless', () => {
        // Luminance under 0.05 or over 0.95 is excluded, leaving no samples.
        assert.equal(averageSaturation(fill(4, 8, 0, 0, 255), GREEN_KEY), 0);
        assert.equal(averageSaturation(fill(4, 255, 250, 250, 255), GREEN_KEY), 0);
    });

    it('excludes pixels close to the key colour in chroma', () => {
        // Pure green is the key, so every sample is excluded.
        assert.equal(averageSaturation(fill(4, 0, 255, 0, 255), GREEN_KEY), 0);
    });

    it('keeps a pixel far from the key and drops one near it', () => {
        const mixed = concat(
            fill(2, 255, 0, 0, 255),   // red: counted
            fill(2, 0, 255, 0, 255),   // green: excluded as key-coloured
        );
        const sat = averageSaturation(mixed, GREEN_KEY);
        // Only the red pixels average, so the result is red's own saturation.
        assert.ok(Math.abs(sat - 1) < 1e-9, `expected 1, got ${sat.toString()}`);
    });

    it('averages across qualifying pixels rather than summing', () => {
        const mixed = concat(
            fill(1, 255, 0, 0, 255),       // saturation 1
            fill(1, 191, 128, 128, 255),   // a muted red, saturation well under 1
        );
        const sat = averageSaturation(mixed, GREEN_KEY);
        assert.ok(sat > 0 && sat < 1, `expected a value strictly between 0 and 1, got ${sat.toString()}`);
    });

    it('applies a different alpha threshold when skipTransparent is set', () => {
        // Alpha 100 is below the default 200 threshold but above the
        // skipTransparent threshold of 10.
        const pixels = fill(4, 255, 0, 0, 100);
        assert.equal(averageSaturation(pixels, GREEN_KEY, false), 0);
        assert.ok(averageSaturation(pixels, GREEN_KEY, true) > 0);
    });

    it('excludes alpha below 10 even when skipTransparent is set', () => {
        assert.equal(averageSaturation(fill(4, 255, 0, 0, 5), GREEN_KEY, true), 0);
    });

    it('treats a different key colour as a different exclusion zone', () => {
        const red = fill(4, 255, 0, 0, 255);
        // Against a green key, red counts; against a red key, it is excluded.
        assert.ok(averageSaturation(red, GREEN_KEY) > 0);
        assert.equal(averageSaturation(red, { r: 255, g: 0, b: 0 }), 0);
    });
});
