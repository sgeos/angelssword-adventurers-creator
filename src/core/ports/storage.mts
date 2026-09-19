/**
 * The storage capability.
 *
 * # What this is for
 *
 * The core decides what is worth remembering, how it is encoded, and whether
 * what comes back is trustworthy. It does not decide where the bytes live.
 * That is the platform's business, and this interface is the seam.
 *
 * # Why `undefined` and not `null`
 *
 * The Web Storage interface returns `null` for an absent key, and until this
 * interface existed four core parsers took `string | null` because that is
 * what their callers had. The platform's representation of absence had
 * reached into the core's signatures.
 *
 * The repository's convention is that a narrowing yields the value or
 * `undefined`, so that is what this says. The adapter translates, which is
 * one line and is the adapter's job.
 *
 * # What an implementation must not do
 *
 * **It must not interpret a value.** Parsing, validating, and defaulting
 * belong to the core, which is where they can be tested. A store that
 * returned a parsed object would be a second authority on the format.
 *
 * **It must not throw for an absent key.** Absence is ordinary and is
 * reported by the return value.
 *
 * **It may throw for a genuine failure**, and a caller must assume it can.
 * A browser with site data blocked throws on the first access to
 * `localStorage` rather than returning nothing, which is why the browser
 * adapter catches rather than trusting the interface to be quiet.
 */
export interface KeyValueStore {
    /** The value stored under `key`, or undefined when there is none. */
    read: (key: string) => string | undefined;
    /** Store `value` under `key`, replacing whatever was there. */
    write: (key: string, value: string) => void;
    /** Remove `key`. Removing an absent key is not an error. */
    remove: (key: string) => void;
}

/**
 * A store that holds nothing and remembers nothing.
 *
 * The honest answer when a platform has no storage, or has one that refuses
 * to work. Every read reports absence, so the core takes its defaults, which
 * is the behaviour a user gets in a private window today. It is also the
 * simplest fixture a test can pass.
 */
export const NULL_STORE: KeyValueStore = {
    read: () => undefined,
    write: () => undefined,
    remove: () => undefined,
};
