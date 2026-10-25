/**
 * Which pipeline stage is showing.
 *
 * The interface renders the tabs, but the stage controllers also move the user
 * between stages, as when Video Prep hands a clip to the exporter. Both reach
 * the same store, so neither has to know the other exists. The interface
 * subscribes, and a controller calls `switchTab` exactly as it did when the
 * function toggled classes on the page itself.
 *
 * Deliberately not a React module. The stage controllers are not React code,
 * and a native shell can subscribe to the same store.
 */

import { asTabId, type TabId } from "../core/tabs.mts";

export { TAB_IDS, asTabId, type TabId } from "../core/tabs.mts";

let current: TabId = 'tab-sprite-prep';
const listeners = new Set<() => void>();

export const currentTab = (): TabId => current;

/**
 * Listen for changes. Returns the function that stops listening, which is the
 * shape `useSyncExternalStore` expects.
 */
export const subscribeTab = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/**
 * Show one stage. A string naming no stage is ignored, as an unknown
 * `data-tab` value was when this toggled classes directly.
 */
export function switchTab(tabId: string): void {
    const next = asTabId(tabId);
    if (next === undefined || next === current) return;
    current = next;
    for (const listener of listeners) listener();
}
