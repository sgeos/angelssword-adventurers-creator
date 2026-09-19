/**
 * Pure logic extracted from video-gen.
 *
 * Known quirks, locked as-is — do not "fix" them here, the tests pin them:
 *  - `duration` is collected by the UI but is not placed in the POST body.
 *  - Keyframe mode requires a start and an end image, but only the first is
 *    sent; the end frame is described in text only.
 */

export const DEFAULT_PROMPT =
  "Generate a gentle breathing idle animation with slight body sway. Keep the character on the same background.";

export const MODEL = "gemini-omni-flash-preview";

/** Drop a data-URI prefix if present. */
export const stripDataUrl = (dataUrl: string): string => {
  const commaAt = dataUrl.indexOf(",");
  return commaAt === -1 ? dataUrl : dataUrl.slice(commaAt + 1);
};

export const detectMime = (dataUrl: string): string =>
  dataUrl.includes("image/png") ? "image/png" : "image/jpeg";

export interface ReferenceImage {
  readonly dataUrl: string;
}

export interface VideoRequestOptions {
  readonly prompt?: string;
  readonly mode?: string;
  readonly referenceImages?: readonly ReferenceImage[];
  /**
   * Accepted from the UI and deliberately never forwarded. Declared so the
   * quirk is visible in the type rather than only in a comment, and so the
   * test that pins it can pass the field without an error.
   */
  readonly duration?: number;
}

export type RequestPart =
  | { readonly type: "image"; readonly data: string; readonly mime_type: string }
  | { readonly type: "text"; readonly text: string };

export type RequestInput = string | readonly RequestPart[];

export interface VideoRequestBody {
  readonly model: string;
  // Always set: every branch of buildVideoRequestBody supplies it.
  readonly input: RequestInput;
  readonly generation_config?: { readonly video_config: { readonly task: string } };
}

const IMAGE_TO_VIDEO = { video_config: { task: "image_to_video" } } as const;

/** Build the Gemini Interactions request body. */
export const buildVideoRequestBody = (opts: VideoRequestOptions = {}): VideoRequestBody => {
  const textPrompt = opts.prompt !== undefined && opts.prompt !== "" ? opts.prompt : DEFAULT_PROMPT;
  const mode = opts.mode ?? "reference";
  const images = opts.referenceImages ?? [];
  const first = images[0];

  if (first === undefined) {
    return { model: MODEL, input: textPrompt };
  }

  // Keyframe mode names the end pose in prose. The end image is not sent.
  const text =
    mode === "keyframe" && images.length >= 2
      ? `Starting from this image (start frame), animate the character transitioning to the end pose. ${textPrompt}`
      : textPrompt;

  return {
    model: MODEL,
    input: [
      { type: "image", data: stripDataUrl(first.dataUrl), mime_type: detectMime(first.dataUrl) },
      { type: "text", text },
    ],
    generation_config: IMAGE_TO_VIDEO,
  };
};

export interface VideoPayload {
  readonly mimeType: string;
  readonly base64: string;
}

/**
 * Find the video in a response, across the three shapes the API returns.
 *
 * The response is untyped external data, so every step narrows with `in`
 * and `typeof` rather than asserting. This is longer than a cast and it is
 * the reason a malformed response yields undefined instead of a
 * TypeError several frames away.
 *
 * Returns null rather than undefined: callers compare against null, and a
 * conversion is the wrong place to change a contract.
 */
export const extractVideoPayload = (data: unknown): VideoPayload | null => {
  if (typeof data !== "object" || data === null) return null;

  // Pattern 1: Interactions API, steps[] carrying model_output.
  if ("steps" in data && Array.isArray(data.steps)) {
    for (const rawStep of data.steps) {
      const step: unknown = rawStep;
      if (typeof step !== "object" || step === null) continue;
      if (!("type" in step) || step.type !== "model_output") continue;
      if (!("content" in step) || !Array.isArray(step.content)) continue;
      for (const rawItem of step.content) {
        const item: unknown = rawItem;
        if (typeof item !== "object" || item === null) continue;
        if (!("type" in item) || item.type !== "video") continue;
        if (!("data" in item) || typeof item.data !== "string" || item.data === "") continue;
        const mime: unknown = "mime_type" in item ? item.mime_type : undefined;
        return {
          mimeType: typeof mime === "string" && mime !== "" ? mime : "video/mp4",
          base64: item.data,
        };
      }
    }
  }

  // Pattern 2: generateContent, candidates[].content.parts[].inlineData.
  if ("candidates" in data && Array.isArray(data.candidates)) {
    for (const rawCandidate of data.candidates) {
      const candidate: unknown = rawCandidate;
      if (typeof candidate !== "object" || candidate === null) continue;
      if (!("content" in candidate)) continue;
      const content: unknown = candidate.content;
      if (typeof content !== "object" || content === null) continue;
      if (!("parts" in content) || !Array.isArray(content.parts)) continue;
      for (const rawPart of content.parts) {
        const part: unknown = rawPart;
        if (typeof part !== "object" || part === null) continue;
        if (!("inlineData" in part)) continue;
        const inline: unknown = part.inlineData;
        if (typeof inline !== "object" || inline === null) continue;
        if (!("mimeType" in inline) || typeof inline.mimeType !== "string") continue;
        if (!inline.mimeType.startsWith("video/")) continue;
        if (!("data" in inline) || typeof inline.data !== "string") continue;
        return { mimeType: inline.mimeType, base64: inline.data };
      }
    }
  }

  // Pattern 3: a polled operation nests the real response under `result`.
  if ("result" in data) return extractVideoPayload(data.result);

  return null;
};

/** Multi-select UI, single handoff: only the first selected index is used. */
export const pickHandoffVideo = <T,>(
  generatedVideos: readonly T[],
  selectedIndicesOrdered: Iterable<number> | null | undefined,
): T | undefined => {
  const [first] = Array.from(selectedIndicesOrdered ?? []);
  return first === undefined ? undefined : generatedVideos[first];
};

/** Generation-count button value to a positive integer, defaulting to 1. */
export const parseGenCount = (count: string | number | null | undefined): number => {
  const n = typeof count === "number" ? Math.trunc(count) : parseInt(count ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};
