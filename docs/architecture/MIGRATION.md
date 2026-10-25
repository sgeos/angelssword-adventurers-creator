# Interface Migration

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

The move of the interface onto Tamagui, with TanStack Start for the web and
Expo for iOS and Android. Adopted by the operator on 2026-10-24. The decision
is recorded in [RESOLVED.md](../decisions/RESOLVED.md), and the questions still
open are in [OPEN.md](../decisions/OPEN.md).

**The web port is complete, as of 2026-10-24. The native half runs on one
Android phone in Expo Go, and has not run on iOS.** The plan put a spike on
devices first. The operator then directed the web port ahead of it, and then
the mobile application itself, so the spike's questions were answered by the
application rather than by a disposable one, on Android only.

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
gradient text and a last-child margin, live in `src/ui/web-only.ts`
rather than in Tamagui components, for the reason given there.

## How the mobile half is put together

`mobile/` is an Expo application, SDK 58, with React Native 0.88, a package of
its own. Native code draws the header, the tab bar, the toasts and the
settings screen in Tamagui. The four media stages run in one web view, as the
Expo DOM component `mobile/dom/Stages.tsx`, which renders `src/ui/StagePanels.tsx`,
the same component the web page renders, and so the same controllers. One web
view rather than four, because the stages share one handoff object in memory.

What the web view lacks, native code supplies through seams in the browser
platform, each with the web page's behaviour as its default.

| Seam | Web page | Mobile |
|---|---|---|
| `http.mts`, the transport behind `HttpClient` | `fetch` to the local proxy | `in-page-proxy.mts` plans each `/api` route with the core's `planProxyRequest`, and native code sends it with Expo's fetch, outside cross-origin rules |
| `save-file.mts` | A download link | The bytes cross to native code, are written to the cache and handed to the share sheet |
| `workers.mts` | Vite's worker bundling | Entry files inside `mobile/dom/`, because Expo built addresses for workers outside its project root that did not exist |
| The notification sound | Web Audio | `expo-audio` |
| Storage, `local-storage.mts`'s backing | `localStorage` | Expo's web view has no Web Storage. The DOM component holds the settings in memory, filled from native storage before any stage module loads and written back to it: keys in SecureStore, the rest in SQLite |
| File inputs | The browser's file chooser | Expo's web view has none. A tap on a file input is intercepted, native code opens the system document picker filtered by the input's `accept`, and the chosen file is set on the input with a change event |

The fonts are imported as assets and registered with the font loading
interface, because Metro bundles a stylesheet's rules but not the files its
`url()` references name.

## What was verified on a device

On a Galaxy A16, Android 16, web view 155, through Expo Go 58, on 2026-10-24.
The web view was driven over the Chrome DevTools Protocol and the screen was
captured. These are results on one phone, not on modest hardware in general.

| Check | Result |
|---|---|
| The application loads, and all four stages initialise | Yes |
| The web view has `MediaRecorder` with WebM, VP8 and VP9, `requestVideoFrameCallback`, `captureStream` and Web Audio, in a secure context | Yes |
| The fifteen frame per second fixture in Video Prep | Detected as 15, 30 frames, scrubber end 29 |
| The thirty frame per second fixture in the exporter | Detected as 30, 60 frames |
| A Graphics Interchange Format export, two second fixture | The share sheet opened 2.4 seconds after the click |
| A WebM export, the same fixture | The share sheet opened 3.1 seconds after the click |
| The handoff from Video Prep to the exporter | 0.28 seconds; the exporter received 30 frames at 15 per second, and the native tab followed |
| Toasts raised in the web view | Shown natively |
| A native tab press | Switches the web view's stage |
| The web fonts | All five faces load |
| Layout at the web view's 384 pixel width | No horizontal overflow, after the fix below |
| The tab bar following a stage to an off-screen tab | It scrolls to Model Exporter and highlights it |
| The settings screen's key test, with a fake OpenAI key | The request went through the native transport, and OpenAI's rejection showed in the status line |
| Saving that key, then a sprite generation | The stage read the key and its request was rejected for the key, not refused for a missing one |
| Settings across a restart | The key, saved natively, and the sprite zoom, saved from the web view, both returned |
| The system file picker | Android's document picker opened from Video Prep's input, and the chosen clip loaded at 15 frames per second |
| The notification sound | A native player started at the end of an export and stopped 1.6 seconds later |
| A 25 megabyte clip, 1280 by 720, 10 seconds, through the picker | Loaded in 3.1 seconds, 300 frames at 30 per second |
| A 100 megabyte clip, 1280 by 720, 20 seconds, through the picker | Loaded in 33.7 seconds, 600 frames; handed to the exporter in 2.2 seconds |
| A WebM export of the 25 megabyte clip, after the export was made to stream | Finished: 300 frames, 9.6 megabytes, in about four and a half minutes, the renderer's memory falling rather than growing |
| A WebM export of the 100 megabyte clip, with the export streamed and Video Prep's cache bounded | Finished: 600 frames, 26.7 megabytes, in eight and a half minutes, the phone's free memory never below 473 megabytes |
| A 200 megabyte clip, 1280 by 720, 40 seconds, end to end | Loaded in 69.7 seconds, 1,200 frames; cached in 20 minutes; handed off in 2.4 seconds; exported as WebM, about 51 megabytes, in 1,106 seconds measured in the page, 0.92 seconds a frame, the phone's free memory never below 317 megabytes over two runs |

