# ⚔️ AS Adventurer Creator

**VTuber Creation Pipeline by Angel's Sword Studios**

*Design · Generate · Prepare · Export*

---

## What Is This?

AS Adventurer Creator is a standalone desktop tool that lets you create animated VTuber / PNGtuber assets from scratch. It walks you through a simple 4-step pipeline — from a static sprite all the way to a transparent, looping animated model ready for streaming.

No installation required for the prebuilt binary. Run it and open your browser. From source, Node.js 22.18 or newer is the only prerequisite.

---

## Quick Start

**Windows**

1. **Double-click** `ASAdventurer.exe` (or use `Start AS Adventurer.bat`)
2. Your browser will open to `http://localhost:3001`
3. Follow the 4-step pipeline below

**macOS**

1. **Double-click** `Start ASAdventurer.command`
2. Your browser will open to `http://localhost:3001`

**Linux and the BSDs**

```sh
./bin/start          # or simply: npm start
```

The launcher checks for Node.js and reports the install command for your
platform if it is missing. It does not install anything itself.

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
  - **Crossfade** — Blend the start and end frames for smooth transitions
- **Concatenation** — Combine multiple video clips together
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
  except when running a prebuilt binary on Windows or macOS. The server is
  TypeScript and runs through Node's native type stripping, with no build
  step; 22.18 is the first release where that works without a flag. Node 23
  needs 23.6 for the same reason.
- **Browser:** Chrome, Edge, or Firefox (opens automatically)
- **Internet:** Required only for AI generation steps (Steps 1-2). Steps 3-4 work fully offline.
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
└── public/                           ← UI files (do not modify)
    ├── index.html
    ├── style.css
    ├── js/                           ← Compiled from src/browser
    └── assets/
```

---

## Working on the Source

The application is TypeScript throughout. The two halves are built and run
differently, because they have to be:

- **Server** (`server.mts`) runs directly. Node strips the types as it loads
  the file, so there is no build step and nothing to keep in sync.
- **Browser** (`src/browser/*.mts`) is compiled to `public/js/*.mjs`, because
  no browser strips types. `index.html` loads that output as ES modules.
  `npm start` builds it first, so running the app never serves a stale bundle.

```sh
npm install
npm start              # builds the browser half, then serves on :3001

npm run check          # typecheck every project, then lint
npm test               # unit and API tests
npx playwright test    # browser tests (needs: npx playwright install chromium)
npm run test:all       # all of the above
```

### Why four tsconfig projects

They differ in which global types each half is allowed to see, and that
separation is enforced rather than assumed:

| Project | Covers | Sees |
|---|---|---|
| `tsconfig.json` | server and build scripts | Node, no DOM |
| `tsconfig.browser.json` | `src/browser` | DOM, no Node |
| `tsconfig.worker.json` | the two Web Workers | WebWorker, neither DOM nor Node |
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

Built with ❤️ for the VTuber community.
