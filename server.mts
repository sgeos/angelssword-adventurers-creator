/**
 * ⚔️ AS Adventurer — Local Server + API Proxy
 * Angel's Sword Studios
 *
 * Serves static files from public/ and proxies API requests to OpenAI and
 * Google Gemini, so the browser never holds a key and CORS is avoided.
 */

import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import nodeFetch from "node-fetch";
import FormData from "form-data";
import path from "node:path";
import { execFile } from "node:child_process";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * A thrown value is `unknown`, not `Error`. Narrow it rather than assuming
 * `.message` exists, which throws again on a rejected non-Error.
 */
const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "unknown error";

/**
 * Express supplies header and query values as `string | string[] | ParsedQs`.
 * Anything that is not a non-empty string is rejected rather than coerced.
 *
 * This is a behaviour fix, not just a type fix. A request shaped
 * `?key[]=a&key[]=b` made `req.query.key` an array, which then reached
 * `.substring()` and threw a TypeError inside the handler, answering 502
 * with a stack-derived message instead of 400.
 */
const singleString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** Clamp an environment port to something `listen` will accept. */
const parsePort = (raw: string | undefined): number => {
  if (raw === undefined) return 3001;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 3001;
};

type AsyncRoute = (req: Request, res: Response) => Promise<void>;

/**
 * Express 4 predates promise-aware routing, so an async handler that
 * rejects leaves the request hanging until it times out. Wrapping funnels
 * rejections into `next()`.
 */
const route =
  (handler: AsyncRoute): RequestHandler =>
  (req, res, next) => {
    handler(req, res).catch(next);
  };

/** Forward an upstream response verbatim, preserving its status. */
const relay = async (res: Response, upstream: { status: number; text: () => Promise<string> }): Promise<void> => {
  const body = await upstream.text();
  res.status(upstream.status).type("application/json").send(body);
};

/**
 * The outbound fetch, injectable.
 *
 * Deliberately a parameter rather than a global lookup such as
 * `globalThis.__AS_FETCH__ ?? nodeFetch`. A global seam ships in the built
 * binary and lets anything loaded earlier intercept every request,
 * including the ones carrying the user's API keys. A parameter is visible
 * only to whoever constructs the app.
 */
/** The response surface this server consumes. Nothing else is touched. */
export interface UpstreamResponse {
  readonly status: number;
  readonly text: () => Promise<string>;
}

/** The request options this server sends. */
export interface UpstreamInit {
  readonly method: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** A JSON string, or a form-data stream for multipart uploads. */
  readonly body?: string | FormData;
  readonly timeout?: number;
}

/**
 * Narrowed to what the proxy actually uses — a status and a text body —
 * rather than the whole of node-fetch. The default argument below is what
 * checks that the real implementation still satisfies it.
 *
 * The narrow shape is also what lets a test supply a mock without asserting
 * it into the full Response type. A mock that has to be cast into place is
 * a mock the compiler has stopped checking.
 */
export type FetchLike = (url: string, init?: UpstreamInit) => Promise<UpstreamResponse>;

// ── App ──────────────────────────────────────────────────────────────

const PORT = parsePort(process.env["PORT"]);

export const createApp = (fetchImpl: FetchLike = nodeFetch): Express => {
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

// `process.pkg` is set by the pkg bundler and is absent from the Node
// types. An `in` check reads it without an ambient declaration, which the
// lint config bans as an unchecked claim about a value nothing verifies.
const APP_DIR = "pkg" in process ? path.dirname(process.execPath) : import.meta.dirname;

app.use(express.static(path.join(APP_DIR, "public")));

// ── OpenAI ───────────────────────────────────────────────────────────

app.post(
  "/api/generate",
  route(async (req, res) => {
    const authHeader = singleString(req.headers.authorization);
    if (authHeader === undefined) {
      res.status(401).json({ error: "No Authorization header provided" });
      return;
    }
    try {
      console.log("  [PROXY] POST /api/generate → OpenAI /v1/images/generations");
      const upstream = await fetchImpl("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(req.body),
        timeout: 300_000,
      });
      console.log(`  [PROXY] /v1/images/generations → ${upstream.status.toString()}`);
      await relay(res, upstream);
    } catch (err) {
      console.error("  [ERROR] Generate proxy failed:", errorMessage(err));
      res.status(502).json({ error: `Proxy error: ${errorMessage(err)}` });
    }
  }),
);

