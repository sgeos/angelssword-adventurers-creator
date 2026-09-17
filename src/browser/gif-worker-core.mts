/**
 * AS Adventurer — GIF encoding, worker-side.
 *
 * The pre-conversion code carried an equivalent encoder as a template literal
 * compiled into a blob URL, which put roughly 150 lines of the hottest code in
 * the project outside the type checker entirely. This module holds the same
 * work as ordinary checked code and reuses the tested GifEncoder rather than
 * restating it.
 *
 * Deliberately free of both DOM and worker globals: the entry point in
 * gif-worker.mts does the message plumbing, which leaves this half checkable
 * by every project and reachable from tests.
 *
 * The caller supplies each frame's bounding box, so this drives GifEncoder's
 * low-level writers rather than addOptimizedFrame, which would recompute a box
 * the caller already knows.
 */
import { GifEncoder, type Rgb } from "./gif-codec.mts";

/** One frame as the main thread packs it: palette indices plus a dirty box. */
export interface WorkerFrame {
    readonly indexed: Uint8Array;
    readonly minX: number;
    readonly minY: number;
    /** Negative maxX marks a fully transparent frame. */
    readonly maxX: number;
    readonly maxY: number;
}

export interface EncodeRequest {
    readonly frames: readonly WorkerFrame[];
    readonly palette: readonly Rgb[];
    readonly transparentIndex: number;
    /** Frame delay in centiseconds, as the GIF format stores it. */
    readonly delay: number;
    readonly width: number;
    readonly height: number;
    readonly totalFrames: number;
}

export type EncodeResponse =
    | { readonly type: 'progress'; readonly frame: number; readonly total: number }
    | { readonly type: 'done'; readonly data: ArrayBuffer };

/** Emit progress every this many frames, and always on the last one. */
const PROGRESS_INTERVAL = 10;

export function encode(
    request: EncodeRequest,
    onProgress: (frame: number, total: number) => void,
): Uint8Array {
    const { frames, palette, transparentIndex, delay, width, height, totalFrames } = request;

    const gif = new GifEncoder(width, height);
    gif.begin();

    const minCodeSize = Math.max(2, Math.ceil(Math.log2(palette.length)));
    const tableSize = 1 << minCodeSize;
    const lctSizeField = minCodeSize - 1;

    const padded: Rgb[] = [...palette];
    while (padded.length < tableSize) {
        padded.push([0, 0, 0] as const);
    }

    for (let fi = 0; fi < totalFrames; fi++) {
        const frame = frames[fi];
        if (frame === undefined) break;

        gif.writeGraphicControlExtension(delay, transparentIndex);

        if (frame.maxX < 0) {
            // Fully transparent frame: a 1x1 placeholder is the smallest legal form.
            gif.writeImageDescriptor(lctSizeField, 0, 0, 1, 1);
            gif.writeColorTable(padded, tableSize);
            gif.writeLZWData(new Uint8Array([transparentIndex]), minCodeSize);
        } else {
            const bw = frame.maxX - frame.minX + 1;
            const bh = frame.maxY - frame.minY + 1;
            const sub = new Uint8Array(bw * bh);
            for (let y = 0; y < bh; y++) {
                for (let x = 0; x < bw; x++) {
                    sub[y * bw + x] = frame.indexed[(frame.minY + y) * width + (frame.minX + x)] ?? 0;
                }
            }
            gif.writeImageDescriptor(lctSizeField, frame.minX, frame.minY, bw, bh);
            gif.writeColorTable(padded, tableSize);
            gif.writeLZWData(sub, minCodeSize);
        }

        if ((fi + 1) % PROGRESS_INTERVAL === 0 || fi === totalFrames - 1) {
            onProgress(fi + 1, totalFrames);
        }
    }

    return gif.finish();
}
