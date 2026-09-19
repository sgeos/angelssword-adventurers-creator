/**
 * Reading binary payloads the browser already holds.
 *
 * # Why these are not the network capability
 *
 * All three callers of `fetch` that end up here are reading something the
 * browser is already holding, not making a request the core would reason
 * about. Two of them fetch an object URL, which is a lookup in the page's own
 * blob registry and never touches a network. The third reads a file shipped
 * beside the page.
 *
 * Forcing them through the `HttpClient` port would be worse, not better. That
 * port yields bytes, deliberately, so that the core can name the type. A
 * `Blob` fetched from an object URL carries its media type, and rebuilding one
 * from bytes would mean guessing it back. The type is the whole reason the
 * caller wanted a `Blob`.
 *
 * # What this file is for
 *
 * It is a home, so that `fetch` is reachable from two named files rather than
 * from anywhere, which is what `eslint.config.mjs` enforces. The rule is the
 * same one that confines `localStorage` to its adapter: a capability gets one
 * place, and a second reach has to be argued for.
 */

/**
 * The blob at a URL, keeping the media type the source reports.
 *
 * Used for object URLs handed between pipeline stages. A rejection means the
 * URL has been revoked or never existed, which callers treat as a reason to
 * fall back rather than as a failure.
 */
export const fetchBlob = async (url: string): Promise<Blob> => {
    const response = await fetch(url);
    return response.blob();
};

/** The bytes at a URL, for a decoder that wants a buffer. */
export const fetchArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    return response.arrayBuffer();
};
