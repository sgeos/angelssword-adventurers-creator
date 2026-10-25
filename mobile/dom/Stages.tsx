"use dom";
/**
 * The four media stages, running in a web view on the phone.
 *
 * An Expo DOM component: this file and everything it imports is bundled for
 * the web and rendered in a web view, while the native application around it
 * draws the chrome and the settings. The stages themselves are in
 * `StageHost.tsx`, which this file loads once the settings are in place.
 *
 * The settings come first because Expo's web view has no Web Storage, where
 * the stages expect to find them: `localStorage` is null there, and Expo
 * offers no option to enable it. So the settings live natively, arrive in the
 * props, and are held here in memory, installed as the browser platform's
 * store before any stage module loads. Several stage modules read a saved
 * preference as they load, which is before any props could reach them, so the
 * host module is imported dynamically, after the first props have filled the
 * store. A setting a stage saves is written back to native storage.
 *
 * Keeping the store in memory also means the provider keys are never written
 * to the web view's disk, only held while it runs.
 *
 * This file imports nothing that reads a setting when it loads. Adding an
 * import here that reaches a stage module would read the store before it is
 * filled, and that stage would start from its defaults.
 */
import type { DOMProps } from "expo/dom";
import { useEffect, useState, type ReactNode } from "react";
import type { KeyValueStore } from "../../src/core/ports/storage.mts";
import type { UpstreamPlan } from "../../src/core/proxy.mts";
import type { UpstreamResult } from "../../src/platform-browser/in-page-proxy.mts";
import type { ConnectionStatus } from "../../src/platform-browser/settings.mts";
import { setStoreBacking } from "../../src/platform-browser/local-storage.mts";

/** A connection test the settings screen asked for. `id` pairs the request with its report. */
export interface TestRequest {
    readonly id: number;
    readonly kind: "openai" | "google" | "comfy";
    readonly value: string;
}

export interface StagesProps {
    /** The tab to show, from the native tab bar. */
    readonly activeTab: string;
    /** Every stored setting by storage key. `null` removes a key. */
    readonly stored: Readonly<Record<string, string | null>>;
    /** The latest connection test the settings screen asked for, if any. */
    readonly test: TestRequest | null;
    readonly sendUpstream: (plan: UpstreamPlan) => Promise<UpstreamResult>;
    readonly saveFile: (filename: string, mimeType: string, base64: string) => Promise<void>;
    readonly playSound: () => Promise<void>;
    readonly showToast: (message: string, kind: string) => Promise<void>;
    readonly changeTab: (tab: string) => Promise<void>;
    readonly reportTest: (id: number, status: ConnectionStatus) => Promise<void>;
    /** Open the system picker for a file input's `accept`, and describe the choice. `null` if cancelled. */
    readonly pickFile: (accept: string) => Promise<{ readonly id: number; readonly name: string; readonly mimeType: string; readonly size: number } | null>;
    /** Up to `length` bytes of a picked file from `offset`, as base64. */
    readonly readPicked: (id: number, offset: number, length: number) => Promise<string>;
    /** Forget a picked file. */
    readonly releasePicked: (id: number) => Promise<void>;
    /**
     * Called once each time this web view starts. A second call without the
     * application restarting means the system killed the web view and it was
     * reloaded, losing whatever the stages held; see App.tsx.
     */
    readonly started: () => Promise<void>;
    /** Persist a setting a stage saved. `null` removes it. */
    readonly writeSetting: (key: string, value: string | null) => Promise<void>;
    readonly dom?: DOMProps;
}

const settings = new Map<string, string>();

/** Where a stage's save goes on to, as of the latest render. */
const persist: { current: StagesProps["writeSetting"] | undefined } = { current: undefined };

const memoryStore: KeyValueStore = {
    read: (key) => settings.get(key),
    write: (key, value) => {
        settings.set(key, value);
        void persist.current?.(key, value);
    },
    remove: (key) => {
        settings.delete(key);
        void persist.current?.(key, null);
    },
};

setStoreBacking(memoryStore);

/** The content of the last snapshot taken in, so that the same one is not applied twice. */
let received = "";

/**
 * Take the host's settings into memory. Not written back: they came from
 * there. Only a snapshot whose content changed is applied, because the host
 * re-sends the same snapshot with every render, and applying it again would
 * undo whatever a stage saved since it was taken.
 */
const receive = (stored: Readonly<Record<string, string | null>>): void => {
    const content = JSON.stringify(stored);
    if (content === received) return;
    received = content;
    for (const [key, value] of Object.entries(stored)) {
        if (value === null) settings.delete(key);
        else settings.set(key, value);
    }
};

type Host = (props: StagesProps) => ReactNode;

/** Whether this page load has reported its start. */
let announced = false;

export default function Stages(props: StagesProps): ReactNode {
    persist.current = props.writeSetting;
    // During render, deliberately: a stage reads the store when it mounts, and
    // a child's effects run before its parent's.
    receive(props.stored);

    const [StageHost, setStageHost] = useState<Host | null>(null);
    // Once per page load. Not an effect keyed on the prop: Expo hands the web
    // view a new function for it on every render, which re-ran such an
    // effect on every render and raised the warning repeatedly. A module
    // flag is reset only by a reload, which is exactly the event reported.
    if (!announced) {
        announced = true;
        void props.started();
    }
    useEffect(() => {
        let live = true;
        void import("./StageHost.tsx").then((module) => {
            if (live) setStageHost(() => module.default);
        });
        return (): void => { live = false; };
    }, []);

    return StageHost === null ? null : <StageHost {...props} />;
}