/**
 * Image edits take reference images. An entry is either a raw base64
 * string or `{ label, data }`, and either may carry a data-URI prefix.
 *
 * Classified into a discriminated union rather than narrowed by a type
 * predicate. A predicate asserts a shape the compiler never verifies; this
 * returns evidence the compiler can follow, and makes the invalid case a
 * value the caller has to handle rather than a silent skip.
 */
type ImageEntry =
  | { readonly kind: "image"; readonly data: string; readonly label: string | undefined }
  | { readonly kind: "invalid" };

const classifyImage = (entry: unknown): ImageEntry => {
  if (typeof entry === "string" && entry.length > 0) {
    return { kind: "image", data: entry, label: undefined };
  }
  if (typeof entry === "object" && entry !== null && "data" in entry) {
    const data: unknown = entry.data;
    if (typeof data === "string" && data.length > 0) {
      const label: unknown = "label" in entry ? entry.label : undefined;
      return { kind: "image", data, label: typeof label === "string" ? label : undefined };
    }
  }
  return { kind: "invalid" };
};

app.post(
  "/api/edits",
  route(async (req, res) => {
    const authHeader = singleString(req.headers.authorization);
    if (authHeader === undefined) {
      res.status(401).json({ error: "No Authorization header provided" });
      return;
    }
    try {
      console.log("  [PROXY] POST /api/edits → OpenAI /v1/images/edits");
      const body: unknown = req.body;
      if (typeof body !== "object" || body === null) {
        res.status(400).json({ error: "Body must be a JSON object" });
        return;
      }
      // Literal-key `in` narrowing reads each field without asserting a
      // shape over the whole body.
      const model: unknown = "model" in body ? body.model : undefined;
      const prompt: unknown = "prompt" in body ? body.prompt : undefined;
      const images: unknown = "images" in body ? body.images : undefined;
      const count: unknown = "n" in body ? body.n : undefined;
      const size: unknown = "size" in body ? body.size : undefined;
      const quality: unknown = "quality" in body ? body.quality : undefined;

      const promptText = singleString(prompt);
      if (promptText === undefined) {
        res.status(400).json({ error: "prompt is required" });
        return;
      }

      const form = new FormData();
      form.append("model", singleString(model) ?? "gpt-image-2");
      form.append("prompt", promptText);
      // Only a string or a finite number is forwarded. `String(unknown)`
      // would happily send "[object Object]" upstream.
      if (typeof count === "number" && Number.isFinite(count)) form.append("n", count.toString());
      else if (typeof count === "string") form.append("n", count);
      const sizeText = singleString(size);
      if (sizeText !== undefined) form.append("size", sizeText);
      const qualityText = singleString(quality);
      if (qualityText !== undefined) form.append("quality", qualityText);

      if (Array.isArray(images)) {
        images.forEach((entry: unknown, index) => {
          const classified = classifyImage(entry);
          if (classified.kind === "invalid") {
            console.warn(`    [IMG] entry ${index.toString()} skipped: not a base64 string or { data }`);
            return;
          }
          const source = classified.data;
          const fileName = `${classified.label ?? `ref${index.toString()}`}.png`;
          // Strip a data-URI prefix if present.
          const commaAt = source.indexOf(",");
          const raw = commaAt === -1 ? source : source.slice(commaAt + 1);
          const buffer = Buffer.from(raw, "base64");
          form.append("image[]", buffer, { filename: fileName, contentType: "image/png" });
          console.log(`    [IMG] ${fileName} (${buffer.length.toString()} bytes)`);
        });
      }

      const upstream = await fetchImpl("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: authHeader, ...form.getHeaders() },
        body: form,
        timeout: 300_000,
      });
      console.log(`  [PROXY] /v1/images/edits → ${upstream.status.toString()}`);
      await relay(res, upstream);
    } catch (err) {
      console.error("  [ERROR] Edits proxy failed:", errorMessage(err));
      res.status(502).json({ error: `Proxy error: ${errorMessage(err)}` });
    }
  }),
);

