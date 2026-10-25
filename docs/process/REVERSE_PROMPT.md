# Reverse Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Assistant to human. The block above the supersession line describes the
present. Everything below it is history and may be wrong.

See [COMMUNICATION.md](./COMMUNICATION.md) for the protocol, and for why this
file is arranged this way rather than being rewritten wholesale.

---

## Last Updated

2026-10-25. The mobile port to Tamagui and Expo runs on the Android phone, in
Expo Go and as a standalone release build. The port was committed and pushed
as `dd5c9dc` on the operator's authorisation, and continuous integration
passed all seven jobs. The fixes the standalone build needed were committed
after it, under the same authorisation.

## Verification

`npm run check` passes across eight TypeScript projects, the mobile one
included, and the lint. 721 unit tests and 60 application programming
interface tests pass. 90 browser specifications pass outside the sandbox.
`npx expo export --platform android` bundles the application, with its fonts
and worker bundles. Every new lint zone and both capability bans were exercised
against deliberately failing files, in every layer and in each adapter.

On a Galaxy A16 in Expo Go: frame rate detection at 15 and 30 frames per
second, a Graphics Interchange Format export in 2.4 seconds and a WebM export
in 3.1 seconds, each ending in the share sheet, the handoff from Video Prep to
the exporter in 0.28 seconds with the native tab following, native toasts,
native tab presses, all five fonts, and no horizontal overflow at 384 pixels.
Then, in a second window: the tab bar scrolling to an off-screen tab; the key
test with a fake OpenAI key, through the native transport to OpenAI and back;
that key saved and read by a sprite generation; the key and a stage's
preference both surviving a restart; Android's document picker opening from a
file input and the chosen clip loading; and the notification sound playing.
The fake key, the test clip and the changed preference were removed after.
Then large clips: 25 and 100 megabytes at 1280 by 720 load through the picker
in 3.1 and 33.7 seconds, after a fix. The WebM export was rewritten to stream
one frame at a time, after the 100 megabyte clip's export killed the web view;
the 25 megabyte clip then exported on the phone, and a new browser
specification reads sixty correctly timed frames from an exported file. The
100 megabyte clip still exhausted the phone until Video Prep's scrubbing
cache, a full-size canvas per frame and 2.2 gigabytes for that clip, was given
a 256 megabyte budget; it then exported, 600 frames in eight and a half
minutes. A 40 second clip of 200 megabytes then exported too. The user is
also told if the web view is ever reclaimed. The clips were removed from the
phone.

Continuous integration, run 40170313151 on `dd5c9dc`: typecheck and lint,
unit and API tests, browser tests, mobile bundles, the container, and the
binary on Ubuntu and Windows, all passed.

A standalone release APK was built locally, with the operator's agreement to
the Android SDK licence and to installing it on the phone, then removed. It
found two defects: the web view will not start a worker from the `file:` page
a release build loads from, and Expo addressed each worker with its directory
twice. Both exports failed until the DOM component started workers from blob
copies of their scripts. Then verified on the release build: both exports to
the share sheet, the sound, the handoff, the key test, the file picker, a
preference surviving a restart, the 100 megabyte clip end to end, exported in
510 seconds, and a 60 second clip of 300 megabytes, 1,800 frames, exported in
1,621 seconds with no reload. The APK was uninstalled after. Continuous integration run
40172673769, on the fixes, passed all seven jobs.

Then the iOS Simulator, iOS 27.0 in Expo Go, driven by touch with Maestro:
WebKit's web view records WebM and MP4 and has every capability the stages
use; the picker, the handoff, a WebM and a GIF export to the share sheet, and
the key test all work. Touch found three defects the inspector-driven Android
tests could not: the web view could not scroll, the settings screen's
`display: none` cut the web view off from Expo on iOS, and the start report
could precede its function prop. All fixed; verified on the simulator, not
yet on the Android phone, which was locked.

Not verified: an iOS device; a request with a valid key, which would spend the
operator's money and was not authorised; a clip larger than 300 megabytes and
60 seconds at 720p; a signed release.

## Summary

**The mobile application.** `mobile/` is an Expo package on SDK 58. Native
chrome and settings in Tamagui; the four stages in one web view as an Expo DOM
component, rendering `src/ui/StagePanels.tsx`, which the web page renders too.
What the web view lacks comes through seams in the browser platform, each
defaulting to the web page's behaviour: the transport, file saving, the
workers and the sound. The proxy's routing is now a core planner that the
server and the phone both execute.

**What the device found.** The stage column was 1,339 pixels wide on a 384
pixel screen. Both workers failed to load, because Expo built their addresses
relative to the mobile project and they live outside it, and the exporter
reported that as an unknown error. The fonts did not load. Expo's web view has
no `localStorage`, so no setting or key reached a stage, and no file chooser,
so file inputs did nothing. All fixed: the settings are held in memory, filled
from native storage before any stage module loads and written back to it, and
a file input's tap opens the system document picker natively.

**What exercising the rules found.** The storage ban had never been in force:
the network ban, a later block setting the same rule, replaced it everywhere.
Nothing had used storage outside its adapter. Both bans are now one setting
per file. Two applications now exist, and lint forbids each to import the
other.

**What reading the proxy found.** Both proxies, the server and the phone's,
read every upstream body as text, which corrupted a ComfyUI image through the
relay and the Grok video download. Fixed in the core's `shapeReply`, which now
takes bytes; tests at three levels with non-UTF-8 bytes, and the two route
tests fail with the old decoding put back. Recorded in `RESOLVED.md`.

## Questions for Human Pilot

**What should a real release be called and signed with?** A package name, an
icon set in place of Expo's placeholders in `mobile/assets/`, and a signing
key. The local build used `com.sgeos.asadventurer.devtest` and debug signing.

**May the downloaded toolchains be deleted?** The JDK, the Android SDK and
Gradle's cache, several gigabytes, are under the temporary directory, kept for
a rebuild. Nothing was installed system wide.

## Technical Concerns

The keys are handed from SecureStore to the web view, which holds them in
memory and never on its disk. A picked file over 32 megabytes crosses the
bridge in chunks, at about 3 megabytes a second. Unused copies of the workers ship in the mobile
bundle, about 23 kilobytes. Expo's command line tooling carries two audit
advisories, not shipped in the application. All recorded in `OPEN.md`. The
corrected declaration for Expo's Babel transformer, in `mobile/types/`, must
be removed if Expo fixes theirs, or it will hide the fix.

## Intended Next Step

Read continuous integration on the fixes commit, then wait for the operator.

## Session Context

`main` at `b8778a3` before this work, `dd5c9dc` for the port. Metro may
still be running from `mobile/`, on port 8081. The toolchains are under
`/private/tmp/claude-501/`: `jdk/`, `android-sdk/`, `gradle-home/`, `node22/`,
and the build copy `apk-build/`.

