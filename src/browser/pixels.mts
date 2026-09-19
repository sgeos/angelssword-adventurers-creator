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
