# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-09-19. The anchor is `169cd1b`, the last commit before this
refresh.** Read this block, run the validity check, then read the task below.

---

## Validity

Validate by ancestry and by content, never by a hash match. A check requiring
the tip to equal a recorded commit claims that nothing else ever lands, and it
fails on the very next commit, including the commit that carries the refresh
itself.

### Ancestry

`main` should **contain** `169cd1b`, the last commit before this refresh. Test
containment rather than equality.

```sh
git merge-base --is-ancestor 169cd1b HEAD
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

1. `git ls-files` reports **81** TypeScript files and exactly **one**
   JavaScript file, `eslint.config.mjs`, which is deliberate.
2. **Five** `tsconfig.*.json` projects exist at the repository root, and
   `src/` holds exactly four directories, `core`, `platform-browser`,
   `platform-worker`, and `entry-browser`.
3. `src/core/ports/` holds **three** capability interfaces, namely
   `storage.mts`, `http.mts`, and `clock.mts`.
4. `npm test` reports **396** unit tests and **44** application programming
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

**The three-layer rearchitecture is structurally complete, and every
capability the core needs is inverted.** Five increments landed.

- `e579ee5` established `src/core/` and `tsconfig.core.json`, which withholds
  the Document Object Model library and the node types together.
- `5da3c11` separated the platform and entry layers, and added the
  import-direction rule that no tsconfig can express.
- `9cf2a11` inverted storage, twenty-seven call sites becoming none.
- `8f75eb5` inverted the network and time, unified the browser's client with
  the server's, and moved the ComfyUI and Grok exchanges into the core.
- `169cd1b` extracted the video stage's loop arithmetic, and struck logging
  and binary payloads off the capability list as not being capabilities.

## The next task

**Not architectural.** Nothing further needs an interface. What remains is the
ordinary work of separating the arithmetic still tangled with the Document
Object Model inside the four stage modules, which is the same work as making
them testable.

`169cd1b` is the worked example to follow. It found a count computed two ways,
two label vocabularies for one concept, and an epsilon whose reason was
unrecorded, all inside forty lines of a stage. The method was to read a
function, ask which lines would still mean something without a document, and
move those.

Sizes at the anchor, largest first. `model-exporter` 1,660, `sprite-prep`
1,119, `video-prep` 914, `shell` 784, `video-gen` 671.

`model-exporter` is the largest and the least examined. `sprite-prep` is the
next. Neither has been read function by function in the way `video-prep` just
was.

### What is already true

Measured at the anchor over code with comments and string literals stripped.
The core has **zero** references to a platform facility of any kind, which
`tsconfig.core.json` also refuses to compile.

| Facility | Entry | Platform | Worker | Status |
|---|---|---|---|---|
| Document Object Model | 320 | 100 | 0 | The remaining work |
| Binary payloads | 33 | 7 | 0 | Not a capability, see LAYERING.md |
| Time and scheduling | 22 | 7 | 2 | Inverted; what is left is animation |
| Logging | 10 | 2 | 0 | Not a capability, see LAYERING.md |
| Storage | 0 | 3 | 0 | Inverted, confined by lint |
| The network | 0 | 3 | 0 | Inverted, confined by lint |
| Randomness | 0 | 2 | 0 | Resolved without an interface |

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
than assumed, and the agreement is now a test.

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
