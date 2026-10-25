/**
 * The storage capability on the phone.
 *
 * The same `KeyValueStore` port the browser implements over Web Storage, so
 * the settings screen saves through the same core functions the web panel
 * uses. The three API keys go to the platform's secure store, which encrypts
 * them with a key held by the operating system; everything else goes to
 * SQLite's key-value store. Both are synchronous, as the port is.
 *
 * Removing a secret writes an empty string rather than deleting it, because
 * the secure store's deletion is asynchronous only, and a read straight after
 * a removal must not see the old key. An empty value reads as absent.
 */
import * as SecureStore from "expo-secure-store";
import { Storage } from "expo-sqlite/kv-store";
import type { KeyValueStore } from "../../src/core/ports/storage.mts";
import { PROVIDERS, VIDEO_PROVIDERS } from "../../src/core/providers.mts";
import { COMFY_SETTINGS_KEY, WAN_SETTINGS_KEY } from "../../src/core/comfyui-core.mts";

const SECRET_KEYS: ReadonlySet<string> = new Set([
    PROVIDERS.openai.storageKey,
    PROVIDERS.xai.storageKey,
    VIDEO_PROVIDERS.google.storageKey,
]);

const absentIfEmpty = (value: string | null): string | undefined => (value === null || value === "" ? undefined : value);

export const nativeStore: KeyValueStore = {
    read: (key) => absentIfEmpty(SECRET_KEYS.has(key) ? SecureStore.getItem(key) : Storage.getItemSync(key)),
    write: (key, value) => {
        if (SECRET_KEYS.has(key)) SecureStore.setItem(key, value);
        else Storage.setItemSync(key, value);
    },
    remove: (key) => {
        if (SECRET_KEYS.has(key)) SecureStore.setItem(key, "");
        else Storage.removeItemSync(key);
    },
};

/**
 * Every stored setting, by storage key, for the web view, which keeps no
 * storage of its own: the three keys, and everything in the key-value store,
 * which holds the ComfyUI and Wan settings and the preferences the stages
 * save, such as the sprite zoom and the character name. `null` tells the web
 * view to drop a key it may hold, so a removed key is always listed.
 */
export const storedSettings = (): Record<string, string | null> => {
    const keys = new Set([...SECRET_KEYS, COMFY_SETTINGS_KEY, WAN_SETTINGS_KEY, ...Storage.getAllKeysSync()]);
    return Object.fromEntries([...keys].map((key) => [key, nativeStore.read(key) ?? null]));
};

/** A setting the web view saved, written where it persists. `null` removes it. */
export const writeSetting = async (key: string, value: string | null): Promise<void> => {
    if (value === null) nativeStore.remove(key);
    else nativeStore.write(key, value);
    return Promise.resolve();
};
