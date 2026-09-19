/**
 * What the application publishes on the page's global object.
 *
 * `app.mts` puts the handoff singleton on globalThis deliberately — it is the
 * documented boundary between pipeline stages, and these specs assert on its
 * shape. Inside `page.evaluate` that value is reached through `window`, which
 * the DOM lib does not know about, so it is declared here.
 *
 * This is an ambient declaration, which the lint configuration bans outside
 * declaration files precisely because such a declaration usually fabricates a
 * type for something the checker never sees. That is not the case here: the
 * type is imported from the module that publishes the value, so if the
 * handoff's shape changes these specs stop compiling.
 */
import type { AppState } from '../../../src/platform-browser/shell.mts';

declare global {
  interface Window {
    /**
     * Present once app.mjs has run. Optional because a spec may evaluate
     * before the module executes, and because nothing should assume it.
     */
    readonly ASAdventurer?: AppState;
    /**
     * Not published by the application. Declared so the one spec that probes
     * for it can compile; that spec skips when it is absent, which it is.
     */
    readonly ChromaKey?: new () => unknown;
  }
}
