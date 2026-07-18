/**
 * RGBA pixel fixtures for sprite-prep-core characterization tests.
 * Fixtures are built inline in tests; this module documents layouts.
 */
'use strict';

/** 4×4 solid green opaque — pickKey should choose magenta (#FF00FF). */
function mostlyGreenSprite(w = 4, h = 4) {
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        buf[o] = 0; buf[o + 1] = 255; buf[o + 2] = 0; buf[o + 3] = 255;
    }
    return { rgba: buf, width: w, height: h, expectedKeyHex: '#FF00FF' };
}

module.exports = { mostlyGreenSprite };
