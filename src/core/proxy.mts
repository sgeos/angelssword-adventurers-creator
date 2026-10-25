/**
 * The proxy's decisions, without a server.
 *
 * Every outbound call the application makes goes through a route under `/api`.
 * On the desktop those routes are an Express server. On a phone there is no
 * server, and the same decisions have to be made on the device. So each route
 * is a pure function from what was asked to a plan: either a reply to give at
 * once, such as a 401 for a missing key, or the one upstream request to make
 * and how to turn its response into the reply.
 *
 * The plans carry the security decisions the routes exist for, and that is the
 * main reason for one implementation rather than two. A video is fetched with
 * the user's credential only from xAI's own hosts. A ComfyUI request reaches
 * only the local network, and only the endpoints the client uses. Both rules
 * were written after upstream's versions turned the local server into an
 * actuator for any page the user had open.
 *
 * Executing a plan is the platform's business: the server uses node's fetch
 * with a form-data stream, the phone uses its own network stack. Neither
 * re-decides anything.
 *
 * URL parsing is a parameter because the core sees no platform, and the
 * WHATWG URL parser is a platform facility. A hand-written parser is not an
 * option for a security check, where a disagreement between the check's parser
 * and the network stack's is the vulnerability.
 */
import { OPENAI_SPRITE_MODEL } from "./providers.mts";

// ─── Inputs ─────────────────────────────────────────────────────────────

/** The parts of a parsed URL the checks read. */
export interface ParsedUrl {
    readonly protocol: string;
    readonly hostname: string;
    readonly origin: string;
}

/** Parse an absolute URL, or `undefined` when it is not one. */
export type UrlParser = (raw: string) => ParsedUrl | undefined;

/** What a route was asked. Header and query values arrive already reduced to single strings. */
export interface ProxyRequest {
    readonly method: string;
    /** The path below the origin, beginning `/api/`, without a query string. */
    readonly path: string;
    /** The `key` query parameter, which the Gemini routes accept. */
    readonly queryKey: string | undefined;
    readonly authorization: string | undefined;
    /** The `x-api-key` header, which the Gemini routes accept. */
    readonly apiKey: string | undefined;
    /** The parsed JSON body, or `undefined` when there was none. */
    readonly body: unknown;
}

/**
 * Credentials and addresses the operator configured, used when the request
 * carries none. Empty on a phone, where every key is the user's own.
 */
export interface ProxyEnvironment {
    readonly openaiKey: string | undefined;
    readonly xaiKey: string | undefined;
    readonly googleKey: string | undefined;
    readonly comfyUrl: string | undefined;
}

export const NO_ENVIRONMENT: ProxyEnvironment = {
    openaiKey: undefined,
    xaiKey: undefined,
    googleKey: undefined,
    comfyUrl: undefined,
};

// ─── Outputs ────────────────────────────────────────────────────────────

/** One part of a multipart upload. A file travels as base64 until the platform sends it. */
export type MultipartPart =
    | { readonly kind: "field"; readonly name: string; readonly value: string }
    | {
          readonly kind: "file";
          readonly name: string;
          readonly filename: string;
          readonly contentType: string;
          readonly base64: string;
      };

export type UpstreamBody =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "multipart"; readonly parts: readonly MultipartPart[] };

/**
 * How the upstream response becomes the reply.
 *
 * `relay` passes the status and the body's exact bytes through, with the
 * upstream's content type. `videoData` wraps a successful body, base64
 * encoded, as `{ data }`, and turns any other status into an error.
 */
export type ReplyShape = "relay" | "videoData";

export interface UpstreamPlan {
    readonly url: string;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: UpstreamBody | undefined;
    /** Milliseconds. */
    readonly timeout: number;
    readonly reply: ReplyShape;
    /** For logs. Never contains a credential. */
    readonly label: string;
}

/** A JSON reply. */
export interface ProxyReply {
    readonly status: number;
    readonly body: Readonly<Record<string, unknown>>;
}

export type ProxyPlan =
    | { readonly kind: "reply"; readonly reply: ProxyReply; readonly warning: string | undefined }
    | { readonly kind: "forward"; readonly upstream: UpstreamPlan; readonly warnings: readonly string[] }
    | { readonly kind: "no-route" };

