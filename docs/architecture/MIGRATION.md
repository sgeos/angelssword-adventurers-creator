# Interface Migration

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

The plan to move the interface onto Tamagui, with TanStack Start for the web
and Expo for iOS and Android. Adopted by the operator on 2026-10-24. The
decision is recorded in [RESOLVED.md](../decisions/RESOLVED.md), and the
questions the first step must answer are in [OPEN.md](../decisions/OPEN.md).

**The first step is a spike, and nothing is rewritten until it passes.**

## What moves and what does not

Measured on 2026-10-24.

| Layer | Size | Under the migration |
|---|---|---|
| `src/core/` and its ports | 6,109 lines, 677 unit tests | Unchanged. It already has no platform and reaches every capability through a port |
| `src/platform-browser/`, `src/platform-worker/` | Part of 5,855 lines | Retained for the web. A native platform layer is added beside it |
| `src/entry-browser/` and `public/index.html` | The rest of the 5,855, plus 1,169 lines of markup and 227 element identifiers | Rewritten as React components. This is the bulk of the work |
| `server.mts` | 726 lines | Becomes server routes on the web. Not used on iOS or Android |

The three-layer rule in [LAYERING.md](./LAYERING.md) continues to hold. The
core gains no platform facility, and a capability a native platform needs
becomes a port, never an import.

## The web, on Tamagui and TanStack Start

Tamagui renders ordinary elements on the web, so the canvas, video, recorder
and worker code keeps running against real `<canvas>` and `<video>` elements
reached through references. What is rewritten is the interface around them.

Costs accepted with the decision. The four stage screens are rewritten as
components. The server gains a build step, where it currently runs directly. The
standalone binary must wrap TanStack Start's server output rather than Express,
which is believed possible and has not been tried. The strict configuration,
which rejects `any`, type assertions and non-null assertions, has to hold
against the published React and Tamagui types, and the friction is unmeasured.
The page becomes heavier, on hardware the product brief calls modest.

On its own this half offers desktop users little. Its value is the component
structure the native application shares, so it is not begun before the spike
has shown that the native application is viable.

## iOS and Android, on Tamagui and Expo

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
2. **If it passes,** restructure into the core unchanged, a web entry on
   TanStack Start, an Expo entry, and the media screens shared as DOM
   components. The browser specifications remain the regression check for the
   desktop, and are ported rather than discarded.
3. **If it fails on iOS,** ship a narrower native application covering
   generation only, and hand clips to the desktop tool for preparation and
   export.
4. **Throughout,** the local server and the standalone binary remain the
   desktop product. The proxy is not moved to a hosted service, because that
   would place users' keys on a server they do not control.

## What this plan does not claim

That WebKit's recorder can produce WebM. That a web view on modest hardware
can export in acceptable time. That TanStack Start's output can be packaged as a
single executable. That the strict configuration is compatible with the
framework types. Each is open, and each is something the spike or the first
increment is meant to settle by execution rather than by reading.
