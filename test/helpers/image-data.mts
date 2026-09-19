/**
 * A raster for node, built to the shape the core asks for.
 *
 * This file used to declare `ImageData` and manufacture a `colorSpace` field
 * it did not use, because that was the only way to satisfy a DOM type that
 * node cannot construct. Its own comment said the keyer reads `data`, `width`
 * and `height` and nothing else, which was true and which the types could not
 * express.
 *
 * The core now declares that shape as `RgbaImage`, so the stand-in states
 * exactly what it provides and the fabricated field is gone. A browser
 * `ImageData` still satisfies the same interface structurally, so nothing in
 * production changed to make this possible.
 */

import type { RgbaImage } from '../../src/core/pixels.mts';

/** RGBA at one coordinate. */
export type Pixel = readonly [number, number, number, number];

/** Build a raster, filling each pixel from its coordinates. */
export function makeImageData(
    width: number,
    height: number,
    fillFn: (x: number, y: number) => Pixel,
): RgbaImage {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
    }
    return { data, width, height };
}

/** Every pixel the same. */
export const solid = (width: number, height: number, pixel: Pixel): RgbaImage =>
    makeImageData(width, height, () => pixel);

/** RGBA of the pixel at a coordinate, for asserting on a result. */
export function pixelAt(image: RgbaImage, x: number, y: number): Pixel {
    const i = (y * image.width + x) * 4;
    return [
        image.data[i] ?? 0,
        image.data[i + 1] ?? 0,
        image.data[i + 2] ?? 0,
        image.data[i + 3] ?? 0,
    ];
}

/** Alpha of the pixel at a coordinate. */
export const alphaAt = (image: RgbaImage, x: number, y: number): number =>
    image.data[(y * image.width + x) * 4 + 3] ?? 0;