---

## Superseded history

Nothing below this line describes the present.

### Superseded 2026-10-24 — the web port to Tamagui and TanStack Start

#### Last Updated

2026-10-24. The web port to Tamagui and TanStack Start is complete and verified
locally. It is not committed, because committing was not authorised for this
goal.

#### Verification

`npm run check` passes across seven TypeScript projects and the lint. 677 unit
tests and 57 application programming interface tests pass. 88 browser
specifications pass outside the sandbox, the six new layout specifications
among them. The standalone binary builds on macOS, serves the page, its main
module and the proxy route, and its page renders with an empty console.

Against the previous build, served from a worktree of `cc05bbd`: every
identified element on every tab, 167, was measured in both and agrees within a
pixel and a half, and the chrome's hover and active colours match. Screenshots
of every tab were compared by eye. Each new or rewritten test was shown to fail
against the defect it guards, except the prompt and console tests, whose
defects were observed directly before they were fixed.

Not verified: the container, because Docker is not running here, and the Linux
and Windows binaries. Continuous integration builds and serves all three, and
has not seen this work.

#### Summary

**The page is a React application.** TanStack Start prerenders the document
shell; the routes render in the browser inside a `ClientOnly` boundary. The
chrome and settings are Tamagui and React state. The four media stages render
their markup once from memoized components and are driven by their existing
controllers, moved to `src/platform-browser/stages/`. Tabs and toasts became
platform stores the controllers still call. Express serves the build.

**What it took.** A secure version set, after the first choice carried a
critical advisory. `@tamagui/core` rather than `tamagui`, whose Slider hung the
build. Two new TypeScript projects, with third-party declaration checks
skipped where the frameworks' own declarations fail, argued in each file. Web-only
CSS Tamagui cannot type, kept in one module.

**What it found.** A hydration mismatch on every load. Tamagui rules beating the
layout on specificity and order. Margins that no longer collapsed. Text sizes
resolved against the spacing scale. Tabs that collapsed under a group. A prompt
re-indented by the converter. And a stale copy of the old build's output in
`public/js/`, shipped beside the new one, which let the worker specifications
pass against files nothing used. All fixed, and the layout ones pinned.

#### Questions for Human Pilot

**May this be committed and pushed?** It is staged and not committed.
Continuous integration's container and binary jobs are the only check of the
Dockerfile and the Linux and Windows builds, and they run on push.

The device question stands: the native spike's Android half can run on the
operator's phone; the iOS half waits for an iPhone.

#### Technical Concerns

The stage components must never re-render, and nothing enforces it beyond their
having no props. The design tokens exist twice, in Tamagui and in the stage
stylesheet. The page's scripts grew from 113 to 192 kilobytes gzipped, and the
parse cost on modest hardware is unmeasured. All three are recorded in
`OPEN.md`.

#### Intended Next Step

Commit and push on authorisation, then read continuous integration. Then the
native spike, Android first.

#### Session Context

`main` at `cc05bbd` before this work.

### Superseded 2026-10-24 — the migration plan recorded

#### Last Updated

2026-10-24. The interface migration plan is adopted and recorded. Nothing has
been built.

#### Verification

Documentation only. The plan's measurements were taken from the tree at
`0e2682a`: 6,109 lines of core, 5,855 lines of platform and entry code, 1,169
lines of markup with 227 element identifiers, and a 726 line server. No
framework has been installed and no device has been used.

#### Summary

The interface is to move to Tamagui, with TanStack Start for the web and Expo
for iOS and Android. The core carries over unchanged. The media stages run on
the phone as Expo DOM components, keeping their browser implementation inside a
web view, so the hardest code is not written twice. The local server and the
binary remain the desktop product, and no hosted backend is adopted.

Recorded in `RESOLVED.md`, planned in `docs/architecture/MIGRATION.md`, and the
spike's questions listed in `OPEN.md`.

#### Questions for Human Pilot

**Devices.** The operator has a physical Android phone and, for now, no iPhone.
The Android half of the spike can run. The iOS half, including whether WebKit's
recorder produces WebM, waits for an iPhone and an Apple developer account.
Desktop Safari and the iOS Simulator can give indications in the meantime, not
results.

#### Technical Concerns

My assessment before adoption was that the web half alone offers desktop users
little and that the native half is viable only through the web view route. The
plan is ordered so that the spike tests that before any rewrite. If the spike
fails on iOS, the plan narrows the native application to generation.

#### Intended Next Step

The Android half of the spike, on the operator's phone. The iOS half when an
iPhone is available. No application code changes before the results are
recorded and the operator chooses a branch.

#### Session Context

`main` at `0e2682a` before this work.

### Superseded 2026-10-24 — dependencies updated, Express 5 adopted

#### Last Updated

2026-10-24. Deprecation warnings addressed and dependencies updated, with two
regressions from Express 5 found and fixed before they shipped.

#### Verification

`npm run check` passes. 677 unit tests and 56 application programming interface
tests pass, the two new ones included. 82 browser specifications pass outside
the sandbox. The standalone binary builds on macOS and serves the page, a
compiled module and a proxy route. `npm audit` reports no vulnerabilities, and
`npm ci` prints no deprecation warning. Each new test was run on Express 4,
where it passed, and on Express 5 before the fix, where it failed. Docker is
not running on this machine, so the new image is checked only by the
`container` job. Continuous integration is read after the push.

#### Summary

**Deprecations.** The workflow's three actions moved from v4 to v7, which run
on Node 24. `multer` was deprecated over vulnerabilities and imported nowhere,
so it is gone. `rcedit` was archived and deprecated, and its only call had
failed on every Windows build, because the package declares no command for npx
to run. It is gone too, and the icon is recorded as a decision.

**Updates.** Everything in range, plus Playwright to 1.64 with its browser,
plus Express 5. The image moves from Node 22.18 to 22.23, five security
releases later. Continuous integration still tests the 22.18 floor.

**Express 5 changed two things the tests did not cover.** `app.listen` now
calls its callback on a failed bind, so on a port already in use the server
printed that it was running and opened a browser on someone else's port. And
`req.body` is now undefined rather than `{}` without a body, so five proxy
routes would have forwarded no body at all. Both are fixed and each has a test.

**Held.** TypeScript 7, because `typescript-eslint` does not yet accept it.
node-fetch 3, because it dropped the `timeout` option the proxy relies on, and
silently. `@types/node` 26, because it is ahead of the supported runtime.

#### Questions for Human Pilot

Three decisions in `OPEN.md`. The Gemini key test, unchanged. Whether the
Windows executable should carry the icon. And whether to raise the development
Node floor to 22.22.2, which `jsdom` 30.1 declares and continuous integration
does not use.

#### Technical Concerns

The Node 22.18 floor is tested only by continuous integration, and the binaries
it builds embed 22.18. They are smoke tests rather than releases, but a release
built the same way would ship that runtime.

