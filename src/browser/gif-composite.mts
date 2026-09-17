/**
 * AS Adventurer — GIF frame compositing.
 *
 * Split from gif-codec.mts because this is the one part of GIF handling that
 * needs a canvas. Keeping it here lets the codec itself compile under the
 * WebWorker lib, where no document exists; tsconfig.worker.json is what
 * enforces that separation rather than leaving it to convention.
 */
import type { DecodedGif } from "./gif-codec.mts";

/** One fully composited frame, ready to draw or re-encode. */
export interface CompositedFrame {
  readonly rgba: Uint8ClampedArray;
  readonly delay: number;
}

/**
 * Composite decoded frames into full RGBA canvases, respecting disposal methods.
 */
export function compositeFrames(gif: DecodedGif): CompositedFrame[] {
    const { width, height, frames } = gif;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('2D canvas context is unavailable');

    const result = [];
    let prevImageData = null;

    for (const frame of frames) {
        // Disposal: 2 = restore to bg (clear), 3 = restore to previous
        if (frame.disposalMethod === 2) {
            ctx.clearRect(0, 0, width, height);
        } else if (frame.disposalMethod === 3 && prevImageData !== null) {
            ctx.putImageData(prevImageData, 0, 0);
        }

        // Save state before drawing if disposal 3
        if (frame.disposalMethod === 3) {
            prevImageData = ctx.getImageData(0, 0, width, height);
        }

        // Draw frame patch
        const patch = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height);
        ctx.putImageData(patch, frame.left, frame.top);

        // Capture composited frame
        const full = ctx.getImageData(0, 0, width, height);
        result.push({ rgba: new Uint8ClampedArray(full.data), delay: frame.delay });
    }
    return result;
}