const reply = (status: number, body: Readonly<Record<string, unknown>>, warning?: string): ProxyPlan => ({
    kind: "reply",
    reply: { status, body },
    warning,
});

const forward = (upstream: UpstreamPlan, warnings: readonly string[] = []): ProxyPlan => ({
    kind: "forward",
    upstream,
    warnings,
});

// ─── Small parsers ──────────────────────────────────────────────────────

/** A non-empty string, or `undefined`. Anything else is refused, never coerced. */
export const singleString = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * The credential for an upstream call. A request header wins, so a key held
 * only on the client never has to reach the server's configuration.
 */
export const resolveAuth = (header: string | undefined, envKey: string | undefined): string | undefined => {
    const fromHeader = singleString(header);
    if (fromHeader !== undefined) return fromHeader;
    const fromEnv = singleString(envKey);
    return fromEnv === undefined ? undefined : `Bearer ${fromEnv}`;
};

/**
 * The JSON text forwarded for a request body. An absent body is forwarded as
 * `{}`, which is what the server sent before Express 5 changed the default.
 */
export const forwardedJson = (body: unknown): string => JSON.stringify(body ?? {});

const fieldsOf = (body: unknown): Readonly<Record<string, unknown>> =>
    typeof body === "object" && body !== null ? { ...body } : {};

// ─── The security checks ────────────────────────────────────────────────

/**
 * Hosts a generated video may be fetched from with the caller's credential.
 * Failing closed: a host not listed is refused rather than fetched.
 */
const XAI_VIDEO_HOSTS: readonly string[] = ["x.ai", "api.x.ai", "assets.x.ai", "imgen.x.ai"];

export const isAllowedVideoUrl = (raw: string, parse: UrlParser): boolean => {
    const parsed = parse(raw);
    if (parsed?.protocol !== "https:") return false;
    return XAI_VIDEO_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
};

/** The ComfyUI endpoints and methods the client needs, and no others. */
const COMFY_ALLOWED_PATHS: Readonly<Record<string, readonly string[]>> = {
    "/prompt": ["POST"],
    "/history": ["GET"],
    "/view": ["GET"],
    "/system_stats": ["GET"],
    "/upload/image": ["POST"],
};

export const isAllowedComfyRequest = (rawPath: string, method: string): boolean => {
    // /history/<id> is the only parameterised form; everything else is exact.
    const base = rawPath.startsWith("/history/") ? "/history" : rawPath;
    const allowed = COMFY_ALLOWED_PATHS[base];
    return allowed?.includes(method.toUpperCase()) === true;
};

/**
 * Reduce a ComfyUI address to an origin on the local network, or reject it.
 * Loopback and the private ranges are permitted and nothing else is.
 */
export const normaliseComfyOrigin = (raw: string, parse: UrlParser): string | undefined => {
    const trimmed = raw.trim().replace(/\/$/, "");
    // A common typo writes the port as a path. Repair it before parsing.
    const repaired = trimmed.replace(/^(https?:\/\/[^/:]+)\/(\d+)$/i, "$1:$2");
    const url = parse(repaired);
    if (url === undefined) return undefined;
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const host = url.hostname;
    const isPrivate =
        host === "localhost"
        || host === "127.0.0.1"
        || host === "::1"
        || host === "comfyui"
        || host.endsWith(".local")
        || host.startsWith("10.")
        || host.startsWith("192.168.")
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    return isPrivate ? url.origin : undefined;
};

// ─── Image edits ────────────────────────────────────────────────────────

/** A reference image entry: a base64 string, or `{ label, data }`. */
type ImageEntry =
    | { readonly kind: "image"; readonly data: string; readonly label: string | undefined }
    | { readonly kind: "invalid" };

const classifyImage = (entry: unknown): ImageEntry => {
    if (typeof entry === "string" && entry.length > 0) return { kind: "image", data: entry, label: undefined };
    if (typeof entry === "object" && entry !== null && "data" in entry) {
        const data: unknown = entry.data;
        if (typeof data === "string" && data.length > 0) {
            const label: unknown = "label" in entry ? entry.label : undefined;
            return { kind: "image", data, label: typeof label === "string" ? label : undefined };
        }
    }
    return { kind: "invalid" };
};

