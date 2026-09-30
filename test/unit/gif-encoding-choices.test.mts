import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_GIF_FPS,
    MIN_GIF_DELAY_CENTISECONDS,
    PALETTE_SAMPLE_TARGET,
    gifDelayCentiseconds,
    paletteSampling,
    paletteSlots,
} from '../../src/core/exporter-math.mts';
import { frameCountFromDuration } from '../../src/core/video-time.mts';

/**
 * Four decisions that governed every Graphics Interchange Format export and
 * were four unexplained numeric literals inside the export routine. Each has
 * a consequence a user could notice and report, which is the argument for
 * naming them rather than only extracting them.
 */

describe('frameCountFromDuration ends a disagreement between two stages', () => {
    /**
     * THE DEFECT. The video stage rounded, the exporter floored in two
     * places, and the handoff carries the video stage's figure while the loop
     * range is clamped to the exporter's. A count one lower silently clipped
     * the loop end, and the exporter's last-frame field is the count minus
     * one, so flooring made the final real frame unreachable.
     */
    it('agrees where the old pair disagreed', () => {
        // Both of these have a fractional part above one half.
        assert.equal(frameCountFromDuration(9.99, 30), 300);
        assert.equal(Math.floor(9.99 * 30), 299, 'which is what the exporter used to get');
        assert.equal(frameCountFromDuration(7.983, 24), 192);
        assert.equal(Math.floor(7.983 * 24), 191);
    });

    it('agrees where the old pair already agreed', () => {
        for (const [duration, fps] of [[10, 30], [2.5, 24], [3.04, 25]] as const) {
            assert.equal(frameCountFromDuration(duration, fps), Math.floor(duration * fps));
        }
    });

    it('recovers the exact count for a clip that is exactly N frames', () => {
        // The reason rounding is kept: a duration of N / fps can land a hair
        // under in floating point, and flooring then loses a frame.
        for (const frames of [1, 30, 97, 300, 601]) {
            assert.equal(frameCountFromDuration(frames / 30, 30), frames, frames.toString());
        }
    });

    it('spans the boundary in both directions', () => {
        assert.equal(frameCountFromDuration(10.0 + 0.4 / 30, 30), 300, 'just below a half frame');
        assert.equal(frameCountFromDuration(10.0 + 0.6 / 30, 30), 301, 'just above');
    });

    it('reports no frames rather than a nonsense count for unusable input', () => {
        for (const [duration, fps] of [[0, 30], [-1, 30], [10, 0], [10, -5], [NaN, 30], [10, NaN]] as const) {
            assert.equal(frameCountFromDuration(duration, fps), 0, `${String(duration)} @ ${String(fps)}`);
        }
    });
});

describe('gifDelayCentiseconds', () => {
    it('converts a rate to hundredths of a second', () => {
        assert.equal(gifDelayCentiseconds(10), 10);
        assert.equal(gifDelayCentiseconds(20), 5);
        assert.equal(gifDelayCentiseconds(50), 2);
    });

    /**
     * THE CEILING, which was implicit in a bare `Math.max(2, ...)`. Asking
     * for more than fifty frames per second is silently met at fifty, and
     * that is the sort of thing a user reports as a bug.
     */
    it('cannot go above the rate its floor implies', () => {
        assert.equal(MAX_GIF_FPS, 50);
        for (const fps of [50, 60, 120, 1000]) {
            assert.equal(gifDelayCentiseconds(fps), MIN_GIF_DELAY_CENTISECONDS, fps.toString());
        }
    });

    /**
     * A delay of one, and especially of zero, is widely reinterpreted by
     * players as a default near ten, which would run an animation far slower
     * than asked rather than faster. The floor avoids that.
     */
    it('never writes a delay players reinterpret', () => {
        for (const fps of [50, 99, 1e6]) {
            assert.ok(gifDelayCentiseconds(fps) >= 2, fps.toString());
        }
    });

    it('drifts where the stored unit is too coarse, which the format causes', () => {
        // 24fps is 4.17 centiseconds, stored as 4, which plays at 25.
        assert.equal(gifDelayCentiseconds(24), 4);
        assert.equal(100 / 4, 25);
    });

    it('falls back to the floor for a rate that is not a usable number', () => {
        for (const bad of [0, -1, NaN, Infinity]) {
            assert.equal(gifDelayCentiseconds(bad), MIN_GIF_DELAY_CENTISECONDS, String(bad));
        }
    });
});

describe('paletteSampling', () => {
    it('samples a long export at the target, not exhaustively', () => {
        assert.equal(PALETTE_SAMPLE_TARGET, 6);
        const { count, stride } = paletteSampling(300);
        assert.equal(count, 6);
        assert.equal(stride, 50);
    });

    it('samples a short export exhaustively, the stride flooring to one', () => {
        const { count, stride } = paletteSampling(4);
        assert.equal(count, 4);
        assert.equal(stride, 1);
    });

    /**
     * THE TARGET IS NOT A GUARANTEE, and my first version of this claimed it
     * was. Between seven and eleven frames the stride floors to one and every
     * frame is sampled, so eleven frames are read against a target of six.
     *
     * Benign, a short export being cheap to sample exhaustively, and asserted
     * so the target is not mistaken for a bound.
     */
    it('exceeds the target between seven and eleven frames', () => {
        assert.equal(paletteSampling(11).count, 11);
        assert.equal(paletteSampling(11).stride, 1);
        assert.equal(paletteSampling(12).count, 6, 'at twelve the stride reaches two');
    });

    it('reports the count the caller will actually read', () => {
        for (let total = 1; total <= 40; total++) {
            const { count, stride } = paletteSampling(total);
            assert.equal(count, Math.ceil(total / stride), total.toString());
        }
    });

    /**
     * A stride of zero would not terminate, and the floor division reaches
     * zero as soon as the count exceeds the length.
     */
    it('never yields a stride of zero', () => {
        for (const total of [1, 2, 5, 6, 7, 11, 300, 10_000]) {
            assert.ok(paletteSampling(total).stride >= 1, total.toString());
        }
    });

    it('holds near the target once the stride exceeds one', () => {
        for (const total of [12, 13, 60, 301, 5_000]) {
            const { count, stride } = paletteSampling(total);
            assert.ok(stride > 1, total.toString());
            // Flooring the stride can add one step at the end.
            assert.ok(count <= PALETTE_SAMPLE_TARGET + 1, `${total.toString()} gave ${count.toString()}`);
        }
    });

    it('asks for nothing when there is nothing to export', () => {
        assert.deepEqual(paletteSampling(0), { count: 0, stride: 1 });
        assert.deepEqual(paletteSampling(NaN), { count: 0, stride: 1 });
    });
});

describe('paletteSlots', () => {
    /**
     * One entry is spent on the transparent colour, which is why a palette is
     * always one smaller than the limit asked for. That was invisible in a
     * bare `maxColors - 1`.
     */
    it('reserves one entry for transparency', () => {
        assert.equal(paletteSlots(256), 255);
        assert.equal(paletteSlots(64), 63);
    });

    it('holds a floor the format can encode', () => {
        for (const asked of [2, 1, 0, -5]) {
            assert.equal(paletteSlots(asked), 2, asked.toString());
        }
    });

    it('truncates a fractional limit rather than producing a fractional palette', () => {
        assert.equal(paletteSlots(64.7), 63);
    });

    it('falls back for a limit that is not a number', () => {
        assert.equal(paletteSlots(NaN), 2);
    });
});
