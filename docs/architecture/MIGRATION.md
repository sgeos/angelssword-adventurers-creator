# Interface Migration

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

The move of the interface onto Tamagui, with TanStack Start for the web and
Expo for iOS and Android. Adopted by the operator on 2026-10-24. The decision
is recorded in [RESOLVED.md](../decisions/RESOLVED.md), and the questions still
open are in [OPEN.md](../decisions/OPEN.md).

**The web port is complete, as of 2026-10-24. The native half has not begun.**
The plan put a spike on devices first. The operator then directed the web port
ahead of it, so the web port was done first and the spike remains the first
step of the native half.

## What the web port did

| Layer | Before | After |
|---|---|---|
| `src/core/` and its ports | 6,109 lines, 677 unit tests | Unchanged, to the line |
| The page's markup | `public/index.html`, 1,169 lines, 227 element identifiers | React components in `src/entry-browser/`, 2,637 lines with the chrome, the settings panel and the design system. Every identifier, class and `data-` attribute kept |
| The four media stages | Script-tag entry points in `src/entry-browser/` | Controllers in `src/platform-browser/stages/`, 4,485 lines, each exporting a mount function. Behaviour unchanged |
| Tabs, toasts, settings | Imperative code in `shell.mts` | Tabs and toasts are stores in the platform layer that React renders. Settings is a React component with its own state |
| Styling | `public/style.css`, 1,812 lines | Tamagui tokens and components for the chrome, panels, layout and settings. The stylesheet keeps 1,270 lines for the stage interiors, whose controllers also generate markup at run time |
| The build | `tsc` emitting `public/js/` | TanStack Start on Vite, single-page mode, into `dist/client/` |
| `server.mts` | Served `public/` | Serves `dist/client/`. Otherwise unchanged |
| Page scripts | 428 kilobytes, 113 gzipped | 616 kilobytes, 192 gzipped |

**Verified against the previous build, not only against the specifications.**
The bounding box of every identified element on every tab, 167 of them, was
measured in the old build and the new one, and they agree within a pixel and
a half. Hover and active colours of the chrome were compared the same way.
Screenshots of every tab were compared by eye, which found two defects the
measurement could not see, in elements without identifiers. The browser
specifications went from 82 to 88; the six added pin the layout defects the
port produced, and each was shown to fail against the defect it guards.

## How the web half is put together

TanStack Start prerenders the root route once, at build time, into the
document shell. Everything inside it renders in the browser. The routes sit in
a `ClientOnly` boundary, because a shell prerendered with the route pending and
a browser rendering the route at once disagree, and React reported that as a
hydration mismatch on every load. `client.tsx` publishes the handoff object
before hydration, which is when the old page published it.

The four media stages are memoized components with no props. They render once
and their controllers own the subtree after, toggling classes and rewriting
contents, which a re-render would undo. This is the shape the native plan
needs: on a phone each becomes an Expo DOM component, keeping its browser
implementation. The chrome and the settings panel are Tamagui and React state
throughout, which is the shape that runs natively.

Three web-only rules that Tamagui's types cannot express, grid layout,
gradient text and a last-child margin, live in `src/entry-browser/ui/web-only.ts`
rather than in Tamagui components, for the reason given there.

## Where the work departed from the plan

**The spike did not come first.** The operator directed the web port before
it. The plan's warning stands, measured now rather than predicted: the web half
alone gives desktop users the same page, heavier.

**The server was not moved into TanStack Start.** The plan had the proxy
becoming server routes. It stays the Express server, which serves the
single-page build as static files. TanStack Start's server output was never
packaged as a single executable, and nothing about the page needs a server
render, while the proxy is covered by 57 tests against the Express app and the
binary was already built from it. Moving it would have been a change for its
own sake.

**Third-party declarations are not checked for the entry layer.** The strict
configuration held against the frameworks' types for this project's code, with
two settings relaxed for the entry layer only and argued in
`tsconfig.app.json`. That answers one of the plan's open questions.

## The native half, still ahead: iOS and Android on Tamagui and Expo

| Stage | Difficulty on a phone |
|---|---|
| Sprite and video generation | Low. Provider calls and image display. No proxy is needed, because a native request is not subject to cross-origin rules, and keys stay on the device |
| Sprite preparation | Moderate. Canvas pixel work |
| Video preparation | High. Frame-accurate seeking and the frame rate probe depend on `requestVideoFrameCallback`, which native video players do not offer |
| Export | Highest. Frame extraction, keying, Graphics Interchange Format encoding in a worker, and WebM recording, none of which React Native provides |

**The route through is Expo's DOM components.** A component marked `"use dom"`
renders inside a web view on the device. Sprite preparation, video preparation
and export keep their browser implementation inside that web view, while
navigation, file selection, settings and provider calls are native Tamagui. One
implementation of the media work, rather than two, is the point.

## Order of work

1. **Spike.** A disposable Expo application holding one DOM component, run on a
   physical iPhone and a physical Android device. It loads the fifteen frame per
   second fixture and establishes, on each device, frame-accurate seeking, the
   detected source rate, a Graphics Interchange Format export, a WebM recording,
   the time each takes, and the cost of moving a clip across the boundary between
   the web view and the native side. The spike does not touch `main`'s
   application code.

   **Devices, as of 2026-10-24.** A physical Android phone is available and no
   iPhone is. The Android half can run now. The iOS half waits for a device.
   Desktop Safari and the iOS Simulator share WebKit with the iPhone and may be
   used as early indications of what WebKit's recorder supports, recorded as
   indications and not as results, because media encoding on a device can
   differ from both. No branch below that depends on iOS is chosen on them.
2. **If it passes,** add an Expo entry beside the web entry, which now exists.
   The core is shared unchanged, the chrome and settings as Tamagui components,
   and the four media stages as DOM components, which their current shape, a
   component that renders once and hands its subtree to a controller, was kept
   for. The browser specifications remain the regression check for the
   desktop.
3. **If it fails on iOS,** ship a narrower native application covering
   generation only, and hand clips to the desktop tool for preparation and
   export.
4. **Throughout,** the local server and the standalone binary remain the
   desktop product. The proxy is not moved to a hosted service, because that
   would place users' keys on a server they do not control.

## What this plan does not claim

That WebKit's recorder can produce WebM. That a web view on modest hardware
can export in acceptable time. Both are open, and both are what the spike is
meant to settle by execution rather than by reading.

Two questions the plan listed are answered by the web port. The strict
configuration holds against the framework types, with the two exemptions
above. And the packaging question did not arise, because the binary serves the
built page as files and never runs TanStack Start's server.
