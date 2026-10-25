# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-10-25. The anchor is `e8a5ba2`, the last commit before this
refresh.** Read this block, run the validity check, then read the task below.

---

## Validity

Validate by ancestry and by content, never by a hash match. A check requiring
the tip to equal a recorded commit claims that nothing else ever lands, and it
fails on the very next commit, including the commit that carries the refresh
itself.

### Ancestry

`main` should **contain** `e8a5ba2`, the last commit before this refresh. Test
containment rather than equality.

```sh
git merge-base --is-ancestor e8a5ba2 HEAD
```

If that fails, this file predates a history rewrite and is stale. If it
succeeds, the anchor is satisfied no matter how far the tip has since moved,
because an anchor only has to be an ancestor.

The anchor is the commit before the refresh, never the refresh commit, for the
reason that a file cannot record the hash of the commit that introduces it.
Naming it by what it is, the last commit before the refresh, also keeps the
description from going stale later, which a phrase such as the current tip
would not.

### Content

Cheap and independent, each verified at the refresh. Read the rendered order
of the list rather than taking the next unused number, and renumber when
inserting, because a list whose numbers skip reads as though checks are
missing.

1. `git ls-files` reports **136** TypeScript files ending `.ts` or `.mts`,
   **18** ending `.tsx`, and exactly **one** JavaScript file,
   `eslint.config.mjs`, which is deliberate.
2. **Seven** projects exist at the repository root, `tsconfig.json` and six
   `tsconfig.*.json` files, and an **eighth** at `mobile/tsconfig.json`.
   `npm run typecheck` checks all eight. `src/` holds exactly five
   directories, `core`, `platform-browser`, `platform-worker`, `ui`, and
   `entry-browser`.
3. `src/core/ports/` holds **three** capability interfaces, namely
   `storage.mts`, `http.mts`, and `clock.mts`, and `src/core/` holds
   **twenty-three** modules, counting `proxy.mts`, `tabs.mts` and `accept.mts`.
4. `npm test` reports **721** unit tests and **61** application programming
   interface tests, all passing. It needs no mobile install.
5. `npm run test:browser` reports **90** passing browser specifications. Use
   that script rather than `npx playwright test`, which reuses a running
   server and therefore skips its own rebuild.
6. `tsc -p tsconfig.core.json` succeeds, and adding `localStorage` to any file
   under `src/core/` makes it fail. Adding it to a file under
   `src/platform-browser/`, `src/ui/` or `mobile/dom/` makes the lint fail,
   which was not true before this refresh; see LAYERING.md.
7. `test/fixtures/media` holds **four** fixtures, two of them small generated
   clips at different frame rates which the loop, exporter and frame rate
   specifications require, and `test/fixtures` holds no other directory.
8. `.github/workflows/verify.yml` declares **six** jobs. Read the most recent
   run rather than taking it on trust:

   ```sh
   gh run list --repo sgeos/angelssword-adventurers-creator --workflow verify.yml --limit 1
   ```

   The repository is named because `gh` otherwise resolves to the upstream
   remote and reports that the workflow does not exist, which reads as a
   failure of this assertion and is not one.

   The three beyond the gate are `mobile`, which installs the mobile package
   and bundles it for Android with `expo export`, `container`, which builds
   the image and fetches from a running container, and `binary`, which builds
   the standalone executable on Linux and on Windows and fetches from each.
   The `check` job now installs the mobile package too, because the gate
   typechecks it. Run 40170313151, on `dd5c9dc`, the commit that added the
   mobile application, passed all seven jobs, the `mobile` job and the
   changed `check` job included.

   Without an authenticated `gh`, report assertion 8 as **unverified**, not as
   failed, and say why. The same holds for assertions 4 and 5 under a sandbox
   that forbids binding local ports, where the tests fail with `listen EPERM`
   for reasons unrelated to the code.

Every assertion above was executed on the working tree that this refresh
describes, except the run status in assertion 8.