#### Intended Next Step

Nothing is queued for an agent.

#### Session Context

`main` at `86c7850` before this work.

### Superseded 2026-10-24 — the frame rate specifications

#### Last Updated

2026-10-24. The two queued frame rate browser specifications are written, and
the handoff is corrected where it contradicted itself.

#### Verification

`npm run check` passes. 677 unit tests and 54 application programming interface
tests pass. 82 browser specifications pass outside the sandbox, the three new
ones among them. Disabling the exporter's adoption of a handed rate was confirmed
to fail the adoption specification, and the source was restored and rebuilt
before the final run. Continuous integration is read after the push.

#### Summary

**`frame-rate.spec.ts`.** Video Preparation reports the fifteen frame clip as
fifteen frames per second and thirty frames. The exporter adopts the rate Video
Preparation hands it. Since measuring again would also give fifteen, the
specification removes `requestVideoFrameCallback` after Video Preparation has
measured, and a paired control shows that the exporter, measuring without it,
reports thirty, assumed. Without the control the adoption test could pass on a
probe that still worked.

**Two loose bounds tightened.** The exporter and loop control specifications
asserted only more than thirty frames, with comments explaining that the rate
varied by host. It no longer does, so both assert sixty, and the comments say
why.

**The handoff.** The documented `gh` command resolves to the upstream remote and
reports a missing workflow, so it now names the fork. The open matters list said
the binaries had never been built and that a queued task addressed the untested
modules, and the summary gave nineteen modules and 644 tests. All corrected.

#### Questions for Human Pilot

**The Gemini key test** is unchanged and still awaits a decision. No key was
available this session, and nothing here depended on one.

#### Technical Concerns

The adoption specification depends on `requestVideoFrameCallback` being
deletable from the prototype. It is in Chromium, and the specification reads the
removal back so that a browser where it is not would fail rather than pass.

#### Intended Next Step

Nothing is queued for an agent.

#### Session Context

`main` at `a4e1ea1` before this work.

### Superseded 2026-10-24 — three of the operator's decisions acted on

#### Last Updated

2026-10-24. Three of the operator's decisions acted on: web fonts hosted,
keyframe use stated per provider, the second clip removed. Committed in
`bddf5ec` and pushed on the operator's authorisation.

#### Verification

`npm run check` passes. 677 unit tests, 54 application programming interface
tests and 79 browser specifications pass, the browser specifications outside the
sandbox. The new test that the page requests nothing from another origin was run
against the page as it was and failed, naming all six Google requests.
Continuous integration has not seen these changes.

#### Summary

**Web fonts.** The four families are hosted in `public/fonts/` as the original
files from Google's font repository, unmodified, beside their licences. Google's
subsets would have been 138 kilobytes against about 401, but two licences
reserve a font name for modified versions and I was not certain a subset is not
one, so I took the option that does not depend on the answer.

**Keyframe mode.** Already sent Gemini both frames and Grok and Wan the start
frame. The keyframe panel now says which, per provider, and a missing start
frame is reported as such rather than as a missing reference image.

**The second clip.** Removed from the page, Video Preparation, the core handoff
and the stylesheet, with the unused crossfade helper. The README had also
advertised a crossfade loop mode that never existed, and no longer does.

#### Questions for Human Pilot

**The Gemini key test**, found while removing the font links. It calls Google
directly from the browser with the key in the query string, bypassing the proxy
every other call uses. Recorded in `OPEN.md`, not fixed.

#### Technical Concerns

The licence reasoning is mine, not a lawyer's. Shipping the unmodified originals
is the conservative reading. Converting them to WOFF2 or subsetting them to save
weight would reopen the question.

Whether Gemini honours a keyframe end frame is still not established.

#### Intended Next Step

The two browser specifications for the frame rate change remain queued.
Otherwise nothing until the Gemini key test is decided.

#### Session Context

`main` at `bddf5ec` before this refresh.

### Superseded 2026-10-24 — prepared for a power cycle

#### Last Updated

2026-10-23. Prepared for a power cycle. The frame rate work is verified,
recorded and pushed.

#### Verification

`npm run check` passes. 675 unit tests and 54 application programming interface
tests pass, and 78 browser specifications pass outside the sandbox. The browser
specifications cannot run inside Claude Code's macOS sandbox, because Chromium
is refused a Mach port at startup. Continuous integration is read after the
push.

#### Summary

The source frame rate is now detected from the timestamps of displayed frames
and kept apart from the export rate. The rate this machine can play at is not
used for anything. Both stages share one probe, and the rate is passed
explicitly. The exporter's normal route from Video Preparation had been ignoring
the rate it was handed. One loader now serves every route.

Tracing every consumer of the rate turned up one more defect, recorded and not
fixed. The exporter never reads the concatenated second clip that Video
Preparation offers, measures and hands over.

#### State that survives a power cycle

- `main` is pushed and the working tree is clean. There is no stash.
- Two local branches, `pr1` and `pr2`, are copies of upstream pull requests from
  July with no remote of their own. They were left untouched.
- `tmp/embedded-prompts-report.md` is a review from 2026-09-10. It is ignored by
  git, as everything in `tmp/` is meant to be.
- `.claude/settings.local.json` holds the operator's port binding setting. It is
  ignored by git and survives on disk.
- No server, container or test process started by this session is left running.
  That was not true until this refresh. Five standalone binaries from smoke tests
  on 19 and 30 September were still running and holding ports 3998 and 3999,
  because the command that was meant to stop them matched nothing and I reported
  them stopped. They are stopped now, and that was confirmed by checking.

#### Questions for Human Pilot

The web fonts, keyframe mode, the second clip, and whether to exclude `gh` from
the sandbox. Each is set out in [HANDOFF.md](./HANDOFF.md).

#### Technical Concerns

The probe has been exercised in headless Chromium on macOS and through
continuous integration on Linux. It has not been run in Firefox or Safari, nor
against a variable frame rate clip from a real generator.

#### Intended Next Step

Two browser specifications for the frame rate change, listed in the handoff.
Otherwise nothing until the questions are answered.

#### Session Context

`main` at `dc70dba` before this refresh.

### Superseded 2026-10-23 — the operator's decisions, and the export rate regression

#### Last Updated

2026-10-07. The operator's decisions acted on, and a worse defect found while
answering the frame rate question.

#### Verification

`npm run check` passes. 654 unit tests, 54 application programming interface
tests and 77 browser specifications pass, run outside this session's sandbox,
which forbids binding local ports. Continuous integration is read after the
push.

#### Summary

**Exports at default settings played too fast, and that is fixed.** The output
rate field means "match source" at zero, its default. The TypeScript conversion
broke that on 2026-09-17. Measured on a two second clip, the GIF export lasted
1.20 seconds and the WebM 0.22 seconds. After the fix they keep the clip's
duration. Two browser specifications now export real files, and both fail on
the old code. The same lost fallback affected the width, height and stored
sprite zoom, which are restored too.

