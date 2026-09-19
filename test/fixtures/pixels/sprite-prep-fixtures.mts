/**
 * RGBA pixel fixtures for the sprite-prep-core tests.
 *
 * Nothing imports this today; the tests build their fixtures inline. It is
 * kept because it documents the layouts those fixtures follow, and converting
 * it costs less than arguing about deleting it. If it is still unreferenced
 * next time someone passes through here, delete it.
 */

/** A fixture sprite together with the key colour it should provoke. */
export interface SpriteFixture {
    readonly rgba: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    readonly expectedKeyHex: string;
}

/** Solid opaque green — pickKey should choose magenta, the farthest key. */
export function mostlyGreenSprite(w = 4, h = 4): SpriteFixture {
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        buf[o] = 0; buf[o + 1] = 255; buf[o + 2] = 0; buf[o + 3] = 255;
    }
    return { rgba: buf, width: w, height: h, expectedKeyHex: '#FF00FF' };
}