**Assertion 8 used to read "the container builds and serves" and was false for
several refreshes, this author included among those who did not notice.** The
runtime image stage did not carry `src/core/`, which the server began importing
during the layering work, so the container exited at startup on a missing module
while the image still built and every test passed. It was carried forward four
times as a claim annotated with an old anchor, which reads as bookkeeping rather
than as a warning.

**It is now an assertion about a machine having done it, which is the point.**
`deployment.test.mts` asserts the image carries every file the server's imports
reach, and the `container` job runs the image and fetches from it. Neither
depends on a person remembering. A claim only a human executes is a claim that
rots, and this one did.

If an assertion fails, this file is stale. Trust the repository and say so.

## If this session is not Claude Code

The protocol below names no tool-specific feature. Every commit in the history so
far was made with Claude Code, however, so it has not yet been exercised by any
other assistant. Anything in it that turns out to assume a Claude feature is a
defect in the protocol, and should be recorded in
[`AGENT_PITFALLS.md`](./AGENT_PITFALLS.md) rather than worked around silently.
[`AGENTS.md`](../../AGENTS.md) states which file each tool loads.
Codex does not load `CLAUDE.md`, so read it explicitly. Grok Build loads both,
and only once the folder is trusted.

## What a resuming session should do first

1. Run the validity check.
2. Read [AGENT_PITFALLS.md](./AGENT_PITFALLS.md). Short, and every entry is a
   mistake made in this repository. Two of them were repeated after being
   written down, so it is not merely decorative.
3. Read [../architecture/LAYERING.md](../architecture/LAYERING.md), which is
   the design the current work implements and which records why the capability
   list is now closed.
4. Read the task below.
5. Stop and wait for a prompt.

## Current state

A hard fork of `AngelsSwordStudios/angelssword-adventurers-creator`, converted
to TypeScript throughout. Upstream is dormant.

A four-stage pipeline in one page. Sprite preparation, video generation, video
preparation, model export, communicating through a shared handoff object.
Sprites generate through OpenAI, Grok, or a local ComfyUI. Video generates
through Gemini, Grok, or ComfyUI with Wan image-to-video. A local server
proxies every outbound call.

**The three-layer rearchitecture is complete, and the extraction it enables
is well advanced.** Nine increments landed.

Architecture, five increments: `e579ee5` established the enforced core;
`5da3c11` separated the platform and entry layers with the import-direction
rule no tsconfig can express; `9cf2a11` inverted storage; `8f75eb5` inverted
the network and time and moved the ComfyUI and Grok exchanges into the core;
`169cd1b` struck logging and binary payloads off the capability list as not
being capabilities.

Extraction, four increments: `ad0a64c` took the exporter's key colour
detection, placement and saturation match, and consolidated the colour table
that existed twice; `c7d070b` took the advanced key scoring, the crop, and the
size estimate; `f260334` gave the seek arithmetic one home and two names;
`2a78864` collapsed a frame selection that existed four times.

Unit tests went from 276 before this work to **623**.

**Since then the operator has run OpenAI sprites and Gemini video against
live keys**, which produced more information than all the mocked testing
before it, and drove a further run of work: a Bust and Full Body toggle, an
art style selector, a portrait canvas for full body, provider-specific output
labels, every reference image reaching Gemini, a primary-plus-slots reference
interface, and both sprite handoffs anchoring consistently.

**The most recent work turned outward, to the things the gate does not
reach, and it has paid every time.** The container was found broken and fixed,
with a test guarding the agreement between the server's imports and the image's
contents. Browser coverage went from 31 specifications to **75**, and is
**82** at this refresh: the loop controls, the two sprite selectors, the
exporter's controls, and the settings panel including the boundary that keys
are not to cross.

**Three rounds of coverage, three defects nobody had looked for.** A loader
whose output order depended on which file decoded first. A second place judging
whether a loop is usable, disagreeing with the first about loops that cross the
seam. And two that were recorded and later fixed on operator decisions: three
paths deciding the frame rate differently, resolved in `573ee9b` by measuring
the source rate from frame timestamps, and webfonts fetched from a third party
on every page load, resolved in `bddf5ec` by hosting the fonts.

