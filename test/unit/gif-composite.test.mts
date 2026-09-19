import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compositeFrames } from '../../src/core/gif-composite.mts';
import type { DecodedFrame, DecodedGif } from '../../src/core/gif-codec.mts';

/**
 * These are the first tests this module has ever had. It was unreachable from
 * a node test while it used a canvas, which is the coverage argument for the
 * layering change stated concretely rather than in the abstract.
 *
 * They are CHARACTERISATION tests. They pin what the code does, which for
 * disposal methods 2 and 3 is not what the Graphics Interchange Format says.
 * Writing them is how that came to light. Each divergent test says so at its
 * own site, the module header states both divergences, and the decision to
 * correct them is recorded in docs/decisions/OPEN.md rather than taken here,
 * because this change moves a module and does not alter one.
 */

/** A solid patch of one colour. */
const patch = (
    width: number,
    height: number,
    pixel: readonly [number, number, number, number],
): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = pixel[0];
        data[i * 4 + 1] = pixel[1];
        data[i * 4 + 2] = pixel[2];
        data[i * 4 + 3] = pixel[3];
    }
    return data;
};

const frame = (over: Partial<DecodedFrame> & Pick<DecodedFrame, 'rgba' | 'width' | 'height'>): DecodedFrame => ({
    delay: 10,
    left: 0,
    top: 0,
    disposalMethod: 0,
    ...over,
});

const gif = (frames: readonly DecodedFrame[], width = 4, height = 4): DecodedGif => ({
    width,
    height,
    frames: [...frames],
});

const RED: readonly [number, number, number, number] = [255, 0, 0, 255];
const BLUE: readonly [number, number, number, number] = [0, 0, 255, 255];

/** RGBA at a coordinate of a composited frame. */
const at = (rgba: Uint8ClampedArray, width: number, x: number, y: number): number[] => {
    const i = (y * width + x) * 4;
    return [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0, rgba[i + 3] ?? 0];
};

