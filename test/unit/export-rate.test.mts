import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ASSUMED_SOURCE_FPS } from '../../src/core/frame-rate.mts';
import {
    gifDelayCentiseconds,
    resolveDimension,
    resolveExportFps,
} from '../../src/core/exporter-math.mts';

/**
 * The output rate and size fields are labelled "0 = match source" and
 * "0 = auto", and zero is their default. The TypeScript conversion stopped
 * honouring that, so every export left at its defaults played too fast. These
 * pin the label's meaning where the decision now lives.
 */

describe('resolveExportFps', () => {
    /** THE REGRESSION. The field's default must mean the source rate. */
    it('treats the default zero as match the source', () => {
        assert.equal(resolveExportFps(0, 30), 30);
        assert.equal(resolveExportFps(0, 16), 16);
    });

    it('honours a rate the user asked for', () => {
        assert.equal(resolveExportFps(12, 30), 12);
        assert.equal(resolveExportFps(60, 16), 60);
    });

    it('treats a value that is not a positive rate as match the source', () => {
        for (const bad of [-5, NaN, Infinity, -Infinity]) {
            assert.equal(resolveExportFps(bad, 24), 24, String(bad));
        }
    });

    it('falls back to the assumed rate only when the source rate is unusable too', () => {
        assert.equal(ASSUMED_SOURCE_FPS, 30);
        for (const bad of [0, -1, NaN, Infinity]) {
            assert.equal(resolveExportFps(0, bad), ASSUMED_SOURCE_FPS, String(bad));
        }
    });

    /**
     * What the regression did downstream. A zero handed to the delay routine
     * becomes its floor, which is fifty frames per second, and a zero turned
     * into a timer interval is infinite. Neither can happen once the rate is
     * resolved first.
     */
    it('never hands the encoders a rate that produces the floor or an infinite interval', () => {
        assert.equal(gifDelayCentiseconds(0), 2, 'what the unresolved zero produced');
        const resolved = resolveExportFps(0, 30);
        assert.equal(gifDelayCentiseconds(resolved), 3);
        assert.ok(Number.isFinite(1000 / resolved));
    });
});

describe('resolveDimension', () => {
    it('treats zero as the clip own size', () => {
        assert.equal(resolveDimension(0, 1280), 1280);
    });

    it('honours a size the user asked for', () => {
        assert.equal(resolveDimension(640, 1280), 640);
    });

    it('treats a value that is not a positive size as the clip own size', () => {
        for (const bad of [-1, NaN, Infinity]) {
            assert.equal(resolveDimension(bad, 720), 720, String(bad));
        }
    });
});
