/**
 * Graphics Interchange Format frame compositing.
 *
 * # Why this is core and not platform
 *
 * This module used to live beside the browser code, and its own header said
 * it was the one part of Graphics Interchange Format handling that needs a
 * canvas. That was not true. It used a canvas as a scratch buffer and called
 * only `putImageData`, `getImageData` and `clearRect`, none of which asks the
 * platform for anything a plain array cannot do. Compositing frames under the
 * format's disposal rules is arithmetic.
 *
 * # One behavioural difference, and it is an improvement
 *
 * A canvas holds its backing store with premultiplied alpha, so writing a
 * partially transparent pixel and reading it back does not necessarily return
 * what was written. The previous implementation round-tripped through
 * `putImageData` and `getImageData` once per frame and inherited that loss.
 * This one does not, so a partially transparent frame composites exactly.
 *
 * Nothing depends on the difference. No production module imports this one,
 * which is recorded in `docs/decisions/OPEN.md` rather than treated as a
 * reason to leave it where it was.
 *
 * # What `putImageData` means here
 *
 * It replaces pixels. It does not alpha-blend a patch over what is beneath,
 * and neither does this module. A frame's patch overwrites the region it
 * covers, including its transparent samples, exactly as the original did.
 *
 * # TWO DISCREPANCIES AGAINST THE FORMAT, PRESERVED RATHER THAN CORRECTED
 *
 * Writing the first tests this module has ever had established that its
 * disposal handling does not match the Graphics Interchange Format.
 *
 * **It applies a frame's own disposal method before drawing that frame.** The
 * format defines the field as what to do with a frame's area *after* it has
 * been displayed, so the disposal that should govern the canvas before frame
 * N is drawn is the one declared by frame N minus one. This implementation is
 * off by one against that.
 *
 * **Disposal 2 clears the whole canvas.** The format restores the background
 * only over the area the disposed frame occupied. A frame smaller than the
 * canvas therefore erases more than it should.
 *
 * Both are preserved here because this commit moves a module and does not
 * change one. A refactor that quietly alters behaviour is a refactor nobody
 * can review, and the same reasoning governed the original conversion. The
 * tests below characterise what the code does rather than what the format
 * says, and each such test says so. The decision to correct them is recorded
 * in `docs/decisions/OPEN.md`.
 *
 * Nothing depends on either, no production module importing this one.
 */

import type { DecodedGif } from "./gif-codec.mts";

/** One fully composited frame, ready to draw or re-encode. */
export interface CompositedFrame {
  readonly rgba: Uint8ClampedArray;
  readonly delay: number;
}

/**
 * Copy one frame's samples into the canvas buffer, clipping at its edges.
 *
 * Clipping reproduces `putImageData`, which silently ignores whatever falls
 * outside the destination. A frame whose declared position puts it wholly
 * outside contributes nothing rather than throwing, because a decoder is not
 * entitled to assume a well formed file.
 */
const blit = (
  canvas: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  patch: Uint8ClampedArray,
  patchWidth: number,
  patchHeight: number,
  left: number,
  top: number,
): void => {
  for (let y = 0; y < patchHeight; y++) {
    const destY = top + y;
    if (destY < 0 || destY >= canvasHeight) continue;
    for (let x = 0; x < patchWidth; x++) {
      const destX = left + x;
      if (destX < 0 || destX >= canvasWidth) continue;
      const source = (y * patchWidth + x) * 4;
      const dest = (destY * canvasWidth + destX) * 4;
      canvas[dest] = patch[source] ?? 0;
      canvas[dest + 1] = patch[source + 1] ?? 0;
      canvas[dest + 2] = patch[source + 2] ?? 0;
      canvas[dest + 3] = patch[source + 3] ?? 0;
    }
  }
};

/**
 * Composite decoded frames into full rasters, applying disposal methods.
 *
 * As implemented, and see the module header for how this differs from the
 * format: a frame declaring disposal 2 clears the whole canvas before that
 * same frame is drawn, and a frame declaring disposal 3 restores the snapshot
 * taken before the previous disposal-3 frame was drawn. Every other value,
 * including the common 0 and 1, leaves the canvas as it stands.
 *
 * The snapshot for disposal 3 is taken after any clear or restore and before
 * the patch is drawn, which is the order the previous canvas implementation
 * used.
 */
export function compositeFrames(gif: DecodedGif): CompositedFrame[] {
  const { width, height, frames } = gif;
  const canvas = new Uint8ClampedArray(width * height * 4);
  const result: CompositedFrame[] = [];
  let previous: Uint8ClampedArray | null = null;

  for (const frame of frames) {
    if (frame.disposalMethod === 2) {
      canvas.fill(0);
    } else if (frame.disposalMethod === 3 && previous !== null) {
      canvas.set(previous);
    }

    if (frame.disposalMethod === 3) {
      previous = new Uint8ClampedArray(canvas);
    }

    blit(canvas, width, height, frame.rgba, frame.width, frame.height, frame.left, frame.top);
    result.push({ rgba: new Uint8ClampedArray(canvas), delay: frame.delay });
  }
  return result;
}
