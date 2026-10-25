# Open Questions

> **Navigation**: [Decisions](./README.md) | [Documentation Root](../README.md)

Matters not settled. Each states what would resolve it.

## The five largest modules have no unit tests of their own

Measured 2026-09-19 after the extraction work: `model-exporter` at 1,599
lines, `sprite-prep` at 1,047, `video-prep` at 912, `shell` at 784, and
`video-gen` at 671. Treat these as of their date. All five are coupled to
`document` and to a live canvas, which the test environment does not provide.

**What that heading now means has changed, and the change is the point.** The
modules are untested; what they compute is not. Extraction has moved the
arithmetic out from under the Document Object Model and into the core, where
520 unit tests reach it. What remains inside the five is element wiring,
canvas drawing and event binding.

Out so far, each with the tests it brought: the Graphics Interchange Format
compositor, the ComfyUI exchange, the Grok exchange, the storage round trips,
the video stage's loop arithmetic and seek timing, the exporter's placement,
crop, size estimate and frame selection, the key colour auto-detection, and
the advanced key scoring.

**Every capability the core needs is inverted**, so nothing left here needs a
new interface. The remaining question is whether to keep extracting, which has
diminishing returns as what is left becomes genuinely presentational, or to
stop and accept that the five hold presentation and nothing else. Supplying a
canvas implementation, the other route once considered, would now reach only
what has been deliberately left as presentation.

## The exporter's frame count changed, and one clip length now exports differently

**Corrected 2026-09-30, and it is a behaviour change rather than a refactor.**
The video preparation stage computed a clip's frame count by rounding
`duration * fps` and the exporter computed it by flooring, in two places.
Those differ whenever the fractional part reaches one half, which real
durations reach: 9.99 seconds at 30 gave 299 against 300.

It mattered because the handoff carries the video stage's count, the exporter
recomputed its own, and the loop range is clamped to the exporter's figure. A
count one lower silently clipped the loop end, and the exporter also sets its
last-frame field to the count minus one, so flooring made the final real frame
unreachable.

Both now use one routine and it rounds. A clip of exactly N frames has
duration `N / fps`, which floating point can render a hair under, and flooring
then discards a frame for nothing. Rounding is also what the handoff's
producer already used, so the value crossing the handoff is unchanged and only
the exporter moved.

**The consequence is that some clips now export one frame more than before.**
That frame is real and was previously dropped, so this is a correction, but
anyone comparing an export against an older one will see the difference.

## The palette sample target is not an upper bound

`paletteSampling` aims at six sampled frames, and between seven and eleven
frames the stride floors to one and every frame is read, so up to eleven are
sampled. Benign, a short export being cheap to sample, and recorded because
the target reads as a guarantee and is not one.

Found on 2026-09-30 by checking an assertion that had passed. The first
version of that routine reported the target as the sample count, which was
simply untrue for those lengths.

## The sprite zoom is anchored to the image edge, not to the character

`computeSpriteDrawRect` sets `zoomY = spriteY + (sh - drawH)`, which holds the
source image's bottom edge in place while the image shrinks. The character's
feet sit above that edge by whatever transparent margin the generation left
below them, so zooming out pulls the feet **toward** the edge, which is
downward, and can push them off the bottom of the canvas.

The shift is that padding times the amount zoomed out, so it is worst for a
generation that left a lot of empty space beneath the character. It is
pinned by a characterisation test, and the vertical offset slider compensates
for it.

Found while testing the anchoring property on 2026-09-30. I expected the feet
to rise and asserted that; they descend. Predates the fork.

What would decide it is whether a zoom that moves the character vertically is
ever wanted. If not, the anchor should be the feet rather than the image edge,
which is a small change to one expression and would move every existing
zoomed sprite.

## The disposal handling in `gif-composite` does not match the format

Writing that module's first tests established two divergences from the
Graphics Interchange Format, both of which predate this fork and neither of
which any behaviour depends on.

It applies a frame's own disposal method before drawing that frame, where the
format defines the field as what to do after a frame has been displayed, so
the governing value should be the previous frame's. Separately, disposal 2
clears the whole canvas where the format restores the background only over the
area the disposed frame occupied.

