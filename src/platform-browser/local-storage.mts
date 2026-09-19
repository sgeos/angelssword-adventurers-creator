/**
 * The storage capability, over Web Storage.
 *
 * # Why this is more than three forwarding calls
 *
 * `localStorage` is not reliably present and not reliably usable. A browser
 * configured to block site data throws a `SecurityError` on the first
 * property access, before any method is called, and a quota exhausted by
 * another page on the origin throws on `setItem`. Neither is exotic: the
 * first is what a user who has turned off cookies experiences, and the
 * application currently has twenty-seven unguarded call sites that would
 * take the whole page down with it.
 *
 * So this adapter catches. A read that fails reports absence, and the core
 * then takes its default, which is the same path a first-time visitor
 * follows. A write that fails is dropped, because the alternative is to
 * abandon work the user has done in order to report that a preference could
 * not be remembered.
 *
 * **That is a deliberate trade and it is worth stating plainly.** Dropping a
 * write silently means a preference can appear to be saved and not be. The
 * judgement is that for slider positions, a chosen provider, and a character
 * name, a lost preference is a smaller harm than a broken page. A credential
 * is the one case where that judgement is arguable, and the settings panel
 * reads the value back after writing it, so a silent failure there surfaces
 * as the field not staying filled.
 *
 * # What this does not do
 *
 * It does not parse, validate, or default. Those belong to the core, where
 * they are tested. This file is the only place in the project that knows the
 * bytes live in Web Storage.
 */

import type { KeyValueStore } from "../core/ports/storage.mts";

/**
 * Whether Web Storage can be used at all.
 *
 * Probed by writing and removing a key rather than by checking that the
 * object exists. Presence does not imply usability, which is the whole
 * problem: a blocked store is present and throws.
 */
const probe = (): Storage | undefined => {
    try {
        const key = "__as_storage_probe__";
        localStorage.setItem(key, key);
        localStorage.removeItem(key);
        return localStorage;
    } catch {
        return undefined;
    }
};

/**
 * A store backed by `localStorage`, degrading to one that forgets.
 *
 * The probe runs once, at construction. A store that becomes unusable later,
 * which quota exhaustion can cause, is still handled, because each operation
 * catches as well.
 */
export const createLocalStore = (): KeyValueStore => {
    const backing = probe();
    if (backing === undefined) {
        return {
            read: () => undefined,
            write: () => undefined,
            remove: () => undefined,
        };
    }
    return {
        read: (key: string): string | undefined => {
            try {
                // Web Storage reports absence as null; the capability uses
                // undefined, and translating is this adapter's job.
                return backing.getItem(key) ?? undefined;
            } catch {
                return undefined;
            }
        },
        write: (key: string, value: string): void => {
            try {
                backing.setItem(key, value);
            } catch {
                // Dropped. See the module header for why this is not thrown.
            }
        },
        remove: (key: string): void => {
            try {
                backing.removeItem(key);
            } catch {
                // Dropped, for the same reason.
            }
        },
    };
};

/**
 * The one store the browser half uses.
 *
 * A single instance rather than one per stage, so the probe runs once and so
 * that nothing can end up with a different view of the same origin's data.
 */
export const browserStore: KeyValueStore = createLocalStore();
