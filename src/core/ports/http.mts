/**
 * The network capability.
 *
 * # One interface, two halves of the application
 *
 * The server inverted its outbound fetch before this file existed, as
 * `FetchLike` in `server.mts`, for a reason worth repeating: a parameter is
 * visible only to whoever constructs the app, whereas a global seam lets
 * anything loaded earlier intercept every request, including the ones
 * carrying the user's credentials.
 *
 * The browser half had not inverted it at all. The two are the same
 * capability, so they are now the same interface, and `server.mts` imports
 * this rather than declaring its own.
 *
 * # Why the request body is a type parameter
 *
 * It is the one axis on which the two halves genuinely differ. The browser
 * sends JSON strings. The server additionally sends a multipart stream for
 * the OpenAI edit endpoint, whose type is supplied by node and cannot be
 * named here, the core compiling without the node types.
 *
 * A parameter with a default keeps the common case unadorned and confines
 * the difference to the one declaration that needs it. The alternative, a
 * base interface the server extends, does not work: widening `body` from
 * `string` to `string | FormData` in a subtype is not assignable, which the
 * compiler refuses for the same reason this project wants it to.
 *
 * # What is deliberately absent
 *
 * **No `ok`.** It is `status` in the range 200 to 299 and nothing else, so
 * [`isOk`] derives it. Every member this interface omits is an
 * implementation it does not exclude.
 *
 * **No headers on the response.** Nothing in this application reads one. An
 * interface that describes more than its callers use stops being checkable
 * against a stand-in.
 *
 * **No streaming.** Every call here is a request and a whole answer.
 */

/** What a caller may read from a response. */
export interface HttpResponse {
    /** The status code, from which [`isOk`] derives success. */
    readonly status: number;
    /** The whole body as text. JSON parsing belongs to the caller. */
    readonly text: () => Promise<string>;
}

/**
 * A response whose body may also be read as bytes.
 *
 * Separate from [`HttpResponse`] rather than folded into it, because
 * requiring `bytes` of every implementation would exclude the server's, whose
 * node-fetch response spells the same operation differently. Only the ComfyUI
 * retrieval needs it.
 *
 * Bytes rather than a `Blob` or an `ArrayBuffer`. `Uint8Array` is the
 * language's, so the core can name it; what a caller wraps it in afterwards
 * is the platform's business.
 *
 * The buffer is narrowed to `ArrayBuffer` rather than left as the default
 * `ArrayBufferLike`, which also admits a `SharedArrayBuffer`. That is not
 * pedantry: a caller cannot construct a `Blob` from, or transfer, a shared
 * buffer, and both are things a caller does with these bytes. Promising the
 * narrower one here is what makes the result usable without a check at every
 * use. No implementation is excluded, a response body never being shared.
 */
export interface BinaryHttpResponse extends HttpResponse {
    readonly bytes: () => Promise<Uint8Array<ArrayBuffer>>;
}

/** What a caller may send. */
export interface HttpRequest<Body = string> {
    readonly method: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: Body;
    /**
     * Milliseconds after which the request is abandoned.
     *
     * Optional, and an implementation that cannot honour it must say so
     * rather than ignore it silently. Both implementations in this repository
     * honour it.
     */
    readonly timeout?: number;
}

/** Make a request and read the answer. */
export type HttpClient<Body = string> =
    (url: string, init?: HttpRequest<Body>) => Promise<HttpResponse>;

/**
 * A client whose responses can also yield bytes.
 *
 * Assignable to [`HttpClient`] wherever one is wanted, a stronger return type
 * being what a function type permits.
 */
export type BinaryHttpClient<Body = string> =
    (url: string, init?: HttpRequest<Body>) => Promise<BinaryHttpResponse>;

/**
 * Whether a response reports success.
 *
 * The same rule the Fetch standard applies to its own `ok`, stated once here
 * so that no implementation has to carry the member and no caller has to
 * remember the range.
 */
export const isOk = (response: Pick<HttpResponse, "status">): boolean =>
    response.status >= 200 && response.status <= 299;

/**
 * A response body parsed as JSON, or an empty object when it is not JSON.
 *
 * Every caller in this project narrows what it finds, so there is nothing one
 * could do differently on learning that a body was unparsable rather than
 * merely unhelpful. Collapsing the two is what each call site did by hand,
 * spelled `await resp.json().catch(() => ({}))`, and it was written out four
 * times before it was written once.
 *
 * The return is `unknown` rather than a shape. Narrowing belongs to whoever
 * knows what was asked for.
 */
export const readJson = async (response: HttpResponse): Promise<unknown> => {
    try {
        return JSON.parse(await response.text());
    } catch {
        return {};
    }
};
