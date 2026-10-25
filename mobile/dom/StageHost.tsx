/**
 * The four media stages and everything they need from the host, loaded by
 * the DOM component, `Stages.tsx`, once it has installed the settings store.
 *
 * The stages are the browser implementation, unchanged, `ui/StagePanels.tsx`
 * and the controllers it mounts. All four share this one web view, because
 * they share one handoff object in memory.
 *
 * What the web view lacks, the native side supplies through the functions in
 * the props, which Expo turns into asynchronous calls across the bridge:
 *
 * - the network, for `/api` routes there is no server to answer, through the
 *   in-page proxy, which plans each route here and asks native code only to
 *   send the upstream request;
 * - saving a file, which a link cannot do in a web view;
 * - the notification sound, whose files are not served to the web view;
 * - the toasts and the current tab, which the native chrome shows;
 * - the workers, whose bundled addresses would not resolve.
 *
 * This module is imported only after the settings store is in place, because
 * importing it evaluates stage modules that read their saved preferences as
 * they load.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { TamaguiProvider, View } from "@tamagui/core";
import "../../public/style.css";
import { config } from "../../src/ui/config.ts";
import { WEB_ONLY_CSS } from "../../src/ui/web-only.ts";
import { StagePanels } from "../../src/ui/StagePanels.tsx";
import { setHttpTransport } from "../../src/platform-browser/http.mts";
import { bytesFromBase64, inPageProxy } from "../../src/platform-browser/in-page-proxy.mts";
import { setFileSaver } from "../../src/platform-browser/save-file.mts";
import { fetchBlob, readBundledTextSync } from "../../src/platform-browser/binary.mts";
import { setWorkerFactory } from "../../src/platform-browser/workers.mts";
import { ASAdventurer, notificationSound } from "../../src/platform-browser/shell.mts";
import { asTabId, currentTab, subscribeTab, switchTab } from "../../src/platform-browser/navigation.mts";
import { currentToasts, subscribeToasts } from "../../src/platform-browser/toasts.mts";
import { testComfy, testGoogleKey, testOpenAiKey, type ConnectionStatus } from "../../src/platform-browser/settings.mts";
import { loadFonts } from "./fonts.ts";
import type { StagesProps, TestRequest } from "./Stages.tsx";

/**
 * The host's functions, as of the latest render. The seams below are installed
 * once and call through this, so they always reach the current props.
 */
const host: { current: StagesProps | undefined } = { current: undefined };

/**
 * How much of a large picked file crosses the bridge per message. Four
 * megabytes is about five and a half as base64, which both sides handle
 * comfortably, and a 100 megabyte clip takes twenty-five round trips.
 */
const PICK_CHUNK = 4 * 1024 * 1024;

/**
 * Up to this size a picked file is read in one message, which native code
 * serves with its fast whole-file encoder. Matches `WHOLE_READ_LIMIT` in
 * mobile/app/files.ts, which cannot be imported here, across the bridge.
 */
const WHOLE_READ_LIMIT = 32 * 1024 * 1024;

const hostOrThrow = (): StagesProps => {
    if (host.current === undefined) throw new Error("The stages were used before the host connected");
    return host.current;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = "";
    // Chunked so a large export does not exceed the argument limit of
    // String.fromCharCode. Each pass advances by a fixed step to the end.
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
};

/** The text of the first of `addresses` that can be read, or the last failure. */
const readFirst = (addresses: readonly string[]): string => {
    let failure: unknown = new Error("No address to read");
    for (const address of new Set(addresses)) {
        try {
            return readBundledTextSync(address);
        } catch (error: unknown) {
            failure = error;
        }
    }
    throw failure;
};

/**
 * Replace the global Worker with one that starts a file: script from a blob:
 * copy, read through `readBundledTextSync`, which argues why it is
 * synchronous. The blob address is kept for the page's
 * life rather than revoked, because the worker fetches it after construction
 * returns; there are two scripts, so at most two are kept.
 */
