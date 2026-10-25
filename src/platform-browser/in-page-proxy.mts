/**
 * The `/api` routes, answered inside the page, for a host with no server.
 *
 * The mobile application runs the stages in a web view with no local proxy
 * behind it. This transport takes the place of one. Each `/api` call is
 * planned by the same core function the Express server runs, so every status,
 * message and security check is the server's. A plan that refuses is answered
 * here. A plan that forwards is handed to the host, which makes the one
 * upstream request natively, where no cross-origin rule applies, and returns
 * the status and the bytes.
 *
 * The plan is made here rather than on the native side because its checks
 * parse URLs, and the web view has the browser's WHATWG parser, the same one
 * its network stack would use. The native JavaScript engine's URL support is
 * incomplete, and a security check must not run on a different parser from
 * the one that decides where a request goes.
 *
 * There are no operator credentials on a phone, so the plan's environment is
 * empty and every key is the one the user saved.
 */
import type { BinaryHttpClient, BinaryHttpResponse, HttpRequest } from "../core/ports/http.mts";
import {
    NO_ENVIRONMENT,
    failureReply,
    planProxyRequest,
    replyText,
    shapeReply,
    type UpstreamPlan,
    type UpstreamResult,
    type UrlParser,
} from "../core/proxy.mts";

export type { UpstreamResult };

export type UpstreamSender = (plan: UpstreamPlan) => Promise<UpstreamResult>;

/** The page's own WHATWG URL parser. */
export const pageUrlParser: UrlParser = (raw) => {
    try {
        const url = new URL(raw);
        return { protocol: url.protocol, hostname: url.hostname, origin: url.origin };
    } catch {
        return undefined;
    }
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const bytesFromBase64 = (base64: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const respond = (status: number, text: string, bytes: Uint8Array<ArrayBuffer>): BinaryHttpResponse => ({
    status,
    text: async () => Promise.resolve(text),
    bytes: async () => Promise.resolve(bytes),
});

const textResponse = (status: number, text: string): BinaryHttpResponse =>
    respond(status, text, encoder.encode(text));

/** Header lookup without regard to case, as HTTP defines it. */
const header = (init: HttpRequest | undefined, name: string): string | undefined => {
    const headers = init?.headers;
    if (headers === undefined) return undefined;
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === wanted && value !== "") return value;
    }
    return undefined;
};

/** The request body as the server's JSON parser would have produced it. */
const parsedBody = (init: HttpRequest | undefined): unknown => {
    const body = init?.body;
    if (body === undefined || body === "") return undefined;
    try {
        const parsed: unknown = JSON.parse(body);
        return parsed;
    } catch {
        return undefined;
    }
};

/**
 * A transport for `browserHttp`: `/api` calls are planned here and their
 * upstream requests sent through `send`; anything else goes to `other`.
 */
export const inPageProxy = (send: UpstreamSender, other: BinaryHttpClient): BinaryHttpClient =>
    async (url, init) => {
        const target = new URL(url, location.href);
        const sameOrigin = target.origin === location.origin;
        if (!sameOrigin || !target.pathname.startsWith("/api/")) return other(url, init);

        const plan = planProxyRequest(
            {
                method: init?.method ?? "GET",
                path: target.pathname,
                queryKey: target.searchParams.get("key") ?? undefined,
                authorization: header(init, "authorization"),
                apiKey: header(init, "x-api-key"),
                body: parsedBody(init),
            },
            NO_ENVIRONMENT,
            pageUrlParser,
        );

        if (plan.kind === "no-route") return textResponse(404, JSON.stringify({ error: `No route for ${target.pathname}` }));
        if (plan.kind === "reply") {
            const r = replyText(plan.reply);
            return textResponse(r.status, r.text);
        }
        try {
            const result = await send(plan.upstream);
            const bytes = bytesFromBase64(result.base64);
            const shaped = shapeReply(plan.upstream.reply, result.status, decoder.decode(bytes));
            // A relayed body keeps its exact bytes, which an image needs. A
            // reshaped one is the JSON the shape produced.
            return plan.upstream.reply === "relay"
                ? respond(shaped.status, shaped.text, bytes)
                : textResponse(shaped.status, shaped.text);
        } catch (err) {
            const failed = failureReply(err);
            return textResponse(failed.status, failed.text);
        }
    };
