/**
 * Files in and out of the stages: saving what they produced, a sprite, a
 * generated video, an export, and picking what they load.
 *
 * The bytes are written to the application's cache and offered through the
 * system share sheet, from which the user saves them to their files or gallery
 * or sends them on. The cache is the right place for something whose real
 * destination the user chooses; the system may clear it later.
 */
import * as DocumentPicker from "expo-document-picker";
import { File, FileMode, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { acceptToMediaTypes } from "../../src/core/accept.mts";

/** A file name the file system accepts, keeping the name the stage chose where it can. */
export const safeFileName = (name: string): string => {
    const cleaned = name.replace(/[^\w.\- ]+/g, "_").trim();
    return cleaned === "" || cleaned.startsWith(".") ? `export${cleaned}` : cleaned;
};

export const saveFile = async (filename: string, mimeType: string, base64: string): Promise<void> => {
    const file = new File(Paths.cache, safeFileName(filename));
    if (file.exists) file.delete();
    await file.write(base64, { encoding: "base64" });
    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Save ${file.name}` });
    }
};

/** A file the user picked, described for the web view, which then reads it in chunks. */
export interface PickedFile {
    readonly id: number;
    readonly name: string;
    readonly mimeType: string;
    readonly size: number;
}

/** Picked documents by identifier, with their sizes, until the web view releases them. */
const picked = new Map<number, { readonly uri: string; readonly size: number }>();

/**
 * The largest file read in one piece, by the file system module's own base64
 * encoder, which is fast: a 25 megabyte clip took 3.0 seconds, where reading
 * it in chunks encoded here took 9.6. A whole 100 megabyte read needed a 272
 * megabyte allocation and exceeded Expo Go's heap, so anything larger goes in
 * chunks. The web view asks for the whole file in one read up to this size.
 */
export const WHOLE_READ_LIMIT = 32 * 1024 * 1024;
let nextPick = 1;

/**
 * Open the system document picker for a stage's file input, filtered by the
 * input's `accept` attribute, and describe the chosen file, or return `null`
 * if the user cancelled. Expo's web view has no file chooser, so the web view
 * asks for this instead of opening one.
 *
 * The document is read where it is, through the address the picker grants,
 * rather than copied into the cache first: in Expo Go the copy landed outside
 * the directories the file system module may read, and reading it failed
 * with a missing permission.
 *
 * Nothing is read here. The web view reads the file in chunks through
 * `readPicked`, because reading a 100 megabyte clip whole as base64 needed a
 * 272 megabyte allocation and exceeded Expo Go's heap on the phone.
 */
export const pickFile = async (accept: string): Promise<PickedFile | null> => {
    const result = await DocumentPicker.getDocumentAsync({
        type: [...acceptToMediaTypes(accept)],
        copyToCacheDirectory: false,
        multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (asset === undefined) return null;
    const size = asset.size ?? new File(asset.uri).size;
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`The picked file reports no usable size: ${String(size)}`);
    const id = nextPick;
    nextPick += 1;
    picked.set(id, { uri: asset.uri, size });
    return { id, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream", size };
};

/** Bytes as base64, in slices small enough for `String.fromCharCode`'s argument limit. */
const toBase64 = (bytes: Uint8Array): string => {
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
    return btoa(binary);
};

/**
 * Up to `length` bytes of a picked file from `offset`, as base64. The handle
 * is opened and closed for each read, so that an abandoned read leaves no
 * descriptor open.
 */
export const readPicked = async (id: number, offset: number, length: number): Promise<string> => {
    const entry = picked.get(id);
    if (entry === undefined) throw new Error(`No picked file ${id.toString()}`);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0) {
        throw new Error(`Invalid read of ${length.toString()} bytes at ${offset.toString()}`);
    }
    if (offset === 0 && length === entry.size && entry.size <= WHOLE_READ_LIMIT) return new File(entry.uri).base64();
    const handle = new File(entry.uri).open(FileMode.ReadOnly);
    try {
        handle.offset = offset;
        return toBase64(await handle.readBytes(length));
    } finally {
        handle.close();
    }
};

/** Forget a picked file once the web view has read it, or given up. */
export const releasePicked = async (id: number): Promise<void> => {
    picked.delete(id);
    return Promise.resolve();
};
