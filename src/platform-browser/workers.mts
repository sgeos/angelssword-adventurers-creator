/**
 * The two Web Workers the exporter starts, behind a replaceable factory.
 *
 * The default is the form Vite bundles, `new Worker(new URL(..., import.meta.url))`,
 * which the web page uses. The mobile application's DOM component replaces it.
 * Expo's bundler supports the same form, but builds the worker's address
 * relative to the mobile project's root, and these workers live outside that
 * root, in `src/platform-worker/`, so the address it built named a file that
 * does not exist and every worker failed to load. The DOM component starts
 * the same workers through entry files inside its own directory instead.
 *
 * A seam rather than a second copy of the exporter: the controller asks for a
 * worker by what it does and never learns how it was made.
 */
export interface WorkerFactory {
    /** The Graphics Interchange Format encoder, `platform-worker/gif-worker.mts`. */
    readonly gif: () => Worker;
    /** The frame timer, `platform-worker/timer-worker.mts`. */
    readonly timer: () => Worker;
}

const bundled: WorkerFactory = {
    gif: () => new Worker(new URL('../platform-worker/gif-worker.mts', import.meta.url), { type: 'module' }),
    timer: () => new Worker(new URL('../platform-worker/timer-worker.mts', import.meta.url), { type: 'module' }),
};

let current: WorkerFactory = bundled;

/** Replace how the workers are started. The host calls this once, before any stage mounts. */
export const setWorkerFactory = (factory: WorkerFactory): void => {
    current = factory;
};

/** Start a worker of the given kind. */
export const startWorker = (kind: keyof WorkerFactory): Worker => current[kind]();

/**
 * What a worker's `error` event says, for a message. An `ErrorEvent` is not an
 * `Error`, and a failure to load the script carries no message at all, so the
 * fallback says so rather than claiming an unknown failure inside the encoder.
 */
export const describeWorkerError = (event: Event): string =>
    event instanceof ErrorEvent && event.message !== ''
        ? event.message
        : 'the worker did not start, or failed without a message';