**Then the same attention went to the artefacts nobody builds, and found more.**
Continuous integration then had five jobs: the three that run the gate, plus one
that builds the container and fetches from it and one that builds the standalone
binary on Linux and on Windows and fetches from each. The mobile port added a
sixth, which bundles the mobile application.

Writing them produced three further findings, all of the same kind and none
reachable by a compiler or a unit test. The documented binary smoke test told the
reader to fetch `js/app.mjs`, which the layering work had moved, so following it
returned 404 on a working binary. The open item recording that neither platform
binary had been built said resolving it needed access to those platforms, while
its own second clause named the runners. And the Windows build **could not have
worked**: three call sites chose `npx.cmd` without a shell, which Node has
required for a batch file since 20.12.

The category is instructions about the code, held where nothing executes them.
The remedy is a machine performing the act, not more careful prose.

**The page is now a React application on Tamagui and TanStack Start.** The web
half of the interface migration was done on 2026-10-24, ahead of the device
spike, on the operator's direction. The core is unchanged to the line. The
four media stages kept their controllers, moved to
`src/platform-browser/stages/`, and mount onto markup that memoized components
render once. Vite builds into `dist/client/`, which the proxy server serves.

**The mobile application exists, and runs on one Android phone.** `mobile/`
is an Expo application on SDK 58, with native chrome and settings in Tamagui
and the four stages in one web view as an Expo DOM component. The stage
components and the panels moved to `src/ui/`, which both applications render.
The proxy's routing became a core planner, `src/core/proxy.mts`, which the
server executes with node and the phone executes natively. On a Galaxy A16 in
Expo Go, frame rate detection, both exports, the handoff between stages, the
native tab switching and toasts, and the fonts were verified; the figures are
in [MIGRATION.md](../architecture/MIGRATION.md), and so were the settings
screen, a provider request through the native transport, settings persisting
across a restart, the system file picker and the notification sound. Five
defects were found on the device and fixed: the stage column was three and a
half times the screen's width, the workers did not load, the fonts did not
load, the web view had no storage, so no setting reached a stage, and file
inputs did nothing, because Expo's web view has no file chooser.

## The next task

**None. The project is in a holding state.** On 2026-10-25 the operator asked
for everything that could sensibly be done without them to be finished before
the project was put on ice, and it was. Every open matter in `OPEN.md` now
needs the operator: a request with a valid key, which spends their money; an
iOS device; a real ComfyUI server; and the package name, icon set, signing key
and store listing a release needs. Nothing is half done. On resuming, run the
validity check, then `npm ci`, `npm ci --prefix mobile`, `npm run check` and
`npm test`, and read the most recent continuous integration run, since
dependencies will have moved. Expect `npm audit --prefix mobile` to report
four high severity findings, all `node-forge` and the packages that depend on
it, in Expo's own tooling. Its Dependabot alert was dismissed as not used, and
`zod` is overridden to a patched major; GIT_STRATEGY.md has the reasoning and
when to undo each.

The local Android toolchain used for the release build was outside the
repository, under the machine's temporary directory, and should be presumed
gone. Rebuilding it is described in MIGRATION.md.

**The operator's decision on a native build, and iOS.** Everything the
Android phone can show in Expo Go has been shown, up to a 40 second 720p clip
of 200 megabytes loaded, cached, handed off and exported as WebM on the phone.
That took the export streaming one frame at a time and Video Prep's scrubbing
cache bounded; `OPEN.md` and MIGRATION.md have the measurements. A standalone
release APK was also built locally, with the operator's agreement, and
verified on the phone, which found two worker defects only a `file:` page
shows. What a real release needs, a package name, an icon set and a signing
key, is the operator's to decide; see `OPEN.md`. iOS needs a device. A key
test with a deliberately wrong key exercises the native transport without
spending anything, and was how it was verified.

