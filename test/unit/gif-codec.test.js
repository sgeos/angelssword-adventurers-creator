'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GifEncoder, ColorQuantizer, GifDecoder } = require('../../public/lib/gif-codec.js');

function solidRgba(w, h, r, g, b, a = 255) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = a;
    }
    return rgba;
}

function findNetscape(buf) {
    const needle = Buffer.from('NETSCAPE2.0');
    return Buffer.from(buf).includes(needle);
}

describe('ColorQuantizer', () => {
    it('quantize: α<128 → transparent; maxColors reserves transparent slot', () => {
        const rgba = new Uint8ClampedArray([
            255, 0, 0, 255,
            0, 255, 0, 100, // transparent (a<128)
            0, 0, 255, 255,
            255, 255, 0, 50  // transparent
        ]);
        const { palette, indexedPixels, transparentIndex } = ColorQuantizer.quantize(rgba, 4);
        // maxColors=4 → paletteSlots=3 opaque + 1 transparent entry
        assert.ok(palette.length <= 4);
        assert.equal(palette.length, transparentIndex + 1);
        assert.equal(indexedPixels[1], transparentIndex);
        assert.equal(indexedPixels[3], transparentIndex);
        assert.notEqual(indexedPixels[0], transparentIndex);
        assert.notEqual(indexedPixels[2], transparentIndex);
    });

    it('nearestPaletteIndex excludes transparent index', () => {
        const palette = [
            [255, 0, 0],
            [0, 0, 0], // transparent slot (color irrelevant)
            [0, 255, 0]
        ];
        const idx = ColorQuantizer.nearestPaletteIndex(palette, 0, 0, 0, 1);
        // Should not pick index 1 even though [0,0,0] is exact match
        assert.notEqual(idx, 1);
        assert.ok(idx === 0 || idx === 2);
    });
});

describe('GifEncoder / GifDecoder', () => {
    it('begin+finish → starts GIF89a ends 0x3B; NETSCAPE loop present for loop=0', () => {
        const enc = new GifEncoder(2, 2, 0);
        enc.begin();
        const data = enc.finish();
        assert.equal(String.fromCharCode(...data.slice(0, 6)), 'GIF89a');
        assert.equal(data[data.length - 1], 0x3B);
        assert.ok(findNetscape(data), 'NETSCAPE2.0 extension expected');
    });

    it('encode→decode solid opaque 4×4 red round-trip (semantic RGB/α)', () => {
        const w = 4, h = 4;
        const rgba = solidRgba(w, h, 255, 0, 0, 255);
        const { palette, indexedPixels, transparentIndex } = ColorQuantizer.quantize(rgba, 16);
        const enc = new GifEncoder(w, h, 0);
        enc.begin();
        enc.addFrame(palette, indexedPixels, transparentIndex, 10);
        const gif = enc.finish();

        const decoded = GifDecoder.decode(gif.buffer.slice(gif.byteOffset, gif.byteOffset + gif.byteLength));
        assert.equal(decoded.width, w);
        assert.equal(decoded.height, h);
        assert.equal(decoded.frames.length, 1);
        const frame = decoded.frames[0];
        for (let i = 0; i < w * h; i++) {
            assert.equal(frame.rgba[i * 4 + 3], 255, `alpha ${i}`);
            // Quantization may shift slightly; red should dominate
            assert.ok(frame.rgba[i * 4] > 200, `R ${frame.rgba[i * 4]}`);
            assert.ok(frame.rgba[i * 4 + 1] < 40, `G`);
            assert.ok(frame.rgba[i * 4 + 2] < 40, `B`);
        }
    });

    it('encode→decode with transparency', () => {
        const w = 4, h = 4;
        const rgba = solidRgba(w, h, 0, 0, 255, 255);
        // Make left half transparent
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < 2; x++) {
                rgba[(y * w + x) * 4 + 3] = 0;
            }
        }
        const { palette, indexedPixels, transparentIndex } = ColorQuantizer.quantize(rgba, 16);
        const enc = new GifEncoder(w, h, 0);
        enc.begin();
        enc.addFrame(palette, indexedPixels, transparentIndex, 5);
        const gif = enc.finish();
        const decoded = GifDecoder.decode(gif.buffer.slice(gif.byteOffset, gif.byteOffset + gif.byteLength));
        const frame = decoded.frames[0];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < 2; x++) {
                assert.equal(frame.rgba[(y * w + x) * 4 + 3], 0, `transparent ${x},${y}`);
            }
            for (let x = 2; x < 4; x++) {
                assert.equal(frame.rgba[(y * w + x) * 4 + 3], 255, `opaque ${x},${y}`);
                assert.ok(frame.rgba[(y * w + x) * 4 + 2] > 200, 'blue channel');
            }
        }
    });

    it('delay centiseconds preserved in GCE / decode timing', () => {
        const w = 2, h = 2;
        const rgba = solidRgba(w, h, 0, 255, 0, 255);
        const { palette, indexedPixels, transparentIndex } = ColorQuantizer.quantize(rgba, 8);
        const delayCs = 25; // 250ms
        const enc = new GifEncoder(w, h, 0);
        enc.begin();
        enc.addFrame(palette, indexedPixels, transparentIndex, delayCs);
        const gif = enc.finish();

        // GCE: 21 F9 04 packed delayLo delayHi trans 00
        let found = false;
        for (let i = 0; i < gif.length - 7; i++) {
            if (gif[i] === 0x21 && gif[i + 1] === 0xF9 && gif[i + 2] === 0x04) {
                const delay = gif[i + 4] | (gif[i + 5] << 8);
                assert.equal(delay, delayCs);
                found = true;
                break;
            }
        }
        assert.ok(found, 'GCE not found');

        const decoded = GifDecoder.decode(gif.buffer.slice(gif.byteOffset, gif.byteOffset + gif.byteLength));
        // Decoder stores delay in ms (centiseconds * 10)
        assert.equal(decoded.frames[0].delay, delayCs * 10);
    });
});
