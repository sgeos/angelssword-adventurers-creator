/**
 * Running a workflow on a ComfyUI instance.
 *
 * # Why this exists
 *
 * The sequence below was written twice, once in the sprite stage and once in
 * the video stage, and the two copies agreed on every step: upload the
 * reference, queue the graph, poll the history until the save node reports an
 * image, retrieve it. They differed only in which graph was built, how long
 * they were willing to wait, and what they wrapped the result in.
 *
 * None of that is presentation. It is the protocol ComfyUI speaks, which is
 * knowledge worth holding once and testing once. Neither copy was tested,
 * because each sat in a module that needs a browser.
 *
 * # What crosses the boundary
 *
 * The result is bytes. The sprite stage wants a data URI and the video stage
 * wants a `Blob` and an object URL, and both of those are the platform's idea
 * of what to wrap bytes in. Returning `Uint8Array` is what lets one function
 * serve both.
 *
 * The graph arrives already built, and with it the seed that was drawn. The
 * core holds no generator, so a run is reproducible from its inputs and a
 * caller wanting the same image twice passes the same seed.
 *
 * # Cancellation and progress
 *
 * Both are plain callbacks rather than capabilities. A capability is
 * something the platform supplies because the core cannot have it; these are
 * something the caller supplies because only the caller knows the answer.
 *
 * Cancellation is checked before and after each wait, which is what both
 * copies did. It is an outcome rather than an exception, because a user
 * asking to stop is not an error, and a timeout is an outcome for the same
 * reason: the caller decides what to say about it.
 */

import type { BinaryHttpClient } from "./ports/http.mts";
import type { Clock } from "./ports/clock.mts";
import { isOk, readJson } from "./ports/http.mts";
import { extractHistoryImages, extractPromptId, viewQuery, type BuiltWorkflow } from "./comfyui-core.mts";
import { responseErrorMessage } from "./api.mts";

/**
 * The local proxy route, which both provider tables name.
 *
 * They named it separately, as `imageRoute` on the sprite provider and
 * `generateRoute` on the video provider, and the two strings were equal. The
 * server exposes one ComfyUI route; this is it.
 */
export const COMFY_PROXY_ROUTE = "/api/comfyui/proxy";

/** One call to a ComfyUI instance, wrapped for the local proxy. */
export const comfyCall = async (
    http: BinaryHttpClient,
    baseUrl: string,
    path: string,
    method: string,
    body?: unknown,
): ReturnType<BinaryHttpClient> =>
    http(COMFY_PROXY_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, path, method, body }),
    });

/**
 * The filename ComfyUI assigned to an uploaded image, if it accepted one.
 *
 * ComfyUI answers an upload with `{ name }`, and may rename to avoid a
 * collision, so the name it reports is the one the graph must use and not the
 * one that was sent.
 */
export const uploadedName = (body: unknown): string | undefined => {
    if (typeof body !== "object" || body === null || !("name" in body)) return undefined;
    const name: unknown = { ...body }.name;
    return typeof name === "string" && name !== "" ? name : undefined;
};

/** Upload one image, answering with the name ComfyUI gave it. */
export const uploadReference = async (
    http: BinaryHttpClient,
    baseUrl: string,
    dataUri: string,
    filename: string,
): Promise<string | undefined> => {
    const response = await comfyCall(http, baseUrl, "/upload/image", "POST", {
        image: dataUri,
        filename,
    });
    if (!isOk(response)) return undefined;
    return uploadedName(await readJson(response));
};

/** How a run ended. */
export type RunOutcome =
    /** The save node produced an image, and here are its bytes. */
    | { readonly kind: "image"; readonly bytes: Uint8Array<ArrayBuffer> }
    /** The caller asked to stop. Not an error. */
    | { readonly kind: "cancelled" }
    /** Every attempt was spent without the save node reporting anything. */
    | { readonly kind: "timedOut"; readonly attempts: number };

/** What a run needs from its caller beyond the graph itself. */
export interface RunOptions {
    /** The instance address, as the proxy expects it. */
    readonly baseUrl: string;
    /**
     * The graph to queue, and the node whose output the history is searched
     * for. Taken as the pair the builders already return, rather than as two
     * fields a caller could mismatch.
     */
    readonly built: BuiltWorkflow;
    /** Milliseconds between polls. */
    readonly pollIntervalMs: number;
    /** How many polls before giving up. */
    readonly maxPolls: number;
    /** Whether the caller has asked to stop. Consulted around every wait. */
    readonly isCancelled?: () => boolean;
    /** Told the attempt number, from 1, and the milliseconds waited so far. */
    readonly onPoll?: (attempt: number, elapsedMs: number) => void;
}

/**
 * Queue a workflow and wait for its image.
 *
 * Throws only for a refusal that leaves nothing to wait for, namely a queue
 * that was rejected, a queue that answered without a prompt identifier, and a
 * retrieval that failed after the history said the image existed. Everything
 * else is an outcome.
 *
 * A failed poll is not an error and does not consume the run. ComfyUI answers
 * a history request for a job it has not started with a non-success status,
 * which both copies treated as "not yet" by continuing, and so does this.
 */
export const runWorkflow = async (
    http: BinaryHttpClient,
    clock: Clock,
    options: RunOptions,
): Promise<RunOutcome> => {
    const { baseUrl, built, pollIntervalMs, maxPolls } = options;
    const cancelled = (): boolean => options.isCancelled?.() ?? false;

    const queued = await comfyCall(http, baseUrl, "/prompt", "POST", { prompt: built.workflow });
    const queuedBody = await readJson(queued);
    if (!isOk(queued)) {
        throw new Error(
            responseErrorMessage(queuedBody) ?? `ComfyUI refused the job (${queued.status.toString()})`,
        );
    }
    const promptId = extractPromptId(queuedBody);
    if (promptId === undefined) throw new Error("ComfyUI did not return a prompt id");

    for (let attempt = 0; attempt < maxPolls; attempt++) {
        if (cancelled()) return { kind: "cancelled" };
        await clock.sleep(pollIntervalMs);
        if (cancelled()) return { kind: "cancelled" };

        options.onPoll?.(attempt + 1, (attempt + 1) * pollIntervalMs);

        const polled = await comfyCall(http, baseUrl, `/history/${promptId}`, "GET");
        if (!isOk(polled)) continue;
        const image = extractHistoryImages(await readJson(polled), promptId, built.saveNodeId)[0];
        if (image === undefined) continue;

        const view = await comfyCall(http, baseUrl, `/view?${viewQuery(image)}`, "GET");
        if (!isOk(view)) throw new Error("ComfyUI produced an image that could not be retrieved");
        return { kind: "image", bytes: await view.bytes() };
    }

    return { kind: "timedOut", attempts: maxPolls };
};