**Running it on the phone.** Set `ANDROID_SERIAL` to the phone's serial on
every command, since another project's emulator shares this machine's `adb`
server. Then `adb reverse tcp:8081 tcp:8081`, start Metro from `mobile/` with
`npx expo start --lan`, and open `exp://127.0.0.1:8081` in Expo Go. Starting
Expo Go cold brings it up behind the launcher; send the same intent a second
time. The web view is reachable for a test script through
`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` and
Playwright's `connectOverCDP`. Never capture the screen without first checking
that Expo Go is the resumed activity, because the phone is a personal device,
and never begin a swipe near a screen edge, which is the back gesture and has
left the app. Find native elements with `uiautomator dump`, filtered to this
application's `testID`s, rather than by screenshot. Ask before changing any
setting on it. The pitfalls are in
`AGENT_PITFALLS.md` under "The mobile application".

**When editing the page,** a stage component under `src/ui/stages/`
must keep rendering once. Its controller owns the subtree after it mounts, and
a prop or state that re-rendered it would undo the controller's changes. The
settings panel and the chrome are ordinary React.

**Decisions taken by the operator.**

- **Sandbox**, 2026-10-07. Local port binding is allowed for this project only,
  through `.claude/settings.local.json`, which exists and is in effect: the
  server tests pass inside the sandbox. The browser specifications still need
  the sandbox lifted, for the reason in `OPEN.md`. Codex and Grok Build were
  vetted green by the operator.
- **Gemini reference images**, 2026-10-07. Send only the first. Done in
  `adfffe2`.
- **Release**, 2026-10-07. Hold until steady state.
- **Frame rate**, 2026-10-08. Detect the source rate, keep it apart from the
  export rate, pass it explicitly, and never use this machine's playback rate in
  its place. Done in `573ee9b`.
- **Web fonts**, 2026-10-24. Host them. Done: the original files and their
  licences are in `public/fonts/`, and the page requests nothing from another
  origin on load.
- **Keyframe mode**, 2026-10-24. Gemini is sent both keyframes, Grok and Wan the
  start frame. The requests already did this. The panel now says so for the
  selected provider.
- **The second clip**, 2026-10-24. Remove it. Done.
- **`gh`**, by 2026-10-24. The operator added `"gh *"` to the sandbox's excluded
  commands in `.claude/settings.local.json`. A command beginning with `gh` runs
  outside the sandbox and works. A `gh` inside a compound command does not
  match the pattern and stays sandboxed. `git` over SSH still needs the sandbox
  lifted, deliberately.
- **Dependencies**, 2026-10-24. Address the deprecation warnings and update
  everything that can be updated responsibly. Done: the workflow's actions are
  at v7, which run on Node 24; Express is at 5, with two regressions it
  introduced found and fixed, each now guarded by a test; `multer` and `rcedit`
  are removed, the first unused and the second never working; the image ships
  Node 22.23; `npm audit` reports nothing. TypeScript 7, node-fetch 3 and
  `@types/node` 26 are held, for the reasons in `OPEN.md`. Inside the sandbox
  the npm cache in the home directory is not writable, so set
  `npm_config_cache` to a temporary directory. Locally npm 12 blocks
  `esbuild`'s install script, and the build and the binary work without it.
- **Interface migration**, 2026-10-24. Move the interface to Tamagui on
  TanStack Start and Expo, spike first. Recorded in `RESOLVED.md`, planned in
  `MIGRATION.md`, open questions in `OPEN.md`.
- **Web port first**, 2026-10-24. Complete the web port to Tamagui and TanStack
  Start ahead of the spike. Done. The decisions it took are in `RESOLVED.md`.
- **Mobile port**, 2026-10-24. Complete the port to Tamagui and Expo, tested
  on the Android phone to the extent it is available. Done on Android in Expo
  Go, with the gaps listed under the next task.
- **Phone settings**, 2026-10-24. Stay-awake on USB may be enabled for a test
  window and must be turned off at its end. It was.