const installFileSafeWorker = (): void => {
    const NativeWorker = globalThis.Worker;
    const blobs = new Map<string, string>();
    const loadable = (script: string | URL): string | URL => {
        const address = new URL(script, location.href);
        if (address.protocol !== "file:") return script;
        const cached = blobs.get(address.href);
        if (cached !== undefined) return cached;
        // Expo's production build names a worker relative to the chunk that
        // starts it, which already sits in _expo/static/js/web/, so the
        // address arrives with that directory twice and names no file. The
        // collapsed address is tried first, since the repetition is never
        // part of a real path; a fixed Expo produces none, and then the two
        // are the same address.
        const collapsed = address.href.replace(/(\/_expo\/static\/js\/web\/)(?:_expo\/static\/js\/web\/)+/, "$1");
        const text = readFirst([collapsed, address.href]);
        const blob = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
        blobs.set(address.href, blob);
        return blob;
    };
    class FileSafeWorker extends NativeWorker {
        constructor(script: string | URL, options?: WorkerOptions) {
            super(loadable(script), options);
        }
    }
    Object.defineProperty(globalThis, "Worker", { value: FileSafeWorker, writable: true, configurable: true });
};

/**
 * Installed once, when this module is first evaluated, so that they are in
 * place before any stage mounts. A stage's first request can come from its
 * mount, and React runs a child's effects before its parent's.
 */
const installSeams = (): void => {
    // A request to another site goes out natively as well, where no
    // cross-origin rule applies. Only the Google key test makes one.
    const direct = async (url: string, init?: { readonly method: string; readonly headers?: Readonly<Record<string, string>>; readonly body?: string; readonly timeout?: number }): Promise<{ status: number; text: () => Promise<string>; bytes: () => Promise<Uint8Array<ArrayBuffer>> }> => {
        const result = await hostOrThrow().sendUpstream({
            url,
            method: init?.method ?? "GET",
            headers: { ...init?.headers },
            body: init?.body === undefined ? undefined : { kind: "text", text: init.body },
            timeout: init?.timeout ?? 60_000,
            reply: "relay",
            label: "direct",
        });
        const binary = atob(result.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = new TextDecoder().decode(bytes);
        return { status: result.status, text: async () => Promise.resolve(text), bytes: async () => Promise.resolve(bytes) };
    };
    setHttpTransport(inPageProxy(async (plan) => hostOrThrow().sendUpstream(plan), direct));

    setFileSaver((source, filename) => {
        (async (): Promise<void> => {
            const blob = typeof source === "string" ? await fetchBlob(source) : source;
            const bytes = new Uint8Array(await blob.arrayBuffer());
            await hostOrThrow().saveFile(filename, blob.type === "" ? "application/octet-stream" : blob.type, bytesToBase64(bytes));
        })().catch((error: unknown) => {
            // The stage has already reported success by the time the save
            // runs, so a failure here would otherwise go unseen.
            console.error("Saving failed:", error);
            void hostOrThrow().showToast(`Could not save ${filename}`, "error");
        });
    });

    notificationSound.setPlayer(() => { void hostOrThrow().playSound(); });

    // Expo's web view has no file chooser, so a tap on a file input would do
    // nothing. Every tap reaching one, directly or through a stage calling
    // its click(), is caught before the web view sees it, and native code
    // opens the system picker. The chosen file is set on the input and a
    // change event sent, which is what a browser does, so the stages read it
    // exactly as they do on the desktop.
    document.addEventListener("click", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
        event.preventDefault();
        (async (): Promise<void> => {
            const native = hostOrThrow();
            const picked = await native.pickFile(input.accept);
            if (picked === null) return;
            // In chunks, each kept as a Blob part, so that neither side holds
            // the whole file as base64 at once. Each pass advances by a fixed
            // step to the size the picker reported, and a short read stops it.
            const parts: Blob[] = [];
            try {
                const step = picked.size <= WHOLE_READ_LIMIT ? Math.max(picked.size, 1) : PICK_CHUNK;
                for (let offset = 0; offset < picked.size; offset += step) {
                    const length = Math.min(step, picked.size - offset);
                    const bytes = bytesFromBase64(await native.readPicked(picked.id, offset, length));
                    if (bytes.length !== length) throw new Error(`Read ${bytes.length.toString()} of ${length.toString()} bytes at ${offset.toString()}`);
                    parts.push(new Blob([bytes]));
                }
            } finally {
                void native.releasePicked(picked.id);
            }
            const transfer = new DataTransfer();
            transfer.items.add(new File(parts, picked.name, { type: picked.mimeType }));
            input.files = transfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        })().catch((error: unknown) => {
            console.error("Picking a file failed:", error);
            void hostOrThrow().showToast("Could not open that file", "error");
        });
    }, true);

    // A standalone build loads this page from file:///android_asset/, and the
    // web view refuses to start a worker from a file: address, although it
    // will read the same file and will start a worker from a blob: address.
    // Development serves everything over HTTP from Metro, which is why this
    // only appeared in a release build, as "the worker did not start". Expo's
    // worker helper calls the global constructor when it runs, so the global
    // is replaced, on file: pages only, by one that loads a file: script as a
    // blob first.
    if (location.protocol === "file:") installFileSafeWorker();

    // Entry files beside this one, so that the bundler's addresses for them
    // resolve. See src/platform-browser/workers.mts.
    setWorkerFactory({
        gif: () => new Worker(new URL("./gif-worker.ts", import.meta.url), { type: "module" }),
        timer: () => new Worker(new URL("./timer-worker.ts", import.meta.url), { type: "module" }),
    });

    // Published for the same reason the web page publishes it: it is the
    // documented boundary between stages, and a debugging session reads it.
    Object.defineProperty(globalThis, "ASAdventurer", { value: ASAdventurer, writable: false, enumerable: true, configurable: true });
};

