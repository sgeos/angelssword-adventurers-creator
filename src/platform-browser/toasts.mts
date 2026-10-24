/**
 * Transient notifications.
 *
 * Every stage reports through `showToast`, and none of them is React code, so
 * the messages go into a store the interface renders from. The timings are the
 * ones the original applied to elements it created directly: shown for three
 * and a half seconds, then given four hundred milliseconds to animate out.
 */

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
    readonly id: number;
    readonly message: string;
    readonly kind: ToastKind;
    /** True once the toast has begun to leave. */
    readonly leaving: boolean;
}

const VISIBLE_MS = 3500;
const EXIT_MS = 400;

const KINDS: readonly ToastKind[] = ['info', 'success', 'warning', 'error'];

/**
 * A known kind, or `info` for anything else. Callers pass a free string, and
 * an unknown one used to become an unstyled class rather than an error.
 */
const asKind = (value: string): ToastKind => KINDS.find((k) => k === value) ?? 'info';

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const publish = (next: readonly Toast[]): void => {
    toasts = next;
    for (const listener of listeners) listener();
};

/** The toasts currently on screen, oldest first. Stable between changes. */
export const currentToasts = (): readonly Toast[] => toasts;

export const subscribeToasts = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export function showToast(message: string, type = 'info'): void {
    const id = nextId;
    nextId += 1;
    publish([...toasts, { id, message, kind: asKind(type), leaving: false }]);
    setTimeout(() => {
        publish(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => { publish(toasts.filter((t) => t.id !== id)); }, EXIT_MS);
    }, VISIBLE_MS);
}
