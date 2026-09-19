# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-09-19. The anchor is `9cf2a11`, the last commit before this
refresh.** Read this block, run the validity check, then read the task below.

---

## Validity

Validate by ancestry and by content, never by a hash match. A check requiring
the tip to equal a recorded commit claims that nothing else ever lands, and it
fails on the very next commit, including the commit that carries the refresh
itself.

### Ancestry

`main` should **contain** `9cf2a11`, the last commit before this refresh. Test
containment rather than equality.

```sh
git merge-base --is-ancestor 9cf2a11 HEAD
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

1. `git ls-files` reports **69** TypeScript files and exactly **one**
   JavaScript file, `eslint.config.mjs`, which is deliberate.
2. **Five** `tsconfig.*.json` projects exist at the repository root, and
   `src/` holds exactly four directories, `core`, `platform-browser`,
   `platform-worker`, and `entry-browser`.
3. `npm test` reports **347** unit tests and **44** application programming
   interface tests, all passing.
4. `npx playwright test` reports **24** passing browser specifications.
5. `tsc -p tsconfig.core.json` succeeds, and adding `localStorage` to any file
   under `src/core/` makes it fail.
6. `docker compose up --build` produces a container that serves on port 3001.

Assertions 1 through 5 were executed at the anchor. Assertion 6 was last
exercised at `69addb8`, two refreshes ago, and has not been repeated since. It
is recorded as unverified rather than restated as though it had been run.

If an assertion fails, this file is stale. Trust the repository and say so.

## What a resuming session should do first

1. Run the validity check.
2. Read [AGENT_PITFALLS.md](./AGENT_PITFALLS.md). Short, and every entry is a
   mistake made in this repository. Two of them were repeated after being
   written down, so it is not merely decorative.
3. Read [../architecture/LAYERING.md](../architecture/LAYERING.md), which is
   the design the current work implements.
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

**The three-layer rearchitecture is structurally complete and has one
capability inverted.** Three increments landed.

- `e579ee5` established `src/core/` and `tsconfig.core.json`, which withholds
  the Document Object Model library and the node types together.
- `5da3c11` separated `src/platform-browser/`, `src/platform-worker/`, and
  `src/entry-browser/`, and added the import-direction rule that no tsconfig
  can express.
- `9cf2a11` inverted storage end to end, from `KeyValueStore` through a
  browser adapter to twenty-seven converted call sites.

## The next task

Continue inverting capabilities. The order below is by value, not by size.

**The network, and it is the most valuable.** The server already inverted it
as `FetchLike` in `server.mts`, and the browser has not inverted it at all.
Those are the same interface and should be one, living in `src/core/ports/`.
Doing this unlocks the real prize. The ComfyUI call sequence, meaning upload,
queue, poll the history, retrieve, is written twice, once in `sprite-prep.mts`
and once in `video-gen.mts`, and it is logic rather than presentation. So is
the Grok polling loop, whose pure parts already sit in `grok-video-core.mts`
while the loop that drives them sits in `video-gen`.

**Time, which the network work needs anyway.** Every polling loop reaches
`setTimeout` directly, so none can be tested without waiting. A `Clock` with
`now` and `sleep` is what makes a poll loop assertable.

**Randomness, which is three sites and an afternoon.** All three generate
seeds. Inverting it makes a generation reproducible under test.

**Logging and binary payloads**, the latter being `Blob`, `File`, and object
URLs at thirty-eight sites. Binary payloads are what block `Handoff` from
moving to the core, since it carries an `HTMLCanvasElement` and two `Blob`
fields.

### What is already true

Measured at the anchor over code with comments and string literals stripped.
The core has **zero** references to a platform facility of any kind, which
`tsconfig.core.json` also refuses to compile. What remains, by layer:

| Capability | Entry | Platform | Worker |
|---|---|---|---|
| Binary payloads | 32 | 6 | 0 |
| Time and scheduling | 24 | 5 | 2 |
| Logging | 10 | 2 | 0 |
| The network | 9 | 4 | 0 |
| Randomness | 2 | 1 | 0 |

### Traps specific to this task

**Measure with a compiler, not with a search.** A search that stripped
comments and strings reported twelve modules portable. The core project
refused two of them, for `ImageData` and for `URLSearchParams`, neither of
which the search had looked for. A search establishes what a pattern matches.
A compiler establishes what a file requires.

**A module reaching for a platform facility has not established that it needs
one.** `gif-composite` asserted in its own header that it needed a canvas. It
used one as a scratch buffer and did not need one. Ask what the facility is
being asked to compute, and whether the answer is arithmetic, before declaring
a capability for it.

**Preserve behaviour across a move, and characterise it.** Writing
`gif-composite`'s first tests found two divergences from the format. Both were
preserved and pinned, and the decision to correct them recorded in
[../decisions/OPEN.md](../decisions/OPEN.md), because the change moved a
module rather than altering one.

**Check that a new rule fires.** Every gate added so far was exercised against
a deliberately failing file before being believed.

## Open matters

Recorded in [../decisions/OPEN.md](../decisions/OPEN.md).

- The four stage modules have no unit tests, and this task subsumes it.
- `gif-composite` diverges from the Graphics Interchange Format in two ways.
- The format's decode path has no production consumer at all.
- The Windows and Linux binary builds have never been run.
- Nothing has been exercised against live keys, a real ComfyUI, or a real Grok
  subscription.
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
