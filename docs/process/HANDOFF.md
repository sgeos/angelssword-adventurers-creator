# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-09-30. The anchor is `dbb4217`, the last commit before this
refresh.** Read this block, run the validity check, then read the task below.

---

## Validity

Validate by ancestry and by content, never by a hash match. A check requiring
the tip to equal a recorded commit claims that nothing else ever lands, and it
fails on the very next commit, including the commit that carries the refresh
itself.

### Ancestry

`main` should **contain** `dbb4217`, the last commit before this refresh. Test
containment rather than equality.

```sh
git merge-base --is-ancestor dbb4217 HEAD
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

1. `git ls-files` reports **97** TypeScript files and exactly **one**
   JavaScript file, `eslint.config.mjs`, which is deliberate.
2. **Five** `tsconfig.*.json` projects exist at the repository root, and
   `src/` holds exactly four directories, `core`, `platform-browser`,
   `platform-worker`, and `entry-browser`.
3. `src/core/ports/` holds **three** capability interfaces, namely
   `storage.mts`, `http.mts`, and `clock.mts`, and `src/core/` holds
   **nineteen** modules.
4. `npm test` reports **644** unit tests and **49** application programming
   interface tests, all passing.
5. `npm run test:browser` reports **51** passing browser specifications. Use
   that script rather than `npx playwright test`, which reuses a running
   server and therefore skips its own rebuild.
6. `tsc -p tsconfig.core.json` succeeds, and adding `localStorage` to any file
   under `src/core/` makes it fail.
7. `test/fixtures/media` holds three fixtures, one of them a thirty kilobyte
   clip the loop specifications require, and `test/fixtures` holds no other
   directory.
8. The container builds and serves. Build the image and run it on a host port
   that is free, per the procedure in
   [VERIFICATION.md](./VERIFICATION.md); `docker compose up --build` uses port
   3001, which a development server usually holds.

Every assertion above was executed at the anchor, assertion 8 included.

**Assertion 8 was false for several refreshes and nobody noticed, this author
included.** The runtime image stage did not carry `src/core/`, which the
server began importing during the layering work, so the container exited at
startup on a missing module while the image still built and every test still
passed. It was carried forward four times as a claim annotated with an old
anchor, which reads as bookkeeping rather than as a warning.

`test/integration/api/deployment.test.mts` now asserts that the image carries
every file the server's imports reach, so the specific failure cannot return
silently. It reads text rather than running a container, so it does not
establish that the image starts. Assertion 8 is the only thing that does, and
it is the assertion most likely to be stale again by the time this is read.

If an assertion fails, this file is stale. Trust the repository and say so.

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
reach.** The container was found broken and fixed, with a test guarding the
agreement between the server's imports and the image's contents. The loop
controls and the two sprite selectors gained browser coverage, twenty
specifications, which found a second place judging whether a loop is usable
and disagreeing with the first about loops that cross the seam. Browser
specifications went from 31 to **51**.

That run also surfaced a defect nothing had looked for: the frame rate is
measured by playing the clip, so it under-reports on a host that cannot decode
in real time. Recorded, not fixed, and the reasoning for not fixing it
unilaterally is in `OPEN.md`.

## The next task

**Run the discriminating test, and it needs the operator.** Gemini returned a
landscape clip from two reference images and a portrait clip from one. The two
images were also misaligned, because the generated-result handoff forwarded
the raw image; that is fixed, so two properly anchored images now settle
whether the cause was multiplicity or misalignment.

If multiplicity, sending every reference image is a regression and should
become a choice or be reverted. That change rests on an argument about conduct
rather than evidence about results, which is stated in `OPEN.md`.

Everything else outstanding is either a decision for the operator or ordinary
work with diminishing returns.

**Decisions**, none taken. Whether the Graphics Interchange Format decode path
should exist when nothing imports it, and whether its two divergences from the
format are worth correcting if it does. Whether the sprite zoom should anchor
to the character's feet rather than the image edge. Whether framing should
influence the sprite canvas only for some providers, given Gemini's shape
behaviour is not understood. Whether this pipeline can target Gemini for
looping assets at all, since it disregards explicit camera instructions.

**Ordinary work, and the extraction tail is close to exhausted.** The five
largest modules still hold their Document Object Model work. Measured at the
anchor, largest first: `model-exporter` 1,647, `sprite-prep` 1,157,
`video-prep` 946, `video-gen` 829, `shell` 796. Every one of these was guessed
wrong on the first attempt at writing an earlier version of this block, which
is why the entry says measured. `shell` is the least examined;
`model-exporter` has been surveyed for arithmetic twice and the remainder is
genuine canvas and element work.

**Coverage of entry-layer behaviour has been the better return, twice
running.** The reference slots, then the loop controls and the sprite
selectors. What remains uncovered there is the exporter's own controls and the
settings panel. A browser specification reaches wiring that a unit test cannot,
and both defects found this way lived in the wiring rather than the
arithmetic.

### What is already true

The core has **zero** references to a platform facility of any kind, which
`tsconfig.core.json` refuses to compile. Storage and the network are each
confined by lint to named adapter files. Nineteen core modules carry what the
application computes; 644 unit tests reach all of it.

The entry-layer behaviour worth asserting is now covered: the reference slots,
the loop controls, and the framing and art style selectors, together with the
two workers and the provider toggles that were covered before. The container
is verified and guarded. Three fixtures exist and all three are used.

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

- The five largest modules still have no unit tests, which the task above
  addresses.
- `gif-composite` diverges from the Graphics Interchange Format in two ways.
- The format's decode path has no production consumer at all.
- The Windows and Linux binary builds have never been run.
- OpenAI sprites and Gemini video have been run against live keys. Grok,
  ComfyUI and the binary have not. Both extracted exchanges are covered by unit tests against a
  scripted client and by a browser specification against mocked routes, which
  is not the same as having run against the service.
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
