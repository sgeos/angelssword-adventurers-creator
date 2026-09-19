/**
 * A scripted `BinaryHttpClient`, and a clock that counts instead of waiting.
 *
 * The ComfyUI run is a conversation: queue, then poll until the history says
 * the image exists, then retrieve. Testing it means answering differently on
 * successive calls to the same route, which is what `script` below is for.
 *
 * Requests are recorded whole, so a test can assert on what was sent as well
 * as on what came back. The proxy envelope is unwrapped for convenience,
 * since every call this client sees is a POST to one route carrying the real
 * request in its body.
 */

import type {
    BinaryHttpClient,
    BinaryHttpResponse,
    HttpRequest,
} from '../../src/core/ports/http.mts';
import type { Clock } from '../../src/core/ports/clock.mts';

/** One call, with the ComfyUI proxy envelope unwrapped. */
export interface RecordedCall {
    readonly url: string;
    readonly method: string;
    /** The ComfyUI path inside the envelope, when there is one. */
    readonly path: string | undefined;
    /** The method the envelope asks the proxy to use upstream. */
    readonly upstreamMethod: string | undefined;
    /** The envelope's `body` field, which is the real request payload. */
    readonly payload: unknown;
    /** The envelope's `baseUrl`, which is the instance address. */
    readonly baseUrl: string | undefined;
}

/** What a scripted answer looks like. */
export interface ScriptedReply {
    readonly status: number;
    /** JSON-encoded when an object, sent verbatim when a string. */
    readonly body?: unknown;
    /** Returned by `bytes`. Defaults to an empty array. */
    readonly bytes?: Uint8Array<ArrayBuffer>;
}

const envelope = (init?: HttpRequest): Partial<RecordedCall> => {
    if (typeof init?.body !== 'string') return {};
    try {
        const parsed: unknown = JSON.parse(init.body);
        if (typeof parsed !== 'object' || parsed === null) return {};
        const fields: Record<string, unknown> = { ...parsed };
        const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
        return {
            path: str(fields['path']),
            upstreamMethod: str(fields['method']),
            baseUrl: str(fields['baseUrl']),
            payload: fields['body'],
        };
    } catch {
        return {};
    }
};

/**
 * A client answering from a list, in order.
 *
 * Running past the end is a test error rather than a default answer, because
 * a run that made more calls than the script anticipated is a run the test
 * has stopped describing.
 */
export const scriptedHttp = (
    replies: readonly ScriptedReply[],
): { readonly http: BinaryHttpClient; readonly calls: readonly RecordedCall[] } => {
    const calls: RecordedCall[] = [];
    let next = 0;
    // eslint's require-await objects to an async body with nothing to wait
    // for, and promise-function-async objects to dropping `async`. Awaiting a
    // resolved promise satisfies both and makes the fake yield, which a real
    // client does. The same reasoning is written out in ports/clock.mts.
    const http: BinaryHttpClient = async (url, init) => {
        await Promise.resolve();
        calls.push({
            url,
            method: init?.method ?? 'GET',
            path: undefined,
            upstreamMethod: undefined,
            payload: undefined,
            baseUrl: undefined,
            ...envelope(init),
        });
        const reply = replies[next];
        next += 1;
        if (reply === undefined) {
            throw new Error(`scriptedHttp ran out of replies at call ${next.toString()} (${url})`);
        }
        const response: BinaryHttpResponse = {
            status: reply.status,
            text: async () =>
                Promise.resolve(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {})),
            bytes: async () => Promise.resolve(reply.bytes ?? new Uint8Array(new ArrayBuffer(0))),
        };
        return response;
    };
    return { http, calls };
};

/** A clock that records every requested wait and performs none of them. */
export const countingClock = (): { readonly clock: Clock; readonly waits: readonly number[] } => {
    const waits: number[] = [];
    let elapsed = 0;
    return {
        waits,
        clock: {
            now: () => elapsed,
            sleep: async (ms) => {
                waits.push(ms);
                elapsed += ms;
                await Promise.resolve();
            },
        },
    };
};
