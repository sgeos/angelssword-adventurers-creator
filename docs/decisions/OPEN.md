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

## No stage has been exercised against live keys

The account available had no remaining credit, so the generation stages were
tested only against mocked responses. The proxy is covered by the application
programming interface tests, but the round trip against a real service is not.

## No release has been cut

The binary is how a non-technical user obtains this tool, and at present the
only way to get one is to build it. A release would need the platform builds
above, or an honest statement that only macOS is published.

## The `test/fixtures/pixels` directory is empty

It holds a tracked `.gitkeep` and nothing else, the fixture it existed for
having been removed as unreferenced. Either a fixture returns or the directory
goes.