**Awaiting the operator.**

- **The Gemini key test.** It calls Google directly from the browser with the
  key in the query string, bypassing the proxy. Recorded in `OPEN.md`, not
  fixed, since it was not asked for.
- **The Windows icon.** The executable has never carried it, the `rcedit` call
  having had nothing to run. The archived package was removed. Whether to add
  the icon with `resedit` is recorded in `OPEN.md`.
- **The mobile application's open matters,** in `OPEN.md`: iOS, a native
  build, the keys held in the web view's memory, and Expo's tooling
  advisories.
- **The development Node floor.** `jsdom` 30.1 declares Node 22.22.2, above the
  project's 22.18, and continuous integration tests at 22.18. Recorded in
  `OPEN.md`.

And the four recorded earlier: whether the Graphics Interchange Format decode
path should exist when nothing imports it, and whether its two divergences from
the format are worth correcting if it does; whether the sprite zoom should
anchor to the character's feet rather than the image edge; whether framing
should influence the sprite canvas only for some providers, given Gemini's shape
behaviour is not understood; and whether this pipeline can target Gemini for
looping assets at all, since it disregards explicit camera instructions.

**Ordinary work, and the extraction tail is close to exhausted.** The five
largest modules still hold their Document Object Model work. Measured at the
anchor, largest first: `model-exporter` 1,647, `sprite-prep` 1,157,
`video-prep` 946, `video-gen` 829, `shell` 796. Every one of these was guessed
wrong on the first attempt at writing an earlier version of this block, which
is why the entry says measured.

`model-exporter` has been surveyed for arithmetic twice and the remainder is
genuine canvas and element work. **`shell` has now been surveyed too**, having
been described as the least examined and unlikely to yield much in three
successive refreshes without anyone looking. It holds the handoff object, the
notification sound, tab switching, the toast, the settings panel, the keyboard
bindings, and the element helpers the other layers call. There is no arithmetic
in it worth moving, so the conclusion carried forward on faith happens to have
been right, which is not the same as having been known.

**Coverage of entry-layer behaviour has been the better return three times
running, and it is now largely spent.** The reference slots, then the loop
controls and the sprite selectors, then the exporter's controls and the settings
panel. What is left uncovered is the canvas work itself, which is where a
browser specification stops being cheap: asserting that a keyed sprite looks
right means comparing pixels, and a pixel comparison is a maintenance burden
rather than a check.

A browser specification reaches wiring that a unit test cannot, and every defect
found this way lived in the wiring rather than the arithmetic.

### What is already true

The core has **zero** references to a platform facility of any kind, which
`tsconfig.core.json` refuses to compile. Storage and the network are each
confined by lint to named adapter files, and the lint now reaches the React
entry layer's `.tsx` files too. Twenty-three core modules carry what the application
computes; 721 unit tests reach all of it.

The entry-layer behaviour worth asserting is covered: the reference slots, the
loop controls, the framing and art style selectors, the exporter's mode limits,
estimate, aspect lock and filename presets, and the settings panel, together
with the two workers and the provider toggles that were covered before. The
container is verified and guarded by a job rather than by a person remembering.
Four fixtures exist and all four are used. **A binary exists for macOS, Linux and
Windows**, the latter two built and served by continuous integration, which is
the first time either has been built at all.

**The trust boundary is asserted rather than only documented.** Saving a
credential reaches neither a proxy route nor another origin, and that assertion
is paired with one proving the same rule would notice a proxy call, so it cannot
pass by matching nothing.

### Traps specific to this task

**Measure with a compiler, not with a search.** A search that stripped
comments and strings reported twelve modules portable. The core project
refused two of them, for `ImageData` and for `URLSearchParams`, neither of
which the search had looked for.

**A module reaching for a platform facility has not established that it needs
one.** `gif-composite` asserted in its own header that it needed a canvas. It
did not.

**A facility the platform uses on its own account is not a capability.** The
original capability list was a count of what the browser layers reach for,
which is a different question from what the core needs handed to it. Two
entries did not survive being asked the right question.

