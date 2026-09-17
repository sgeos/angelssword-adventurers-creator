/**
 * Exporter math helpers.
 */

export type ExportMode = "adventurer" | "normal" | "premium";
export type CropRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";

export interface ModeLimit {
  readonly format: "webm" | "gif";
  readonly maxFrames: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

export const MODE_LIMITS: Readonly<Record<ExportMode, ModeLimit>> = {
  adventurer: {
    format: "webm",
    maxFrames: Infinity,
    maxWidth: Infinity,
    maxHeight: Infinity,
  },
  normal: { format: "gif", maxFrames: 120, maxWidth: 1000, maxHeight: 1000 },
  premium: { format: "gif", maxFrames: 600, maxWidth: 4000, maxHeight: 4000 },
};

/**
 * Frames produced by an export.
 *
 * @param start    first frame, inclusive
 * @param end      last frame, inclusive
 * @param skip     UI frame-skip value; 0 means every frame, so step is skip + 1
 * @param pingPong whether the sequence plays forward then back
 */
export const getOutputFrameCount = (
  start: number,
  end: number,
  skip: number,
  pingPong: boolean,
): number => {
  const step = Math.max(1, skip + 1);

  let count = 0;
  for (let f = start; f <= end; f += step) count++;

  // Ping-pong replays the interior frames, so both endpoints are not
  // repeated.
  return pingPong && count > 2 ? count + (count - 2) : count;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes.toString()} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export interface CropBox {
  readonly cropX: number;
  readonly cropY: number;
  readonly cropW: number;
  readonly cropH: number;
}

/**
 * Width and height parts of a supported aspect ratio.
 *
 * Keyed by string rather than CropRatio: callers pass whatever the UI
 * holds, and an unrecognised value must fall back to square. Typing the key
 * as the union would only be true if an assertion made it so.
 */
const RATIO_PARTS: Readonly<Record<string, readonly [number, number]>> = {
  "1:1": [1, 1],
  "4:3": [4, 3],
  "3:4": [3, 4],
  "16:9": [16, 9],
  "9:16": [9, 16],
};

/**
 * Largest box of the requested ratio that fits the video, centred.
 *
 * An unrecognised ratio falls back to square, preserving the original
 * behaviour, which is why the parameter is a string rather than the union.
 */
export const computeCropToCenter = (
  videoWidth: number,
  videoHeight: number,
  ratio: string,
): CropBox => {
  const [rw, rh] = RATIO_PARTS[ratio] ?? [1, 1];

  const videoAspect = videoWidth / videoHeight;
  const cropAspect = rw / rh;

  const cropW = cropAspect >= videoAspect ? videoWidth : Math.round(videoHeight * cropAspect);
  const cropH = cropAspect >= videoAspect ? Math.round(videoWidth / cropAspect) : videoHeight;

  return {
    cropX: Math.round((videoWidth - cropW) / 2),
    cropY: Math.round((videoHeight - cropH) / 2),
    cropW,
    cropH,
  };
};

/** Reduce a character name to something safe for a filename. */
export const sanitizeFilename = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "_");

/**
 * Narrow a string from the DOM to an ExportMode, or undefined when it is not
 * one. Mode selectors carry their value in a data attribute, so the value
 * arrives as an unconstrained string and has to be checked before use.
 *
 * Returns the value rather than a boolean because the lint configuration bans
 * user-defined type predicates: a predicate asserts a relationship the
 * compiler takes on trust, which is the class of escape hatch this project
 * exists to avoid. The comparisons below are checked for real.
 */
export const asExportMode = (value: string): ExportMode | undefined =>
  value === "adventurer" || value === "normal" || value === "premium"
    ? value
    : undefined;

/** Narrow a string from the DOM to a CropRatio. See asExportMode. */
export const asCropRatio = (value: string): CropRatio | undefined =>
  value === "1:1" || value === "4:3" || value === "3:4" ||
  value === "16:9" || value === "9:16"
    ? value
    : undefined;