const planEdits = (body: unknown, authHeader: string): ProxyPlan => {
    if (typeof body !== "object" || body === null) return reply(400, { error: "Body must be a JSON object" });
    const fields = fieldsOf(body);
    const promptText = singleString(fields["prompt"]);
    if (promptText === undefined) return reply(400, { error: "prompt is required" });

    const parts: MultipartPart[] = [
        { kind: "field", name: "model", value: singleString(fields["model"]) ?? OPENAI_SPRITE_MODEL },
        { kind: "field", name: "prompt", value: promptText },
    ];
    // Only a string or a finite number is forwarded. `String(unknown)` would
    // happily send "[object Object]" upstream.
    const count = fields["n"];
    if (typeof count === "number" && Number.isFinite(count)) parts.push({ kind: "field", name: "n", value: count.toString() });
    else if (typeof count === "string") parts.push({ kind: "field", name: "n", value: count });
    const sizeText = singleString(fields["size"]);
    if (sizeText !== undefined) parts.push({ kind: "field", name: "size", value: sizeText });
    const qualityText = singleString(fields["quality"]);
    if (qualityText !== undefined) parts.push({ kind: "field", name: "quality", value: qualityText });

    const warnings: string[] = [];
    const images = fields["images"];
    if (Array.isArray(images)) {
        images.forEach((entry: unknown, index) => {
            const classified = classifyImage(entry);
            if (classified.kind === "invalid") {
                warnings.push(`entry ${index.toString()} skipped: not a base64 string or { data }`);
                return;
            }
            const source = classified.data;
            // Strip a data-URI prefix if present.
            const commaAt = source.indexOf(",");
            parts.push({
                kind: "file",
                name: "image[]",
                filename: `${classified.label ?? `ref${index.toString()}`}.png`,
                contentType: "image/png",
                base64: commaAt === -1 ? source : source.slice(commaAt + 1),
            });
        });
    }

    return forward(
        {
            url: "https://api.openai.com/v1/images/edits",
            method: "POST",
            headers: { Authorization: authHeader },
            body: { kind: "multipart", parts },
            timeout: 300_000,
            reply: "relay",
            label: "OpenAI /v1/images/edits",
        },
        warnings,
    );
};

// ─── The routes ─────────────────────────────────────────────────────────

const XAI_API_BASE = "https://api.x.ai/v1";
const OPENAI_API_BASE = "https://api.openai.com/v1";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const json = (text: string): UpstreamBody => ({ kind: "text", text });
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** A POST that forwards the request's JSON body unchanged with a bearer key. */
const bearerJson = (url: string, authHeader: string, body: unknown, timeout: number, label: string): ProxyPlan =>
    forward({
        url,
        method: "POST",
        headers: { ...JSON_HEADERS, Authorization: authHeader },
        body: json(forwardedJson(body)),
        timeout,
        reply: "relay",
        label,
    });

const XAI_POLL = /^\/api\/xai\/videos\/([^/]+)$/;

/**
 * A path segment decoded as Express decodes a route parameter. A malformed
 * escape gives `undefined`, which the route answers with a 400, where an
 * uncaught `decodeURIComponent` would have thrown out of the plan.
 */
const decodeSegment = (segment: string): string | undefined => {
    try {
        return decodeURIComponent(segment);
    } catch {
        return undefined;
    }
};

/**
 * Plan one proxy request.
 *
 * Route by route this is what `server.mts` did inline, including every status
 * and message, which the server's tests pin. `no-route` means no route matched
 * the method and path, which the server answers by falling through to the
 * static files.
 */
