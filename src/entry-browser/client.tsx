/**
 * The browser's entry point: publish the handoff, then hydrate the document.
 *
 * TanStack Start's default client entry, with one addition before hydration.
 * The handoff singleton is published on the global object here because this is
 * the first code of the application that runs. The page published it while its
 * module scripts ran, before the load event, and the browser specifications read
 * it as soon as the page has loaded. Publishing it from a component, after React
 * has rendered, made it appear later than that.
 *
 * ECMAScript modules create no globals, so nothing outside the module graph
 * could see the handoff otherwise. It is the documented boundary between stages
 * and the specifications assert against its shape. `defineProperty` needs
 * neither a type assertion nor `declare global`, both of which the lint bans.
 */
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { ASAdventurer } from "../platform-browser/shell.mts";

Object.defineProperty(globalThis, "ASAdventurer", {
    value: ASAdventurer,
    writable: false,
    enumerable: true,
    configurable: true,
});

startTransition(() => {
    hydrateRoot(
        document,
        <StrictMode>
            <StartClient />
        </StrictMode>,
    );
});