**Gemini reference mode sends only the first image**, as decided. Keyframe mode
still sends its start and end frames.

**My earlier account of the frame rate defect was wrong**, and `OPEN.md` is
corrected. A rate read too low skips frames throughout the clip. It does not cut
off the end or change the speed.

#### Questions for Human Pilot

**Web fonts.** The reply read "Hist". I took it as "host" and did nothing,
because a guess there would add files to the repository, the image and the
binary.

**Keyframe mode.** Should "send only the first" apply to it too? That would
leave keyframe mode unable to send its end frame.

**Frame rate.** Decision pending. The explanation is in the reply that
accompanies this refresh.

**Claude Code sandbox.** The setting is in the project's
`.claude/settings.local.json`, which this session cannot write.

#### Technical Concerns

The two new export checks run in headless Chromium only. Firefox records WebM
by a different path, captureStream at the export rate, and nothing here checks
it.

Nothing in the pipeline has been exercised end to end with a Wan clip, whose
rate of sixteen frames per second is the plainest case of the exporter's thirty
frame assumption being wrong.

#### Intended Next Step

None of mine until the questions above are answered.

#### Session Context

`main` at `adfffe2` before this refresh.

### Superseded 2026-10-07 — prepared for Codex and Grok Build

#### Last Updated

2026-10-07. The repository prepared for handoff to Codex and Grok Build.

#### Verification

`npm run check` passes. 644 unit tests, 54 application programming interface
tests and 75 browser specifications pass, run outside this session's sandbox
because the sandbox forbids binding local ports. 158 documentation links
resolve. Continuous integration is read separately after the push.

#### Summary

Grok Build's own documentation, read from its local copy, states that it loads
both `AGENTS.md` and `CLAUDE.md` from the repository root, and only once the
folder is trusted. Codex loads `AGENTS.md` and not `CLAUDE.md`. So the two files
reach one agent together and must agree, and every rule Codex must obey has to
be in `AGENTS.md` rather than behind a link.

Checking both files against the tree found five statements that had stopped
being true: a project count of four where there are five, a compiled-output path
the layering work had moved, a browser test command that can test a stale
bundle, a claim that only the macOS binary had been built, and a claim that no
stage had met live keys. `AGENTS.md` also lacked the layering rules entirely.
All are corrected, and a test now checks the mechanical parts of both files.

The process documents name no tool-specific feature, so the protocol needed no
change. It has, however, never been run by anything but Claude Code here, and the
handoff now says so rather than implying otherwise.

#### The finding most likely to matter to the next agent

Under this session's sandbox, 32 of 54 application programming interface tests
failed at once with `listen EPERM`. That is the sandbox refusing to bind a local
port, and every one passes outside it and in continuous integration. Codex and
Grok Build both commonly run sandboxed, and an agent seeing thirty-two failures
could reasonably conclude the server is broken. `AGENTS.md` and the handoff now
tell it to report such a run as not executed, naming the restriction.

#### Questions for Human Pilot

**Should the next agent's sandbox allow local port binding?** Without it the
proxy tests and browser specifications cannot run at all. In Claude Code that is
`sandbox.network.allowLocalBinding`. I have not checked the equivalent settings
for Codex or Grok Build and would not want to guess them.

The decisions from the previous block stand and are all still yours: how the
frame rate should be established, whether to self-host the webfonts or correct
the README, the Gemini experiment with two anchored reference images, and whether
to cut a release now that three platform binaries exist.

#### Technical Concerns

**The guard does not catch everything it was written for.** Run against the old
files it fails on the project count and the Playwright command, but not on the
moved output path, because it skips paths containing a wildcard. It checks
scripts, paths, links and a count, never whether prose is true.

**I wrote one false sentence while preparing this**, that the protocol had been
run by more than one assistant. The history shows only Claude Code. It was
corrected before commit.

**Nothing here was exercised in Codex or Grok Build.** What each tool loads comes
from Grok's documentation and from the established Codex convention, not from
running either against this repository. Running `grok inspect` in the repository
would confirm Grok's side directly.

#### Intended Next Step

None of mine. The repository is ready for another agent to resume from the
handoff, and the open items are decisions.

#### Session Context

`main` at `d9131dc` before this refresh.

### Superseded 2026-09-30 — continuous integration builds the container and the binaries

#### Last Updated

2026-09-30. Continuous integration now builds the container and the binaries.
Three more findings, all of them instructions nothing executed.

#### Verification

`npm run check` passes across all five projects. 644 unit tests, 49 application
programming interface tests, 75 browser specifications, all passing. 158
documentation links resolve.

**Continuous integration has five jobs and the latest run on `main` passed all
of them**, which now includes the container and a binary on two platforms. That
is stronger than my local runs, being a clean checkout on hardware I do not
have.

#### Summary

Entry-layer coverage was spent, so this went after the artefacts that are built
by hand or not at all. Two jobs: one builds the image, runs it, and fetches the
page, a compiled module and a proxy route; the other builds the standalone
binary on Linux and on Windows and fetches the same from each.

They found three things within an hour of existing, and all three are the same
kind of defect.

**The documented binary check was wrong.** `VERIFICATION.md` told the reader to
fetch `js/app.mjs`. The layering work moved it to `js/entry-browser/app.mjs`, so
following the documented procedure on a perfectly good binary returns 404. I
confirmed that by building one.

**The open item was wrong about why it was open.** It said building the Windows
and Linux binaries needed access to those platforms. Its own second clause named
continuous integration runners as the alternative, and I had read that item
several times without reaching the second clause. Both built the same afternoon
somebody tried.

**The Windows build could not have worked.** It failed at the first npx call with
`spawnSync npx.cmd EINVAL`. Since Node 20.12 a batch file cannot be spawned
without a shell, under the hardening added for CVE-2024-27980, and three call
sites chose `npx.cmd` without one. The platform branch had been written and then
not followed through. It is fixed, and Windows now builds and serves.

#### What I think the real lesson of today is

Six defects today, and five share a category that is not "untested code". They
were **instructions about the code, held where nothing executes them**: a
Dockerfile copy list, a validity assertion only a human ran, a documented curl
path, a recorded blocker that had stopped being true, and a platform branch no
supported platform exercised. A compiler cannot see any of them and a unit test
cannot reach them. They are observable only by performing the act they describe.

This morning I would have proposed better documentation discipline. That would
not have worked, because every one of these was written carefully by someone
paying attention, including me. What worked was arranging for a machine to
perform the act.

#### Questions for Human Pilot

Unchanged from the previous block, and all still yours.

**How should the frame rate be established?** Three paths decide it differently
and give different counts for one clip. `requestVideoFrameCallback` is accurate
and changes frame counts for every existing workflow; exposing the detected rate
for editing solves the practical problem without touching detection.