app.post(
  "/api/chat",
  route(async (req, res) => {
    const authHeader = singleString(req.headers.authorization);
    if (authHeader === undefined) {
      res.status(401).json({ error: "No Authorization header provided" });
      return;
    }
    try {
      console.log("  [PROXY] POST /api/chat → OpenAI /v1/chat/completions");
      const upstream = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(req.body),
        timeout: 30_000,
      });
      console.log(`  [PROXY] /v1/chat/completions → ${upstream.status.toString()}`);
      await relay(res, upstream);
    } catch (err) {
      console.error("  [ERROR] Chat proxy failed:", errorMessage(err));
      res.status(502).json({ error: `Proxy error: ${errorMessage(err)}` });
    }
  }),
);

// ── Gemini ───────────────────────────────────────────────────────────

/** Both Gemini routes accept the key by header or query string. */
const geminiKey = (req: Request): string | undefined =>
  singleString(req.headers["x-api-key"]) ?? singleString(req.query["key"]);

app.post(
  "/api/video/generate",
  route(async (req, res) => {
    const apiKey = geminiKey(req);
    if (apiKey === undefined) {
      res.status(401).json({ error: "No Google API key provided" });
      return;
    }
    try {
      console.log("  [PROXY] POST /api/video/generate → Gemini Interactions API");
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
      console.log("  [PROXY] URL:", url.replace(apiKey, `${apiKey.slice(0, 8)}...`));

      const upstream = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        timeout: 600_000,
      });

      const data = await upstream.text();
      console.log(`  [PROXY] Gemini Interactions → HTTP ${upstream.status.toString()}`);
      if (upstream.status === 200) {
        const sizeMB = (data.length / 1024 / 1024).toFixed(1);
        console.log(`  [PROXY] ✅ Video generated successfully! (${sizeMB} MB response)`);
      } else {
        console.error("  [ERROR] Gemini API error response:");
        console.error("  ", data.slice(0, 500));
      }
      res.status(upstream.status).type("application/json").send(data);
    } catch (err) {
      console.error("  [ERROR] Video generate proxy failed:", errorMessage(err));
      res.status(502).json({ error: `Proxy error: ${errorMessage(err)}` });
    }
  }),
);

app.post(
  "/api/video/poll",
  route(async (req, res) => {
    const apiKey = geminiKey(req);
    if (apiKey === undefined) {
      res.status(401).json({ error: "No Google API key provided" });
      return;
    }
    const body: unknown = req.body;
    const operationName =
      typeof body === "object" && body !== null && "operationName" in body
        ? singleString(body.operationName)
        : undefined;
    if (operationName === undefined) {
      res.status(400).json({ error: "No operationName provided" });
      return;
    }
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;
      const upstream = await fetchImpl(url, { method: "GET", timeout: 30_000 });
      await relay(res, upstream);
    } catch (err) {
      console.error("  [ERROR] Video poll failed:", errorMessage(err));
      res.status(502).json({ error: `Proxy error: ${errorMessage(err)}` });
    }
  }),
);

return app;
};

// ── Start ────────────────────────────────────────────────────────────

/**
 * Only listen when this module is the process entry point, so importing it
 * from a test constructs the app without binding a port.
 */
const isEntryPoint = process.argv[1] !== undefined && import.meta.filename === path.resolve(process.argv[1]);

if (isEntryPoint) {
createApp().listen(PORT, () => {
  console.log("");
  console.log("  ⚔️  AS Adventurer — VTuber Creation Pipeline");
  console.log("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Server running at http://localhost:${PORT.toString()}`);
  console.log("  Press Ctrl+C to stop");
  console.log("");

  // Set AS_NO_OPEN=1 to suppress, which matters for headless CI and for
  // the BSDs, where xdg-open comes from xdg-utils and is often absent.
  if (process.env["AS_NO_OPEN"] !== "1") {
    const url = `http://localhost:${PORT.toString()}`;
    // execFile rather than exec: no shell, so PORT cannot be interpolated
    // into a command line. On Windows `start` is a cmd builtin whose first
    // quoted argument is the window title.
    const [opener, args]: readonly [string, readonly string[]] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    // Failure is not fatal. The URL is printed above either way.
    execFile(opener, [...args], () => undefined);
  }
});
}
