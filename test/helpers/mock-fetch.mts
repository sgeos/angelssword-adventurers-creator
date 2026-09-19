/**
 * Injectable fetch mock for the API characterization tests.
 *
 * Pass `mockFetch` to createApp(). There is deliberately no global
 * installer: a global seam ships in the built binary and lets anything
 * loaded earlier intercept requests carrying the user's API keys.
 *
 * The mock satisfies server.mts's FetchLike structurally, with no assertion.
 * That is only possible because FetchLike describes what the proxy actually
 * consumes — a status and a text body — rather than the whole of node-fetch.
 * A mock that has to be cast into place is a mock the compiler has stopped
 * checking.
 */
import FormData from "form-data";
import type { FetchLike, UpstreamInit, UpstreamResponse } from "../../server.mts";

/** One recorded call, for asserting what the proxy sent upstream. */
export interface RecordedCall {
    readonly url: string;
    readonly options: UpstreamInit | undefined;
    readonly method: string;
}

/** A response body may be given as a string or as anything JSON-encodable. */
export interface ResponseSpec {
    readonly status?: number;
    readonly body?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
}

/** The mock's response, which also exposes the header lookup and `ok`. */
export interface MockResponse extends UpstreamResponse {
    readonly ok: boolean;
    readonly headers: { get: (name: string) => string | null };
    json: () => Promise<unknown>;
}

const calls: RecordedCall[] = [];
let nextResponse: MockResponse | null = null;
let nextError: Error | null = null;

export function createResponse(spec: ResponseSpec = {}): MockResponse {
    const { status = 200, body = '{}', headers = {} } = spec;
    const textBody = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: {
            get: (name: string): string | null =>
                headers[name.toLowerCase()] ?? headers[name] ?? null,
        },
        text: async (): Promise<string> => textBody,
        json: async (): Promise<unknown> => JSON.parse(textBody),
    };
}

export const mockFetch: FetchLike = async (url: string, init?: UpstreamInit) => {
    calls.push({ url, options: init, method: init?.method ?? 'GET' });

    if (nextError !== null) {
        const err = nextError;
        nextError = null;
        throw err;
    }

    const response = nextResponse ?? createResponse();
    nextResponse = null;
    return response;
};

export function resetMockFetch(): void {
    calls.length = 0;
    nextResponse = null;
    nextError = null;
}

export function mockFetchResponse(
    status: number,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): void {
    nextResponse = createResponse(
        headers === undefined ? { status, body } : { status, body, headers },
    );
}

export function mockFetchReject(message: string): void {
    nextError = new Error(message);
}

export function getFetchCalls(): readonly RecordedCall[] {
    return calls.slice();
}

export function wasFetchCalled(): boolean {
    return calls.length > 0;
}

/**
 * Read a request body back as a string, so a test can assert on multipart
 * content. UpstreamInit says a body is a string or a form-data FormData, and
 * instanceof on the real class narrows it without an assertion.
 *
 * Synchronous: form-data buffers the whole body, so there is nothing to wait
 * for. It was async when it also handled a raw stream, which nothing sends.
 */
export function getFormBodyString(body: string | FormData | undefined): string {
    if (body === undefined) return '';
    if (typeof body === 'string') return body;
    if (body instanceof FormData) return body.getBuffer().toString('binary');
    return '';
}

/** A recorded call with its options and headers already narrowed. */
export interface ResolvedCall {
    readonly url: string;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string | FormData | undefined;
}

/**
 * The nth recorded call, throwing if it or its options are absent.
 *
 * Tests assert on these constantly, and every step — the array index, the
 * optional init, the optional headers — is legitimately possibly-undefined.
 * Narrowing once here beats three guards at every assertion site, and a
 * missing call fails with a message rather than a chain of type errors.
 */
export function callAt(index = 0): ResolvedCall {
    const call = calls[index];
    if (call === undefined) {
        throw new Error(
            `expected a fetch call at index ${index.toString()}, but ${calls.length.toString()} were recorded`,
        );
    }
    const options = call.options;
    if (options === undefined) {
        throw new Error(`fetch call at index ${index.toString()} was made with no options`);
    }
    return {
        url: call.url,
        method: options.method,
        headers: options.headers ?? {},
        body: options.body,
    };
}

/** Body of a recorded call as a string, for JSON assertions. */
export function callBodyText(index = 0): string {
    const body = callAt(index).body;
    if (typeof body !== 'string') {
        throw new Error(`fetch call at index ${index.toString()} had a non-string body`);
    }
    return body;
}
