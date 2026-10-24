/**
 * The browser build.
 *
 * TanStack Start in single-page mode. The root route is prerendered once at
 * build time into `dist/client/index.html`, the document shell, and everything
 * inside it renders in the browser. Nothing is rendered per request, which is
 * what lets the existing Express server, and the standalone binary built from
 * it, serve the output as static files beside the proxy routes. TanStack
 * Start's own server bundle in `dist/server` exists only for that prerender
 * and is never run in production.
 *
 * `public/` is Vite's public directory: the fonts, the logo, the notification
 * sounds and the stylesheet for the stage interiors are copied unchanged. So
 * is anything else left there. The previous build compiled into `public/js/`,
 * and a copy of that output, made by running the old build once, was shipped
 * by this one and let the worker specifications pass against files the
 * application no longer used. Vite empties `dist/` itself; `public/` is
 * yours to keep clean.
 */
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";

/**
 * Mark the prerender's server bundle as an ECMAScript module.
 *
 * The prerender step imports `dist/server/server.js`, a name it fixes. This
 * package is not `"type": "module"`, so Node would read a `.js` file there as
 * CommonJS and fail. Marking the whole package would change how every `.ts`
 * file in the repository loads, Playwright's included, to suit one generated
 * directory. A `package.json` emitted beside the bundle scopes the decision to
 * that directory.
 */
const serverEsmMarker: Plugin = {
    name: "server-esm-marker",
    applyToEnvironment: (environment) => environment.name === "ssr",
    generateBundle(): void {
        this.emitFile({ type: "asset", fileName: "package.json", source: '{ "type": "module" }\n' });
    },
};

const config: UserConfig = defineConfig({
    // Tamagui branches on this at build time, and leaves native code paths in
    // the bundle unless told it is building for the web.
    define: { "process.env.TAMAGUI_TARGET": JSON.stringify("web") },
    // Tamagui's primitives import React Native. On the web that is React
    // Native for Web, which renders the same components as elements.
    resolve: { alias: { "react-native": "react-native-web" } },
    environments: {
        ssr: {
            build: {
                rolldownOptions: {
                    output: { entryFileNames: "[name].js", chunkFileNames: "assets/[name]-[hash].js" },
                },
            },
        },
    },
    // The Express proxy, for `npm run dev`. The dev server serves the page and
    // forwards every `/api` call to a server started separately.
    server: {
        proxy: { "/api": `http://localhost:${process.env["PROXY_PORT"] ?? "3001"}` },
    },
    plugins: [
        tanstackStart({
            srcDirectory: "src/entry-browser",
            spa: { enabled: true, prerender: { outputPath: "/index.html" } },
        }),
        viteReact(),
        serverEsmMarker,
    ],
});

export default config;
