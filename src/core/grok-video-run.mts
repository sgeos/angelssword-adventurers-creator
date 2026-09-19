/**
 * Driving a Grok video generation to completion.
 *
 * # What was already here, and what was not
 *
 * `grok-video-core.mts` held every pure part of this exchange: the request
 * shape, the classification of a poll response, the throttle backoff, the
 * limits. All of it was tested. What it did not hold was the loop that uses
 * them, which sat in the video stage beside the progress bar it updates and
 * was therefore reachable from no test.
 *
 * The parts that were easy to extract had been extracted, and the part that
 * needed a clock and a network had not. Inverting those two is what closes
 * the gap, and the shape of this module deliberately matches
 * `comfyui-run.mts`, the two being the same problem.
 *
 * # What crosses the boundary
 *
 * The finished asset arrives from the proxy as base64 inside a JSON body, and
 * leaves here as that same string. Decoding needs `atob`, which the core does
 * not have and does not want: what the bytes become, a `Blob` and an object
 * URL, is the platform's decision anyway.
 *
 * # Why the credential is a parameter
 *
 * It is threaded through every call and never stored here. The proxy holds
 * the outbound credential; this passes the caller's authorization header
 * along so that the proxy can decide. A module that fetched the credential
 * itself would be a second place that knows where credentials live.
 */

import type { Clock } from "./ports/clock.mts";
import type { HttpClient } from "./ports/http.mts";
import { isOk, readJson } from "./ports/http.mts";
import {
    MAX_CONSECUTIVE_THROTTLES,
    MAX_POLL_ATTEMPTS,
    POLL_INTERVAL_MS,
    classifyPoll,
    describeError,
    extractRequestId,
    throttleBackoffMs,
    type GrokVideoRequest,
} from "./grok-video-core.mts";

/** Proxy route that starts a generation. */
export const GROK_START_ROUTE = "/api/xai/videos/generations";

/** Proxy route that retrieves a finished asset, holding the credential. */
export const GROK_FETCH_ROUTE = "/api/xai/video-fetch";

/** Proxy route that reports on one generation. */
export const grokPollRoute = (requestId: string): string =>
    `/api/xai/videos/${encodeURIComponent(requestId)}`;

/** How a generation ended. */
export type GrokOutcome =
    /** The clip is ready, as base64 in whatever container the proxy sent. */
    | { readonly kind: "video"; readonly base64: string }
    /** The caller asked to stop. Not an error. */
    | { readonly kind: "cancelled" }
    /** Every attempt was spent without the clip becoming ready. */
    | { readonly kind: "timedOut"; readonly attempts: number };

/** What a run needs from its caller beyond the request itself. */
export interface GrokRunOptions {
    /** The Authorization header value, passed through to the proxy. */
    readonly auth: string;
    /** The generation request, from `buildGrokVideoRequest`. */
    readonly request: GrokVideoRequest;
    /** Whether the caller has asked to stop. Consulted around every wait. */
    readonly isCancelled?: () => boolean;
    /** Told the attempt number from 1, the milliseconds waited, and the limit. */
    readonly onPoll?: (attempt: number, elapsedMs: number, maxAttempts: number) => void;
    /** Overridable for a test; defaults to the core's own limits. */
    readonly pollIntervalMs?: number;
    readonly maxPolls?: number;
}

/**
 * Retrieve the finished asset through the proxy.
 *
 * Exported so that a test can reach it, and because the retrieval is a
 * distinct failure: the generation succeeded and the download did not, which
 * is worth saying differently from a generation that failed.
 */
export const fetchGrokVideo = async (
    http: HttpClient,
    auth: string,
    url: string,
): Promise<string> => {
    const response = await http(GROK_FETCH_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ url }),
    });
    const payload = await readJson(response);
    if (!isOk(response)) throw new Error(describeError(payload, response.status));

    const encoded = typeof payload === "object" && payload !== null && "data" in payload
        ? { ...payload }.data
        : undefined;
    if (typeof encoded !== "string" || encoded === "") {
        throw new Error("Grok video download returned no data");
    }
    return encoded;
};

/**
 * Start a generation and poll it to a conclusion.
 *
 * Throws for a refusal that leaves nothing to wait for, namely a rejected
 * start, a start that answered without an identifier, a poll classified as
 * fatal or failed, repeated throttling, and a failed retrieval. Cancellation
 * and exhaustion are outcomes rather than exceptions.
 *
 * A throttled poll does not consume an attempt. It backs off by the core's
 * schedule and retries, and only a run of `MAX_CONSECUTIVE_THROTTLES` of them
 * gives up. A poll that is not throttled resets that count, which is what
 * makes it a run rather than a total.
 */
export const runGrokVideo = async (
    http: HttpClient,
    clock: Clock,
    options: GrokRunOptions,
): Promise<GrokOutcome> => {
    const { auth, request } = options;
    const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    const maxPolls = options.maxPolls ?? MAX_POLL_ATTEMPTS;
    const cancelled = (): boolean => options.isCancelled?.() ?? false;

    const started = await http(GROK_START_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(request),
    });
    const startBody = await readJson(started);
    if (!isOk(started)) throw new Error(describeError(startBody, started.status));

    const requestId = extractRequestId(startBody);
    if (requestId === undefined) throw new Error("Grok did not return a generation id");

    let consecutiveThrottles = 0;

    for (let attempt = 0; attempt < maxPolls; attempt++) {
        if (cancelled()) return { kind: "cancelled" };
        await clock.sleep(pollIntervalMs);
        if (cancelled()) return { kind: "cancelled" };

        options.onPoll?.(attempt + 1, (attempt + 1) * pollIntervalMs, maxPolls);

        const polled = await http(grokPollRoute(requestId), {
            method: "GET",
            headers: { Authorization: auth },
        });
        const outcome = classifyPoll(polled.status, await readJson(polled));

        if (outcome.kind === "ready") {
            return { kind: "video", base64: await fetchGrokVideo(http, auth, outcome.url) };
        }
        if (outcome.kind === "fatal" || outcome.kind === "failed") throw new Error(outcome.reason);
        if (outcome.kind === "throttled") {
            consecutiveThrottles += 1;
            if (consecutiveThrottles >= MAX_CONSECUTIVE_THROTTLES) {
                throw new Error("Grok throttled the request repeatedly");
            }
            await clock.sleep(throttleBackoffMs(consecutiveThrottles));
            continue;
        }
        consecutiveThrottles = 0;
    }

    return { kind: "timedOut", attempts: maxPolls };
};
