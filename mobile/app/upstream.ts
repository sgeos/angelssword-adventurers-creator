/**
 * Sending the upstream request a proxy plan names.
 *
 * The plan is made in the web view, by the same core function the desktop
 * server runs, with its credentials, statuses and security checks already
 * decided. This sends it and nothing else: it does not route, check or
 * interpret. It runs natively because a request from here is not subject to
 * the cross-origin rules a web view's would be.
 *
 * The body comes back as base64 so that a binary response, an image from
 * ComfyUI or a fetched video, crosses the bridge to the web view intact.
 */
import { fetch } from "expo/fetch";
import { encodeMultipart, type UpstreamPlan, type UpstreamResult } from "../../src/core/proxy.mts";

const encoder = new TextEncoder();

const fromBase64 = (base64: string): Uint8Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

export const toBase64 = (bytes: Uint8Array): string => {
    let binary = "";
    // Chunked, so a video of several megabytes does not exceed the argument
    // limit of String.fromCharCode. Each pass advances a fixed step.
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
    return btoa(binary);
};

/** A boundary no part's content contains in practice. Randomness is the platform's to draw. */
const boundary = (): string => `----as-adventurer-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export const sendUpstream = async (plan: UpstreamPlan): Promise<UpstreamResult> => {
    const headers: Record<string, string> = { ...plan.headers };
    let body: string | Uint8Array<ArrayBuffer> | undefined;
    if (plan.body?.kind === "text") {
        body = plan.body.text;
    } else if (plan.body?.kind === "multipart") {
        const marker = boundary();
        body = encodeMultipart(plan.body.parts, marker, (text) => encoder.encode(text), fromBase64);
        headers["Content-Type"] = `multipart/form-data; boundary=${marker}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, plan.timeout);
    try {
        const response = await fetch(plan.url, {
            method: plan.method,
            headers,
            ...(body === undefined ? {} : { body }),
            signal: controller.signal,
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        return { status: response.status, base64: toBase64(bytes) };
    } finally {
        clearTimeout(timer);
    }
};
