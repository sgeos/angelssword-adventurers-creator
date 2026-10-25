/**
 * The network capability, over the Fetch standard.
 *
 * # What this adapter adds
 *
 * Three things, each of which was absent at every one of the call sites it
 * replaces.
 *
 * **A response shape the core can name.** `Response` carries far more than
 * this application reads, and none of it can be named in the core. The
 * adapter exposes the status, the text, and the bytes.
 *
 * **A timeout that is honoured.** The capability declares one, and an
 * implementation that ignored it silently would be worse than one that did
 * not offer it. `AbortSignal.timeout` supplies it here. No browser caller
 * passes one today, so nothing changes behaviour; the point is that a caller
 * who passes one gets it.
 *
 * **A single place where a network failure has a shape.** `fetch` rejects on
 * a transport failure rather than returning a status, which is a different
 * control path from a failed request. That distinction is preserved rather
 * than smoothed over, because a caller that cannot reach the server and one
 * that reached it and was refused want different messages.
 *
 * # What this adapter does not do
 *
 * It does not parse, retry, or interpret a status. Those belong to the core.
 */

import type { BinaryHttpClient, HttpRequest } from "../core/ports/http.mts";

/**
 * A client over the page's own `fetch`.
 *
 * Returns a binary-capable response, because the browser's `Response` can
 * always produce bytes and the ComfyUI retrieval needs them. It remains
 * usable wherever the weaker `HttpClient` is wanted.
 */
const fetchTransport: BinaryHttpClient = async (
    url: string,
    init?: HttpRequest,
) => {
    const request: RequestInit = {
        method: init?.method ?? "GET",
        ...(init?.headers === undefined ? {} : { headers: { ...init.headers } }),
        ...(init?.body === undefined ? {} : { body: init.body }),
        ...(init?.timeout === undefined ? {} : { signal: AbortSignal.timeout(init.timeout) }),
    };
    const response = await fetch(url, request);
    return {
        status: response.status,
        text: async () => response.text(),
        bytes: async () => new Uint8Array(await response.arrayBuffer()),
    };
};

let transport: BinaryHttpClient = fetchTransport;

/**
 * The page's network client.
 *
 * Every call goes through the current transport, which is `fetch` unless a
 * host has replaced it. The mobile application replaces it, because inside its
 * web view there is no local server to answer `/api` routes: its transport plans
 * each route on the page and sends only the upstream request to the native
 * side. See `in-page-proxy.mts`.
 */
export const browserHttp: BinaryHttpClient = async (url: string, init?: HttpRequest) => transport(url, init);

/** The transport `browserHttp` uses before any host replaces it. */
export const pageFetch: BinaryHttpClient = fetchTransport;

/**
 * Replace the transport. Called once, at start-up, by a host that has no
 * server behind the page. Deliberately a call rather than a global a script
 * could set, so that only code inside the module graph can redirect requests
 * that carry the user's keys.
 */
export const setHttpTransport = (next: BinaryHttpClient): void => {
    transport = next;
};
