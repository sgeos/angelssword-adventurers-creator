/**
 * The encoder worker's entry, inside the mobile project so that Expo's
 * bundler builds an address that exists. The worker itself is the shared one.
 * See src/platform-browser/workers.mts.
 */
import "../../src/platform-worker/gif-worker.mts";
