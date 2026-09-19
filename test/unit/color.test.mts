import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeImageData, solid, type Pixel } from '../helpers/image-data.mts';
import {
    COLOR_NAMES,
    EDGE_SAMPLES,
    QUANTISE_STEP,
    colorName,
    detectKeyColor,
    hexToRgb,
    rgbToHex,
} from '../../src/core/color.mts';

/**
 * `detectKeyColor` had never been tested. It was a forty line algorithm
 * inside a click handler, reading pixels one at a time through the canvas,
 * and every property below was a decision nobody could see.
 */

const GREEN: Pixel = [0, 255, 0, 255];
const MAGENTA: Pixel = [255, 0, 255, 255];
const RED: Pixel = [255, 0, 0, 255];

describe('colorName', () => {
    it('names the five key colours the interface offers', () => {
        assert.equal(colorName('#00FF00'), 'Green');
        assert.equal(colorName('#FF00FF'), 'Magenta');
        assert.equal(colorName('#0000FF'), 'Blue');
        assert.equal(colorName('#FFFF00'), 'Yellow');
        assert.equal(colorName('#00FFFF'), 'Cyan');
    });

    it('is case-insensitive about the hex it is given', () => {
        assert.equal(colorName('#00ff00'), 'Green');
    });

    it('passes an unknown colour through unchanged, in its original case', () => {
        assert.equal(colorName('#abcdef'), '#abcdef');
    });

    it('covers every entry of the exported table', () => {
        for (const [hex, name] of Object.entries(COLOR_NAMES)) {
            assert.equal(colorName(hex), name, hex);
        }
    });
});

describe('hexToRgb', () => {
    it('reads a six-digit hex colour', () => {
        assert.deepEqual(hexToRgb('#00FF00'), { r: 0, g: 255, b: 0 });
        assert.deepEqual(hexToRgb('#123456'), { r: 0x12, g: 0x34, b: 0x56 });
    });

    it('accepts either case', () => {
        assert.deepEqual(hexToRgb('#aabbcc'), hexToRgb('#AABBCC'));
    });

    /**
     * CHARACTERISATION. This does not validate and never did. A malformed
     * value yields NaN, which reaches the keyer and propagates through its
     * arithmetic. Preserved rather than corrected, because correcting it means
     * deciding what a caller should do instead. Pinned here so the decision is
     * visible when someone takes it.
     */
    it('yields NaN for a value that is not #RRGGBB, rather than refusing', () => {
        assert.ok(Number.isNaN(hexToRgb('#0f0').b), 'a three-digit hex is not supported');
        assert.ok(Number.isNaN(hexToRgb('nonsense').r));
        assert.ok(Number.isNaN(hexToRgb('').r));
    });
});

describe('rgbToHex', () => {
    it('writes a colour as lowercase #rrggbb', () => {
        assert.equal(rgbToHex({ r: 0, g: 255, b: 0 }), '#00ff00');
        assert.equal(rgbToHex({ r: 1, g: 2, b: 3 }), '#010203');
    });

    it('round-trips with hexToRgb', () => {
        for (const hex of Object.keys(COLOR_NAMES)) {
            assert.equal(rgbToHex(hexToRgb(hex)).toUpperCase(), hex);
        }
    });

    it('clamps at both ends, unlike the inline version it replaced', () => {
        // The exporter clamped only above, which was sufficient there because
        // its only producer was the quantiser and could not go negative.
        assert.equal(rgbToHex({ r: 300, g: -5, b: 128 }), '#ff0080');
    });
});

