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

Video Prep's concat with crossfade joins two clips inside a SINGLE export, so
that transition is baked into one file rather than handled between files.

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

## No release has been cut

The binary is how a non-technical user obtains this tool, and at present the
only way to get one is to build it. A release would need the platform builds
above, or an honest statement that only macOS is published.

## The `test/fixtures/pixels` directory is empty

It holds a tracked `.gitkeep` and nothing else, the fixture it existed for
having been removed as unreferenced. Either a fixture returns or the directory
goes.
