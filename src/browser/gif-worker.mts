/**
 * AS Adventurer — GIF encoding worker entry point.
 *
 * Message plumbing only. The encoding itself lives in gif-worker-core.mts,
 * which is free of worker globals so every project can check it and tests can
 * call it directly. Compiled by tsconfig.worker.json, which supplies the
 * WebWorker lib that this file — and only this file — needs.
 */
import { encode, type EncodeRequest, type EncodeResponse } from "../core/gif-worker-core.mts";

self.addEventListener('message', (event: MessageEvent<EncodeRequest>): void => {
    const post = (message: EncodeResponse, transfer?: readonly Transferable[]): void => {
        if (transfer === undefined) self.postMessage(message);
        else self.postMessage(message, [...transfer]);
    };

    const result = encode(event.data, (frame, total) => {
        post({ type: 'progress', frame, total });
    });

    // finish() returns a freshly sliced array, so its buffer is exactly sized
    // and unaliased and can be transferred rather than copied. A
    // SharedArrayBuffer cannot be transferred, so that case copies instead.
    let payload: ArrayBuffer;
    if (result.buffer instanceof ArrayBuffer) {
        payload = result.buffer;
    } else {
        payload = new ArrayBuffer(result.byteLength);
        new Uint8Array(payload).set(result);
    }
    post({ type: 'done', data: payload }, [payload]);
});
