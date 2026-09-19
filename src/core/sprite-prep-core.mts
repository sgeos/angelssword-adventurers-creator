/**
 * Sprite Prep core: pure logic, no DOM and no fetch.
 */
import { channel, type RgbaBuffer, type RgbaImage } from "./pixels.mts";
import { colorName } from "./color.mts";

export interface KeyColor {
  readonly hex: string;
  readonly name: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const KEY_COLORS: readonly KeyColor[] = [
  { hex: "#00FF00", name: "Green", r: 0, g: 255, b: 0 },
  { hex: "#FF00FF", name: "Magenta", r: 255, g: 0, b: 255 },
  { hex: "#0000FF", name: "Blue", r: 0, g: 0, b: 255 },
  { hex: "#FFFF00", name: "Yellow", r: 255, g: 255, b: 0 },
  { hex: "#00FFFF", name: "Cyan", r: 0, g: 255, b: 255 },
];

/** Alpha at or above which a pixel counts as part of the sprite. */
const OPAQUE = 128;

export interface KeyPick {
  readonly hex: string;
  readonly bestIdx: number;
  readonly minDist: Float64Array;
}

/**
 * Pick the key colour furthest from anything in the image.
 *
 * For each candidate, find its smallest Euclidean distance to any opaque
 * pixel; the winner is the candidate whose smallest distance is largest,
 * so the key is least likely to collide with the artwork.
 */
export const pickKeyByEuclideanMinDist = (
  rgba: RgbaBuffer,
  width: number,
  height: number,
): KeyPick => {
  const minDist = new Float64Array(KEY_COLORS.length).fill(Infinity);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    if (channel(rgba, idx + 3) < OPAQUE) continue;
    const r = channel(rgba, idx);
    const g = channel(rgba, idx + 1);
    const b = channel(rgba, idx + 2);
    KEY_COLORS.forEach((key, c) => {
      const dr = r - key.r;
      const dg = g - key.g;
      const db = b - key.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < (minDist[c] ?? Infinity)) minDist[c] = dist;
    });
  }

  let bestIdx = 0;
  let bestSep = -1;
  KEY_COLORS.forEach((_key, c) => {
    const separation = minDist[c] ?? -Infinity;
    if (separation > bestSep) {
      bestSep = separation;
      bestIdx = c;
    }
  });

  return { hex: KEY_COLORS[bestIdx]?.hex ?? "#00FF00", bestIdx, minDist };
};

/** Lowest row containing any pixel above the alpha threshold. */
export const findBottomOpaqueRow = (
  rgba: RgbaBuffer,
  w: number,
  h: number,
  alphaThreshold = 30,
): number => {
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      if (channel(rgba, (y * w + x) * 4 + 3) > alphaThreshold) return y;
    }
  }
  // No pixel cleared the threshold; the original left bottomRow at h - 1.
  return h - 1;
};

export interface DrawRectOptions {
  readonly sw: number;
  readonly sh: number;
  readonly bottomRow: number;
  readonly offset: number;
  readonly zoom: number;
  readonly CW?: number;
  readonly CH?: number;
}

export interface DrawRect {
  readonly zoomX: number;
  readonly zoomY: number;
  readonly drawW: number;
  readonly drawH: number;
  readonly spriteX: number;
  readonly spriteY: number;
}

/** Bottom-anchored placement with an offset and a zoom percentage. */
export const computeSpriteDrawRect = (opts: DrawRectOptions): DrawRect => {
  const CW = opts.CW ?? 1280;
  const CH = opts.CH ?? 720;

  const spriteY = CH - opts.bottomRow - 1 + opts.offset;
  const spriteX = Math.round((CW - opts.sw) / 2);

  const scale = opts.zoom / 100;
  const drawW = Math.round(opts.sw * scale);
  const drawH = Math.round(opts.sh * scale);

  return {
    zoomX: spriteX + Math.round((opts.sw - drawW) / 2),
    zoomY: spriteY + (opts.sh - drawH),
    drawW,
    drawH,
    spriteX,
    spriteY,
  };
};

