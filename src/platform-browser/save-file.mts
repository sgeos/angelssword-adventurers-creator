/**
 * Saving a file the page produced.
 *
 * In a browser a link with a `download` attribute saves it. In the mobile
 * application's web view such a link does nothing, so the host replaces the
 * saver with one that hands the bytes to the phone. Four places save files: a
 * prepared sprite, a generated sprite, a generated video, and an export.
 */

/** What to save: the bytes themselves, or a URL the page can read them from. */
export type SaveSource = Blob | string;

export type FileSaver = (source: SaveSource, filename: string) => void;

/** Revoked after this delay, which outlasts the browser starting the download. */
const REVOKE_AFTER_MS = 5000;

const linkSave: FileSaver = (source, filename) => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (typeof source !== "string") setTimeout(() => { URL.revokeObjectURL(url); }, REVOKE_AFTER_MS);
};

let saver: FileSaver = linkSave;

export const saveFile = (source: SaveSource, filename: string): void => {
    saver(source, filename);
};

/** Replace the saver. Called once, at start-up, by a host where links cannot download. */
export const setFileSaver = (next: FileSaver): void => {
    saver = next;
};