export const planProxyRequest = (request: ProxyRequest, env: ProxyEnvironment, parse: UrlParser): ProxyPlan => {
    const method = request.method.toUpperCase();
    const { path, body } = request;

    if (method === "POST" && path === "/api/generate") {
        const auth = resolveAuth(request.authorization, env.openaiKey);
        if (auth === undefined) return reply(401, { error: "No Authorization header provided" });
        return bearerJson(`${OPENAI_API_BASE}/images/generations`, auth, body, 300_000, "OpenAI /v1/images/generations");
    }

    if (method === "POST" && path === "/api/edits") {
        const auth = resolveAuth(request.authorization, env.openaiKey);
        if (auth === undefined) return reply(401, { error: "No Authorization header provided" });
        return planEdits(body, auth);
    }

    if (method === "POST" && path === "/api/chat") {
        const auth = resolveAuth(request.authorization, env.openaiKey);
        if (auth === undefined) return reply(401, { error: "No Authorization header provided" });
        return bearerJson(`${OPENAI_API_BASE}/chat/completions`, auth, body, 30_000, "OpenAI /v1/chat/completions");
    }

    if (method === "POST" && path === "/api/xai/images/generations") {
        const auth = resolveAuth(request.authorization, env.xaiKey);
        if (auth === undefined) return reply(401, { error: "No xAI API key provided" });
        return bearerJson(`${XAI_API_BASE}/images/generations`, auth, body, 300_000, "xAI /v1/images/generations");
    }

    if (method === "POST" && path === "/api/xai/videos/generations") {
        const auth = resolveAuth(request.authorization, env.xaiKey);
        if (auth === undefined) return reply(401, { error: "No xAI API key provided" });
        return bearerJson(`${XAI_API_BASE}/videos/generations`, auth, body, 600_000, "xAI /v1/videos/generations");
    }

    const poll = method === "GET" ? XAI_POLL.exec(path) : null;
    if (poll !== null) {
        const auth = resolveAuth(request.authorization, env.xaiKey);
        if (auth === undefined) return reply(401, { error: "No xAI API key provided" });
        const id = singleString(decodeSegment(poll[1] ?? ""));
        if (id === undefined) return reply(400, { error: "No generation id provided" });
        return forward({
            url: `${XAI_API_BASE}/videos/${encodeURIComponent(id)}`,
            method: "GET",
            headers: { Authorization: auth },
            body: undefined,
            timeout: 60_000,
            reply: "relay",
            label: "xAI /v1/videos/:id",
        });
    }

    if (method === "POST" && path === "/api/xai/video-fetch") {
        const auth = resolveAuth(request.authorization, env.xaiKey);
        if (auth === undefined) return reply(401, { error: "No xAI API key provided" });
        const url = singleString(fieldsOf(body)["url"]);
        if (url === undefined) return reply(400, { error: "No video url provided" });
        if (!isAllowedVideoUrl(url, parse)) {
            return reply(
                400,
                { error: "Refusing to fetch a video from a host outside the allowlist" },
                "Refused video fetch for a host outside the allowlist",
            );
        }
        return forward({
            url,
            method: "GET",
            headers: { Authorization: auth },
            body: undefined,
            timeout: 300_000,
            reply: "videoData",
            label: "xAI video fetch",
        });
    }

    if (method === "POST" && path === "/api/comfyui/proxy") {
        const fields = fieldsOf(body);
        const baseUrl = singleString(fields["baseUrl"]) ?? env.comfyUrl;
        const origin = baseUrl === undefined ? undefined : normaliseComfyOrigin(baseUrl, parse);
        if (origin === undefined) return reply(400, { error: "ComfyUI address must be on the local network" });

        const rawPath = singleString(fields["path"]) ?? "/";
        const targetPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
        const targetMethod = (singleString(fields["method"]) ?? "GET").toUpperCase();
        if (!isAllowedComfyRequest(targetPath.split("?")[0] ?? "", targetMethod)) {
            return reply(
                400,
                { error: `Refusing to proxy ${targetMethod} ${targetPath}` },
                `Refused ${targetMethod} ${targetPath}`,
            );
        }
        const bodyless = targetMethod === "GET" || targetMethod === "HEAD";
        return forward({
            url: `${origin}${targetPath}`,
            method: targetMethod,
            headers: bodyless ? {} : JSON_HEADERS,
            body: bodyless ? undefined : json(JSON.stringify(fields["body"])),
            timeout: bodyless ? 120_000 : 600_000,
            reply: "relay",
            label: `ComfyUI ${targetMethod} ${targetPath}`,
        });
    }

    if (method === "POST" && (path === "/api/video/generate" || path === "/api/video/poll")) {
        const apiKey = singleString(request.apiKey) ?? singleString(request.queryKey) ?? singleString(env.googleKey);
        if (apiKey === undefined) return reply(401, { error: "No Google API key provided" });
        if (path === "/api/video/generate") {
            return forward({
                url: `${GEMINI_API_BASE}/interactions?key=${apiKey}`,
                method: "POST",
                headers: JSON_HEADERS,
                body: json(forwardedJson(body)),
                timeout: 600_000,
                reply: "relay",
                label: "Gemini Interactions",
            });
        }
        const operationName = singleString(fieldsOf(body)["operationName"]);
        if (operationName === undefined) return reply(400, { error: "No operationName provided" });
        return forward({
            url: `${GEMINI_API_BASE}/${operationName}?key=${apiKey}`,
            method: "GET",
            headers: {},
            body: undefined,
            timeout: 30_000,
            reply: "relay",
            label: "Gemini operation poll",
        });
    }

    return { kind: "no-route" };
};

