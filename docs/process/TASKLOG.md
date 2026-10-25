# Task Log

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Shared source of truth for current work. Both the operator and the assistant
read and write this file.

A task marked complete carries verification evidence. A blocked task names its
blocker. Same-day entries are consolidated so history does not grow without
bound.

## Active

**Holding state, from 2026-10-25.** Everything that could be done without the
operator is done. What remains is listed in [HANDOFF.md](./HANDOFF.md) under
"The next task", and each item needs the operator.

**Awaiting one experiment the operator must run.** Gemini returned a landscape
clip from two reference images and a portrait clip from one. Those two images
were also misaligned; that is fixed, so two properly anchored images now
settle whether the cause was multiplicity or misalignment.

If multiplicity, sending every reference image is a regression and should
become a choice or be reverted.

Everything else outstanding is a decision for the operator or ordinary work
with diminishing returns. Both are enumerated in [HANDOFF.md](./HANDOFF.md).

## Completed: the three-layer rearchitecture

Structurally complete, and every capability the core needs inverted. Designed
in [../architecture/LAYERING.md](../architecture/LAYERING.md).

The three layers exist as four directories under `src/`, and each boundary is
checked rather than promised. `tsconfig.core.json` withholds both platform
libraries; two lint zones carry the import-direction rule no tsconfig can
express; storage and the network are each confined to named adapter files.

Storage, the network, and time are inverted end to end. Randomness is resolved
by passing a seed rather than a generator. Logging and binary payloads were
examined and are not capabilities, which is recorded rather than quietly
dropped.

## Recently Completed