**Self-host the webfonts, or correct the README?** Six requests leave on every
page load against a claim that the later stages work fully offline.

**The discriminating test on Gemini**, with two properly anchored reference
images.

**New, and small:** whether to publish a release now that three platform
binaries exist. What the jobs establish is that each starts and serves on a
runner. Nobody has double-clicked one, no Windows machine has been asked about
an unsigned executable, and the macOS binary is ad-hoc signed rather than
notarized.

Four further decisions are in [../decisions/OPEN.md](../decisions/OPEN.md).

#### Technical Concerns

**An empty result from a convenience wrapper is a fact about the wrapper.**
`gh run list` returned an empty array and I formed the hypothesis that continuous
integration had never run. There were 43 runs. I verified before writing it down,
which cost one command; had I not, `OPEN.md` would now contain a confident
falsehood.

**I have added jobs I can only verify through the jobs themselves.** Windows is
not testable here. I pushed, read the failure, fixed it, pushed again and read
the pass. That is a complete loop, but it is worth being explicit that my
knowledge of the Windows build is entirely second hand.

**What the binaries do not establish.** They start and serve on a runner. That is
not the same as being usable by the audience this tool is for, and I would not
describe the platform support as finished.

Carried forward: Grok and ComfyUI remain unexercised against anything real.

#### Intended Next Step

I do not have a next item of comparable value, and I would rather say so than
invent one. Entry-layer coverage is spent, the extraction tail is exhausted, and
the artefacts now build themselves.

What remains is the canvas work, where a specification means comparing pixels and
becomes a maintenance burden; and the decisions above, which are yours.

#### Session Context

`main` at `9a5f904` before this refresh. Upstream carries two open pull requests
and one open issue, all from this fork.

### Superseded 2026-09-30 — the exporter, the settings panel, and the trust boundary

Same day as the current block, and kept rather than consolidated: this one is the
exporter and settings coverage and the two findings it produced.

#### Last Updated

2026-09-30. The exporter's controls and the settings panel covered, the trust
boundary asserted, and two findings recorded rather than fixed.

#### Verification

`npm run check` passes across all five projects. 644 unit tests, 49
application programming interface tests, 75 browser specifications, all
passing. 158 documentation links resolve. The container was built and run
today; the procedure is in [VERIFICATION.md](./VERIFICATION.md).

#### Summary

The exporter's specifications had held two tests. One listed controls and
asserted they were present, which would pass against a page whose every control
was inert. The other checked whether a class was on the global object, found it
was not, and asserted that it was not. Neither established that the exporter
does anything. They are replaced by seventeen that fail if the control they
exercise is disconnected.

The settings panel had one test, covering two of four credentials. It now has
nine, and among them the property the documentation promises and nothing
checked: that saving a key reaches neither a proxy route nor another origin.

**Three rounds of browser coverage, three defects nobody had looked for.** That
is now a pattern rather than luck, and it is the reason I kept going after
saying I would stop.

#### The two findings, neither of them fixed

**Three paths decide the frame rate, and they disagree.** The exporter reported
sixty frames for the clip Video Preparation reported as thirty-eight, same clip,
same machine. Video Preparation measures by playing it. A file dropped on the
exporter is assumed to be thirty frames per second. A clip arriving by handoff
carries Video Preparation's figure. The two failure modes point opposite ways:
the assumption is exact at thirty and wrong in proportion elsewhere, so a two
second clip at fifteen frames per second is reported as sixty frames and half
the frame numbers the exporter offers do not exist.

Unifying the frame count earlier today is what made this findable, and it is
the better argument for consolidation than brevity ever was. While each stage
computed its own count from its own rate, a disagreement could be blamed on the
arithmetic, and I did blame it. With one formula the only place two answers can
come from is the input.

**The page fetches webfonts from a third party on every load.** Six requests,
measured, for four families. The README says the later stages work fully
offline and that the internet is needed only for generation. That holds as a
statement about function, the faces falling back, and fails as one about
traffic. Every load also tells a third party the user's address, which sits
oddly beside a proxy arrangement built so that keys and prompts reach only the
service they are for.

#### Questions for Human Pilot

**How should the frame rate be established?** The widest-reaching of these.
`requestVideoFrameCallback` is accurate and changes frame counts for every
existing workflow. Exposing the detected rate for editing solves the practical
problem without touching detection. Whichever is chosen, the three paths should
agree afterwards.

**Should the webfonts be self-hosted, or the README corrected?** Self-hosting
removes the requests and adds weight to the repository, the container and the
binary; the faces are all under the SIL Open Font License, so redistribution is
permitted. Correcting the prose instead is honest and free.

**The discriminating test is still yours.** Two properly anchored reference
images on Gemini. Landscape means multiplicity is the problem and sending every
image is a regression; portrait means it was the misalignment, now fixed.

Four further decisions are in [../decisions/OPEN.md](../decisions/OPEN.md) and
none is mine.

#### Technical Concerns

**A no-op that leaves the system in the state the test wanted is the hardest
false pass to notice.** The aspect lock assertions passed before they tested
anything: the lock is a styled switch whose checkbox is hidden, so my `check()`
could not have clicked it, and the lock defaults to on. Nothing about the result
looked unusual. Five such switches exist and the flip is now a shared helper
that drives the visible span and confirms the input followed.

**My expectation was stale in the direction of my own earlier work.** I asserted
that an inverted frame range selects nothing. It wraps, because I made the
playback space circular myself and then wrote a test assuming it was not. Fourth
time this session that a belief I brought to a test was the thing at fault.

**An assertion that observes nothing happening needs a companion.** The trust
boundary test passes by seeing no request of two kinds, and a classifier
matching nothing would pass it equally well. It is paired with a test that the
same rule notices a deliberate proxy call.

**It took two tries to state the boundary checkably.** Asserting no request at
all failed on the webfonts, then again on the success toast fetching its
notification sound. Neither says anything about a key. The assertion is about
where requests go, which is what is actually checkable.

Carried forward: Grok, ComfyUI and the binary remain unexercised against
anything real, and only the macOS binary has been built.

#### Intended Next Step

Coverage of the entry layer is largely spent. What is left uncovered is the
canvas work, and that is where a browser specification stops being cheap:
asserting a keyed sprite looks right means comparing pixels, which is a
maintenance burden rather than a check. I would not start that unasked.

The two new findings are decisions, not work, and both are pinned by
specifications that will fail when they are fixed.

#### Session Context

`main` at `7dc69a8` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-30 — the container, and the coverage that found it

Same day as the current block. Kept rather than consolidated: this one is the
container defect and the loop and sprite selector coverage.

#### Last Updated

2026-09-30. The container, found broken and fixed. Browser coverage for the
loop controls and the sprite selectors. One defect nobody had looked for.

