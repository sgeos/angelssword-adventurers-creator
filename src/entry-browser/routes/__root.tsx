/**
 * The document.
 *
 * This is the only route rendered at build time. It produces the static shell
 * the server sends for `/`: the head, the theme's stylesheet, and the scripts
 * that render the application in the browser. The stage markup is not in it.
 *
 * Tamagui's CSS is written into the head here, from the configuration, rather
 * than injected at run time. The shell is rendered once on the server and then
 * adopted by React in the browser, and an injected stylesheet appears in only
 * one of the two, which React reports as a hydration mismatch.
 */
import { ClientOnly, createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TamaguiProvider } from "@tamagui/core";
import type { ReactNode } from "react";
import { config } from "../ui/config.ts";
import { WEB_ONLY_CSS } from "../ui/web-only.ts";

const DESCRIPTION =
    "AS Adventurer Creator — VTuber Creation Pipeline by Angel's Sword Studios. Create animated PNGtuber and VTuber assets from scratch in minutes.";

const ICON =
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚔️</text></svg>";

/**
 * The document element, as TanStack's shell component.
 *
 * Rendered both into the prerendered shell and by the browser, around whatever
 * the routes produce. The Tamagui provider is not in it, but in the route's
 * component below, because the shell holds no route content: when the provider
 * sat here, the shell's empty outlet and the browser's first render disagreed
 * inside it, and React reported a hydration mismatch on every load.
 */
const Document = ({ children }: { readonly children: ReactNode }): ReactNode => (
    <html lang="en" suppressHydrationWarning>
        <head>
            <HeadContent />
            {/*
              Tamagui's rules, then the web-only rules that must override them.
              React moves the head content's stylesheet links to the top of the
              head, so these two inline blocks follow the stage stylesheet
              whatever order they are written in; only their order relative to
              each other matters. See ui/web-only.ts.
            */}
            <style id="tamagui-config-css" dangerouslySetInnerHTML={{ __html: config.getCSS() }} />
            <style id="web-only-css" dangerouslySetInnerHTML={{ __html: WEB_ONLY_CSS }} />
        </head>
        <body suppressHydrationWarning>
            {children}
            <Scripts />
        </body>
    </html>
);

/**
 * The theme around every route, and the boundary between the shell and the
 * application.
 *
 * `ClientOnly` renders nothing in the prerendered shell and nothing during the
 * browser's hydration of it, so the two agree, and mounts the routes just after
 * hydration. Without it the shell held the route as a pending boundary while
 * the browser's first render produced the route itself, and React reported a
 * hydration mismatch on every load and threw the shell away. Nothing inside
 * renders on a server in any case; see `start.ts`.
 */
const Themed = (): ReactNode => (
    <TamaguiProvider config={config} defaultTheme="dark" disableInjectCSS>
        <ClientOnly fallback={null}>
            <Outlet />
        </ClientOnly>
    </TamaguiProvider>
);

export const Route = createRootRoute({
    // The one route rendered at build time, into the document shell.
    ssr: true,
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1.0" },
            { name: "description", content: DESCRIPTION },
            { title: "⚔️ AS Adventurer Creator — VTuber Creation Pipeline" },
        ],
        // Relative, as they were, so the page also works below a path prefix.
        // Both files are copied unchanged from public/ by the build.
        links: [
            { rel: "stylesheet", href: "fonts/fonts.css" },
            { rel: "stylesheet", href: "style.css" },
            { rel: "icon", href: ICON },
        ],
    }),
    shellComponent: Document,
    component: Themed,
});
