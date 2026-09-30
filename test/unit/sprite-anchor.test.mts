import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeImageData, type Pixel } from '../helpers/image-data.mts';
import {
    computeSpriteDrawRect,
    findBottomOpaqueRow,
} from '../../src/core/sprite-prep-core.mts';

/**
 * THE PROPERTY THE ANCHORING EXISTS FOR, which had no test.
 *
 * `findBottomOpaqueRow` and `computeSpriteDrawRect` were each tested in
 * isolation. What was not tested is the thing they exist to guarantee
 * together: that two generations placing the character at different heights
 * in their own canvas land at the same place on the composed canvas.
 *
 * That property was also not being applied. The generated-result handoff
 * forwarded the raw image while the upload path forwarded the anchored one,
 * which produced a reported pair of reference images with the character at
 * different heights, and is the leading explanation for a video that cropped
 * to landscape and zoomed.
 */

const OPAQUE: Pixel = [200, 150, 120, 255];
const CLEAR: Pixel = [0, 0, 0, 0];

/**
 * A figure of `bodyHeight` rows whose feet sit `gap` rows above the bottom.
 *
 * Models place a character at different heights in their own canvas, which
 * is exactly what `gap` varies.
 */
const figure = (
    width: number,
    height: number,
    bodyHeight: number,
    gap: number,
): ReturnType<typeof makeImageData> => {
    const feet = height - 1 - gap;
    const head = feet - bodyHeight + 1;
    return makeImageData(width, height, (_x, y) => (y >= head && y <= feet ? OPAQUE : CLEAR));
};

/** Where the figure's feet end up on the composed canvas. */
const composedFeetRow = (
    image: ReturnType<typeof makeImageData>,
    offset = 0,
    zoom = 100,
): number => {
    const { data, width: sw, height: sh } = image;
    const bottomRow = findBottomOpaqueRow(data, sw, sh, 30);
    const rect = computeSpriteDrawRect({ sw, sh, bottomRow, offset, zoom, CW: 1280, CH: 720 });
    // The drawn image is placed at zoomY and scaled to drawH, so the feet sit
    // at that fraction of the way down the drawn rectangle.
    return rect.zoomY + Math.round(((bottomRow + 1) / sh) * rect.drawH);
};

describe('the bottom anchor removes the model own placement', () => {
    it('lands two differently placed figures in the same place', () => {
        const high = figure(512, 512, 200, 180);
        const low = figure(512, 512, 200, 20);

        // The raw images disagree by 160 rows about where the feet are.
        assert.notEqual(
            findBottomOpaqueRow(high.data, 512, 512, 30),
            findBottomOpaqueRow(low.data, 512, 512, 30),
        );
        assert.equal(composedFeetRow(high), composedFeetRow(low));
    });

    it('lands them at the bottom of the canvas', () => {
        assert.equal(composedFeetRow(figure(512, 512, 200, 100)), 720);
    });

    it('agrees across a range of placements', () => {
        const rows = [0, 10, 50, 120, 250].map((gap) => composedFeetRow(figure(512, 512, 180, gap)));
        assert.equal(new Set(rows).size, 1, `expected one anchored row, got ${rows.join(', ')}`);
    });

    it('agrees across source canvases of different sizes', () => {
        const rows = [
            composedFeetRow(figure(512, 512, 200, 60)),
            composedFeetRow(figure(1024, 1024, 400, 120)),
        ];
        assert.equal(new Set(rows).size, 1, rows.join(', '));
    });

    it('moves both by the same amount when an offset is applied', () => {
        const high = figure(512, 512, 200, 180);
        const low = figure(512, 512, 200, 20);
        assert.equal(composedFeetRow(high, 40), composedFeetRow(low, 40));
        assert.equal(composedFeetRow(high, 40) - composedFeetRow(high, 0), 40);
    });

    /**
     * CHARACTERISATION, and a finding. I expected zoom to keep the feet
     * anchored and asserted that; it does not.
     *
     * `computeSpriteDrawRect` sets `zoomY = spriteY + (sh - drawH)`, which
     * holds the SOURCE IMAGE's bottom edge in place, not the character's
     * feet. The feet sit above that edge by whatever transparent margin the
     * generation left below them, and shrinking the image pulls them toward
     * that edge, which is DOWNWARD. My first guess was that they would rise;
     * they descend, and can descend off the bottom of the canvas.
     *
     * The shift is the padding below the feet times how much was zoomed out,
     * so it is worst for a generation that left a lot of empty space beneath
     * the character. The vertical offset slider compensates, and this
     * predates the fork.
     *
     * What would decide it is whether a zoom that moves the character
     * vertically is ever wanted. If not, the anchor should be the feet
     * rather than the image edge. Recorded in docs/decisions/OPEN.md.
     */
    it('anchors zoom to the image edge, pushing the feet down as it shrinks', () => {
        const padding = 80;
        const image = figure(512, 512, 200, padding);
        const full = composedFeetRow(image, 0, 100);
        assert.equal(full, 720, 'at full size the feet sit on the canvas bottom');

        const half = composedFeetRow(image, 0, 50);
        assert.ok(half > full, 'zooming out pushes the character down, not up');
        assert.ok(half > 720, 'and can push it off the bottom of the canvas');

        // The shift is the padding below the feet times the amount zoomed out.
        assert.equal(half - full, Math.round(padding * 0.5));
    });

    it('shifts more the more empty space a generation left below the feet', () => {
        const shift = (padding: number): number =>
            composedFeetRow(figure(512, 512, 150, padding), 0, 50)
            - composedFeetRow(figure(512, 512, 150, padding), 0, 100);
        assert.equal(shift(0), 0, 'a figure already on the edge does not move');
        assert.ok(shift(200) > shift(40), 'more padding, more drift');
    });

    it('holds the anchor exactly at full size, whatever the padding', () => {
        for (const gap of [0, 40, 200]) {
            assert.equal(composedFeetRow(figure(512, 512, 180, gap), 0, 100), 720, gap.toString());
        }
    });

    it('centres horizontally regardless of placement', () => {
        const rect = (gap: number): number => {
            const image = figure(512, 512, 200, gap);
            const bottomRow = findBottomOpaqueRow(image.data, 512, 512, 30);
            return computeSpriteDrawRect({
                sw: 512, sh: 512, bottomRow, offset: 0, zoom: 100, CW: 1280, CH: 720,
            }).spriteX;
        };
        assert.equal(rect(20), rect(200));
        assert.equal(rect(20), Math.round((1280 - 512) / 2));
    });

    /**
     * A fully transparent image has no feet to find. The helper reports the
     * last row rather than failing, which places the empty image at the
     * bottom and is harmless.
     */
    it('survives an image with nothing opaque in it', () => {
        const empty = makeImageData(64, 64, () => CLEAR);
        assert.equal(findBottomOpaqueRow(empty.data, 64, 64, 30), 63);
        assert.ok(Number.isFinite(composedFeetRow(empty)));
    });

    it('ignores nearly transparent pixels, which a soft edge produces', () => {
        // Alpha 20 is below the threshold of 30, so this row is not the feet.
        const soft = makeImageData(64, 64, (_x, y) => {
            if (y === 63) return [10, 10, 10, 20];
            if (y >= 40 && y <= 50) return OPAQUE;
            return CLEAR;
        });
        assert.equal(findBottomOpaqueRow(soft.data, 64, 64, 30), 50);
    });
});