describe('compositeFrames', () => {
    it('starts from a transparent canvas, so an uncovered region stays clear', () => {
        const out = compositeFrames(gif([frame({ rgba: patch(2, 2, RED), width: 2, height: 2 })]));
        assert.equal(out.length, 1);
        assert.deepEqual(at(out[0]?.rgba ?? new Uint8ClampedArray(), 4, 0, 0), [255, 0, 0, 255]);
        assert.deepEqual(at(out[0]?.rgba ?? new Uint8ClampedArray(), 4, 3, 3), [0, 0, 0, 0]);
    });

    it('carries the delay of each frame through unchanged', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(1, 1, RED), width: 1, height: 1, delay: 7 }),
            frame({ rgba: patch(1, 1, BLUE), width: 1, height: 1, delay: 23 }),
        ]));
        assert.deepEqual(out.map((f) => f.delay), [7, 23]);
    });

    it('accumulates frames when disposal is 0 or 1', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(2, 2, RED), width: 2, height: 2, disposalMethod: 1 }),
            frame({ rgba: patch(2, 2, BLUE), width: 2, height: 2, left: 2, top: 0 }),
        ]));
        const second = out[1]?.rgba ?? new Uint8ClampedArray();
        assert.deepEqual(at(second, 4, 0, 0), [255, 0, 0, 255], 'the first frame must persist');
        assert.deepEqual(at(second, 4, 2, 0), [0, 0, 255, 255], 'the second frame must be drawn');
    });

    /**
     * CHARACTERISATION, NOT A SPECIFICATION. The format says disposal 2
     * restores the background over the area the DISPOSED frame occupied,
     * before the NEXT frame is drawn. This implementation clears the WHOLE
     * canvas before the frame that DECLARES it. Both divergences are recorded
     * in the module header and in docs/decisions/OPEN.md; this test pins what
     * the code does so that correcting it is a visible change.
     */
    it('clears the whole canvas before drawing the frame that declares disposal 2', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(2, 2, RED), width: 2, height: 2, disposalMethod: 1 }),
            frame({ rgba: patch(2, 2, BLUE), width: 2, height: 2, left: 2, top: 0, disposalMethod: 2 }),
        ]));
        const second = out[1]?.rgba ?? new Uint8ClampedArray();
        assert.deepEqual(at(second, 4, 0, 0), [0, 0, 0, 0],
            'the clear happens before this frame is drawn, erasing the earlier one');
        assert.deepEqual(at(second, 4, 2, 0), [0, 0, 255, 255],
            'and this frame is then drawn onto the cleared canvas');
    });

    it('leaves a frame declaring disposal 2 unable to protect its own pixels in the next frame', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(2, 2, RED), width: 2, height: 2, disposalMethod: 2 }),
            frame({ rgba: patch(2, 2, BLUE), width: 2, height: 2, left: 2, top: 0, disposalMethod: 1 }),
        ]));
        const second = out[1]?.rgba ?? new Uint8ClampedArray();
        assert.deepEqual(at(second, 4, 0, 0), [255, 0, 0, 255],
            'the format would have cleared frame 0 here; this implementation does not');
    });

    /**
     * CHARACTERISATION, NOT A SPECIFICATION, for the same reason. The restore
     * is applied before the frame that DECLARES disposal 3, using a snapshot
     * taken before the previous such frame.
     */
    it('restores before drawing the frame that declares disposal 3', () => {
        const out = compositeFrames(gif([
            // Frame 0 paints the left half and persists.
            frame({ rgba: patch(2, 4, RED), width: 2, height: 4, disposalMethod: 1 }),
            // Frame 1 declares 3, so it snapshots the canvas as frame 0 left it,
            // then draws over the right half.
            frame({ rgba: patch(2, 4, BLUE), width: 2, height: 4, left: 2, disposalMethod: 3 }),
            // Frame 2 declares 3 as well, so it restores that snapshot first.
            frame({ rgba: patch(1, 1, BLUE), width: 1, height: 1, left: 0, top: 3, disposalMethod: 3 }),
        ]));
        const third = out[2]?.rgba ?? new Uint8ClampedArray();
        assert.deepEqual(at(third, 4, 2, 0), [0, 0, 0, 0], 'frame 1 must have been undone');
        assert.deepEqual(at(third, 4, 0, 0), [255, 0, 0, 255], 'frame 0 must survive the restore');
        assert.deepEqual(at(third, 4, 0, 3), [0, 0, 255, 255], 'frame 2 must be drawn');
    });

    it('treats disposal 3 on the first frame as no restore, having nothing to restore', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(2, 2, RED), width: 2, height: 2, disposalMethod: 3 }),
        ]));
        assert.deepEqual(at(out[0]?.rgba ?? new Uint8ClampedArray(), 4, 0, 0), [255, 0, 0, 255]);
    });

    it('replaces rather than blends, so a transparent sample erases what it covers', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(4, 4, RED), width: 4, height: 4, disposalMethod: 1 }),
            frame({ rgba: patch(2, 2, [0, 0, 0, 0]), width: 2, height: 2 }),
        ]));
        const second = out[1]?.rgba ?? new Uint8ClampedArray();
        assert.deepEqual(at(second, 4, 0, 0), [0, 0, 0, 0], 'putImageData semantics replace the region');
        assert.deepEqual(at(second, 4, 3, 3), [255, 0, 0, 255], 'and leave everything outside it alone');
    });

    it('clips a patch that overhangs the canvas instead of throwing', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(4, 4, RED), width: 4, height: 4, left: 2, top: 2 }),
        ]));
        const only = out[0]?.rgba ?? new Uint8ClampedArray();
        assert.deepEqual(at(only, 4, 3, 3), [255, 0, 0, 255], 'the part inside must be drawn');
        assert.equal(only.length, 4 * 4 * 4, 'the canvas must not have grown');
    });

    it('ignores a patch positioned wholly outside the canvas', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(2, 2, RED), width: 2, height: 2, left: 10, top: 10 }),
        ]));
        assert.ok((out[0]?.rgba ?? new Uint8ClampedArray()).every((sample) => sample === 0));
    });

    it('returns an independent buffer per frame, not views of one canvas', () => {
        const out = compositeFrames(gif([
            frame({ rgba: patch(4, 4, RED), width: 4, height: 4, disposalMethod: 1 }),
            frame({ rgba: patch(4, 4, BLUE), width: 4, height: 4 }),
        ]));
        assert.deepEqual(at(out[0]?.rgba ?? new Uint8ClampedArray(), 4, 0, 0), [255, 0, 0, 255],
            'the first result must not have been overwritten by the second frame');
    });

    it('returns nothing for a file with no frames', () => {
        assert.deepEqual(compositeFrames(gif([])), []);
    });
});