#### Verification

`npm run check` passes across all five projects. 644 unit tests, 49
application programming interface tests, 51 browser specifications, all
passing. 153 documentation links resolve. **The container was built and run
this time**, on macOS with Docker 29.8.1, and the procedure is recorded in
[VERIFICATION.md](./VERIFICATION.md).

#### Summary

I went after the things the gate does not reach, on the reasoning that the
extraction tail was thin and that coverage work had returned more than further
extraction would.

**The container did not work, and the defect was mine.** The image built and
the container exited at startup on a missing module. The runtime stage copied
the server and the public files, which was correct while the server was
self-contained; the layering work gave the server an import from the portable
core, and nothing in the repository connected those two facts. A test now
asserts that the image carries every file the server's imports reach, and I
confirmed it fails on the real defect rather than only passing on the fix.

The loop controls and the framing and art style selectors gained twenty browser
specifications. That found a second place judging whether a loop is usable,
using a plain subtraction that predates loops being circular, so the
information panel hid loops that the readout beside it called valid, in exactly
the seam-crossing case the circular change was made to support.

#### The thing I would most like you to see

**The frame rate is not read from the file.** The stage plays the clip at four
times speed for half a second and divides the frames the browser reports
decoding by the elapsed media time, so what it measures is how fast the host
can decode. A clip of exactly sixty frames was reported as thirty-eight.

That makes the last twenty-two frames unreachable and runs an export at a rate
the clip never had. It is expected to be worse on modest hardware than on a
developer's machine, which is the direction that makes a defect hard to notice,
and this tool's stated audience is streamers on modest hardware.

I did not fix it. `requestVideoFrameCallback` reports each frame's media time
and would give the rate without depending on decode speed, but changing
detection alters the frame count for every existing workflow, and my evidence
is one synthetic clip on one host. Offering the detected rate as an editable
field would solve the practical problem without touching detection. Recorded in
[../decisions/OPEN.md](../decisions/OPEN.md) with what would decide it.

#### Questions for Human Pilot

**The discriminating test is still yours and still the largest open question.**
Two properly anchored reference images, on Gemini. Landscape means multiplicity
is the problem and sending every image is a regression. Portrait means it was
the misalignment, now fixed.

**New, and the one I would act on next if you want it acted on:** whether to
change frame rate detection, or to expose the detected rate for editing, or to
leave it alone.

Four further decisions are recorded in OPEN.md and none is mine: the fate of
the unreferenced Graphics Interchange Format decode path, whether its format
divergences matter, whether sprite zoom should anchor to the feet rather than
the image edge, and whether this pipeline can target Gemini for looping assets
given that it disregards explicit camera instructions.

#### Technical Concerns

**An assertion nobody runs is worse than no assertion.** The handoff carried
the container claim through four refreshes, each time annotated with an anchor
further behind. That annotation reads as bookkeeping rather than as a warning,
and I treated it as bookkeeping while rewriting it. The claim was false for
most of that time.

**A rearchitecture invalidates every hand-maintained list of files, and those
lists are outside the compiler's reach.** I spent five increments moving
modules with lint rules enforcing the import directions, all of it inside the
type system's view. The Dockerfile was four lines naming paths, and it was the
only place the reorganisation actually broke.

**A test that passes may be testing nothing.** My first framing specification
omitted the switch into generation mode, and the default-value assertion passed
anyway, because reading an attribute works on a hidden element. Two further
traps: a range input clamps an out-of-range value silently, and a missing
character name stops generation with a toast that looks exactly like a request
never made.

**I guessed two module line counts while refreshing the handoff, again**, and
corrected them by measuring. That pitfall was already written down twice.

Carried forward: Grok, ComfyUI and the binary remain unexercised against
anything real, and only the macOS binary has been built. The findings from live
running, including that Gemini disregards explicit camera instructions, are in
the history block below and still hold.

#### Intended Next Step

The extraction tail is exhausted for practical purposes. What remains
uncovered in the entry layer is the exporter's controls and the settings panel.

I judged that a smaller return than the two rounds before it and nearly stopped
on that basis, then changed my mind on the evidence rather than the estimate.
**Both rounds of coverage work found a genuine defect, two for two**, and
neither was in the behaviour the specifications were written to assert: the
first surfaced an ordering dependency in a loader, the second a second
judgement of loop usability and, through it, the container. A third round is
therefore worth running, and the estimate that it is a small return is the
same kind of estimate that was wrong twice.

What is still yours regardless: the Gemini experiment, the frame rate decision,
and the four recorded decisions. None of those is blocked by the above.

#### Session Context

`main` at `dbb4217` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-30 — live running, and the frame count two stages disagreed about

Same day as the current block, and kept rather than consolidated into it, the
two describing different work. This one is the first live running against
OpenAI and Gemini, and what it drove.

#### Last Updated

2026-09-30. Live running against OpenAI and Gemini, the work it drove, and
one frame count that two stages disagreed about.

#### Verification

`npm run check` passes across all five projects. 644 unit tests, 44
application programming interface tests, 31 browser specifications, all
passing. 152 documentation links resolve. The container has still not been
rebuilt and is marked unverified in [HANDOFF.md](./HANDOFF.md).

#### Summary

The operator ran OpenAI sprites and Gemini video against live keys for the
first time in this fork's history. Two days of live running produced more
information than all the mocked testing before it, and most of this period's
work is downstream of it.

Framing and art style became user choices, because the pipeline disagreed
with itself about what a sprite is: the brief specified full body, the prompt
asked for waist up, and the video half defended full-body framing. The art
style was hardcoded and beat the operator's claymation reference outright.

The reference images now all reach Gemini, are all previewed, keep the order
supplied, and sit in three replaceable slots. Both sprite handoffs now
compose identically, where one previously forwarded the raw generation.

#### Questions for Human Pilot

**One experiment would settle the largest open question.** Two properly
anchored reference images, on Gemini. Landscape means multiplicity is the
problem and sending every image is a regression. Portrait means it was the
misalignment, now fixed.

Four decisions are recorded in [../decisions/OPEN.md](../decisions/OPEN.md)
and none is mine: the fate of the unreferenced Graphics Interchange Format
decode path, whether its format divergences matter, whether sprite zoom
should anchor to the feet rather than the image edge, and whether this
pipeline can target Gemini for looping assets given that it disregards
explicit camera instructions.

#### A defect worth naming separately

**The two stages disagreed about how many frames a clip has.** Video Prep
rounded `duration * fps` and the exporter floored it, so the exporter could
count one fewer. The handoff carries Video Prep's figure while the loop range
is clamped to the exporter's, so a loop end was silently clipped, and the
exporter's last-frame field made the final real frame unreachable.

Unified on rounding, which is a behaviour change: some clips now export one
frame more than before. That frame is real and was being dropped.

#### Technical Concerns

