/**
 * An ImageData-shaped object for node.
 *
 * Node has no ImageData, but TypeScript is structural and the chroma keyer
 * reads only `data`, `width` and `height`. A plain object with the right
 * shape satisfies both the compiler and the code under test, which is why
 * ImageData-taking functions are testable here without a DOM implementation.
 */

/** RGBA at one coordinate. */
export type Pixel = readonly [number, number, number, number];

/** Build an ImageData stand-in, filling each pixel from its coordinates. */
export function makeImageData(
    width: number,
    height: number,
    fillFn: (x: number, y: number) => Pixel,
): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
    }
    return { data, width, height, colorSpace: 'srgb' };
}

/** Every pixel the same. */
export const solid = (width: number, height: number, pixel: Pixel): ImageData =>
    makeImageData(width, height, () => pixel);

/** RGBA of the pixel at a coordinate, for asserting on a result. */
export function pixelAt(image: ImageData, x: number, y: number): Pixel {
    const i = (y * image.width + x) * 4;
    return [
        image.data[i] ?? 0,
        image.data[i + 1] ?? 0,
        image.data[i + 2] ?? 0,
        image.data[i + 3] ?? 0,
    ];
}

/** Alpha of the pixel at a coordinate. */
export const alphaAt = (image: ImageData, x: number, y: number): number =>
    image.data[(y * image.width + x) * 4 + 3] ?? 0;
