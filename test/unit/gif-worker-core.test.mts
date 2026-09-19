import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { at } from '../helpers/at.mts';
import type { Rgb } from '../../src/core/gif-codec.mts';
import { GifDecoder } from '../../src/core/gif-codec.mts';
import { encode, type EncodeRequest, type WorkerFrame } from '../../src/core/gif-worker-core.mts';

/**
 * These cover the encoder that replaced the blob-URL worker string. That code
 * was never reachable from a test, because it only existed as a template
 * literal; the point of moving it into a module is that these assertions can
 * exist at all.
 */

const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const CLEAR: Rgb = [0, 0, 0];
/** Index 2 in the palettes below; the encoder writes it as transparent. */
const TRANSPARENT_INDEX = 2;

/** Copy into a definitely-non-shared buffer, which is what decode() takes. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

function frame(width: number, height: number, fill: number): WorkerFrame {
    return {
        indexed: new Uint8Array(width * height).fill(fill),
        minX: 0,
        minY: 0,
        maxX: width - 1,
        maxY: height - 1,
    };
}

function request(frames: readonly WorkerFrame[], width = 4, height = 4): EncodeRequest {
    return {
        frames,
        palette: [RED, GREEN, CLEAR],
        transparentIndex: TRANSPARENT_INDEX,
        delay: 10,
        width,
        height,
        totalFrames: frames.length,
    };
}

describe('gif-worker-core encode', () => {
    it('produces a decodable single-frame GIF with the right dimensions', () => {
        const bytes = encode(request([frame(4, 4, 0)]), () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        assert.equal(decoded.width, 4);
        assert.equal(decoded.height, 4);
        assert.equal(decoded.frames.length, 1);
    });

    it('carries the header, the loop extension, and the trailer', () => {
        const bytes = encode(request([frame(4, 4, 0)]), () => undefined);
        assert.equal(Buffer.from(bytes.subarray(0, 6)).toString('latin1'), 'GIF89a');
        assert.ok(Buffer.from(bytes).includes(Buffer.from('NETSCAPE2.0')));
        assert.equal(at(bytes, bytes.length - 1), 0x3B);
    });

    it('round-trips the pixel data of an opaque frame', () => {
        const bytes = encode(request([frame(4, 4, 0)]), () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        const rgba = at(decoded.frames, 0).rgba;
        assert.equal(at(rgba, 0), 255);
        assert.equal(at(rgba, 1), 0);
        assert.equal(at(rgba, 2), 0);
        assert.equal(at(rgba, 3), 255);
    });

    it('emits every frame it is given', () => {
        const bytes = encode(request([frame(4, 4, 0), frame(4, 4, 1), frame(4, 4, 0)]), () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        assert.equal(decoded.frames.length, 3);
    });

    it('writes a 1x1 placeholder for a fully transparent frame', () => {
        const empty: WorkerFrame = {
            indexed: new Uint8Array(16).fill(TRANSPARENT_INDEX),
            minX: 0, minY: 0, maxX: -1, maxY: -1,
        };
        const bytes = encode(request([empty]), () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        assert.equal(decoded.frames.length, 1);
        assert.equal(at(decoded.frames, 0).width, 1);
        assert.equal(at(decoded.frames, 0).height, 1);
    });

    it('honours a frame bounding box smaller than the canvas', () => {
        const boxed: WorkerFrame = {
            indexed: new Uint8Array(16).fill(0),
            minX: 1, minY: 1, maxX: 2, maxY: 2,
        };
        const bytes = encode(request([boxed]), () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        const f = at(decoded.frames, 0);
        assert.equal(f.left, 1);
        assert.equal(f.top, 1);
        assert.equal(f.width, 2);
        assert.equal(f.height, 2);
    });

    it('reports progress on the last frame even below the interval', () => {
        const seen: number[] = [];
        encode(request([frame(4, 4, 0), frame(4, 4, 1)]), (done) => { seen.push(done); });
        assert.deepEqual(seen, [2]);
    });

    it('reports progress every ten frames and once at the end', () => {
        const frames = Array.from({ length: 25 }, () => frame(4, 4, 0));
        const seen: number[] = [];
        encode(request(frames), (done, total) => {
            assert.equal(total, 25);
            seen.push(done);
        });
        assert.deepEqual(seen, [10, 20, 25]);
    });

    it('stops at totalFrames when it exceeds the frames supplied', () => {
        const supplied = [frame(4, 4, 0)];
        const bytes = encode({ ...request(supplied), totalFrames: 5 }, () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        assert.equal(decoded.frames.length, 1);
    });

    it('pads a short palette up to the colour table size', () => {
        // Three colours need a 2-bit code size, so the table holds four.
        const bytes = encode(request([frame(4, 4, 0)]), () => undefined);
        const decoded = GifDecoder.decode(toArrayBuffer(bytes));
        assert.equal(decoded.frames.length, 1);
    });
});
