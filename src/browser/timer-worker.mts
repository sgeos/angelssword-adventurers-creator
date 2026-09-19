/**
 * AS Adventurer — interval timer worker.
 *
 * A worker's timers keep firing at their requested rate when the tab is in the
 * background, whereas the main thread's are throttled. The WebM export drives
 * its frame pacing from here for that reason.
 *
 * Small enough that the pre-conversion code inlined it as a string compiled to
 * a blob URL. It is a module for the same reason as gif-worker.mts: code in a
 * string is code no checker can see, and size is not the criterion.
 */

/** Start ticking every `ms`, or stop and shut the worker down. */
export type TimerCommand =
    | { readonly cmd: 'start'; readonly ms: number }
    | { readonly cmd: 'stop' };

/** Sent on every interval fire. */
export const TICK = 'tick';

let interval: ReturnType<typeof setInterval> | undefined;

self.addEventListener('message', (event: MessageEvent<TimerCommand>): void => {
    const message = event.data;
    if (message.cmd === 'start') {
        // Replace rather than stack, in case start arrives twice.
        if (interval !== undefined) clearInterval(interval);
        interval = setInterval(() => { self.postMessage(TICK); }, message.ms);
    } else {
        if (interval !== undefined) clearInterval(interval);
        interval = undefined;
        self.close();
    }
});
