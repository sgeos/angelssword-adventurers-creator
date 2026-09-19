import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BYTES_PER_PIXEL_PER_FRAME,
    clampCropOrigin,
    computeCropToCenter,
    cropOverlayPercent,
    estimateExportBytes,
    lockedDimension,
    viewportToPixel,
} from '../../src/core/exporter-math.mts';

/**
 * The crop rectangle, the size estimate and the pointer conversion, none of
 * which had a test. Each lived inside an event handler on the exporter and
 * was therefore reachable only by driving a browser.
 */

describe('clampCropOrigin', () => {
    it('moves the rectangle by the drag when it stays inside the frame', () => {
        assert.equal(clampCropOrigin(100, 50, 200, 640), 150);
        assert.equal(clampCropOrigin(100, -50, 200, 640), 50);
    });

    it('stops at the left edge rather than going negative', () => {
        assert.equal(clampCropOrigin(10, -100, 200, 640), 0);
    });

    it('stops at the right edge, so the rectangle stays wholly inside', () => {
        // The rightmost valid origin puts the rectangle's far edge on the
        // frame's far edge.
        assert.equal(clampCropOrigin(400, 500, 200, 640), 440);
        assert.equal(440 + 200, 640);
    });

    it('rounds, so a crop is always whole pixels', () => {
        assert.equal(clampCropOrigin(100, 0.4, 200, 640), 100);
        assert.equal(clampCropOrigin(100, 0.6, 200, 640), 101);
    });

    /**
     * A crop larger than the frame gives a negative upper bound, which
     * `Math.min` then selects. Clamping below at zero afterwards is what keeps
     * the result usable, and that ordering is the reason the expression is
     * written the way it is.
     */
    it('yields zero when the crop is larger than the frame', () => {
        assert.equal(clampCropOrigin(0, 0, 800, 640), 0);
        assert.equal(clampCropOrigin(100, 100, 800, 640), 0);
    });

    it('yields zero when the crop exactly fills the frame', () => {
        assert.equal(clampCropOrigin(0, 50, 640, 640), 0);
    });
});

describe('cropOverlayPercent', () => {
    it('expresses a rectangle as percentages of the frame', () => {
        const overlay = cropOverlayPercent(
            { cropX: 160, cropY: 120, cropW: 320, cropH: 240 },
            640,
            480,
        );
        assert.deepEqual(overlay, { left: 25, top: 25, width: 50, height: 50 });
    });

    it('reports a full-frame crop as the whole overlay', () => {
        const overlay = cropOverlayPercent({ cropX: 0, cropY: 0, cropW: 640, cropH: 480 }, 640, 480);
        assert.deepEqual(overlay, { left: 0, top: 0, width: 100, height: 100 });
    });

    it('agrees with computeCropToCenter, which is what produces the rectangle', () => {
        const crop = computeCropToCenter(640, 480, '1:1');
        const overlay = cropOverlayPercent(crop, 640, 480);
        assert.equal(overlay.height, 100, 'a square crop of a landscape frame is full height');
        assert.ok(overlay.left > 0 && overlay.width < 100, 'and is inset horizontally');
        assert.equal(overlay.left * 2 + overlay.width, 100, 'centred, so the margins match');
    });
});

describe('lockedDimension', () => {
    it('applies the ratio and rounds to a whole pixel', () => {
        assert.equal(lockedDimension(640, 480 / 640), 480);
        assert.equal(lockedDimension(500, 480 / 640), 375);
    });

    it('is reversible to within rounding', () => {
        const width = 640;
        const height = lockedDimension(width, 9 / 16);
        assert.equal(height, 360);
        assert.equal(lockedDimension(height, 16 / 9), width);
    });

    it('yields NaN for an unparsable field rather than inventing a size', () => {
        // The caller passes parseInt of an input's value, which is NaN when
        // the field is empty. Preserved: the field then shows NaN, which is
        // visible, rather than silently becoming a number nobody chose.
        assert.ok(Number.isNaN(lockedDimension(NaN, 0.5)));
    });
});

describe('viewportToPixel', () => {
    it('converts a click to a pixel when the canvas is displayed at its own size', () => {
        assert.equal(viewportToPixel(150, 100, 640, 640), 50);
    });

    it('scales when the canvas is displayed smaller than its backing store', () => {
        // A 640-wide canvas shown 320 wide: each displayed pixel is two.
        assert.equal(viewportToPixel(150, 100, 640, 320), 100);
    });

    it('scales when the canvas is displayed larger than its backing store', () => {
        assert.equal(viewportToPixel(200, 100, 320, 640), 50);
    });

    it('reports zero for a click on the element origin', () => {
        assert.equal(viewportToPixel(100, 100, 640, 320), 0);
    });

    /**
     * Floored rather than rounded, because the result indexes a pixel.
     * Rounding would let a click on the right half of the last pixel address
     * one past the end of the row.
     */
    it('floors, so a click never addresses one past the last pixel', () => {
        assert.equal(viewportToPixel(639.9, 0, 640, 640), 639);
        assert.equal(viewportToPixel(639.4, 0, 640, 640), 639);
    });
});

describe('estimateExportBytes', () => {
    it('scales with frames, area and the container heuristic', () => {
        assert.equal(estimateExportBytes(10, 100, 100, 'gif'), 10 * 100 * 100 * 0.3);
        assert.equal(estimateExportBytes(10, 100, 100, 'webm'), 10 * 100 * 100 * 0.1);
    });

    it('estimates a WebM smaller than a Graphics Interchange Format image', () => {
        assert.ok(
            estimateExportBytes(60, 512, 512, 'webm') < estimateExportBytes(60, 512, 512, 'gif'),
        );
    });

    it('uses the exported constants rather than numbers written twice', () => {
        assert.equal(BYTES_PER_PIXEL_PER_FRAME.gif, 0.3);
        assert.equal(BYTES_PER_PIXEL_PER_FRAME.webm, 0.1);
        assert.equal(
            estimateExportBytes(7, 11, 13, 'gif'),
            7 * 11 * 13 * BYTES_PER_PIXEL_PER_FRAME.gif,
        );
    });

    /**
     * The inputs are numeric fields a user can clear, so each can arrive as
     * NaN. Reporting zero makes the estimate read as nothing; reporting NaN
     * would put the word NaN in front of the user.
     */
    it('reports zero rather than NaN for a cleared field', () => {
        assert.equal(estimateExportBytes(NaN, 100, 100, 'gif'), 0);
        assert.equal(estimateExportBytes(10, NaN, 100, 'gif'), 0);
        assert.equal(estimateExportBytes(10, 100, NaN, 'gif'), 0);
    });

    it('reports zero for a frame count or dimension that is not positive', () => {
        assert.equal(estimateExportBytes(0, 100, 100, 'gif'), 0);
        assert.equal(estimateExportBytes(10, -5, 100, 'gif'), 0);
        assert.equal(estimateExportBytes(10, 100, Infinity, 'gif'), 0);
    });
});
