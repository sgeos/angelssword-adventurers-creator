/**
 * The pipeline's stages, by the identifiers the interface uses for them.
 *
 * Shared vocabulary rather than behaviour: the web chrome, the mobile
 * application's native tab bar and the store that tracks the current tab all
 * name stages this way, so it lives where every layer can read it.
 */

export const TAB_IDS = [
    "tab-sprite-prep",
    "tab-video-gen",
    "tab-video-prep",
    "tab-exporter",
    "tab-settings",
] as const;

export type TabId = (typeof TAB_IDS)[number];

/** A tab identifier, or `undefined` for a string that names no tab. */
export const asTabId = (value: string): TabId | undefined => TAB_IDS.find((id) => id === value);
