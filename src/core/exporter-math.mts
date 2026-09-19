import type { KeyValueStore } from "./ports/storage.mts";
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

/** Storage key holding the slider positions between sessions. */
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
 * malformed, or not an object. The store is writable by anything running on
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

/**
 * Slider positions as stored, or undefined when nothing usable is there.
 *
 * Absence, an empty entry, malformed text, and a value that is not an object
 * all reach the same answer, because a caller can do nothing different with
 * any of them. The four cases were spelled out at the call site before the
 * storage capability existed.
 */
export const loadPersistedSliders = (store: KeyValueStore): PersistedSliders | undefined => {
    const raw = store.read(SLIDER_STORAGE_KEY);
    if (raw === undefined || raw === '') return undefined;
    return parsePersistedSliders(raw);
};

/** Store slider positions. */
export const savePersistedSliders = (store: KeyValueStore, sliders: PersistedSliders): void => {
    store.write(SLIDER_STORAGE_KEY, JSON.stringify(sliders));
};

/* ────────────────────────────────────────────────────────────────────────
 * Placing the video inside the output frame.
 * ──────────────────────────────────────────────────────────────────────── */

/** Where and how large the video is drawn inside the output frame. */
export interface Placement {
    /** Left edge of the destination rectangle. */
    readonly dx: number;
    /** Top edge of the destination rectangle. */
    readonly dy: number;
    /** Destination width. */
    readonly sw: number;
    /** Destination height. */
    readonly sh: number;
}

/**
 * Scale the video about the frame's centre, then shift it vertically.
 *
 * # This existed five times
 *
 * The preview, the original-mode preview, the reference-match measurement,
 * the WebM recorder and the Graphics Interchange Format encoder each computed
 * it, identically, and each sanitised its inputs the same way immediately
 * beforehand. Five copies of four lines is how a change reaches four of five
 * places.
 *
 * # What the sanitising is for
 *
 * The scale and the offset come from numeric inputs, so both can arrive as
 * NaN, and the scale can arrive as zero or negative. A non-positive scale
 * collapses the frame to nothing and a NaN offset makes every coordinate NaN,
 * neither of which a user asked for by typing in a box. A scale falls back to
 * 1 and an offset to 0.
 *
 * # Rounding
 *
 * Each of the four values is rounded independently, which is what the copies
 * did. That means the drawn rectangle is not necessarily centred to the pixel
 * when the scaled size is odd against an even frame, the remainder falling on
 * one side. It is preserved rather than corrected, because the alternative
 * shifts every existing export by up to half a pixel.
 */
