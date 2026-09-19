/**
 * Colours, and detecting which one a frame is keyed against.
 *
 * # Why this exists
 *
 * The named-colour table existed twice, byte for byte, as `COLOR_NAMES` in the
 * platform's `app-utils.mts` and as `DEFAULT_COLOR_NAMES` in
 * `sprite-prep-core.mts`. The second copy was there because the first was in
 * the platform and the core could not reach it, and `buildPrompt` grew a
 * `colorNameFn` parameter so that a caller could supply the platform's copy.
 *
 * That injection point is a capability-shaped seam for something that is not a
 * capability. A lookup table is not a platform facility, and the core can
 * simply own it. The seam remains, because a caller overriding the naming is a
 * reasonable thing to want and a test exercises it, but its default is now the
 * one table rather than a second one.
 *
 * # What is here
 *
 * The conversions each half was doing inline, and the auto-detection that had
 * never been reachable from a test.
 */

import { channel, type RgbaImage } from "./pixels.mts";

/** A colour as the keyer, the swatches and the exporter carry it. */
export interface Rgb {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

/** Friendly names for the key colours the interface offers. */
export const COLOR_NAMES: Readonly<Record<string, string>> = {
    "#00FF00": "Green",
    "#FF00FF": "Magenta",
    "#0000FF": "Blue",
    "#FFFF00": "Yellow",
    "#00FFFF": "Cyan",
};

/** Friendly name for a known key colour, or the hex itself. */
export const colorName = (hex: string): string => COLOR_NAMES[hex.toUpperCase()] ?? hex;

/**
 * Read a six-digit hex colour.
 *
 * **This does not validate, and it never did.** A string that is not
 * `#RRGGBB` yields `NaN` in one or more channels rather than an error, and
 * that `NaN` reaches the keyer and propagates through its arithmetic. The
 * behaviour is preserved rather than corrected here, because correcting it
 * means deciding what a caller should do instead, which is a question about
 * the interface rather than about this function. It is characterised by a test
 * so that the decision is visible when someone takes it.
 *
 * Every present caller passes either a swatch's own `data-color` attribute or
 * a value this module produced, so nothing reaches it malformed today.
 */
export const hexToRgb = (hex: string): Rgb => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
});

/** One channel as two lowercase hex digits, clamped into range. */
const hexChannel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");

/**
 * Write a colour as `#rrggbb`.
 *
 * Clamped at both ends. The exporter's inline version clamped only above,
 * which was sufficient there because its only producer was the quantiser
 * below and could not go negative. A general function should not inherit that
 * assumption.
 */
export const rgbToHex = (rgb: Rgb): string =>
    `#${hexChannel(rgb.r)}${hexChannel(rgb.g)}${hexChannel(rgb.b)}`;

/**
 * How many sample points are wanted along each edge.
 *
 * The step is the dimension divided by this, so a wider frame is sampled no
 * more densely than a narrow one. Fifty is what the exporter used.
 */
export const EDGE_SAMPLES = 50;

/** Colours are counted in buckets this wide, to absorb compression noise. */
export const QUANTISE_STEP = 16;

/** Snap one channel to the counting grid. */
const quantise = (value: number): number =>
    Math.min(255, Math.round(value / QUANTISE_STEP) * QUANTISE_STEP);

/**
 * The colour a frame appears to be keyed against, by sampling its border.
 *
 * # Why the border and not the whole frame
 *
 * The subject is in the middle. Sampling everything would count the character
 * as well as the backdrop, and on a frame where the character is large the
 * character would win. The border is the part a keyed frame is expected to be
 * uniform across.
 *
 * # What the counting does
 *
 * Each sample is snapped to a grid [`QUANTISE_STEP`] wide before being
 * counted, so that compression noise around one backdrop colour lands in one
 * bucket. The reported colour is the bucket centre, not any pixel that was
 * actually sampled, which is why a nearly uniform green backdrop reports a
 * round value rather than whatever the first pixel happened to be.
 *
 * A tie is resolved in favour of whichever bucket was seen first, following
 * insertion order. That is what the original did by iterating its map, and it
 * is recorded because it is otherwise invisible.
 *
 * Returns undefined for a frame with no pixels, there being nothing to report.
 */
export const detectKeyColor = (image: RgbaImage): Rgb | undefined => {
    const { data, width, height } = image;
    if (width <= 0 || height <= 0) return undefined;

    const counts = new Map<string, { readonly rgb: Rgb; count: number }>();
    const sample = (x: number, y: number): void => {
        const i = (y * width + x) * 4;
        const rgb: Rgb = {
            r: quantise(channel(data, i)),
            g: quantise(channel(data, i + 1)),
            b: quantise(channel(data, i + 2)),
        };
        const key = `${rgb.r.toString()},${rgb.g.toString()},${rgb.b.toString()}`;
        const seen = counts.get(key);
        if (seen === undefined) counts.set(key, { rgb, count: 1 });
        else seen.count += 1;
    };

    const stepX = Math.max(1, Math.floor(width / EDGE_SAMPLES));
    for (let x = 0; x < width; x += stepX) {
        sample(x, 0);
        sample(x, height - 1);
    }
    const stepY = Math.max(1, Math.floor(height / EDGE_SAMPLES));
    for (let y = 0; y < height; y += stepY) {
        sample(0, y);
        sample(width - 1, y);
    }

    let best: { readonly rgb: Rgb; count: number } | undefined;
    for (const entry of counts.values()) {
        if (best === undefined || entry.count > best.count) best = entry;
    }
    return best?.rgb;
};