| Task | Status | Verification |
|---|---|---|
| Frame count unified; encoding decisions named | Complete | 21 new tests; the two stages asserted to agree |
| Both sprite handoffs anchor; framing reaches video | Complete | 17 new unit tests, 7 new browser specs |
| Reference slots, previews, ordering, multi-image | Complete | Order and clear asserted in a browser spec |
| Framing and art style are user choices | Complete | Defaults asserted byte-identical to shipped |
| Live findings recorded; stale live-keys claim removed | Complete | 152 links resolve; no contradiction in OPEN.md |
| Loop made circular; preview reads the frame cache | Complete | Panel promise and export asserted to agree |
| Frame selection collapsed from four copies to one | Complete | 20 new tests; count and list asserted to agree |
| Seek arithmetic unified, one number split into two names | Complete | 16 new tests; no `0.001` left in either stage |
| Key scoring, crop and size estimate extracted | Complete | 43 new tests; six constants named and pinned |
| Colour detection and placement extracted | Complete | 45 new tests; five placement copies became one |
| Loop arithmetic extracted; capability list closed | Complete | 14 new tests; two formulas asserted to agree |
| Network and time capabilities inverted | Complete | 35 new tests; server shares the port; ban exercised |
| Storage capability inverted | Complete | 27 sites converted to 0; 37 new tests; ban exercised |
| Platform and entry layers separated | Complete | Both import zones refuse a failing file; workers exercised |
| Portable core established and enforced | Complete | Core project refuses a failing file; two couplings found |
| Handoff validity anchored on commit N minus one | Complete | Ancestry check run against the anchor it records |
| Container deployment, environment keys completed | Complete | Image built and run; 276/44/22 pass |
| ComfyUI Wan image-to-video | Complete | Letterbox verified at 832x480 |
| ComfyUI sprites, wired | Complete | Generates with no key set |
| Grok video, wired | Complete | Start, poll and fetch sequence |
| Provider abstraction and Grok sprites | Complete | Toggle reaches generation |
| Knowledge graph adopted under `docs/` | Complete | Full gate passes |
| `tmp/` and `secret/` markers tracked | Complete | Ignore rules exercised both ways |
| Attribution, `keyColor`, jsdom, Node single executable | Complete | 182 unit tests, binary runs |
| Playwright harness converted to TypeScript | Complete | 10 specifications pass |
| Conversion merged to `main` | Complete | Tagged `initial-typescript-conversion` |
| Container verified, and found broken | Complete | Runtime stage lacked `src/core`; image now serves |
| Deployment closure guarded by a test | Complete | Fails on the real defect, naming the omitted module |
| Loop controls covered in the browser | Complete | 10 specifications, on a generated clip |
| Framing and art style covered | Complete | Persistence across reload, and the canvas requested |
| Loop judgement unified in the info panel | Complete | Seam-crossing loops no longer hidden from one of two readouts |
| Empty `test/fixtures/pixels` removed | Complete | Nothing referenced it |
| Exporter controls covered | Complete | Mode limits, estimate, aspect lock, presets |
| Settings and the trust boundary covered | Complete | Saving a key issues no request, non-vacuously |
| Frame rate disagreement found | Recorded | Two stages, three paths, three answers |
| Third party webfont requests found | Recorded | Contradicts the offline claim in the README |
| Container built and served by CI | Complete | Fetches page, module and a proxy route |
| Linux and Windows binaries built | Complete | First time ever; both serve in CI |
| Windows binary made buildable | Complete | `npx.cmd` needs a shell since Node 20.12 |
| Stale path in the binary procedure fixed | Complete | Documented check returned 404 on a good binary |
| `shell.mts` surveyed | Complete | Nothing extractable, claim now verified |
| Agent files prepared for Codex and Grok Build | Complete | Five stale facts corrected, layering rules added to AGENTS.md |
| Agent instruction files guarded by a test | Complete | Fails on the old files, misses wildcard paths |
| Sandbox port binding identified | Recorded | `listen EPERM` is the sandbox, not the server |
| Default export rate regression fixed | Complete | GIF ran at 50 fps, WebM about 9x fast, from the conversion |
| Zero fallbacks restored | Complete | Output rate, width, height, stored sprite zoom |
| Gemini reference mode sends the first image only | Complete | Operator decision, keyframe mode unchanged |
| Frame rate consequence corrected in OPEN.md | Complete | Coarser sampling, not a lost tail or wrong speed |
| Source frame rate detected from frame timestamps | Complete | One probe for both stages, export rate kept separate |
| Exporter loaders merged | Complete | The handed rate was ignored on the normal route |
| Second clip never read by the exporter | Recorded | Collected and handed over, then dropped |
| Chromium blocked by the macOS sandbox | Recorded | Browser specifications need the sandbox lifted |
| Web fonts hosted locally | Complete | Original files and licences, no request to another origin on load |
| Second clip removed | Complete | Never read by the exporter, here or upstream |
| Keyframe use stated per provider | Complete | Gemini both frames, Grok and Wan the start frame |
| Gemini key test bypasses the proxy | Recorded | Direct call with the key in the query string |
| Video Prep rate detection covered in the browser | Complete | Fifteen frame clip reported as fifteen |
| Exporter adoption of a handed rate covered | Complete | Fails with adoption disabled; paired control |
| Loose frame count bounds tightened to sixty | Complete | Two specifications, stale comments corrected |
| Handoff contradictions corrected | Complete | `gh` names the fork; binaries, counts, open list |
| Workflow actions moved off Node 20 | Complete | checkout, setup-node, upload-artifact at v7 |
| In-range dependency updates and audit fixes | Complete | `npm audit` reports zero |
| Express 5 adopted | Complete | Two regressions found, fixed, and guarded by tests |
| Unused `multer` removed | Complete | Deprecated over vulnerabilities, imported nowhere |
| Archived `rcedit` removed | Complete | Its step had failed on every Windows build |
| Container image moved to Node 22.23 | Complete | Five security releases since 22.18 |
| Held majors and `jsdom` floor recorded | Recorded | TypeScript 7, node-fetch 3, `@types/node` 26 |
| Interface migration plan adopted | Recorded | Tamagui on TanStack Start and Expo; spike first, not begun |
| Web port to Tamagui and TanStack Start | Complete | 167 element boxes match the previous build; 88 browser specifications |
| Mobile port to Tamagui and Expo, Android | Complete in Expo Go | Exports, handoff, tabs, toasts, fonts, settings, a provider request, persistence, the file picker and the sound on a Galaxy A16; iOS not run |
| Settings and file inputs in Expo's web view | Complete | Both absent there; a memory store and a native picker, each verified on the phone; 10 new unit tests |
| WebM export streamed one frame at a time | Complete | Sixty frames ending at 1.97 s read from the file; fails without the overrun carry; 10 s 720p clip exports on the phone |
| Large picked files read in chunks; web view restarts announced | Complete | 100 MB clip loads in 34 s on the phone; one warning per reload, none on a fresh start |
| iOS Simulator run; scrolling, settings overlay, start report fixed | Complete | Picker, handoff, WebM and GIF exports to the share sheet, key test, on iOS 27.0; on the phone a swipe scrolled 373 of 624 pixels and the key test returned through the overlay |
| Runs on `main` no longer cancelled | Complete | A cancelled run had turned the README badge to failing with no test failed; other branches still cancel |
| Dependabot alerts addressed | Complete | `zod` overridden to 4.6.7: Expo's schemas pass twelve cases, both platforms bundle, the dev server serves; `node-forge` dismissed as not used, no patched release exists |
| README Quick Start, launcher names, mobile section | Complete | No prebuilt binary is promised; source and built launchers distinguished; the mobile application described |
| Source launchers fixed | Complete on macOS | `bin/start` served the page with the build absent, after serving "Cannot GET /" before; the batch file not run, no Windows machine |
| Proxy no longer grants every origin | Complete | Server test failed before the fix; 721 unit, 61 server and 90 browser tests pass after |
| Remote brought to parity with keleusma where sensible | Complete | `SECURITY.md`, `CONTRIBUTING.md`, issue and pull request templates, private vulnerability reporting; the server's exposure recorded in OPEN.md |
| Remote configured; README badges | Complete | Settings read back from the API; every badge image returned 200, the CI badge reading passing |
| `secret/` ignored entirely, as in keleusma | Complete | Marker untracked; a new file and the old marker both reported ignored by `git check-ignore` |
| Holding state prepared; handoff refreshed | Complete | Every content check rerun; the TypeScript file count corrected from 135 to 136 |
| ComfyUI reachable from the phone; plain HTTP permitted in release | Complete in Expo Go | Settings test reached a stand-in server on the phone; `usesCleartextTraffic="true"` in a regenerated merged release manifest; not installed |
| iOS start-up error traced | Inferred | Expo's wrapper sends props before iOS registers the view; not established by experiment |
| Phone check attached to another application's web view | Recorded | Stopped before reading anything; the check now selects Expo Go's socket by process number |
| Both proxies read upstream bodies as bytes | Complete | Non-UTF-8 image and video bytes survive the relay and arrive as base64; route tests fail with the old decoding; fake key test on the phone |
| Standalone release APK built and verified on the phone | Complete | Exports, handoff, sound, key test, picker and persistence on a release build; two `file:` worker defects found and fixed |
| Video Prep's scrubbing cache bounded to 256 MB | Complete | 6 new unit tests; the 100 MB, 20 s 720p clip then exported on the phone, free memory never below 473 MB |
| Proxy routing moved into a core planner | Complete | 18 new unit tests, multipart checked against Node's parser; server tests unchanged |
| Storage ban restored; application import zone added | Complete | Each ban and zone refused a failing file in every layer |
| Stage controllers moved to the platform layer | Complete | Mount onto memoized components; behaviour unchanged |
| Settings and chrome rewritten as React | Complete | Settings specifications pass unedited |
| Hydration mismatch on every load fixed | Complete | Routes inside `ClientOnly`; console empty, pinned by a specification |
| Stale build output shipped from `public/js/` | Complete | Removed; ignore rule dropped so it cannot hide |
| Worker specification reads addresses from the bundle | Complete | Fails with the worker file removed |
| Container test covers the served page directory | Complete | Fails on the old copy line |
| Layout regressions from the port pinned | Complete | Six specifications, four shown to fail against their defect |

## Open Items

Tracked in [decisions/OPEN.md](../decisions/OPEN.md) rather than duplicated
here.