**I was wrong in the interface, and that is the worst place to be wrong.** I
wrote "Follows your reference image" from reasoning rather than observation,
and the first live run contradicted it. Anything user-facing should report
what was seen.

**Two limitations I called omissions look like undocumented retreats.** The
waist-up prompt and the single-image reference. Both were removed on the
reasoning that they were oversights. The first has corroborating evidence
that it was deliberate; the second is under suspicion from one live run.
Removing a limitation deserves the question of whether it was load-bearing.

**Gemini disregards explicit camera instructions.** A prompt stating "Zero
Camera movement, no panning, no drifting, and no zooming" produced a crop and
a zoom. That bears on whether looping assets are achievable there at all,
since a drifting scale defeats both the loop matching and the exporter.

Carried forward: Grok, ComfyUI and the binary remain unexercised against
anything real.

#### Intended Next Step

Await the discriminating test. `model-exporter` has now been surveyed for
arithmetic twice and the remainder is genuine canvas and element work, so the
extraction tail is close to exhausted. `shell` at 796 lines is the least
examined and is the settings panel and page chrome, which is unlikely to yield
much.

#### Session Context

`main` at `754e78d` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-30 — extraction, before live running

#### Last Updated

2026-09-19. Four extraction increments on top of the five architectural ones.
Unit tests 276 to 520.

#### Verification

`npm run check` passes across all five projects. 520 unit tests, 44
application programming interface tests, 24 browser specifications, all
passing. The container was not rebuilt and is marked unverified at the anchor
in [HANDOFF.md](./HANDOFF.md).

#### Summary

The architecture made the extraction possible; the extraction is what it was
for. Nine increments in total, and the last four moved arithmetic out from
under the Document Object Model into the core.

What came out, and what each was hiding.

The exporter's placement existed in **five identical copies**, each preceded
by the same sanitising. The frame selection existed in **four**, and the
fourth produced the estimate shown to a user before an export they then wait
for. The named colour table existed **twice**, and the second copy had grown
an injection parameter so the core could be handed the first. `0.001`
appeared **seven times** serving two different purposes, an end-of-clip
margin and a seek tolerance, which are not the same quantity.

The auto-detection and the advanced key scoring were each a real algorithm
inside a click handler, the second at ninety lines with six unexplained
constants. Both are now named, documented and tested.

Two booleans that could both be true, meaning nothing, became one field.

#### Questions for Human Pilot

**Whether to keep extracting.** What remains in the five largest modules is
increasingly element wiring, canvas drawing and event binding, which is what
a stage module is for. Continuing means progressively thinner slices.
Stopping means saying that those five hold presentation and the core holds
what is worth testing. I have no strong view; the returns are visibly
diminishing.

Two matters from earlier remain open and are recorded in
[../decisions/OPEN.md](../decisions/OPEN.md). The Graphics Interchange Format
decode path has no production consumer, and its two divergences from the
format are worth correcting only if it is kept.

#### Technical Concerns

**Several of the extracted behaviours are preserved rather than correct**, and
each says so where it is defined. A histogram bucket is identified by its
floor, biasing every reconstructed colour dark by up to three levels. The
placement rounds its four values independently, so the centring remainder
falls on one side. `clampSeekTime` applies its lower clamp before its upper,
so a sub-millisecond clip yields a negative time. `hexToRgb` does not
validate and yields NaN. None is reachable in practice except the first,
which moves every score if changed.

**The size estimate's two constants are heuristics with no provenance.** They
came from a comment saying roughly. They are named now so a measurement has
somewhere to go, but nothing here establishes them.

Two of my own tests failed on first run and both were the tests rather than
the code, one asserting a clamp the function does not perform and one
asserting a boundary that floating point makes unassertable at that
magnitude. Both are recorded in [AGENT_PITFALLS.md](./AGENT_PITFALLS.md).

Carried forward: neither extracted exchange has run against a live service.

#### Intended Next Step

Await the decision above. If the answer is to continue, `shell` at 784 lines
is the least examined of the five.

#### Session Context

`main` at `2a78864` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-19 — rearchitecture complete, extraction begun

#### Last Updated

2026-09-19. Three-layer rearchitecture, five increments. Structurally
complete, and every capability the core needs inverted.

#### Verification

`npm run check` passes across all five projects. 396 unit tests, 44
application programming interface tests, 24 browser specifications, all
passing. Every gate added was exercised against a deliberately failing file:
the core project, the two determinism bans, the two import-direction zones,
the storage ban, and the network ban. The container was not rebuilt and is
marked unverified at the anchor in [HANDOFF.md](./HANDOFF.md).

#### Summary

The pattern is from `~/projects/re/1830/`, whose architecture document states
the part that matters: the rule is enforceable by inspection, and a core that
needs a clock or a socket declares an interface for it. A layering nobody can
check is a naming convention.

A TypeScript project is this codebase's crate and its `lib` and `types` are
its manifest, so `tsconfig.core.json` withholds both platform libraries and
the core sees the language alone. Two lint zones carry the half no tsconfig
can express, namely the direction imports may run.

Three capabilities are inverted end to end. Storage, the network, and time.
Randomness is resolved by passing a seed rather than a generator, following
the reference project's rules crate. Two entries on the original list,
logging and binary payloads, were examined and are not capabilities.

The inversions were not the point in themselves. They made four things
testable that had never been reachable from a node test: the Graphics
Interchange Format compositor, the ComfyUI exchange, the Grok exchange, and
the storage round trips. 120 tests were added across the five increments.

#### Questions for Human Pilot

Two decisions are recorded in [../decisions/OPEN.md](../decisions/OPEN.md) and
neither is mine to take.

The Graphics Interchange Format decode path has no production consumer.
`GifDecoder` and `compositeFrames` are reached only by tests. Either an import
path returns, which is what upstream had, or roughly 200 lines go. That
decides whether the two format divergences pinned beside them are worth
correcting.

#### Technical Concerns

**The capability list was wrong when first written, and the correction matters
more than the entries.** It began as a count of what the browser layers reach
for, which is not the same question as what the core needs handed to it. Two
of seven entries did not survive being asked the right question. Anything
added to such a list in future should be asked whether the core would call it.

The core's freedom from the platform is checked by the compiler, but
`Math.random`, `Date.now`, and `new Date` are ECMAScript and outside what any
library setting excludes. A lint rule is the only instrument there.

The storage adapter drops a failed write silently, which is a stated trade: a
lost preference against a page that will not load where site data is blocked.

Neither extracted exchange has run against a live service. Both are covered by
unit tests against a scripted client and by a browser specification against
mocked routes, which establishes that the sequence is right and not that the
service agrees with it.

#### Intended Next Step

Separating the arithmetic still tangled with the Document Object Model in the
five largest modules. Not architectural, and needing no new interface.
`169cd1b` is the worked example: read a function, ask which lines would still
mean something without a document, move those. `model-exporter` at 1,660 lines
is the largest and the least examined.