Both are pinned by characterisation tests, so correcting them is a visible
change rather than a silent one. What is undecided is whether to correct them
at all, which turns on the question below.

## The full body workflow was abandoned, and half the pipeline still expects it

The product brief specifies a sprite with "Full body visible from head to
toe". The shipped prompt has always asked for the opposite, "waist up ... No
ground, no floor, no feet visible", and it said so in the upstream JavaScript
at `3f6e1ff` before this fork existed. The brief was never updated.

**The video half still defends the abandoned framing.** The Wan negative
prompt lists "cropped head, cropped feet, head cut off", with a comment saying
those terms exist because Wan would otherwise reframe a full-body still into a
bust shot. The letterboxing exists for the same stated reason. The ComfyUI
video prompt ends "full body in frame".

So the sprite stage asks for an image with no feet and the video stage spends
effort protecting feet that were never generated. Nothing breaks, and the
letterboxing remains correct for preserving whatever framing does arrive.

**Partly resolved on 2026-09-28.** The third option was taken for the sprite
stage: framing is a user choice, remembered, defaulting to the shipped bust
wording so nothing changes for anyone who does not touch it.

**Gemini's output shape is not yet understood**, and the entry that stood
here on 2026-09-28 claiming it always returns landscape was contradicted the
next day by a portrait result. What is actually observed is recorded under
live running below: landscape from two reference images, portrait from one.

Nothing about shape is sent to Gemini in either case. Whether the Interactions
API accepts an aspect ratio hint is unknown, and no field has been added on
speculation.

**So whether a portrait sprite canvas helps or hurts on the Gemini path
depends on the unresolved question below.** It remains right for ComfyUI,
whose canvas the user sets, and untested on Grok, which is sent 16:9
explicitly. Whether framing should influence the sprite canvas only for some
providers is raised and not answered.

**A portrait sprite reaches a landscape video canvas.** Wan defaults to 832
by 480, and the letterboxing fits whatever arrives inside it. A full-body
portrait sprite therefore lands as a narrow column with wide bars either side,
spending most of the video's pixels on background. The Wan width and height
are user-editable, so the workaround exists, but nothing suggests it. Making
the video canvas follow the framing the way the sprite canvas now does would
resolve it, and needs the framing to cross the handoff.

**Resolved 2026-09-30.** The framing is carried on the handoff, the Wan
negative prompt derives its feet and upper-body terms from it, and the
ComfyUI video prompt states waist-up framing for a bust. Tests assert that a
bust produces no prompt text asking for feet.

The brief still describes full body as though it were the only option, and
should be corrected to describe the choice.

## Transitions between animations are the consuming application's problem

Each run of the pipeline produces one independent clip, exported as its own
file. The `_intro`, `_outro` and `_speaking` filename presets imply a
convention for switching between them, and nothing generates, relates or
validates those files against each other.

Video Prep's concatenation, which would have baked a transition into one file,
never worked and was removed on 2026-10-24.

Whether a seam jump when an application switches sources is acceptable depends
on what that application can do, which is outside this repository. Recorded
because the question has been asked and the answer is not written down
anywhere.

## The Graphics Interchange Format decode path has no production consumer

`GifDecoder`, `DecodedGif`, and `compositeFrames` are reached only by tests.
Nothing under `src/entry-browser` or `src/platform-browser` imports any of
them, so the format is written but never read.

Either an import path returns, which is what upstream had, or roughly 200
lines of decoder and compositor go. Deciding that also decides whether the
disposal divergences above are worth correcting.

## Neither the Windows nor the Linux binary has been built

Only macOS on arm64 has been exercised. Both paths are structurally unchanged
from an implementation that worked before the conversion, but neither has been
run since. Resolving this needs access to those platforms, or continuous
integration runners that build rather than merely test.

**Resolved 2026-09-30, and the Windows half was worse than recorded.** The
`binary` job builds the executable on `ubuntu-latest` and on `windows-latest`
and fetches the page, a compiled browser module and a proxy route from each.
Both pass. The phrase "needs access to those platforms" was the error: the
runners were always that access, and treating the item as blocked on hardware
is why it sat for as long as it did.

