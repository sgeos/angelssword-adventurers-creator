/**
 * Remembered user preferences that belong to no single stage.
 *
 * Each of these was read and written inline with a storage call, a literal
 * key, and its own way of handling an unparsable value. Collecting them here
 * puts the keys and the defaults in one place, and puts both under test.
 *
 * What is NOT here: credentials and provider choices, which live with the
 * provider tables in `providers.mts`; the ComfyUI and Wan settings, which live
 * with their parsers in `comfyui-core.mts`; and the exporter's slider
 * positions, which live with the slider arithmetic in `exporter-math.mts`. A
 * preference belongs beside the thing that gives it meaning, and this file is
 * for the ones with nowhere better to be.
 */

import type { KeyValueStore } from "./ports/storage.mts";

/** Storage key holding the character name shared by two stages. */
export const CHARACTER_NAME_KEY = "as_char_name";

/** Storage key holding whether notification sounds play. */
export const SOUND_ENABLED_KEY = "as_sound_enabled";

/** Storage key holding the sprite's vertical offset, in pixels. */
export const SPRITE_OFFSET_KEY = "sp-offset";

/** Storage key holding the sprite's zoom, as a percentage. */
export const SPRITE_ZOOM_KEY = "sp-zoom";

/** Vertical offset applied when nothing is stored. */
export const SPRITE_OFFSET_DEFAULT = 0;

/** Zoom applied when nothing is stored. */
export const SPRITE_ZOOM_DEFAULT = 100;

/**
 * An integer from a stored string, or the fallback.
 *
 * `parseInt` is what the sprite stage used, so a trailing suffix is tolerated
 * and `120px` reads as 120. That is preserved rather than tightened, because
 * nothing establishes that no such value was ever written, and refusing one
 * now would silently reset a user's slider.
 *
 * What is NOT preserved is the surrounding expression. The original computed
 * `NaN` for an absent key and relied on `Number.isFinite` to reject it, which
 * works and reads as though absence were a parse failure. Absence is checked
 * directly here.
 */
export const storedInteger = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/** The character name, or an empty string when none is stored. */
export const loadCharacterName = (store: KeyValueStore): string =>
    store.read(CHARACTER_NAME_KEY) ?? "";

/** Remember the character name. */
export const saveCharacterName = (store: KeyValueStore, name: string): void => {
    store.write(CHARACTER_NAME_KEY, name);
};

/**
 * Whether notification sounds play. Absent means enabled.
 *
 * The stored form is the string `false` and nothing else, which is what the
 * shell wrote. Any other content, including `0` and `no`, reads as enabled,
 * and that is deliberate: the setting defaults on, so anything unrecognised
 * should land on the default rather than on its opposite.
 */
export const loadSoundEnabled = (store: KeyValueStore): boolean =>
    store.read(SOUND_ENABLED_KEY) !== "false";

/** Remember whether notification sounds play. */
export const saveSoundEnabled = (store: KeyValueStore, enabled: boolean): void => {
    store.write(SOUND_ENABLED_KEY, String(enabled));
};

/** The sprite's stored vertical offset, or the default. */
export const loadSpriteOffset = (store: KeyValueStore): number =>
    storedInteger(store.read(SPRITE_OFFSET_KEY), SPRITE_OFFSET_DEFAULT);

/** Remember the sprite's vertical offset. */
export const saveSpriteOffset = (store: KeyValueStore, offset: number): void => {
    store.write(SPRITE_OFFSET_KEY, offset.toString());
};

/** The sprite's stored zoom, or the default. */
export const loadSpriteZoom = (store: KeyValueStore): number =>
    storedInteger(store.read(SPRITE_ZOOM_KEY), SPRITE_ZOOM_DEFAULT);

/** Remember the sprite's zoom. */
export const saveSpriteZoom = (store: KeyValueStore, zoom: number): void => {
    store.write(SPRITE_ZOOM_KEY, zoom.toString());
};
