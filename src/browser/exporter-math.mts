import { channel, type RgbaBuffer } from "./pixels.mts";

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

/* ────────────────────────────────────────────────────────────────────────
 * Exporter settings: narrowing and stored-value validation.
 *
 * These live here rather than in model-exporter.mts because they are pure
 * and this module is DOM-free, which is what makes them reachable from
 * tests. model-exporter keeps only the helper that reads an input element.
 * ──────────────────────────────────────────────────────────────────────── */

/** Backdrop the preview canvas draws behind the keyed frame. */
export type PreviewMode = 'checker' | 'black' | 'white' | 'original';

/**
 * Narrow a data-attribute string to a PreviewMode. Returns the value rather
 * than a boolean; the lint configuration bans type predicates, which assert
 * rather than check.
 */
export const asPreviewMode = (value: string): PreviewMode | undefined =>
    value === 'checker' || value === 'black' || value === 'white' || value === 'original'
        ? value
        : undefined;

/** Container the last export was written into. */
export type ExportFormat = 'gif' | 'webm';
/** A positive number, or the fallback when it is zero, negative, or NaN. */
export const positiveOr = (value: number, fallback: number): number =>
    Number.isFinite(value) && value > 0 ? value : fallback;

/** localStorage key holding the slider positions between sessions. */
export const SLIDER_STORAGE_KEY = 'ex_slider_values';

/**
 * Slider positions as they are stored. Every field may be absent: what is read
 * back is whatever a previous version of this code wrote, or whatever else has
 * been left under that key. Declared as `T | undefined` rather than optional
 * because the parser always sets every key, and exactOptionalPropertyTypes
 * draws a real distinction between the two.
 */
export interface PersistedSliders {
    readonly similarity: number | undefined;
    readonly smoothness: number | undefined;
    readonly spillSuppress: number | undefined;
    readonly scale: number | undefined;
    readonly vOffset: number | undefined;
    readonly saturation: number | undefined;
    readonly brightness: number | undefined;
    readonly edgeFade: number | undefined;
    readonly antiAlias: boolean | undefined;
    readonly smokeCleanup: boolean | undefined;
}

/**
 * Coerce a stored field to a finite number.
 *
 * Accepts strings because earlier builds wrote input.value directly, which is
 * a string; those entries are still in users' browsers. The old reader divided
 * those strings by 100 and relied on JavaScript coercing them, so the values
 * were never numbers at all. This normalises on read and writes numbers.
 */
export const storedNumber = (raw: unknown): number | undefined => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    if (typeof raw !== 'string' || raw.trim() === '') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export const storedBoolean = (raw: unknown): boolean | undefined =>
    typeof raw === 'boolean' ? raw : undefined;

/**
 * Parse the stored slider positions, or undefined when the entry is absent,
 * malformed, or not an object. localStorage is writable by anything running on
 * the origin, so nothing read back is trusted; every field is checked.
 */
export const parsePersistedSliders = (raw: string): PersistedSliders | undefined => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const source: Record<string, unknown> = { ...parsed };
    return {
        similarity: storedNumber(source['similarity']),
        smoothness: storedNumber(source['smoothness']),
        spillSuppress: storedNumber(source['spillSuppress']),
        scale: storedNumber(source['scale']),
        vOffset: storedNumber(source['vOffset']),
        saturation: storedNumber(source['saturation']),
        brightness: storedNumber(source['brightness']),
        edgeFade: storedNumber(source['edgeFade']),
        antiAlias: storedBoolean(source['antiAlias']),
        smokeCleanup: storedBoolean(source['smokeCleanup']),
    };
};

/* ────────────────────────────────────────────────────────────────────────
 * Reference-match saturation analysis.
 *
 * Moved here from model-exporter so it is reachable from tests. It took an
 * ImageData, which a node test cannot construct; it only ever read the
 * underlying buffer, so it takes that instead. Behaviour is unchanged.
 * ──────────────────────────────────────────────────────────────────────── */

/** A colour as the keyer and the swatches carry it. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const averageSaturation = (
  rgba: RgbaBuffer,
  bgColor: Rgb,
  skipTransparent = false,
): number => {
  const keyCb = 128 + (-0.168736 * bgColor.r - 0.331264 * bgColor.g + 0.5 * bgColor.b);
  const keyCr = 128 + (0.5 * bgColor.r - 0.418688 * bgColor.g - 0.081312 * bgColor.b);
  const keyExcludeRange = 40; // Exclude pixels within this chroma distance of key

  let totalSat = 0, count = 0;
  for (let j = 0; j < rgba.length; j += 4) {
      const alpha = channel(rgba, j + 3);
      if (skipTransparent && alpha < 10) continue;
      if (!skipTransparent && alpha < 200) continue; // For ref: only solid pixels

      const dr = channel(rgba, j), dg = channel(rgba, j + 1), db = channel(rgba, j + 2);
      const r = dr / 255, g = dg / 255, b = db / 255;
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const lum = (maxC + minC) / 2;

      // Skip near-black and near-white (saturation is meaningless)
      if (lum < 0.05 || lum > 0.95) continue;

      // Skip key-colored pixels
      const cb = 128 + (-0.168736 * dr - 0.331264 * dg + 0.5 * db);
      const cr = 128 + (0.5 * dr - 0.418688 * dg - 0.081312 * db);
      const chromaDist = Math.sqrt((cb - keyCb) ** 2 + (cr - keyCr) ** 2);
      if (chromaDist < keyExcludeRange) continue;

      // HSL saturation
      const sat = maxC === minC ? 0 : (maxC - minC) / (1 - Math.abs(2 * lum - 1));
      totalSat += Math.min(1, sat); // clamp
      count++;
  }
  return count > 0 ? totalSat / count : 0;
};
