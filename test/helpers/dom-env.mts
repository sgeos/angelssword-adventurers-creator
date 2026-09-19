/**
 * A jsdom environment for testing DOM-coupled browser modules.
 *
 * The browser modules read `document` and `window` as globals at import time,
 * so those globals must exist before the module under test is imported. A
 * caller therefore installs the environment first and imports dynamically
 * afterwards.
 *
 * Globals are listed and assigned explicitly rather than copied by iterating
 * the jsdom window. Iterating would require reading arbitrary keys off a typed
 * object, which cannot be done without an assertion, and the configuration
 * bans those. The explicit form is longer and states exactly what a test can
 * rely on being present.
 *
 * Canvas is deliberately absent. jsdom provides no 2D context, and supplying a
 * fake one would mean asserting against a drawing surface that does nothing,
 * which proves less than it appears to. Modules whose behaviour is genuinely
 * pixel work are covered by their `-core` siblings, which take buffers and
 * need no DOM at all.
 */
import { JSDOM } from 'jsdom';

/** Handles needed to tear an installed environment back down. */
export interface DomEnvironment {
    readonly window: JSDOM['window'];
    readonly document: Document;
    readonly cleanup: () => void;
}

/**
 * Install a DOM built from `html` onto globalThis and return a cleanup
 * function. Tests must call cleanup, otherwise globals leak into the next
 * test file and failures surface in unrelated places.
 */
export function installDom(
    html = '<!doctype html><html><body></body></html>',
): DomEnvironment {
    const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/' });
    const w = dom.window;

    const entries: readonly (readonly [string, unknown])[] = [
        ['window', w],
        ['document', w.document],
        ['navigator', w.navigator],
        ['location', w.location],
        ['localStorage', w.localStorage],
        ['getComputedStyle', w.getComputedStyle.bind(w)],
        ['requestAnimationFrame', w.requestAnimationFrame.bind(w)],
        ['cancelAnimationFrame', w.cancelAnimationFrame.bind(w)],
        ['Element', w.Element],
        ['HTMLElement', w.HTMLElement],
        ['HTMLInputElement', w.HTMLInputElement],
        ['HTMLButtonElement', w.HTMLButtonElement],
        ['HTMLCanvasElement', w.HTMLCanvasElement],
        ['HTMLVideoElement', w.HTMLVideoElement],
        ['HTMLImageElement', w.HTMLImageElement],
        ['HTMLSelectElement', w.HTMLSelectElement],
        ['HTMLTextAreaElement', w.HTMLTextAreaElement],
        ['HTMLAnchorElement', w.HTMLAnchorElement],
        ['Event', w.Event],
        ['CustomEvent', w.CustomEvent],
        ['MouseEvent', w.MouseEvent],
        ['Blob', w.Blob],
        ['FileReader', w.FileReader],
    ];

    const restore: (() => void)[] = [];
    for (const [name, value] of entries) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, name);
        restore.push(() => {
            if (previous === undefined) Reflect.deleteProperty(globalThis, name);
            else Object.defineProperty(globalThis, name, previous);
        });
        Object.defineProperty(globalThis, name, {
            value,
            configurable: true,
            writable: true,
            enumerable: false,
        });
    }

    return {
        window: w,
        document: w.document,
        cleanup: (): void => {
            for (const undo of restore.reverse()) undo();
            w.close();
        },
    };
}
