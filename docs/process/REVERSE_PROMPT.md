# Reverse Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Assistant to human. The block above the supersession line describes the
present. Everything below it is history and may be wrong.

See [COMMUNICATION.md](./COMMUNICATION.md) for the protocol, and for why this
file is arranged this way rather than being rewritten wholesale.

---

## Last Updated

2026-09-30. The container, found broken and fixed. Browser coverage for the
loop controls and the sprite selectors. One defect nobody had looked for.

## Verification

`npm run check` passes across all five projects. 644 unit tests, 49
application programming interface tests, 51 browser specifications, all
passing. 153 documentation links resolve. **The container was built and run
this time**, on macOS with Docker 29.8.1, and the procedure is recorded in
[VERIFICATION.md](./VERIFICATION.md).

## Summary

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

## The thing I would most like you to see

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

## Questions for Human Pilot

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

## Technical Concerns

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

## Intended Next Step

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

## Session Context

`main` at `dbb4217` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

---

## Superseded history

Nothing below this line describes the present.

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