The Windows build did not merely go unbuilt. **It could not have worked.** Three
call sites chose `npx.cmd` on Windows and none passed a shell, and since Node
20.12 a batch file cannot be spawned without one, the call failing with `EINVAL`
under the hardening added for CVE-2024-27980. The build died at the first npx
call on every Node the project supports. The platform condition had been written
and not followed through, and no amount of reading it would have shown that;
running it took one job.

**What this does not establish.** The binaries start and serve on a runner.
Nobody has double-clicked one on a real desktop, no Windows machine has been
asked whether it will run an unsigned executable, and SmartScreen has never seen
it. The macOS binary carries an ad-hoc signature and is not notarized, so another
Mac will still quarantine it. Those are distribution questions and they remain
open under "No release has been cut".

## What live running has established, and what it has not

**OpenAI sprites and Gemini video have now been run against live keys**, on
2026-09-27 and 2026-09-28. That replaces the previous entry here, which said
no stage had been, and which had become the sort of staleness that makes a
whole document untrusted.

Grok and ComfyUI remain unexercised against a real service, as does the
binary, so mocked coverage is still all that stands behind those.

### Gemini disregards explicit camera instructions

The prompt template states `Locked-off Position Static Camera` and then, under
a constraints heading, `Do NOT Camera Zoom, Absolute static camera. Zero
Camera movement, no panning, no drifting, and no zooming`. Gemini cropped the
frame and then zoomed within it anyway. The prompt is wired correctly and does
reach the request, so this is the service and not the plumbing.

This bears on whether the pipeline can target Gemini for looping assets at
all. A continuous zoom means the character's scale changes across the clip,
and Video Prep's loop matching looks for two frames that agree while the
exporter applies one scale uniformly. A drifting crop defeats both.

### Gemini returned landscape from two reference images and portrait from one

A 1024 by 1536 portrait sprite with **two** reference images produced a
landscape clip, cropped at the shins and the hat brim, which then zoomed in to
the thighs and the eyes. The same sprite with **one** reference image produced
a portrait clip with no pan or zoom.

**The number of images is the identified difference and it is confounded.**
The two images also had the character at different heights, because the
generated-result handoff forwarded the raw image rather than the
bottom-anchored one. So the cause may be multiplicity or it may be
misalignment, and the discriminating test is two properly anchored images.
The anchoring is fixed as of 2026-09-30; the test has not been run.

If multiplicity turns out to be the cause, sending every reference image is a
regression and should become a choice or be reverted. That change was made on
the reasoning that silently discarding user input is worse than sending it,
which is an argument about conduct rather than evidence about results.

**Decided 2026-10-07 by the operator: send only the first.** The experiment was
not run, so the cause remains unknown, and the decision does not depend on it.
Reference mode now sends the first image to Gemini, as it does to every other
provider, and the interface says so. The extra slots remain and reach no
provider in reference mode.

Keyframe mode was left sending its start and end frames, since a keyframe
request without an end frame is not one. Whether the decision was meant to
cover keyframe mode too is a question put to the operator, not assumed.

### The retreat from full body has corroborating evidence

**Still a hypothesis.** Nobody recorded a reason, so this is inference from
what the code does.

The operator suggested that full body was abandoned because of exactly the
cropping above. The bust directive reserves "plenty of solid background space
above the character's head" and accepts a bottom crop by design, stating the
lower body is cut off by the bottom edge. Headroom is precisely a defence
against a top crop and a zoom, and accepting a bottom crop leaves nothing
below to lose.

So the bust framing reads as engineered against the failure the live runs
produced. That is a mechanism and a fingerprint rather than a record, and it
could still be coincidence.

## Exports at default settings played too fast

**Found and fixed 2026-10-07.** A regression from the TypeScript conversion of
the exporter on 2026-09-17, not inherited from upstream.

