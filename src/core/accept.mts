/**
 * The media types an `accept` attribute names, for a native file picker.
 *
 * The mobile application opens Android's document picker for the stages'
 * file inputs, because its web view has no file chooser of its own, and that
 * picker filters by media type alone. An `accept` attribute mixes media types,
 * wildcards such as `image/*`, and file extensions such as `.mov`, so each
 * extension is translated, and one this table does not know widens the filter
 * to everything rather than hiding a file the input would have taken. The
 * stages validate what they receive in any case, as they do on the desktop.
 */

/** The extensions the stages' inputs name, by their media type. */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
};

/** Matches `type/subtype` and `type/*`, case-insensitively, without parameters. */
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]*)$/;

/** Everything, which is what an absent or unusable `accept` means. */
export const ANY_TYPE = "*/*";

/**
 * The distinct media types `accept` allows, in the order it names them, or
 * `["*\/*"]` when it allows anything or names something untranslatable.
 */
export const acceptToMediaTypes = (accept: string): readonly string[] => {
    const types: string[] = [];
    for (const raw of accept.split(",")) {
        const entry = raw.trim().toLowerCase();
        if (entry === "") continue;
        const type = entry.startsWith(".") ? EXTENSION_TYPES[entry] : MEDIA_TYPE.test(entry) ? entry : undefined;
        if (type === undefined || type === ANY_TYPE) return [ANY_TYPE];
        if (!types.includes(type)) types.push(type);
    }
    return types.length === 0 ? [ANY_TYPE] : types;
};