#### Session Context

`main` at `169cd1b` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-19 — rearchitecture, first three increments

#### Last Updated

2026-09-19. Three-layer rearchitecture, three increments. Structurally
complete, one capability of six inverted.

#### Verification

`npm run check` passes across all five projects. 347 unit tests, 44
application programming interface tests, 24 browser specifications, all
passing. Every gate added was exercised against a deliberately failing file
before being believed: the core project, the two determinism bans, the two
import-direction zones, and the storage ban. The container was not rebuilt and
is marked unverified at the anchor in [HANDOFF.md](./HANDOFF.md).

#### Summary

The pattern is taken from `~/projects/re/1830/`, whose architecture document
states it plainly: a core holding all logic and declaring an interface for
every capability it needs, a platform implementing those interfaces, and an
entry point that constructs the platform and holds no logic.

A TypeScript project is this codebase's crate, and its `lib` and `types`
settings are its manifest. `tsconfig.core.json` withholds the Document Object
Model library and the node types together, so `src/core/` sees the language
and nothing else.

Three increments landed. The core was established and enforced. The platform
and entry layers were separated, which required splitting an 821 line module
that all four stages imported, since an entry point nothing imports is the
property that makes it one. Storage was inverted end to end, from
`KeyValueStore` through a browser adapter to twenty-seven converted call
sites, all of which are now tested against a Map.

#### Questions for Human Pilot

Two decisions are recorded in [../decisions/OPEN.md](../decisions/OPEN.md) and
neither is mine to take.

The Graphics Interchange Format decode path has no production consumer at all.
`GifDecoder` and `compositeFrames` are reached only by tests. Either an import
path returns, which is what upstream had, or roughly 200 lines go.

That decides the second. `gif-composite` diverges from the format in two ways,
applying a frame's own disposal method rather than its predecessor's, and
clearing the whole canvas for disposal 2 rather than the disposed frame's
area. Both predate this fork and are now pinned by characterisation tests.
Correcting them is only worth doing if the path is kept.

#### Technical Concerns

The core's freedom from the platform is checked by the compiler, but three
ECMAScript facilities are outside what any library setting can exclude, namely
`Math.random`, `Date.now`, and `new Date`. A lint rule is the only thing
standing between the core and an ambient source of non-determinism. Rust's
`no_std` has no equivalent hole.

The storage adapter drops a failed write silently. The judgement is that for a
slider position or a remembered provider, a lost preference is a smaller harm
than a page that will not load in a browser with site data blocked. For a
credential that judgement is arguable, and the settings panel reading the value
back is the only thing that surfaces it.

Concerns carried forward unchanged. Nothing added for Grok or ComfyUI has run
against a live service. The four stage modules still have no unit tests, which
the remaining capability work subsumes.

#### Intended Next Step

The network capability, argued for in [HANDOFF.md](./HANDOFF.md). The server
already inverted it as `FetchLike`, the browser has not inverted it at all,
and they are the same interface. It unlocks the ComfyUI call sequence, which
is written twice and is logic rather than presentation.

#### Session Context

`main` at `9cf2a11` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-19 — handoff validity anchored on commit N minus one

#### Last Updated

2026-09-19. Handoff validity corrected to anchor on commit N minus one.
Complete.

#### Verification

`npm test` reports 276 unit tests and 44 application programming interface
tests passing. `npx playwright test` reports 22 passing browser
specifications. `git merge-base --is-ancestor 2c0aef0 HEAD` succeeds, which is
the new ancestry check exercised against the anchor it records. The container
assertion was not re-run and is marked unverified at the anchor in
[HANDOFF.md](./HANDOFF.md) rather than restated.

#### Summary

The handoff previously validated by content alone, having judged that ancestry
validation needed a long-lived version branch. That judgement was wrong, and
the omission showed itself within one session when the header named a commit
the refresh had itself superseded.

Validity is now by ancestry and by content. The anchor is the tip read before
the refresh is committed, which makes it commit N minus one once the refresh
lands, and it is tested by containment rather than by equality. The same
convention now governs the per-branch mailboxes. The reversal is recorded in
[DESIGN_JOURNAL.md](./DESIGN_JOURNAL.md) and the failure mode in
[AGENT_PITFALLS.md](./AGENT_PITFALLS.md).

#### Questions for Human Pilot

None outstanding. The next task remains the rearchitecture stated in
[HANDOFF.md](./HANDOFF.md).

#### Technical Concerns

The ancestry check detects a history rewrite and nothing else. It cannot tell
that the content assertions have gone stale, which is why both halves exist
and why neither substitutes for the other.

Concerns carried forward unchanged. Nothing added for Grok or ComfyUI has run
against a live service. Six tests were environment-dependent until a
`withoutEnv` helper fixed them, and the class of problem will recur wherever a
fallback reads the environment. Five stage modules totalling roughly 4,700
lines still have no unit tests.

#### Intended Next Step

The three-layer rearchitecture described in [HANDOFF.md](./HANDOFF.md). Not
started. Read the two reference projects first, and measure before moving
anything, because a portable core already exists in fourteen modules without
being named.

#### Session Context

`main` at `2c0aef0` before this change. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-19 — upstream pull request 1 reimplemented

#### Last Updated

2026-09-19. Reimplementation of upstream pull request 1. Complete.

#### Verification

`npm run check`, `npm test` and `npx playwright test` all pass. 276 unit
tests, 44 application programming interface tests, 22 browser
specifications. The container was verified by building and running it.

#### Summary

Upstream pull request 1 is fully reimplemented across five increments: a
provider abstraction with Grok sprites, Grok video, ComfyUI sprites, ComfyUI
Wan video, and container deployment. Three parts were deliberately not
reproduced, each for a stated reason recorded beside the code that would have
held them.

#### Questions for Human Pilot

None outstanding. The next task is stated in
[HANDOFF.md](./HANDOFF.md) and is a rearchitecture into three layers.

#### Technical Concerns

Nothing added for Grok or ComfyUI has run against a live service. Every
provider test uses mocked routes, so the request shapes are faithful to what
upstream established empirically rather than independently verified.

Completing the environment key support made six tests environment-dependent:
they passed in continuous integration and failed on a workstation with a key
exported. A `withoutEnv` helper fixed it, but the class of problem will recur
wherever a fallback reads the environment.

Five stage modules totalling roughly 4,700 lines still have no unit tests.
The next task subsumes this, the cause being the same coupling in both cases.

#### Intended Next Step

The three-layer rearchitecture described in [HANDOFF.md](./HANDOFF.md). Read
the two reference projects first. Measure before moving anything, because a
portable core already exists in fourteen modules without being named.

#### Session Context

`main` at `69addb8`. Upstream carries two open pull requests and one open
issue, all from this fork.