The output rate field is labelled "0 = match source" and defaults to zero. The
original read it as `parseInt(value) || source`, so zero fell through to the
source rate. The conversion replaced that with a helper that falls back only on
a value that is not a number, so zero reached the encoders. Measured on a two
second clip at default settings: a Graphics Interchange Format export lasted
1.20 seconds, every frame at the two centisecond floor, which is fifty frames
per second; a WebM export lasted 0.22 seconds, its recording timer having been
handed `1000 / 0`. After the fix the WebM spans 1.99 seconds and every
Graphics Interchange Format delay is three centiseconds.

No specification exported anything, which is why it survived three weeks. Two
now do, and both fail on the exporter as it was. The width and height fields
had lost their "0 = auto" meaning the same way, with less exposure because
loading a clip writes its size into them. A sweep of every `parseInt(...) ||`
in the original found one more instance, the stored sprite zoom, also restored.

This is separate from how the source rate is established, below. It mattered
more: it affected every export left at its defaults, whatever the rate.

## Three paths decide the frame rate differently, and they disagree

**Resolved 2026-10-08, commit `573ee9b`.** The source rate is now read from the
presentation timestamps of displayed frames, in `core/frame-rate.mts`, through
one probe both stages use. The exporter's two loaders became one that takes the
rate as a parameter and adopts a handed rate only when it was measured. The
export rate stays the output field, zero meaning the source rate. How fast this
machine plays a clip is no longer measured or used. A fifteen frame per second
clip now counts as thirty frames in the exporter rather than sixty.

What it does not resolve, recorded in the module: a host that skipped exactly
every other frame looks like a clip at half the rate, a variable frame rate clip
has no single answer, and 29.97 is reported as 30. The history below is kept as
it was written, including its corrections.

**Covered in the browser 2026-10-24.** `frame-rate.spec.ts` asserts that Video
Prep reports the fifteen frame clip as fifteen, and that the exporter adopts the
rate handed to it rather than measuring again. The second is made to
discriminate by removing `requestVideoFrameCallback` after Video Prep has
measured, so a second measurement would fall back to thirty, and a paired
control shows that it does. Disabling the adoption in the exporter was
confirmed to fail the test.


`loadVideo` does not read the frame rate from the file. It sets
`playbackRate` to four, plays for five hundred milliseconds, and divides the
frames `getVideoPlaybackQuality` reports by the elapsed media time. Every
frame count in the pipeline follows from that number.

**Observed 2026-09-30.** A clip generated at exactly thirty frames per second
for exactly two seconds, so sixty frames, was reported as nineteen frames per
second and thirty-eight frames in headless Chromium.

**Corrected 2026-10-07.** This entry first said the last twenty-two frames
became unreachable and that an export ran at a rate the clip never had. Both
were wrong, and reading the seek arithmetic shows why. Frame `k` is shown at
`k / rate` seconds, so a rate read low still spans the whole clip, in coarser
steps. Thirty-eight steps across two seconds means about twenty-two of the
sixty real frames, spread through the clip rather than at its end, can never be
selected, previewed, chosen as a loop point or exported. An export at the
believed rate keeps the clip's duration and loses those frames. The cost is
temporal resolution and loop-seam precision, not length or speed.

The mechanism is that the quantity being measured is how fast the host can
decode, which equals the clip's rate only when the host keeps up. Headless
software decoding does not, and neither, by assumption, does the modest
hardware this tool is said to be for. So the failure is expected to be worse
for the intended audience than for the developer, which is the direction that
makes a defect hard to notice.

Two consequences are already visible. The count is derived by
`frameCountFromDuration`, so it is consistent everywhere, which means a wrong
rate is wrong consistently rather than caught by disagreement. And the value
is clamped to thirty when it falls below ten or above one hundred and twenty,
so a severe under-read is silently replaced by a plausible default, while a
moderate one passes through.

**Observed 2026-09-30, second finding.** The exporter does not measure at all.
A file dropped on it is assumed to be thirty frames per second, marked in the
source as a default assumption, and a clip arriving from Video Prep by handoff
carries Video Prep's measured figure instead. So the exporter gives **two
different frame counts for one clip depending on how it arrived**, and the
clip above is sixty frames on a direct upload and thirty-eight through the
handoff.