/**
 * Default naming for a key colour.
 *
 * This carried its own copy of the table until `color.mts` existed, because
 * the only other copy was in the platform and the core could not reach it.
 * The `colorNameFn` seam below remains, a caller overriding the naming being
 * reasonable, but its default is now the one table rather than a second one.
 */
export const defaultColorName = (hex: string): string => colorName(hex);

export type RaceMode = "normal" | "kanolith" | "zoalith";

export interface PromptOptions {
  readonly name?: string;
  readonly desc?: string;
  readonly action?: string;
  readonly keyHex: string;
  readonly raceMode?: string;
  readonly colorNameFn?: (hex: string) => string;
}

const KANOLITH_DIRECTIVE =
  "\nCRITICAL - KEMONOMIMI STYLE:\nThis character is a kemonomimi (moe anthropomorphism). They must have a FULLY HUMAN face - human nose, human mouth, human skin, human facial structure. They have animal ears on top of their head and an animal tail, but NO human ears (the sides of the head where human ears would be must be covered by hair or simply absent). NO snout, NO fur on face, NO whiskers, NO muzzle, NO animal nose. The face must be 100% anime-human in appearance. Only the ears and tail are animal-like.\n";

const ZOALITH_DIRECTIVE =
  "\nCRITICAL - FULL ANTHROPOMORPHIC STYLE:\nThis character is a full anthropomorphic beastfolk (furry/kemono style). They should have pronounced animal facial features: a visible snout or muzzle, fur covering the face and body, animal nose, whiskers if applicable, digitigrade legs if applicable. The body structure is humanoid but the head and skin are distinctly animal. Think classic RPG beastfolk like Breath of Fire or Final Fantasy Bangaa/Moogle.\n";

