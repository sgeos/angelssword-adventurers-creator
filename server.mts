/**
 * ⚔️ AS Adventurer — Local Server + API Proxy
 * Angel's Sword Studios
 *
 * Serves static files from public/ and proxies API requests to OpenAI and
 * Google Gemini, so the browser never holds a key and CORS is avoided.
 */

import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import nodeFetch from "node-fetch";

import type { HttpRequest, HttpResponse } from "./src/core/ports/http.mts";
import {
  failureReply,
  isAllowedComfyRequest as coreIsAllowedComfyRequest,
  isAllowedVideoUrl as coreIsAllowedVideoUrl,
  normaliseComfyOrigin as coreNormaliseComfyOrigin,
  planProxyRequest,
  shapeReply,
  singleString,
  type ProxyEnvironment,
  type ShapedReply,
  type UpstreamPlan,
  type UrlParser,
} from "./src/core/proxy.mts";
import FormData from "form-data";
import path from "node:path";
import { execFile } from "node:child_process";
import { isSea } from "node:sea";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * The URL parser the core's checks are given: node's WHATWG implementation,
 * the same one its fetch uses, so the check and the request agree about what
 * a URL means.
 */
const nodeUrl: UrlParser = (raw) => {
  try {
    const url = new URL(raw);
    return { protocol: url.protocol, hostname: url.hostname, origin: url.origin };
  } catch {
    return undefined;
  }
};

/** Whether a URL is one this proxy will attach a credential to. See `core/proxy.mts`. */
export const isAllowedVideoUrl = (raw: string): boolean => coreIsAllowedVideoUrl(raw, nodeUrl);

/** Whether a ComfyUI path and method pair is one this proxy forwards. */
export const isAllowedComfyRequest: (rawPath: string, method: string) => boolean = coreIsAllowedComfyRequest;

/** Reduce a ComfyUI address to an origin on the local network, or reject it. */
export const normaliseComfyOrigin = (raw: string): string | undefined => coreNormaliseComfyOrigin(raw, nodeUrl);

/** Clamp an environment port to something `listen` will accept. */
const parsePort = (raw: string | undefined): number => {
  if (raw === undefined) return 3001;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 3001;
};

type AsyncHandler = (req: Request, res: Response, next: () => void) => Promise<void>;

/**
 * Funnel an async handler's rejection into `next()`. Express 5 forwards a
 * rejection itself; this is kept so the handling is stated rather than left to
 * a framework default, and so the lint's floating promise rules see a `catch`.
 */