Neither path is reliable and they fail in opposite directions. The assumption
is exactly right for a thirty frame clip and wrong in proportion for anything
else: a two second clip at fifteen frames per second holds thirty frames and
the exporter reports sixty. Every real frame then appears twice under two
numbers, so an export carries each frame twice, roughly doubling a Graphics
Interchange Format file for no gain in motion, while keeping the duration.
This entry first said half the frame numbers did not exist, which was wrong in
the same way as the passage corrected above.
The measurement is right for any rate when the host keeps up and low when it
does not.

That the two disagree is the part that makes this more than a detection
weakness. `frameCountFromDuration` was unified earlier in this session
precisely so that one duration and one rate give one count everywhere, and it
does. The remaining disagreement is upstream of it, in what the stages believe
the rate to be, and unifying the arithmetic made that the only place left for
the two to differ.

**What would decide it.** `requestVideoFrameCallback` reports each frame's
`mediaTime`, so the interval between two consecutive frames gives the rate
without depending on decode speed, and it is available in the browsers this
targets. The reasons not to take that unilaterally are that it changes the
frame count for every existing workflow, that the evidence is two synthetic
clips on one host, and that a clip with a variable frame rate has no single
answer for either method. Offering the detected rate as an editable field
would also resolve the practical problem without a detection change, and the
exporter already exposes a rate the user may set.

The three paths are Video Preparation, which measures; a file dropped on the
exporter, which is assumed to be thirty; and a clip reaching the exporter by
handoff, which carries Video Preparation's figure. Two stages, three answers.

Whatever is chosen, the three paths should agree afterwards, and an assumption
that happens to be correct for the developer's own clips is the worst of the
three because it is the least likely to be noticed.

Not fixed. `loop-controls.spec.ts` reads the count the stage reports rather
than asserting sixty, and `exporter.spec.ts` pins the assumption with a clip
at fifteen frames per second, so the specifications neither depend on the
defect nor conceal it.

## The page fetches webfonts from a third party, and the README says otherwise

`public/index.html` preconnects to `fonts.googleapis.com` and
`fonts.gstatic.com` and loads a stylesheet from the first, which pulls four
font families from the second. Six requests on every page load, measured.

**The README says the later steps work fully offline, and that the internet is
needed only for the generation steps.** As a statement about function that
holds, the faces falling back to whatever the host has. As a statement about
traffic it does not: the requests are unconditional and happen before any
stage is used.

Two consequences, of different weight.

The smaller one is that the standalone binary and the container both ship a
page that reaches outside, so a machine with no route out pays a connection
timeout on every load before the fallback faces appear. Nothing breaks and the
delay is the whole cost.

The larger one is that every load tells a third party the user's address and
that this tool is in use. That sits oddly beside the arrangement the rest of
the application is built around, where a local server proxies every call so
that keys and prompts reach only the service they are for. The fonts were
never part of that reasoning because nobody looked at them.

**What would decide it.** Self-hosting the four families removes the requests
outright. All four are under the SIL Open Font License, so redistribution is
permitted with the license text carried alongside, and the cost is the weight
in the repository, in the image and in the binary, plus the subsetting work if
that weight matters. The alternative is to correct the README rather than the
page, which is honest and cheaper and leaves the requests in place.

Not decided, because it is a change to what three artefacts carry.
`settings.spec.ts` asserts the requests happen, so the fact is pinned and a
later fix will show up as those assertions failing, which is the intended
behaviour of pinning a defect rather than a feature.

**Resolved 2026-10-24 by the operator's decision: hosted.** The four families
are in `public/fonts/`, as the original files from `github.com/google/fonts`,
unmodified, beside their licences, about 401 kilobytes. The originals were
chosen over Google's 138 kilobytes of subsets because two of the licences
reserve a font name for modified versions, and whether a subset is a
modification was not settled. `settings.spec.ts` now asserts that loading the
page requests nothing from another origin, a test that fails on the page as it
was, and that every family loads from the local files. The README's offline
statement is now true of the traffic as well as the function.

## The exporter never reads the second clip

