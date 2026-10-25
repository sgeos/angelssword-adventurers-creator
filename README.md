# ⚔️ AS Adventurer Creator

[![verify](https://github.com/sgeos/angelssword-adventurers-creator/actions/workflows/verify.yml/badge.svg?branch=main)](https://github.com/sgeos/angelssword-adventurers-creator/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/github/license/sgeos/angelssword-adventurers-creator)](./LICENSE)
[![Node.js 22.18+](https://img.shields.io/badge/node-%E2%89%A522.18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)](./mobile/)
[![Status: on hold](https://img.shields.io/badge/status-on%20hold-lightgrey)](./docs/process/HANDOFF.md)
[![Hard fork of AngelsSwordStudios](https://img.shields.io/badge/fork%20of-AngelsSwordStudios-blue?logo=github)](https://github.com/AngelsSwordStudios/angelssword-adventurers-creator)

**VTuber Creation Pipeline by Angel's Sword Studios**

*Design · Generate · Prepare · Export*

---

## What Is This?

AS Adventurer Creator is a tool that lets you create animated VTuber / PNGtuber assets from scratch. It walks you through a simple 4-step pipeline — from a static sprite all the way to a transparent, looping animated model ready for streaming.

It runs on your computer and opens in your browser, either from source or as a standalone binary you build yourself. It also runs in a container, and as a mobile application for Android and iOS, described under [The mobile application](#the-mobile-application).

No release has been published, so there is no prebuilt binary to download. Running from source needs only Node.js 22.18 or newer.

---

## Quick Start

These run the application from a copy of this repository. Each launcher
installs the dependencies on first run, starts the server, and opens your
browser to `http://localhost:3001`. Then follow the 4-step pipeline below.

**Windows**

1. If Node.js is not installed, **double-click** `Setup.bat`, which installs it
2. **Double-click** `Start ASAdventurer.bat`

**macOS**

1. **Double-click** `Start ASAdventurer.command`

**Linux and the BSDs**

```sh
./bin/start          # or simply: npm start
```

On macOS, Linux and the BSDs the launcher checks for Node.js and reports the
install command for your platform if it is missing. It does not install
anything itself.

**A standalone binary** needs no Node.js on the machine that runs it, but has
to be built first, as described under
[Building a standalone binary](#building-a-standalone-binary). The build
writes `ASAdventurer` or `ASAdventurer.exe` to `dist/ASAdventurer/`, with a
launcher named `Start AS Adventurer` beside it; either may be double-clicked.

Set `AS_NO_OPEN=1` to stop the server opening a browser, which is useful
headless and on systems without `xdg-open`.

---

## The Pipeline

### ① Sprite Prep  🎨

**What it does:** Create or prepare a character sprite image on a solid chroma key background.

**Two modes:**
- **Upload Mode** — Drag in an existing character sprite (PNG with transparency). The tool places it on a colored background automatically.
- **Generate Mode** — Describe your character in a text prompt and generate a sprite using AI (requires an OpenAI API key).

**Key features:**
- Pick your chroma key color (magenta, green, blue, or custom)
- Adjust canvas size and sprite positioning
- Download the result as a PNG ready for animation

**Output:** A character sprite on a solid-color background (e.g., magenta), ready for Step 2.

---

### ② Generate Video  🎬

**What it does:** Turn your static sprite into an animated video using Google's Gemini AI.

> **💡 This step is optional.** If you already have an animated video from another tool (Veo, RunwayML, Kling, etc.), skip directly to Step 3.

**How to use:**
1. Your sprite from Step 1 is automatically carried over (or upload your own reference images)
2. Write a motion prompt describing the animation you want (e.g., "character gently breathing and blinking, idle animation")
3. Set the video length (3-10 seconds) and number of simultaneous generations
4. Click Generate — Gemini creates a short animated video

**Requirements:**
- A Google Gemini API key (set up in the Settings tab)
- Cost: approximately $0.10 per second of video

**Output:** A short animated video clip (MP4) of your character moving on the chroma key background.

---

### ③ Video Prep  🔄

**What it does:** Prepare your generated video for seamless looping and export.

**Key features:**
- **Frame Trimming** — Set in/out points to cut unwanted frames from the start or end
- **Loop Building** — Create seamless loops using:
  - **Ping-Pong** — Plays forward then backward for a natural bounce
  - **Reverse** — Plays the video in reverse
- **Onion Skinning** — Overlay frame 0 at 50% opacity to help align loop points
- **Preview** — Scrub through frames and preview the final loop before exporting

**Output:** A prepared, looping video clip ready for chroma key removal in Step 4.

---

### ④ Model Exporter  📦

**What it does:** Remove the chroma key background and export as a transparent animated file.

**Export formats:**
| Mode | Format | Max Frames | Max Resolution |
|------|--------|------------|----------------|
| ⚔️ Adventurer | WebM (VP9 alpha) | Unlimited | Unlimited |
| 🟢 F. Normal | GIF | 120 frames | 1000×1000 |
| 💎 F. Premium | GIF | 600 frames | 4000×4000 |

**Chroma Key Controls:**
- **Key Color** — Pick or eyedrop the background color to remove
- **Similarity** — How close a pixel must be to the key color to be removed (default: 40%)
- **Smoothness** — How gradually edges transition from opaque to transparent (default: 8%)
- **Spill Suppression** — Remove color contamination from the key bleeding onto the character (default: 10%)

**Additional features:**
- Frame scrubber with play/pause for previewing
- Crop tool to trim the output
- Real-time preview with checkerboard transparency

**Output:** A transparent WebM or GIF file — ready to use in streaming overlays like AS Reactive Overlay, OBS, or any PNGtuber app.

---

## Settings  ⚙️

Access the Settings tab to configure:

- **OpenAI API Key** — Required for AI sprite generation (Step 1, Generate mode)
- **Google Gemini API Key** — Required for AI video generation (Step 2)

API keys are stored locally in your browser's storage. They are never sent anywhere except directly to the respective API services.

> **💡 No API keys needed** if you bring your own sprite images and animated videos. Steps 3-4 work entirely offline.

---

## Using with AS Reactive Overlay

The assets you export from AS Adventurer are designed to work seamlessly with **AS Reactive Overlay** (our streaming overlay tool):

1. Export your character animations as transparent WebM files using the naming presets:
   - `character_idle.webm` — Default idle animation
   - `character_speaking.webm` — Talking animation
   - `character_intro.webm` — Entrance animation
   - `character_outro.webm` — Exit animation
2. Place the exported files into Reactive Overlay's `public/assets/` folder
3. Reactive Overlay will automatically load and display them as your VTuber's animated states

The exported WebM files also work with any OBS browser source, PNGtuber app, or other streaming tools that support transparent video.

---

## System Requirements

- **OS:** Windows 10/11, macOS, Linux, or FreeBSD/OpenBSD/NetBSD (64-bit)
- **Node.js:** 22.18 or newer (24 recommended), required on every platform
  except when running a standalone binary you have built. The server is
  TypeScript and runs through Node's native type stripping, with no build
  step; 22.18 is the first release where that works without a flag. Node 23
  needs 23.6 for the same reason.
- **Browser:** Chrome, Edge, or Firefox (opens automatically)
- **Internet:** Required only for AI generation steps (Steps 1-2). Steps 3-4 work fully offline.

### Generation providers

Sprite generation runs through OpenAI or through Grok, selected in the AI
Generate panel. Video generation runs through Google Gemini or through Grok,
selected in the Video Generation panel. Each provider uses its own key,
entered in Settings and held in browser storage.

Sprites and video may also be generated locally with ComfyUI, configured in
Settings. Video uses Wan image-to-video, and the reference still is
letterboxed onto the Wan canvas beforehand so that the whole character stays
in frame rather than being cropped at the head or feet.
Only addresses on the local network are accepted, and the endpoints the
application may reach are restricted to the five it uses. No credential is
involved, because ComfyUI runs on the user's own machine.

Grok video is generated asynchronously. The request returns an identifier,
the application polls until the clip is ready, and the finished asset is
retrieved through the local proxy, which holds the credential the asset
requires. Only addresses on xAI's own hosts are fetched.

A key may instead be supplied to the server through the `OPENAI_API_KEY`,
`GOOGLE_API_KEY`, or `XAI_API_KEY` environment variables, which lets one
person run the tool for others without each of them holding a key. A key sent
from the browser takes precedence, so an environment key is a fallback rather
than an override.
- **Disk Space:** ~40 MB for the application

### Building a standalone binary

```sh
node build-exe.mts
```

Produces a self-contained binary for the platform it is run on, into
`dist/ASAdventurer/`, alongside the user interface files and a launcher.
Windows, macOS, and Linux are supported. The Berkeley Software Distribution
systems are not, because Node publishes no build for them. Run the application
with `npm start` there instead.

The build uses Node's single executable applications feature. The server is
bundled to one CommonJS file with esbuild, Node turns that bundle into a
preparation blob, and postject injects the blob into a copy of the running
Node binary. The bundling step exists because the source is ECMAScript module
TypeScript and the feature wants a CommonJS entry point.

An earlier version of this build used `pkg`. That tool is archived, its final
release rejects `import.meta`, and its newest base binary is Node 18, so the
binary ran an older runtime than the one the project is tested against. The
feature used now is maintained by the Node project and embeds whichever
version of Node produced it.

On macOS the build applies an ad-hoc code signature, because injection
invalidates the signature the copied binary carried and Apple Silicon refuses
to run an unsigned executable. That is not notarization. Distributing to
another Mac requires an Apple Developer identifier and a notarization step, or
the recipient clearing the quarantine attribute by hand.

---

## File Structure

The built distribution, where the binary and launcher names follow the
platform they were built on:

```
ASAdventurer/
├── ASAdventurer[.exe]                ← Main application (double-click to run)
├── Start AS Adventurer.[bat|command|sh]  ← Launcher with console output
├── README.md                         ← This file
├── icon.ico                          ← Application icon (Windows builds only)
└── public/                           ← The page, as built (do not modify)
    ├── index.html                    ← The document shell
    ├── style.css                     ← Styles for the stage controls
    ├── fonts/
    └── assets/                       ← The application's scripts, and images and sounds
```

---

## Running in a container

```sh
docker compose up --build
```

Serves on port 3001. The image is built in two stages, so the page is built
with the development dependencies and the runtime image carries neither them
nor the bundler.

API keys may be supplied to the container so that one deployment serves
several people without each of them holding a key.

```sh
OPENAI_API_KEY=... GOOGLE_API_KEY=... XAI_API_KEY=... docker compose up
```

A key sent from a browser takes precedence over one in the environment, so
these are a fallback rather than an override.

A ComfyUI service is present in `docker-compose.yml` but commented out. It is
optional, the correct image depends on the graphics hardware, and starting a
large model server that was not asked for is not a reasonable default.
Uncomment it, choose the image, and set `COMFYUI_URL` alongside it.

The container runs unprivileged and mounts nothing from the host.

---

## The mobile application

The same four stages run on Android and iOS, in an application built with
Expo, in [`mobile/`](./mobile/). The tabs and Settings are native, and the
stages run in a web view that shares its code with the web page. Keys are
held in the platform's secure store, and requests go straight to each
provider from the device, so no server is involved. A ComfyUI server must be
given its address on your local network, since `127.0.0.1` on a phone is the
phone itself.

It is not in an app store, and no signed build has been published. To run it
in [Expo Go](https://expo.dev/go), with the phone and the computer on the
same network:

```sh
npm ci --prefix mobile
cd mobile && npx expo start --lan     # then scan the code with Expo Go
```

**How far it has been tested.** On one Android phone, a Galaxy A16, in Expo
Go and as a standalone release build made locally: every stage, both exports
to the share sheet, the handoff between stages, the file picker, settings
that persist, and clips up to 60 seconds and 300 megabytes at 720p. On iOS,
only in the Simulator. Generation with a valid key has not been run on a
phone, nor on any iOS device. The details are in
[Interface Migration](./docs/architecture/MIGRATION.md) and
[Open Questions](./docs/decisions/OPEN.md).

---

## Documentation

Fuller documentation lives in [`docs/`](./docs/README.md), structured as a
knowledge graph. Each file holds one concept, and each directory carries an
index.

| If the question is | Start here |
|---|---|
| How the stages fit together | [Pipeline](./docs/architecture/PIPELINE.md) |
| Why there are seven TypeScript projects | [Project Structure](./docs/architecture/PROJECT_STRUCTURE.md) |
| How the core, platform, and entry layers are separated | [Layering](./docs/architecture/LAYERING.md) |
| How the page moved to Tamagui, TanStack Start and Expo | [Interface Migration](./docs/architecture/MIGRATION.md) |
| Why something is the way it is | [Resolved Decisions](./docs/decisions/RESOLVED.md) |
| What is still unresolved | [Open Questions](./docs/decisions/OPEN.md) |

Assistants working on this repository should begin with
[`AGENTS.md`](./AGENTS.md) and [`CLAUDE.md`](./CLAUDE.md).

---

## Contributing and security

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow and
[`SECURITY.md`](./SECURITY.md) for the trust model and how to report a
vulnerability privately. Participation is governed by the
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Working on the Source

The application is TypeScript throughout. The two halves are built and run
differently, because they have to be:

- **Server** (`server.mts`) runs directly. Node strips the types as it loads
  the file, so there is no build step and nothing to keep in sync.
- **Browser** is a React application on Tamagui, built by TanStack Start on
  Vite into `dist/client/`, which the server serves. The page's chrome and
  settings are Tamagui components; the four media stages render their markup
  as components and are driven by controllers in `src/platform-browser/stages/`.
  `npm start` builds it first, so running the app never serves a stale bundle.

```sh
npm install
npm start              # builds the browser half, then serves on :3001
npm run dev            # Vite's dev server; run `npm start` on :3001 for /api

npm run check          # typecheck every project, then lint
npm test               # unit and API tests
npm run test:browser   # browser tests, rebuilding first (needs: npx playwright install chromium)
npm run test:all       # all of the above
```

Use `npm run test:browser` rather than a bare `npx playwright test`, which
reuses a server that is already running and so can test an old build.

### Why seven tsconfig projects

They differ in which global types each part is allowed to see, and that
separation is enforced rather than assumed:

| Project | Covers | Sees |
|---|---|---|
| `tsconfig.json` | server and build scripts | Node, no DOM |
| `tsconfig.core.json` | `src/core` | Neither. ECMAScript alone |
| `tsconfig.browser.json` | `src/platform-browser` | DOM, no Node, no framework |
| `tsconfig.app.json` | `src/entry-browser`, the React application | DOM, JSX, React, Tamagui, TanStack |
| `tsconfig.worker.json` | the two Web Workers | WebWorker, neither DOM nor Node |
| `tsconfig.tools.json` | `vite.config.mts` | Node and DOM |
| `tsconfig.test.json` | tests and the Playwright config | both |

The worker project exists because the `WebWorker` and `DOM` libs both declare
`self` and cannot be loaded together. Splitting it also proves the GIF codec
is free of DOM dependencies, which is how a stray `document` reference in it
was found.

### The strictness is deliberate

`eslint.config.mjs` carries roughly two thirds of the enforcement; the
compiler settings alone cannot ban `any`, type assertions, or non-null
assertions. `isolatedDeclarations` requires every exported symbol to state a
type the compiler need not infer. Type predicates are banned, so code that
narrows an untrusted string returns the narrowed value or `undefined` rather
than asserting a relationship the compiler must take on trust.

If a rule is in the way, the honest move is to argue for changing it, not to
route around it — `eslint-disable` comments are disabled config-wide and will
not work.

### The tests are checked too

Every source file is TypeScript apart from `eslint.config.mjs` itself, tests
included, and the tests are linted with full type information rather than
exempted from the type-aware rules. That matters because a test harness
exempted from the rules is the obvious place for unchecked code to accumulate,
and the harness is what everything else is trusted on.

Two narrow exemptions exist, each named in the config with its reason:

- `node:test`'s `describe`/`it` are exempted from `no-floating-promises` by
  name. The runner owns those promises. The rule stays on everywhere else in a
  test, so a forgotten `await` on a page action is still an error.
- `require-await` is off in `test/helpers/mock-fetch.mts` alone, where a mock
  satisfying a `Promise`-returning interface has nothing to await and the two
  async rules cannot both be satisfied.

Playwright compiles specs to CommonJS, so spec-side code uses `__dirname`
rather than `import.meta.url`.

---

## Tips & Tricks

- **Best chroma key results:** Use **magenta** (`#FF00FF`) as your key color — it rarely appears in character art.
- **Smooth loops:** Use Ping-Pong mode in Video Prep for the easiest seamless loops.
- **AI prompts:** Be specific about the motion you want. "Gentle idle breathing animation, slight hair movement" works better than "make it move."
- **Spill suppression:** If you see a colored fringe around your character after keying, increase the Spill Suppression slider.
- **WebM for streaming:** The Adventurer (WebM) format supports true alpha transparency and is ideal for OBS browser sources.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Browser doesn't open | Navigate manually to `http://localhost:3001` |
| Port 3001 in use | Close other instances or set `PORT` environment variable |
| AI generation fails | Check your API key in Settings and ensure you have credits |
| Video won't load | Try converting to MP4 (H.264) first — some codecs aren't supported |
| Export looks wrong | Adjust Similarity/Smoothness sliders — start with defaults |

---

## Credits

**AS Adventurer Creator** by Angel's Sword Studios

The interface uses the Cinzel, Cinzel Decorative, Outfit and Share Tech Mono
typefaces, each under the SIL Open Font License 1.1 and hosted with the
application so that it makes no request to a font service. Their authors and
licences are listed in [`public/fonts/README.md`](./public/fonts/README.md).

Built with ❤️ for the VTuber community.