installSeams();

void loadFonts().then((failed) => {
    if (failed.length > 0) console.warn("Fonts that did not load, left on their fallbacks:", failed.join(", "));
});

const runTest = async (request: TestRequest): Promise<ConnectionStatus> => {
    switch (request.kind) {
        case "openai":
            return testOpenAiKey(request.value);
        case "google":
            return testGoogleKey(request.value);
        case "comfy":
            return testComfy(request.value);
    }
};

export default function StageHost(props: StagesProps): ReactNode {
    host.current = props;

    const wanted = asTabId(props.activeTab) ?? "tab-sprite-prep";
    if (currentTab() !== wanted) switchTab(wanted);

    // A stage that moves the user, as Video Prep does when it hands a clip to
    // the exporter, changes the tab store; the native tab bar follows.
    useEffect(() => subscribeTab(() => { void hostOrThrow().changeTab(currentTab()); }), []);

    // Each new toast is shown natively, once.
    const shownToasts = useRef(new Set<number>());
    useEffect(() => subscribeToasts(() => {
        for (const toast of currentToasts()) {
            if (shownToasts.current.has(toast.id)) continue;
            shownToasts.current.add(toast.id);
            void hostOrThrow().showToast(toast.message, toast.kind);
        }
    }), []);

    // A connection test from the settings screen, run here so that it goes
    // through the same proxy plan and guards as the stages' own requests.
    const lastTest = useRef(0);
    const { test } = props;
    useEffect(() => {
        if (test === null || test.id === lastTest.current) return;
        lastTest.current = test.id;
        void (async (): Promise<void> => {
            const status = await runTest(test);
            await hostOrThrow().reportTest(test.id, status);
        })();
    }, [test]);

    return (
        <TamaguiProvider config={config} defaultTheme="dark">
            <style dangerouslySetInnerHTML={{ __html: WEB_ONLY_CSS }} />
            {/* Expo's root element is a flex row, and a React Native Web view
                does not shrink, so without a width this grew to the widest
                line of its content, 1,339 pixels on a 384 pixel screen. */}
            <View padding={12} width="100%" minWidth={0} flexShrink={1}>
                <StagePanels active={wanted} />
            </View>
        </TamaguiProvider>
    );
}
