/**
 * The time capability.
 *
 * # Why the core needs one
 *
 * Every polling loop in this application waits between attempts, and every
 * one of them reached `setTimeout` directly, which is why not one of them
 * could be tested. A loop that sleeps for real cannot be asserted on without
 * waiting for real, and a test that waits for real is a test nobody runs.
 *
 * An injected clock can be driven. A fake that returns immediately turns a
 * ninety attempt poll loop into a few microseconds, and one that counts its
 * calls lets a test assert on the backoff schedule rather than on the elapsed
 * wall time.
 *
 * # Why `now` is here as well as `sleep`
 *
 * `Date.now` is ECMAScript rather than a platform facility, so no library
 * setting excludes it from the core and `eslint.config.mjs` bans it instead.
 * The ban would be pointless without somewhere for the need to go.
 *
 * # What an implementation must not do
 *
 * **`sleep` must resolve, and must not reject.** A caller in a poll loop has
 * no meaningful response to a failed wait, and a clock that can throw pushes
 * a branch into every loop that uses one.
 *
 * **`now` must be monotonic within a run** to the extent the platform allows.
 * Nothing here depends on it matching any particular epoch, only on the
 * difference between two readings being a duration.
 */
export interface Clock {
    /** Milliseconds since an unspecified origin, for measuring durations. */
    now: () => number;
    /** Resolve after at least `ms` milliseconds. */
    sleep: (ms: number) => Promise<void>;
}

/**
 * A clock that never waits and never advances.
 *
 * For a test that cares about the sequence of attempts rather than about
 * time. A test that cares about elapsed time should supply one it controls.
 *
 * `sleep` awaits a resolved promise rather than returning one. Two lint rules
 * disagree about a promise-returning member with nothing to wait for, one
 * demanding `async` and the other objecting to its absent `await`, and this
 * repository already carries one narrow exemption for that pair. A second
 * exemption is not warranted when a yield to the microtask queue satisfies
 * both rules and is the more faithful fake besides: a caller in a poll loop
 * still gives up control, which is what a real sleep does and what a bare
 * resolved promise does not.
 */
export const INSTANT_CLOCK: Clock = {
    now: () => 0,
    sleep: async () => { await Promise.resolve(); },
};
