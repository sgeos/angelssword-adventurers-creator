/**
 * The time capability, over the page's timers.
 *
 * `setTimeout` is subject to the browser's throttling in a background tab,
 * which is a real property and not a defect of this adapter. The WebM export
 * drives its frame pacing from a Web Worker for exactly that reason, and a
 * caller needing unthrottled pacing should keep doing so rather than expect
 * this to supply it.
 *
 * `performance.now` rather than `Date.now`, because the capability asks for a
 * monotonic reading and the wall clock is not one. A system clock adjustment
 * mid-poll would otherwise make an elapsed duration negative.
 */

import type { Clock } from "../core/ports/clock.mts";

/** The clock the browser half uses. */
export const browserClock: Clock = {
    now: () => performance.now(),
    sleep: async (ms: number) =>
        new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
};
