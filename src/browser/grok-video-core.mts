/**
 * Grok video generation, the parts that need no browser.
 *
 * Reimplemented from upstream pull request 1 by @Manya3084. The request shape
 * and the polling behaviour below were established there against the live
 * service across several corrective commits, and that empirical knowledge is
 * the part worth carrying over. It is expressed here as pure functions so it
 * can be tested, which it could not be in its original form.
 */

/** Bounds the service accepts. A request outside them answers 422. */
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 15;

/** Poll cadence and ceiling. Ninety attempts at five seconds is 7.5 minutes. */
export const POLL_INTERVAL_MS = 5_000;
export const MAX_POLL_ATTEMPTS = 90;

/** Consecutive throttling responses tolerated before giving up. */
export const MAX_CONSECUTIVE_THROTTLES = 5;

export interface GrokVideoRequest {
  readonly model: string;
  readonly prompt: string;
  readonly image: { readonly url: string };
  readonly duration: number;
  readonly aspect_ratio: string;
  readonly resolution: string;
}

/**
 * Build the generation body.
 *
 * Every field is required. Upstream reached a 422 by omitting parts of this
 * shape, and corrected it over two commits. The duration is clamped rather
 * than rejected, because the surrounding control offers values the service
 * will not accept.
 */
export const buildGrokVideoRequest = (opts: {
  readonly prompt: string;
  readonly imageDataUri: string;
  readonly durationSeconds: number;
  readonly mode?: string;
}): GrokVideoRequest => {
  const parsed = Math.trunc(opts.durationSeconds);
  const duration = Number.isFinite(parsed)
    ? Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, parsed))
    : 6;

  const prompt = opts.mode === "keyframe"
    ? `Starting from this image as the first frame, animate a smooth transition. ${opts.prompt}`
    : opts.prompt;

  return {
    model: "grok-imagine-video-1.5",
    prompt,
    image: { url: opts.imageDataUri },
    duration,
    aspect_ratio: "16:9",
    resolution: "720p",
  };
};

/** Read a string property from an untyped object, or undefined. */
const str = (source: unknown, key: string): string | undefined => {
  if (typeof source !== "object" || source === null) return undefined;
  const record: Record<string, unknown> = { ...source };
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** Read a nested object property, or undefined. */
const obj = (source: unknown, key: string): unknown => {
  if (typeof source !== "object" || source === null) return undefined;
  const record: Record<string, unknown> = { ...source };
  return record[key];
};

/**
 * The identifier to poll on.
 *
 * The service has been observed returning it under several names and at two
 * levels of nesting. Upstream accumulated this list empirically, and dropping
 * any of it risks a generation that starts and is then never collected.
 */
export const extractRequestId = (body: unknown): string | undefined =>
  str(body, "request_id")
  ?? str(body, "id")
  ?? str(body, "requestId")
  ?? str(obj(body, "data"), "request_id")
  ?? str(obj(body, "data"), "id");

/** The finished video's address, wherever the response carries it. */
export const extractVideoUrl = (body: unknown): string | undefined =>
  str(obj(body, "video"), "url")
  ?? str(body, "url")
  ?? str(body, "video_url")
  ?? str(obj(obj(body, "data"), "video"), "url")
  ?? str(obj(body, "data"), "url")
  ?? str(obj(obj(body, "result"), "video"), "url");

/** What a poll response means for the loop. */
export type PollOutcome =
  | { readonly kind: "ready"; readonly url: string }
  | { readonly kind: "pending" }
  | { readonly kind: "throttled" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "fatal"; readonly reason: string };

/** Terminal states the service reports. */
const DONE_STATES = new Set(["done", "completed", "succeeded", "success"]);
const FAILED_STATES = new Set(["failed", "error", "cancelled", "expired"]);

/**
 * Classify one poll response.
 *
 * Returning a discriminated union rather than throwing keeps the decision
 * testable and keeps the loop readable. The status codes each mean something
 * specific and were learned the hard way.
 *
 * 202 means the work continues. 403 and 429 are throttling and are retried
 * with a growing delay. 401 means the credential died mid-run and retrying
 * cannot help. A 5xx is transient. Anything else is the service refusing.
 */
export const classifyPoll = (status: number, body: unknown): PollOutcome => {
  if (status === 202) return { kind: "pending" };
  if (status === 403 || status === 429) return { kind: "throttled" };
  if (status === 401) return { kind: "fatal", reason: "Grok authentication expired during generation" };
  if (status >= 500) return { kind: "pending" };

  if (status !== 200) {
    return { kind: "failed", reason: describeError(body, status) };
  }

  const state = (str(body, "status") ?? str(body, "state") ?? "").toLowerCase();
  const url = extractVideoUrl(body);

  // A URL is proof of completion even when no status accompanies it, which is
  // a case upstream hit and handled.
  if (url !== undefined && (state === "" || DONE_STATES.has(state))) {
    return { kind: "ready", url };
  }
  if (DONE_STATES.has(state)) {
    return { kind: "failed", reason: "Grok reported completion without a video address" };
  }
  if (FAILED_STATES.has(state)) {
    return { kind: "failed", reason: describeError(body, status) };
  }
  return { kind: "pending" };
};

/** A human-readable reason from an untyped error body. */
export const describeError = (body: unknown, status: number | string): string => {
  const nested = str(obj(body, "error"), "message");
  if (nested !== undefined) return nested;
  const direct = str(body, "error") ?? str(body, "message") ?? str(body, "detail");
  if (direct !== undefined) return direct;
  return `Grok video error: ${String(status)}`;
};

/** How long to wait after n consecutive throttles. */
export const throttleBackoffMs = (consecutive: number): number =>
  3_000 * Math.max(1, consecutive);
