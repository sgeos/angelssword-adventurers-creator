/**
 * Shared pixel-buffer access.
 *
 * noUncheckedIndexedAccess types every index read as possibly undefined,
 * including reads from typed arrays. That is correct: nothing in the type
 * system knows the index is in range.
 *
 * These helpers keep the rule rather than asserting past it. Out of range
 * reads yield 0, which is what an out-of-range channel meant anyway — the
 * previous code produced undefined there and propagated NaN through the
 * arithmetic instead.
 */

/** Any buffer holding 8-bit RGBA samples. */
export type RgbaBuffer = Uint8ClampedArray | Uint8Array | readonly number[];

/** One channel, or 0 when the index falls outside the buffer. */
export const channel = (rgba: RgbaBuffer, index: number): number => rgba[index] ?? 0;

/** Alpha of the pixel at a coordinate, or 0 when out of range. */
export const alphaAt = (rgba: RgbaBuffer, width: number, x: number, y: number): number =>
  channel(rgba, (y * width + x) * 4 + 3);

/**
 * A mutable RGBA raster, as the core sees one.
 *
 * This is the inversion of the drawing surface, in its narrowest useful form.
 * The keyer and the exporters need somewhere to read and write pixels; they do
 * not need a canvas, a rendering context, or a document. So the core declares
 * the shape it actually uses and the platform supplies something that has it.
 *
 * A browser `ImageData` satisfies this structurally, which is why no adapter
 * exists and none is wanted. A test satisfies it with an object literal, which
 * is the property that makes the keyer testable at all.
 *
 * `data` is readonly as a property and mutable as a buffer. That asymmetry is
 * deliberate and matches every consumer: the keyer writes samples in place and
 * never replaces the array.
 */
export interface RgbaImage {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
}