export const placeScaled = (
    width: number,
    height: number,
    rawScale: number,
    rawOffset: number,
): Placement => {
    const scale = positiveOr(rawScale, 1);
    const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
    const sw = Math.round(width * scale);
    const sh = Math.round(height * scale);
    return {
        sw,
        sh,
        dx: Math.round((width - sw) / 2),
        dy: Math.round((height - sh) / 2) + offset,
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

/**
 * Below this, the output is treated as having no colour to match against.
 *
 * Dividing by a near-zero average saturation produces an enormous ratio from
 * rounding noise, so the exporter declines to act rather than slamming the
 * slider to its limit.
 */
export const SATURATION_MATCH_FLOOR = 0.001;

/** The slider cannot exceed this, so neither can a matched value. */
export const SATURATION_MAX_PERCENT = 200;

/**
 * The saturation percentage that would make the output match a reference.
 *
 * Returns undefined when the output has essentially no saturation to scale,
 * which is the case the exporter skips. Returning a value there would mean
 * choosing one, and there is no right answer, since an output with no colour
 * cannot be made to match a reference that has some.
 *
 * The result is clamped to the slider's own range and rounded to a whole
 * percent, because that is what is written back into the control. Rounding
 * here rather than at the call site keeps the returned number and the
 * displayed number the same.
 *
 * The floor comparison is written so that a NaN output average declines
 * rather than proceeding, NaN failing every ordered comparison.
 */
export const matchedSaturationPercent = (
    referenceAverage: number,
    outputAverage: number,
): number | undefined => {
    if (!(outputAverage > SATURATION_MATCH_FLOOR)) return undefined;
    const ratio = referenceAverage / outputAverage;
    return Math.round(Math.max(0, Math.min(SATURATION_MAX_PERCENT, ratio * 100)));
};

/* ────────────────────────────────────────────────────────────────────────
 * Estimating the output size.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Bytes per pixel per frame, by container.
 *
 * **These are heuristics and nothing here establishes them.** They came from
 * the code this was extracted from, whose only justification was a comment
 * saying roughly. They are stated as named constants rather than buried in an
 * expression so that a measurement, if anyone makes one, has somewhere to go.
 *
 * The estimate is shown to a user before an export, so being wrong by a
 * factor costs a surprise rather than a failure.
 */
export const BYTES_PER_PIXEL_PER_FRAME: Readonly<Record<ExportFormat, number>> = {
    gif: 0.3,
    webm: 0.1,
};

/**
 * Roughly how large an export will be.
 *
 * Returns 0 for a degenerate request rather than NaN, so the displayed
 * estimate reads as nothing rather than as a fault. A frame count or a
 * dimension that is not a usable number is treated as zero, which is what the
 * inputs that feed this can produce when a field is cleared.
 */
export const estimateExportBytes = (
    frameCount: number,
    width: number,
    height: number,
    format: ExportFormat,
): number => {
    const usable = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);
    return usable(frameCount) * usable(width) * usable(height) * BYTES_PER_PIXEL_PER_FRAME[format];
};

/* ────────────────────────────────────────────────────────────────────────
 * The crop rectangle, as the user drags it.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Where a dragged crop rectangle ends up on one axis.
 *
 * Clamped so the rectangle cannot leave the frame on either side, and rounded
 * so the crop is always whole pixels. A crop wider than the frame would give
 * a negative upper bound, which `Math.min` then makes the winner, so the
 * result is clamped below at zero afterwards rather than before.
 */
export const clampCropOrigin = (
    startOrigin: number,
    delta: number,
    cropSize: number,
    frameSize: number,
): number => Math.round(Math.max(0, Math.min(frameSize - cropSize, startOrigin + delta)));

/** The crop rectangle as percentages of the frame, for positioning an overlay. */
export interface CropOverlay {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

/**
 * Express a crop rectangle as percentages of the frame.
 *
 * Percentages rather than pixels because the overlay sits over a canvas whose
 * displayed size is decided by the page's layout and is not the canvas's own
 * width. A pixel offset would be right only at one zoom level.
 */
export const cropOverlayPercent = (
    crop: CropBox,
    frameWidth: number,
    frameHeight: number,
): CropOverlay => ({
    left: (crop.cropX / frameWidth) * 100,
    top: (crop.cropY / frameHeight) * 100,
    width: (crop.cropW / frameWidth) * 100,
    height: (crop.cropH / frameHeight) * 100,
});

/**
 * The other dimension, when the aspect ratio is locked.
 *
 * `ratio` is the other dimension over this one, so a caller asking for a new
 * height from a width passes height over width. Rounded, because the field it
 * is written into holds an integer.
 */
export const lockedDimension = (value: number, ratio: number): number =>
    Math.round(value * ratio);

/**
 * Convert a pointer position into a pixel coordinate on a canvas.
 *
 * A canvas has a backing size and a displayed size and they are rarely equal.
 * A click arrives in page coordinates, so it is made relative to the element
 * and then scaled by the ratio between the two.
 *
 * Floored rather than rounded, because the result indexes a pixel: rounding
 * would let a click on the right half of the last pixel address one past the
 * end.
 */
export const viewportToPixel = (
    pointerCoord: number,
    elementOrigin: number,
    backingSize: number,
    displayedSize: number,
): number => Math.floor((pointerCoord - elementOrigin) * (backingSize / displayedSize));
