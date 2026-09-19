# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-09-19. The anchor is `2a78864`, the last commit before this
refresh.** Read this block, run the validity check, then read the task below.

---

## Validity

Validate by ancestry and by content, never by a hash match. A check requiring
the tip to equal a recorded commit claims that nothing else ever lands, and it
fails on the very next commit, including the commit that carries the refresh
itself.

### Ancestry

`main` should **contain** `2a78864`, the last commit before this refresh. Test
containment rather than equality.

```sh
git merge-base --is-ancestor 2a78864 HEAD
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

1. `git ls-files` reports **89** TypeScript files and exactly **one**
   JavaScript file, `eslint.config.mjs`, which is deliberate.
2. **Five** `tsconfig.*.json` projects exist at the repository root, and
   `src/` holds exactly four directories, `core`, `platform-browser`,
   `platform-worker`, and `entry-browser`.
3. `src/core/ports/` holds **three** capability interfaces, namely
   `storage.mts`, `http.mts`, and `clock.mts`, and `src/core/` holds
   **nineteen** modules.
4. `npm test` reports **520** unit tests and **44** application programming
   interface tests, all passing.
5. `npx playwright test` reports **24** passing browser specifications.
6. `tsc -p tsconfig.core.json` succeeds, and adding `localStorage` to any file
   under `src/core/` makes it fail.
7. `docker compose up --build` produces a container that serves on port 3001.

Assertions 1 through 6 were executed at the anchor. Assertion 7 was last
exercised at `69addb8`, several refreshes ago, and has not been repeated. It
is recorded as unverified rather than restated as though it had been run.

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

Unit tests went from 276 before this work to **520**.

## The next task

**A decision first, and it belongs to the operator.** The extraction has
reached diminishing returns and the question in
[../decisions/OPEN.md](../decisions/OPEN.md) is whether to continue.

What is left in the five largest modules is increasingly element wiring,
canvas drawing and event binding, which is what a stage module is for. The
arithmetic that was tangled with it has largely come out. Continuing means
extracting progressively thinner slices; stopping means accepting that those
five hold presentation and that the core holds what is worth testing.

Sizes at the anchor, largest first. `model-exporter` 1,599, `sprite-prep`
1,047, `video-prep` 912, `shell` 784, `video-gen` 671.

`shell` is the one least examined, its 784 lines being the settings panel and
the page chrome. `video-gen` was found to be already well factored, its pure
parts having been extracted during the earlier provider work.

Two other matters in `OPEN.md` are decisions rather than work, and neither has
been taken: whether the Graphics Interchange Format decode path should keep
existing when nothing imports it, and whether its two divergences from the
format are worth correcting if it does.

### What is already true

The core has **zero** references to a platform facility of any kind, which
`tsconfig.core.json` refuses to compile. Storage and the network are each
confined by lint to named adapter files. Nineteen core modules carry what the
application computes; 520 unit tests reach all of it.

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
- Nothing has been exercised against live keys, a real ComfyUI, or a real Grok
  subscription. Both extracted exchanges are covered by unit tests against a
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