/** Compose the generation prompt. */
export const buildPrompt = (opts: PromptOptions): string => {
  const name = opts.name?.trim() !== undefined && opts.name.trim() !== "" ? opts.name.trim() : "Character";
  const desc = opts.desc?.trim() ?? "";
  const action = opts.action?.trim() ?? "";
  const raceMode = opts.raceMode ?? "normal";
  const colorNameFn = opts.colorNameFn ?? defaultColorName;

  const keyName = colorNameFn(opts.keyHex);
  const actionText = action !== "" ? action : "standing in a neutral idle position";

  const raceDirective =
    raceMode === "kanolith" ? KANOLITH_DIRECTIVE : raceMode === "zoalith" ? ZOALITH_DIRECTIVE : "";

  return [
    `A single ${name}${desc !== "" ? `, ${desc}` : ""}, ${actionText}.`,
    raceDirective,
    `Character shown from the waist up (upper body, chest, shoulders, head). The character is positioned in the lower portion of the canvas, centered horizontally, with plenty of solid background space above the character's head.`,
    `The entire background must be a solid, uniform ${keyName.toUpperCase()} (${opts.keyHex}) with absolutely no gradients, shadows, or variations.`,
    `Every pixel of background must be the exact same shade of ${keyName.toLowerCase()} — a single uniform matte color.`,
    `The character should be drawn in a high-quality anime/JRPG art style with clean linework and cel-shading.`,
    `The image must be exactly 1280×720 pixels.`,
    `The character has crisp, clean edges with bold dark outlines and a well-defined silhouette against the flat colored background.`,
    `Waist-up portrait composition with flat studio lighting. The character's lower body is cut off at approximately the waist or hip level by the bottom edge of the canvas. No ground, no floor, no feet visible.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
};

export interface ReferenceFlags {
  readonly charRef?: boolean;
  readonly styleRef?: boolean;
}

/** Prepend or append the reference-image instructions. */
export const buildPromptWithRefs = (promptText: string, refs: ReferenceFlags = {}): string => {
  const charRef = refs.charRef === true;
  const styleRef = refs.styleRef === true;

  if (charRef && styleRef) {
    return `Two reference images are provided. The FIRST image (character_reference.png) is the CHARACTER REFERENCE — the generated character must look exactly like this character. The SECOND image (style_reference.png) is the STYLE REFERENCE — match its art style only. ${promptText}\n\nCRITICAL: The character must look like the one in character_reference.png.`;
  }
  if (charRef) {
    return `${promptText}\n\nThe character should look exactly like the one in the provided reference image.`;
  }
  if (styleRef) {
    return `Match the exact art style shown in the provided style reference image. ${promptText}`;
  }
  return promptText;
};

export interface GenerateRequestBody {
  readonly model: string;
  readonly prompt: string;
  readonly n: number;
  readonly size: string;
  readonly quality: string;
  readonly images?: readonly unknown[];
}

export interface GenerateRequest {
  readonly endpoint: string;
  readonly body: GenerateRequestBody;
}

/** Choose the endpoint and shape the body. Performs no request. */
export const buildGenerateRequest = (opts: {
  readonly prompt: string;
  readonly images?: readonly unknown[];
}): GenerateRequest => {
  const images = opts.images ?? [];
  const hasImages = images.length > 0;
  const base = {
    model: "gpt-image-2",
    prompt: opts.prompt,
    n: 1,
    size: "1536x1024",
    quality: "high",
  } as const;

  return {
    endpoint: hasImages ? "/api/edits" : "/api/generate",
    body: hasImages ? { ...base, images } : base,
  };
};

/* ────────────────────────────────────────────────────────────────────────
 * Colour science.
 *
 * Moved here from sprite-prep so it is reachable from tests: it is pure, and
 * a wrong constant in a colour-space conversion produces output that looks
 * plausible indefinitely.
 * ──────────────────────────────────────────────────────────────────────── */

/** A colour in CIE Lab, where Euclidean distance approximates perception. */
export interface Lab {
    readonly L: number;
    readonly a: number;
    readonly b: number;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
    // sRGB → XYZ → Lab
    let rr = r / 255, gg = g / 255, bb = b / 255;
    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    let x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
    let y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) / 1.00000;
    let z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;

    x = x > 0.008856 ? Math.cbrt(x) : (7.787 * x) + 16 / 116;
    y = y > 0.008856 ? Math.cbrt(y) : (7.787 * y) + 16 / 116;
    z = z > 0.008856 ? Math.cbrt(z) : (7.787 * z) + 16 / 116;

    return {
        L: (116 * y) - 16,
        a: 500 * (x - y),
        b: 200 * (y - z)
    };
}

/* ────────────────────────────────────────────────────────────────────────
 * Scoring the key colours against a sampled region.
 *
 * This was ninety lines inside a click handler on the advanced key dialogue.
 * It is colour science and nothing else: the only part that needed a browser
 * was one call to read the selected rectangle's pixels.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Bits kept per channel when building the histogram.
 *
 * Six, so a channel becomes one of sixty-four buckets and three channels pack
 * into eighteen bits. The purpose is speed rather than noise: a region of any
 * size collapses to at most 262,144 entries, and each candidate colour is
 * then compared against buckets rather than against pixels.
 *
 * A bucket is identified by its FLOOR, not its centre. A channel of 251 and
 * one of 255 both become 252. That biases every reconstructed colour slightly
 * dark, by up to three levels, and it is preserved from the original because
 * correcting it would move every score.
 */
export const HISTOGRAM_BITS = 6;

/** Alpha at or above which a pixel counts as part of the subject. */
export const OPAQUE_ALPHA_MIN = 128;

/**
 * Fewer opaque pixels than this and the analysis refuses.
 *
 * A handful of pixels produces scores that swing wildly with the selection,
 * which reads as authoritative and is not. Refusing is better than reporting.
 */
export const MIN_ANALYSIS_PIXELS = 100;

/**
 * Below this CIE76 distance, a subject colour is counted as endangered.
 *
 * Thirty is roughly where a difference stops being obvious to the eye, so a
 * subject colour nearer than this to the key colour is at risk of being keyed
 * away with the background.
 */
export const DANGER_DELTA_E = 30;

/**
 * How the score weighs the nearest colour against the average.
 *
 * Mostly the nearest, because one subject colour close to the key colour is
 * enough to punch a hole in the subject, and an average cannot see that. Some
 * weight on the average, because a subject that is broadly near the key
 * colour keys badly even with no single collision.
 */
export const SCORE_MIN_WEIGHT = 0.6;
export const SCORE_AVG_WEIGHT = 0.4;

/** A key colour scored against a sampled region. */
export interface KeyScore extends KeyColor {
  /** CIE76 distance to the nearest subject colour. Higher is safer. */
  readonly minDist: number;
  /** Distance to the average subject colour, weighted by pixel count. */
  readonly avgDist: number;
  /** Share of subject pixels within `DANGER_DELTA_E`, as a percentage. */
  readonly dangerPercent: number;
  /** The weighted verdict. Higher is better. */
  readonly score: number;
}

/** One decimal place, which is the precision the results are shown at. */
const toTenth = (value: number): number => Math.round(value * 10) / 10;

/**
 * Score every candidate key colour against a region of the subject.
 *
 * Returns undefined when the region holds fewer than [`MIN_ANALYSIS_PIXELS`]
 * opaque pixels, which is the case the dialogue reports rather than scoring.
 *
 * Results are ordered best first. Ties keep the order of [`KEY_COLORS`],
 * `Array.prototype.sort` being stable, which is what makes the list read
 * consistently across runs on the same input.
 */
export const scoreKeyColors = (image: RgbaImage): readonly KeyScore[] | undefined => {
  const shift = 8 - HISTOGRAM_BITS;
  const mask = (1 << HISTOGRAM_BITS) - 1;
  const { data } = image;

  const counts = new Map<number, number>();
  let opaquePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (channel(data, i + 3) < OPAQUE_ALPHA_MIN) continue;
    const key =
      ((channel(data, i) >> shift) << (HISTOGRAM_BITS * 2)) |
      ((channel(data, i + 1) >> shift) << HISTOGRAM_BITS) |
      (channel(data, i + 2) >> shift);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    opaquePixels += 1;
  }

  if (opaquePixels < MIN_ANALYSIS_PIXELS) return undefined;

  const scored = KEY_COLORS.map((keyColor): KeyScore => {
    const keyLab = rgbToLab(keyColor.r, keyColor.g, keyColor.b);
    let minDist = Infinity;
    let weightedTotal = 0;
    let dangerPixels = 0;

    for (const [bucket, count] of counts) {
      const pixelLab = rgbToLab(
        ((bucket >> (HISTOGRAM_BITS * 2)) & mask) << shift,
        ((bucket >> HISTOGRAM_BITS) & mask) << shift,
        (bucket & mask) << shift,
      );
      const dist = Math.sqrt(
        (keyLab.L - pixelLab.L) ** 2 +
        (keyLab.a - pixelLab.a) ** 2 +
        (keyLab.b - pixelLab.b) ** 2,
      );
      if (dist < minDist) minDist = dist;
      weightedTotal += dist * count;
      if (dist < DANGER_DELTA_E) dangerPixels += count;
    }

    const avgDist = weightedTotal / opaquePixels;
    return {
      ...keyColor,
      minDist: toTenth(minDist),
      avgDist: toTenth(avgDist),
      dangerPercent: toTenth((dangerPixels / opaquePixels) * 100),
      score: toTenth(minDist * SCORE_MIN_WEIGHT + avgDist * SCORE_AVG_WEIGHT),
    };
  });

  return [...scored].sort((a, b) => b.score - a.score);
};
