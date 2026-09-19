/**
 * A `KeyValueStore` held in a Map.
 *
 * This is what the storage capability buys. Every function that now takes a
 * store used to read `localStorage` directly from inside a stage module, and
 * was therefore reachable only from a browser. Here it is a Map and three
 * methods.
 *
 * `recording` additionally keeps an ordered log of what was asked of it, so a
 * test can assert that a blank credential was REMOVED rather than written as
 * an empty string. That distinction is invisible to a test that only reads the
 * final contents back.
 */

import type { KeyValueStore } from '../../src/core/ports/storage.mts';

/** One operation performed on a recording store. */
export type StoreOp =
    | { readonly op: 'read'; readonly key: string }
    | { readonly op: 'write'; readonly key: string; readonly value: string }
    | { readonly op: 'remove'; readonly key: string };

/** A store backed by a Map, optionally seeded. */
export const memoryStore = (seed: Readonly<Record<string, string>> = {}): KeyValueStore => {
    const data = new Map<string, string>(Object.entries(seed));
    return {
        read: (key) => data.get(key),
        write: (key, value) => { data.set(key, value); },
        remove: (key) => { data.delete(key); },
    };
};

/** A memory store that also records what was asked of it. */
export const recordingStore = (
    seed: Readonly<Record<string, string>> = {},
): { readonly store: KeyValueStore; readonly ops: readonly StoreOp[] } => {
    const inner = memoryStore(seed);
    const ops: StoreOp[] = [];
    return {
        ops,
        store: {
            read: (key) => { ops.push({ op: 'read', key }); return inner.read(key); },
            write: (key, value) => { ops.push({ op: 'write', key, value }); inner.write(key, value); },
            remove: (key) => { ops.push({ op: 'remove', key }); inner.remove(key); },
        },
    };
};

/**
 * A store that throws on every operation.
 *
 * What a browser with site data blocked supplies. Nothing in the core is
 * expected to survive this, the capability's contract permitting a genuine
 * failure to throw; it exists so that the browser adapter's catching can be
 * argued about against something concrete.
 */
export const throwingStore = (): KeyValueStore => ({
    read: () => { throw new Error('storage is blocked'); },
    write: () => { throw new Error('storage is blocked'); },
    remove: () => { throw new Error('storage is blocked'); },
});