**Preserve behaviour across a move, and characterise it.** Writing
`gif-composite`'s first tests found two divergences from the format. Both were
preserved and pinned, and the decision recorded in
[../decisions/OPEN.md](../decisions/OPEN.md).

**Check that a new rule fires.** Every gate added so far was exercised against
a deliberately failing file before being believed.

**A test that passes may still be false.** One asserted that a palette sample
target bounds the sample count. It passed on the lengths chosen and was untrue
for lengths between seven and eleven. A test which passes first time against
a belief brought to it deserves more suspicion than one that fails.

**`npm run test:browser`, never the bare Playwright command.** The suite
reuses a running server outside continuous integration and so skips its own
rebuild, testing the previous bundle. Two specifications appeared to regress
this way against markup that had been updated and code that had not.

**A limitation may be load-bearing.** Two things called an omission in this
repository's own commit messages look like undocumented retreats from real
failures: the waist-up prompt, and the single-image reference. Before removing
a limitation, ask whether it was a retreat, and say in the commit which it is
and on what evidence.

**An indentation-sensitive literal substitution matches at every depth.**
Replacing a four-space-indented line also rewrites the eight-space copy,
because the shorter string is a substring of the longer one. This produced
duplicated statements once. Anchor on surrounding lines instead.

**Check that two formulas agree before unifying them.** The loop count was
computed two ways and they turned out to agree, which was established rather
than assumed, and the agreement is now a test. The export frame count was the
same story, and that one is shown to the user as an estimate before a wait.

**One number can have two meanings.** `0.001` appeared seven times across two
stages, four times as an end-of-clip margin and three as a seek tolerance. A
single constant would have tied them together by accident.

**`assert.equal` narrows.** Its `asserts actual is T` signature means a
defensive `?.` after it is dead, which the lint reports. Assert once, then use
the value plainly.

**A boundary cannot always be asserted at a realistic magnitude.**
`3 + 0.001` is not representable, so a tolerance test at three seconds
measures floating point rather than the function under test.

## Open matters

Recorded in [../decisions/OPEN.md](../decisions/OPEN.md).

- The five largest modules still have no unit tests. Their arithmetic is in
  the core and their wiring is covered by browser specifications, so what
  remains untested is canvas and element work.
- `gif-composite` diverges from the Graphics Interchange Format in two ways.
- The format's decode path has no production consumer at all.
- OpenAI sprites and Gemini video have been run against live keys. Grok and
  ComfyUI have not. Both extracted exchanges are covered by unit tests against
  a scripted client and by a browser specification against mocked routes,
  which is not the same as having run against the service. The binary is
  built and served by continuous integration on Linux and Windows, and by hand
  on macOS.
- The Gemini key test bypasses the proxy, awaiting the operator.
- The mobile application has run on one Android phone, in Expo Go and as a
  locally built release APK, never on iOS. No release is signed.
- No release has been cut.

## Relationship to upstream

Two pull requests and one issue are open upstream, all from this fork. The
issue reports four defects in the upstream JavaScript and carries a posted
correction: the key colour defect was first reported as an unconnected
feature, which was wrong, the field being read from the wrong object.

## Refreshing this file

Rewrite the block above when its assertions stop holding. Do not append and
leave the old one, which is how the reference project's equivalent reached 118
kilobytes. Superseded detail belongs in
[DESIGN_JOURNAL.md](./DESIGN_JOURNAL.md).

Record the anchor by reading the tip **before** committing the refresh.

```sh
git rev-parse --short HEAD   # run this first, write the result as the anchor
```

That commit becomes the parent of the refresh commit, so the anchor is always
commit N minus one relative to the refresh. Writing the tip after committing
is impossible, and writing it after any later commit would name a commit the
refresh never described.

A refresh may also take more than one commit, in which case any hash written
mid-sequence is wrong by the time the sequence finishes. The ancestry test
tolerates this, since it asks only that the anchor be reachable.