describe('detectKeyColor', () => {
    it('reports the colour of a uniform frame', () => {
        assert.deepEqual(detectKeyColor(solid(64, 64, GREEN)), { r: 0, g: 255, b: 0 });
    });

    it('reports nothing for a frame with no pixels', () => {
        assert.equal(detectKeyColor(makeImageData(0, 0, () => GREEN)), undefined);
    });

    /**
     * THE REASON IT SAMPLES THE BORDER. The subject is in the middle. A frame
     * whose character covers most of its area must still report the backdrop,
     * which sampling everything would not do.
     */
    it('ignores the middle, so a large subject does not outvote the backdrop', () => {
        const image = makeImageData(64, 64, (x, y) =>
            (x >= 2 && x < 62 && y >= 2 && y < 62) ? RED : GREEN);
        assert.deepEqual(detectKeyColor(image), { r: 0, g: 255, b: 0 });
    });

    it('reports the more common of two border colours', () => {
        // Green on three edges, magenta on the last.
        const image = makeImageData(64, 64, (_x, y) => (y === 63 ? MAGENTA : GREEN));
        assert.deepEqual(detectKeyColor(image), { r: 0, g: 255, b: 0 });
    });

    /**
     * THE REASON IT QUANTISES. A backdrop that has been through a video codec
     * is not one colour; it is a cloud of near colours. Counting raw values
     * would split that cloud into hundreds of buckets of one.
     */
    it('collapses near colours into one bucket, so codec noise does not split the vote', () => {
        let n = 0;
        const image = makeImageData(64, 64, () => {
            // Vary each sample slightly within one quantisation bucket.
            n += 1;
            return [0, 250 + (n % 6), 0, 255];
        });
        const detected = detectKeyColor(image);
        assert.deepEqual(detected, { r: 0, g: 255, b: 0 },
            'noisy near-white greens must all count as one colour');
    });

    it('reports the bucket centre rather than any sampled pixel', () => {
        // 250 rounds to 256 and is capped at 255; 8 rounds to 16.
        const image = solid(64, 64, [8, 250, 8, 255]);
        assert.deepEqual(detectKeyColor(image), { r: 16, g: 255, b: 16 });
    });

    it('caps a quantised channel at 255 rather than letting it reach 256', () => {
        // 255 / 16 rounds to 16, and 16 * 16 is 256, so the cap is what keeps
        // a white border reporting white rather than overflowing the channel.
        const detected = detectKeyColor(solid(64, 64, [255, 255, 255, 255]));
        // assert.deepEqual narrows through its `asserts actual is T`
        // signature, so `detected` is no longer possibly undefined here.
        assert.deepEqual(detected, { r: 255, g: 255, b: 255 });
        assert.equal(rgbToHex(detected), '#ffffff');
    });

    it('ignores alpha, a backdrop being opaque whatever the keyer later does', () => {
        assert.deepEqual(
            detectKeyColor(solid(64, 64, [0, 255, 0, 0])),
            detectKeyColor(solid(64, 64, GREEN)),
        );
    });

    /**
     * CHARACTERISATION of a tie. Insertion order decides, which is what the
     * original did by iterating its map. Recorded because it is otherwise
     * invisible, not because anything depends on it.
     */
    it('breaks a tie in favour of the colour seen first', () => {
        // A 2x2 frame: every pixel is a border pixel, two of each colour.
        const image = makeImageData(2, 2, (x) => (x === 0 ? GREEN : MAGENTA));
        assert.deepEqual(detectKeyColor(image), { r: 0, g: 255, b: 0 },
            'the top-left pixel is sampled first');
    });

    it('samples a small frame exhaustively rather than skipping rows', () => {
        // Below EDGE_SAMPLES the step floors to zero and is raised to one, so
        // a short edge must not be sampled with a zero step and loop forever.
        // Four is well under the sample target of EDGE_SAMPLES.
        assert.equal(EDGE_SAMPLES, 50);
        assert.deepEqual(detectKeyColor(solid(4, 4, MAGENTA)), { r: 255, g: 0, b: 255 });
    });

    it('handles a single-pixel frame, where every edge is the same pixel', () => {
        assert.deepEqual(detectKeyColor(solid(1, 1, GREEN)), { r: 0, g: 255, b: 0 });
    });

    it('handles a one-pixel-tall frame without reading out of bounds', () => {
        const detected = detectKeyColor(solid(16, 1, GREEN));
        assert.deepEqual(detected, { r: 0, g: 255, b: 0 });
    });

    it('steps across a wide frame rather than reading every column', () => {
        // The step is width / EDGE_SAMPLES, so a 500-wide frame is sampled
        // every 10 columns. A stripe narrower than the step can be missed
        // entirely, which is a property of the sampling and is stated here
        // rather than discovered.
        const step = Math.max(1, Math.floor(500 / EDGE_SAMPLES));
        assert.equal(step, 10);
        const image = makeImageData(500, 8, (x) => (x === 5 ? MAGENTA : GREEN));
        assert.deepEqual(detectKeyColor(image), { r: 0, g: 255, b: 0 },
            'a one-column stripe between sample points is invisible to detection');
    });

    it('uses the documented quantisation step', () => {
        assert.equal(QUANTISE_STEP, 16);
        // A value exactly between two buckets rounds up, as Math.round does.
        assert.deepEqual(detectKeyColor(solid(8, 8, [8, 0, 0, 255])), { r: 16, g: 0, b: 0 });
    });
});