Five defects were found on the device and fixed. The stage column was 1,339
pixels wide on a 384 pixel screen, because Expo's root element is a flex row
and a React Native Web view does not shrink. Both workers failed to load,
for the address reason above, and the exporter's handler reported the failure
as an unknown error, because an `ErrorEvent` is not an `Error`. The fonts did
not load. `localStorage` is null in Expo's web view, so no setting, and no key,
reached a stage. And a file input did nothing when tapped. The community web
view, which has a file chooser, was tried and abandoned, because Expo's DOM
runtime fails to start in it.

Reading a picked file whole as base64 failed for the 100 megabyte clip,
needing a 272 megabyte allocation in a 256 megabyte heap. Files up to 32
megabytes are now read whole, by the file system module's fast native encoder,
and larger ones in 4 megabyte chunks assembled as `Blob` parts in the web
view. Chunking costs time: the 25 megabyte clip took 9.6 seconds in chunks
against 3.1 whole, which is why the threshold exists.

**The WebM export streams.** It used to decode and key every frame first,
four bytes a pixel, and then play them into the recorder; 600 frames at 1280
by 720 were 2.2 gigabytes. Now each frame is prepared while the recorder is
paused and shown for one frame interval while it runs, so one frame is held at
a time. A recorder leaves paused time out of its timestamps, and each
interval's timer overrun is carried into the next, so a sixty frame export
ends at 1.97 seconds, where sixty frames at thirty per second end, which a
browser specification now reads from the file itself. On the phone, the 25
megabyte clip exports with the renderer's memory falling throughout.

**The other two gigabytes were Video Prep's.** Streaming alone did not save
the 100 megabyte clip: the export still died five minutes in. Neither the
renderer's memory nor the page's collected heap grew per frame, which ruled
out a leak in the export. The cause was Video Prep, which after loading a clip
caches every frame as a full-size canvas for instant scrubbing: 600 frames at
720p are another 2.2 gigabytes, built in the background while the export ran.
The cache now has a 256 megabyte budget, `cacheFrameSize` in the core. A two
second 720p clip is still cached at full size; a twenty second one at about a
third of the linear size, which the scrubber and the loop preview draw scaled
to their canvas anyway.

**If the system still reclaims the web view,** for a clip larger again or a
phone with less memory, Expo reloads it and the user is now told that the
stages restarted and what was lost, rather than seeing them reset.

## A standalone build, on the same phone

On 2026-10-25, with the operator's agreement, a release APK was built and
installed on the phone, then removed. The JDK, the Android SDK and its NDK
were downloaded into a temporary directory, and the build ran on a copy of the
committed tree, `npx expo prebuild` then `./gradlew assembleRelease`, with a
temporary package name, `com.sgeos.asadventurer.devtest`, since the real one
is undecided. Nothing native is committed.

It loads its production bundle from `file:///android_asset/`, and that exposed
two defects development could not, both in starting the workers. The web
view refuses a worker from a `file:` address, and Expo's production build
addressed each worker with its directory twice. In development Metro served
everything over HTTP from correct addresses. The DOM component now, on
`file:` pages only, starts a worker from a `blob:` copy of its script, read
through `readBundledTextSync` in the binary adapter, trying the collapsed
address first.

Verified on the standalone build: the page in a secure context with all five
fonts and every media capability; frame rate detection at 15 and 30 frames per
second; a GIF export and a WebM export, each to the share sheet, the WebM in
3.9 seconds; the notification sound; the handoff to the exporter, which
received 30 frames at 15 per second; the key test with a fake key, through the
native transport to OpenAI and back; the system file picker; and a stage's
preference surviving a restart. The production page's heap is 11 megabytes,
against 78 in development. The 100 megabyte, 20 second 720p clip went end to
end on it as well: loaded in 31.9 seconds, cached in 348, handed off in 1.7,
and exported as WebM, 600 frames, in 510, the phone's free memory never below
574 megabytes and the page never reloaded. A 60 second clip of 300
megabytes, 1,800 frames, followed: loaded in 144 seconds, cached in 1,822,
handed off in 3.0, and exported as WebM, 83.9 megabytes, in 1,621, free memory
never below 448 megabytes and no reload. The APK was uninstalled after.

The same 60 second clip was first tried in Expo Go and was interrupted, not
by memory: the phone's USB link dropped mid-export, and when it returned
Expo Go reloaded the whole experience from Metro, its native bundle included,
which a reclaimed web view does not do. A standalone build has no such link.

**Not verified on a device.** iOS, on any device. A provider
request with a valid key, which would spend money, as opposed to the rejected
one. A clip larger than 300 megabytes and 60 seconds at 720p, the largest
exported. Export time on hardware slower than this phone, which at 0.85
seconds a frame on this one is already minutes for a long clip.

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

## The native half as planned, before it was built

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

As planned. Steps one and two were taken together on Android: the application
was built and then measured on the phone, rather than a spike first. Step one
on iOS has not been taken.

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

That WebKit's recorder can produce WebM, which is still open, since no iOS
device has run the application. That a web view on modest hardware can export
in acceptable time, which is answered for one Android phone, where a two
second clip exported in under four seconds, and open for slower ones.

Two questions the plan listed are answered by the web port. The strict
configuration holds against the framework types, with the two exemptions
above. And the packaging question did not arise, because the binary serves the
built page as files and never runs TanStack Start's server.
