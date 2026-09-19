/**
 * The browser entry point.
 *
 * An entry point constructs what the application needs, hands it over, and
 * runs. It holds no logic, which is why this file is short and why nothing
 * imports it. A module that anything imports is not an entry point, and the
 * lint configuration enforces that for this directory rather than leaving it
 * to be noticed in review.
 *
 * Everything called below lives in the platform layer, in `shell.mts`, which
 * was this file until the layers were separated. The four stage modules import
 * from there and not from here, so the pipeline's shared state and its chrome
 * no longer arrive through the entry point.
 */

import {
    ASAdventurer,
    initCharNameSync,
    initKeyboard,
    initSettings,
    initTabs,
} from "../platform-browser/shell.mts";

/**
 * Publish the handoff singleton on the global object.
 *
 * ECMAScript modules create no globals, so nothing outside the module graph
 * could see this otherwise. It is published deliberately rather than as a
 * leftover. The handoff is the documented boundary between pipeline stages,
 * and the characterization suite in test/integration/browser asserts against
 * its shape.
 *
 * Publishing belongs here rather than in the shell. Deciding what a page
 * exposes to the world is an entry point's business, and the shell should be
 * usable by a different entry point that exposes nothing.
 *
 * Object.defineProperty rather than an assignment through a cast: the lint
 * configuration bans type assertions and `declare global`, and defineProperty
 * needs neither.
 */
Object.defineProperty(globalThis, 'ASAdventurer', {
    value: ASAdventurer,
    writable: false,
    enumerable: true,
    configurable: true,
});

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSettings();
    initKeyboard();
    initCharNameSync();
    console.log('⚔️ AS Adventurer initialized');
});