Video Preparation can concatenate a second clip with an optional crossfade. It
loads the clip, establishes its source rate, shows it in the information panel,
and carries its address, size, duration, rate and the crossfade settings in the
handoff. The exporter reads none of it. `model-exporter.mts` contains no
reference to the concatenation at all, so a user who adds a second clip exports
the first alone, with nothing to say so.

Found 2026-10-08 while tracing every consumer of a frame rate. The same shape as
the loop start before it was wired: a field written carefully and never read.

**What would decide it.** Either the exporter learns to play the two clips in
sequence with the crossfade, which is real work in the frame selection and the
seek loop, or Video Preparation stops offering the feature until it does. Leaving
both halves as they are is the one option that misleads.

**Resolved 2026-10-24 by the operator's decision: removed.** The controls, the
second clip's state, its handoff fields and the unused crossfade helper are
gone from Video Preparation, the core and the page. A test asserts the handoff
carries nothing about a second clip. The README had also advertised a
"crossfade" loop mode that never existed; that line is gone too.

## The browser specifications cannot run inside Claude Code's macOS sandbox

**Observed 2026-10-08.** With local port binding allowed for this project, the
server tests pass inside the sandbox, all 54 of them. The browser specifications
still fail, every one, because Chromium cannot register a Mach port at startup:
`bootstrap_check_in ... Permission denied`. That is a macOS service the sandbox
withholds, separate from network access, and no setting tried so far grants it.
They pass outside the sandbox and in continuous integration.

Not a defect in the code. Recorded so that a sandboxed session does not mistake
seventy-eight launch failures for seventy-eight regressions.

## Keyframe mode sends each provider what its request can carry

**Decided 2026-10-24 by the operator.** Gemini is sent both keyframes, the start
and then the end. Grok and Wan are sent the start frame. That was already what
the requests did, since Grok's body and Wan's graph each carry one image by
shape. What was missing was the telling: both accepted an end frame and dropped
it without a word. The keyframe panel now says, for the selected provider, which
frames it is sent, and a missing start frame is reported as such.

Not established: whether Gemini honours the end frame. Keyframe mode has not
been run against the live service.

## The Gemini key test bypasses the proxy and puts the key in a URL

**Found 2026-10-24, not fixed.** The Settings test button for the Gemini key
calls `generativelanguage.googleapis.com` directly from the browser, with the
key in the query string. Every other call goes through the local proxy, and the
documentation says the proxy carries every outbound call. The server's own
Gemini calls also pass the key as a query parameter, which Google documents as
one accepted method, but a URL is more likely than a header to be written to a
log. Google also accepts the key in an `x-goog-api-key` header.

**What would decide it.** Whether to route the test through the proxy as the
other providers' tests are, and whether to move the key from the query string
to the header on the server's calls. Both are small. Neither was asked for.

## What the migration spike has to establish

**Opened 2026-10-24**, with the adoption of the plan in
[MIGRATION.md](../architecture/MIGRATION.md). None of the following is known.
Each is to be settled by running it on a physical device, not by reading.

- **WebKit's recorder and WebM.** Android's web view is Chromium and records
  WebM. Whether the iOS web view's `MediaRecorder` can, and with what codecs, is
  not established. If it cannot, iOS exports are Graphics Interchange Format or
  another container, and the adventurer mode needs a different output there.
- **Frame-accurate seeking and the rate probe in a web view.** Expected to work,
  since both engines implement `requestVideoFrameCallback`, but untested inside
  Expo's web view.
- **Performance on modest devices.** Export time for the two second fixtures,
  measured, against the same export in a desktop browser.
- **The boundary cost.** How long moving a clip and an exported file between the
  web view and the native side takes, and whether large files are practical.
- **The strict configuration against Expo's types.** Answered for React,
  Tamagui and TanStack by the web port: this project's code uses them without
  `any`, assertions or suppressions, with third-party declaration checks
  skipped for the entry layer, as `tsconfig.app.json` argues. Expo's own types
  are untried.

**Answered by the web port, 2026-10-24.** Packaging, whether TanStack Start's
server output could be built into the single executable. It did not need to
be: the page is built as files, which the existing server and the binary serve.