const route =
  (handler: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    handler(req, res, () => { next(); }).catch(next);
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
/**
 * The response surface this server consumes. Nothing else is touched.
 *
 * Re-exported from the core rather than declared here. It was declared here
 * first, and the browser half had no equivalent at all; the two are the same
 * capability, so they are now the same interface. The alias is kept because
 * the proxy's prose calls it an upstream response, which is what it is from
 * this side.
 */
export interface UpstreamResponse extends HttpResponse {
  /**
   * The body as bytes. The proxy reads every upstream body this way, because
   * reading it as text decoded a binary body as UTF-8 and corrupted it.
   */
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
  readonly headers: { readonly get: (name: string) => string | null };
}

/**
 * The request options this server sends.
 *
 * The body is a JSON string, or a form-data stream for multipart uploads.
 * That second case is the whole reason the core's request type takes a body
 * parameter: `FormData` is supplied by node, and the core compiles without
 * the node types, so it cannot be named there.
 */
export type UpstreamInit = HttpRequest<string | FormData>;

/**
 * Narrowed to what the proxy actually uses, a status, the body's bytes and
 * its content type, rather than the whole of node-fetch. The default argument below is what
 * checks that the real implementation still satisfies it.
 *
 * The narrow shape is also what lets a test supply a mock without asserting
 * it into the full Response type. A mock that has to be cast into place is
 * a mock the compiler has stopped checking.
 */
export type FetchLike = (url: string, init?: UpstreamInit) => Promise<UpstreamResponse>;

/** Base64, for the video download's reply; node's own encoder. */
const toBase64 = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString("base64");

// ── App ──────────────────────────────────────────────────────────────

const PORT = parsePort(process.env["PORT"]);

/** Where the page and its assets are served from. See the note at its use. */
const STATIC_DIR: string = isSea()
  ? path.join(import.meta.dirname, "public")
  : path.join(import.meta.dirname, "dist", "client");

/**
 * Build the app. Both collaborators are parameters so a test can supply them.
 *
 * `staticDir` is where the page is served from. A test passes a directory it
 * created, because the real one is build output: an earlier version of the
 * test served whatever `dist/client` happened to hold, passed on a machine
 * that had built the page, and failed in continuous integration, where the
 * test job builds nothing.
 */
export const createApp = (fetchImpl: FetchLike = nodeFetch, staticDir: string = STATIC_DIR): Express => {
const app = express();

// JSON only, and no cross-origin headers. The page is served from this origin
// and Vite's dev server proxies /api, so no legitimate caller is on another
// origin. Upstream granted every origin, which let any site the user visited
// drive the proxy and read its answers, spending an environment key if one
// was set. A form body is not parsed because another origin can send one
// without a preflight. See SECURITY.md.
app.use(express.json({ limit: "50mb" }));

// The page is the browser build's output, `dist/client`, beside this file in
// a checkout or the container. The standalone binary carries the same files
// in a `public/` folder beside the executable. Under Node's single executable
// feature `import.meta.dirname`, bundled as `__dirname`, is the executable's
// directory, so one expression finds both. A check for `process.pkg` stood
// here and outlived the pkg build it was written for.
app.use(express.static(staticDir));

// ── The proxy ─────────────────────────────────────────────────────────
//
// Every /api route is planned by `planProxyRequest` in src/core/proxy.mts,
// which a phone also runs, and executed here. The plan carries the statuses,
// the messages and the security checks; this only sends what it says.

/** The credentials and ComfyUI address an operator configured, if any. */
const environment = (): ProxyEnvironment => ({
  openaiKey: process.env["OPENAI_API_KEY"],
  xaiKey: process.env["XAI_API_KEY"],
  googleKey: process.env["GOOGLE_API_KEY"],
  comfyUrl: process.env["COMFYUI_URL"],
});

/** The request options for a plan, building a multipart stream when it asks for one. */
const upstreamInit = (plan: UpstreamPlan): UpstreamInit => {
  const base = { method: plan.method, timeout: plan.timeout };
  if (plan.body === undefined) {
    return Object.keys(plan.headers).length === 0 ? base : { ...base, headers: { ...plan.headers } };
  }
  if (plan.body.kind === "text") return { ...base, headers: { ...plan.headers }, body: plan.body.text };
  const form = new FormData();
  for (const part of plan.body.parts) {
    if (part.kind === "field") {
      form.append(part.name, part.value);
    } else {
      const buffer = Buffer.from(part.base64, "base64");
      form.append(part.name, buffer, { filename: part.filename, contentType: part.contentType });
      console.log(`    [IMG] ${part.filename} (${buffer.length.toString()} bytes)`);
    }
  }
  return { ...base, headers: { ...plan.headers, ...form.getHeaders() }, body: form };
};

app.use(
  route(async (req, res, next) => {
    const plan = planProxyRequest(
      {
        method: req.method,
        path: req.path,
        queryKey: singleString(req.query["key"]),
        authorization: singleString(req.headers.authorization),
        apiKey: singleString(req.headers["x-api-key"]),
        body: req.body,
      },
      environment(),
      nodeUrl,
    );
    if (plan.kind === "no-route") {
      next();
      return;
    }
    if (plan.kind === "reply") {
      if (plan.warning !== undefined) console.warn(`  [PROXY] ${plan.warning}`);
      res.status(plan.reply.status).json(plan.reply.body);
      return;
    }
    const { upstream } = plan;
    for (const warning of plan.warnings) console.warn(`    [IMG] ${warning}`);
    console.log(`  [PROXY] ${req.method} ${req.path} → ${upstream.label}`);
    let answer: ShapedReply;
    try {
      const response = await fetchImpl(upstream.url, upstreamInit(upstream));
      console.log(`  [PROXY] ${upstream.label} → ${response.status.toString()}`);
      const body = new Uint8Array(await response.arrayBuffer());
      answer = shapeReply(upstream.reply, response.status, body, response.headers.get("content-type") ?? undefined, toBase64);
    } catch (err) {
      console.error(`  [ERROR] ${upstream.label} failed:`, err instanceof Error ? err.message : "unknown error");
      const failed = failureReply(err);
      answer = { status: failed.status, body: failed.text, contentType: "application/json" };
    }
    res.status(answer.status).type(answer.contentType).send(typeof answer.body === "string" ? answer.body : Buffer.from(answer.body));
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
// Express 5 calls this on a failed bind as well as on success, passing the
// error. Ignoring the argument printed that the server was running, and opened
// a browser, on a port another process held. Express 4 crashed instead, with a
// nonzero status, which is the outcome kept here.
createApp().listen(PORT, (error?: Error) => {
  if (error !== undefined) {
    console.error(`  [ERROR] Could not listen on port ${PORT.toString()}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
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