// ─── Turning the upstream response into the reply ───────────────────────

/** A reply as status and JSON text, ready to send. */
export interface TextReply {
    readonly status: number;
    readonly text: string;
}

export const replyText = (r: ProxyReply): TextReply => ({ status: r.status, text: JSON.stringify(r.body) });

/** A reply whose body is either JSON text or bytes to pass through unchanged. */
export interface ShapedReply {
    readonly status: number;
    readonly body: string | Uint8Array<ArrayBuffer>;
    readonly contentType: string;
}

/**
 * The reply for an upstream response's status and body, by the plan's shape.
 *
 * Takes the body as bytes. It used to take text, which both callers produced
 * by decoding the body as UTF-8, and that corrupted every binary body: an
 * image ComfyUI returns through the relay, and the Grok video download, whose
 * client expects base64 and was handed the video's bytes decoded as text.
 * Base64 encoding is a platform facility, so the encoder is a parameter.
 */
export const shapeReply = (
    shape: ReplyShape,
    status: number,
    body: Uint8Array<ArrayBuffer>,
    contentType: string | undefined,
    toBase64: (bytes: Uint8Array<ArrayBuffer>) => string,
): ShapedReply => {
    if (shape === "relay") return { status, body, contentType: contentType ?? "application/json" };
    if (status !== 200) {
        const r = replyText({ status, body: { error: `Failed to fetch video: ${status.toString()}` } });
        return { status: r.status, body: r.text, contentType: "application/json" };
    }
    return { status: 200, body: JSON.stringify({ data: toBase64(body) }), contentType: "application/json" };
};

/** The reply when the upstream request itself failed. */
export const failureReply = (err: unknown): TextReply =>
    replyText({ status: 502, body: { error: `Proxy error: ${err instanceof Error ? err.message : "unknown error"}` } });

// ─── Executing a plan without a server ──────────────────────────────────

/** What a host returns for an upstream request: its status and body. */
export interface UpstreamResult {
    readonly status: number;
    /** The body's bytes, as base64, so that binary bodies survive a bridge. */
    readonly base64: string;
}

/**
 * A multipart body, as bytes, for a host whose network stack takes bytes.
 *
 * The server builds its multipart stream with a library; the phone has no such
 * library and gets this instead. The encoders are parameters because UTF-8
 * and base64 decoding are platform facilities. The layout is RFC 7578: each
 * part opens with its boundary and headers, the body follows a blank line, and
 * a final boundary with two trailing hyphens closes the whole.
 */
export const encodeMultipart = (
    parts: readonly MultipartPart[],
    boundary: string,
    utf8: (text: string) => Uint8Array,
    fromBase64: (base64: string) => Uint8Array,
): Uint8Array<ArrayBuffer> => {
    const chunks: Uint8Array[] = [];
    for (const part of parts) {
        const disposition = part.kind === "field"
            ? `Content-Disposition: form-data; name="${part.name}"`
            : `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}`;
        chunks.push(utf8(`--${boundary}\r\n${disposition}\r\n\r\n`));
        chunks.push(part.kind === "field" ? utf8(part.value) : fromBase64(part.base64));
        chunks.push(utf8("\r\n"));
    }
    chunks.push(utf8(`--${boundary}--\r\n`));
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
    }
    return body;
};