**Answered on Android, 2026-10-24,** by the application itself on one Galaxy
A16 in Expo Go, with the measurements in MIGRATION.md. Frame-accurate seeking
and the rate probe work in the web view. Both exports work, in 2.4 and 3.1
seconds for the two second fixture, and the boundary cost for that clip is
inside those figures. Expo's types held against the strict configuration, with
two vendor declarations needing correction or avoidance, as
`mobile/types/expo-babel-transformer.d.ts` and `mobile/metro.config.mts` argue.

**Still open.** Everything about iOS, WebKit's WebM first among it. Export
time on slower phones. Whether large clips are practical across the bridge,
since a saved file crosses it as base64 in one message.

**What would decide the rest.** An iOS device, and a slower Android one.

## What the web port left as it was, deliberately

**Recorded 2026-10-24.** Three consequences of keeping the media stages'
controllers rather than rewriting them, each a choice rather than an oversight.

- **Two styling systems.** The chrome, panels, layout and settings are Tamagui.
  The controls inside the four stages are styled by `public/style.css`, because
  their controllers generate markup at run time that only a class can style. The
  design tokens are therefore written twice, in `ui/config.ts` and in the
  stylesheet's `:root`, and must agree until the stages are rewritten.
- **A stage component must never re-render.** Its controller owns its subtree
  after it mounts. The components take no props and are memoized, which holds
  the invariant today; nothing enforces it against a future edit that gives one
  a prop. A browser specification would likely catch the breakage, since the
  stage would lose its state, but none asserts it directly.
- **The page is heavier.** Its scripts went from 113 to 192 kilobytes gzipped,
  for React, Tamagui and the router. It is served from the same machine, so
  what this costs is parse time on modest hardware, which has not been measured.

**What would decide them.** Whether the stages are rewritten as React, which is
the native plan's question as much as the web's: on a phone they are meant to
run as they are, inside a web view.

## The mobile application's open matters

**Recorded 2026-10-24.**

- **iOS has run only in the Simulator.** In Expo Go on iOS 27.0; see
  MIGRATION.md. No device is available, and a simulator's media encoding may
  differ from a device's.
- **The scrolling and settings fixes are unverified on the Android phone.**
  Both were made and verified on the iOS Simulator while the phone was locked.
  The scrolling fix was also checked in Chromium, the engine of Android's web
  view, on the very page Metro serves the phone, at its 384 by 684 viewport
  with touch: a touch swipe scrolled 401 of 558 pixels and brought the handoff
  button on screen, and with the rule removed nothing scrolled and the button
  stayed at 1,004 pixels, below the view. The settings overlay is a native
  layout change that Android, which worked before it, has not run. The check
  for both is `tmp/android-fixes-check.sh`, which runs only on an unlocked
  phone.
- **An error on every iOS launch in development.** Expo's bridge reports that
  it cannot find its web view by tag at start-up. Nothing observed depends on
  it; whether it is Expo's or this application's was not established.
- **No release build is committed or signed.** A standalone Android release
  APK was built locally on 2026-10-25 and verified on the phone; see
  MIGRATION.md. It used a temporary package name and the template's debug
  signing, and the generated `android/` directory was not committed. A real
  release needs a package name, an icon set in place of Expo's placeholders,
  a signing key and a store listing, which are the operator's to decide.
  Continuous integration bundles the JavaScript but does not build an APK. iOS
  needs Xcode's simulators or a device, and signing.
- **The provider keys are held in the web view's memory.** They are kept
  natively in SecureStore and handed to the web view, which holds them in
  memory while it runs, because the stages read them through the storage
  port. They are never written to the web view's disk. Passing a key only with
  each request would shorten its life in memory further, and touches every
  stage that reads one.
- **Phone exports are slow for long clips, and their ceiling is above what
  was tried.** With the WebM export streamed and Video Prep's scrubbing cache
  bounded to 256 megabytes, a 20 second 720p clip of 100 megabytes exports on
  the four gigabyte test phone in eight and a half minutes, and a 40 second one
  of 200 megabytes exports too, in 18 minutes, after a cache of about as long.
  On a standalone build a 60 second clip of 300 megabytes exports in 27
  minutes, after a 30 minute cache. Nothing larger was tried. Video Prep's cache taking 20 minutes for a long clip on a phone is
  itself a cost: scrubbing works by seeking meanwhile, and nothing waits on it
  but the loop preview. The Graphics Interchange Format export does not stream; its frames are
  one byte a pixel and its modes cap their count and size, so a normal export
  fits, but a premium export at its full 4000 by 4000 would not fit a phone. If
  the system reclaims the web view, the user is told.
- **A large picked file is slow to load.** Files over 32 megabytes cross the
  bridge in 4 megabyte chunks, about 3 megabytes a second on the test phone.
- **Expo's command line tools carry advisories.** `npm audit` in `mobile/`
  reports node-forge and zod advisories, both inside `@expo/cli`, which runs on
  the developer's machine and is not shipped in the application. Not accepted
  or dismissed; recorded.
- **Unused worker copies ship in the mobile bundle.** The platform's default
  worker factory names the workers in Vite's form, and Expo bundles those too,
  about 23 kilobytes that the phone never starts.

## The Windows executable has never carried the project icon

**Found 2026-10-24, not fixed.** The binary build called `npx rcedit` to embed
`icon.ico`. The `rcedit` package exports a library and declares no command, so
npx had nothing to run, the call failed on every Windows build, and the failure
was caught and logged as a warning. The continuous integration log for run
`40093131743` shows it. The package was also archived by the Electron project
on 2026-04-01 and deprecated on npm, so it was removed during the dependency
update rather than repaired. The build now says the default icon is used.

**What would decide it.** Whether the icon matters. If it does, `resedit` is
maintained, pure JavaScript, and edits the resources of an executable. Applying
it to the copied Node binary before the blob is injected keeps the injection
the last modification. Only a Windows build can verify it, so the change should
make the build fail when the icon is not applied, which the `binary` job would
then check. Neither was done, because it adds behaviour the project never had.

## Dependencies held below their latest major

**Recorded 2026-10-24.** Each was considered and held, for the reason given.

- **TypeScript 7.** `typescript-eslint` 8.72, the newest, declares TypeScript
  `>=4.8.4 <6.1.0`. The lint is part of the gate, so TypeScript stays at 6.0.
  Revisit when `typescript-eslint` widens its range.
- **node-fetch 3.** The proxy passes node-fetch 2's `timeout` option on its
  five minute image calls. Version 3 removed that option without an error, so
  upgrading would silently drop every timeout. The better move is to Node's
  own `fetch` and `FormData` with `AbortSignal.timeout`, which would also
  remove `form-data`, but that changes the request type the core shares with
  the browser and is a piece of work rather than an update.
- **`@types/node` 26.** The project supports Node 22.18. Types for a newer
  runtime than the floor describe APIs the floor does not have. The types are
  already one major ahead, at 24, which predates this entry.

## `jsdom` declares a higher Node floor than the project does

**Found 2026-10-24.** `jsdom` 30.1, every patch of it, declares Node
`^22.22.2 || ^24.15.0 || >=26.0.0`. The project declares `^22.18.0`, and
continuous integration runs the unit tests on 22.18.0, where they pass. So the
range is not enforced and the tests do not currently depend on whatever raised
it, but nothing guarantees that a later `jsdom` patch will not. It is a
development dependency only, and the runtime floor is unaffected.

**What would decide it.** Whether to raise the development floor to 22.22.2,
which would also bring the security releases since 22.18, or to hold `jsdom`
at a version whose declared range includes 22.18.

## No release has been cut

The binary is how a non-technical user obtains this tool, and at present the
only way to get one is to build it. A release would need the platform builds
above, or an honest statement that only macOS is published.

## The `test/fixtures/pixels` directory is empty

It holds a tracked `.gitkeep` and nothing else, the fixture it existed for
having been removed as unreferenced. Either a fixture returns or the directory
goes.

**Resolved 2026-09-30.** The directory is gone. Nothing referenced it, and an
empty directory kept alive by a placeholder invites a reader to assume a
fixture is missing. `test/fixtures/media` holds the fixtures that are actually
used, and now also a small generated clip for the loop controls.
