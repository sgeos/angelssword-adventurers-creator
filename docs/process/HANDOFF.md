# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-09-19. The anchor is `2c0aef0`, the last commit before this
refresh.** Read this block, run the validity check, then read the task below.
It is a rearchitecture and should not be begun without reading the two
reference projects named.

---

## Validity

Validate by ancestry and by content, never by a hash match. A check requiring
the tip to equal a recorded commit claims that nothing else ever lands, and it
fails on the very next commit, including the commit that carries the refresh
itself.

### Ancestry

`main` should **contain** `2c0aef0`, the last commit before this refresh. Test
containment rather than equality.

```sh
git merge-base --is-ancestor 2c0aef0 HEAD
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

1. `git ls-files` reports **58** TypeScript files and exactly **one**
   JavaScript file, `eslint.config.mjs`, which is deliberate.
2. **Four** `tsconfig.*.json` projects exist at the repository root.
3. `npm test` reports **276** unit tests and **44** application programming
   interface tests, all passing.
4. `npx playwright test` reports **22** passing browser specifications.
5. `docker compose up --build` produces a container that serves on port 3001.

Assertions 1 through 4 were re-executed at the anchor. Assertion 5 was last
exercised one refresh earlier, at `69addb8`, and was judged too costly to
repeat for a status check. It is recorded as unverified at the anchor rather
than restated as though it had been run.

If an assertion fails, this file is stale. Trust the repository and say so.

## What a resuming session should do first

1. Run the validity check.
2. Read [AGENT_PITFALLS.md](./AGENT_PITFALLS.md). Short, and every entry is a
   mistake made in this repository. Two of them were repeated after being
   written down, so it is not merely decorative.
3. Read the task below and the two reference projects.
4. Stop and wait for a prompt.

## Current state

A hard fork of `AngelsSwordStudios/angelssword-adventurers-creator`, converted
to TypeScript throughout. Upstream is dormant.

A four-stage pipeline in one page. Sprite preparation, video generation, video
preparation, model export, communicating through a shared handoff object.
Sprites generate through OpenAI, Grok, or a local ComfyUI. Video generates
through Gemini, Grok, or ComfyUI with Wan image-to-video. A local server
proxies every outbound call.

The whole of upstream pull request 1 has been reimplemented, deliberately
excluding three things. Its OAuth flow presented as xAI's own command line
client. Its ComfyUI restart route ran a shell command and needed the Docker
socket mounted. Its video fetch attached the user's credential to any address
a caller named. Each omission is recorded where the code would have gone.

Verification passes in full, and the container is verified by building and
running rather than by reading.

## The next task

Rearchitect the project into three layers, matching the operator's Rust
projects.

- A portable core, free of platform assumptions, inverting control through
  interfaces so that capabilities normally taken from the platform are
  supplied to it.
- A platform layer implementing those interfaces for a particular target,
  which may use the platform's own facilities or delegate to a proprietary
  library.
- An entry point, which may be a command line tool, an application, or a
  library.

Two reference projects almost certainly follow this pattern and should be read
before starting.

- `~/projects/rust/keleusma/`
- `~/projects/re/1830/`

Note that the first is also the source of this repository's knowledge graph
and process protocol, so its conventions are already partly present here.

### What is already true, and what is not

The shape exists in part and is worth measuring before moving anything.
Classified by whether a browser interface appears in code rather than in a
comment, which matters because several modules discuss `localStorage` in prose
without touching it:

**Portable today, fourteen modules.** `api`, `chroma-key`, `comfyui-core`,
`exporter-math`, `gif-codec`, `gif-worker`, `gif-worker-core`,
`grok-video-core`, `pixels`, `providers`, `sprite-prep-core`, `timer-worker`,
`video-gen-core`, `video-prep-core`.

**Coupled to the browser, eight modules.** `app`, `app-utils`, `dom`,
`gif-composite`, `model-exporter`, `sprite-prep`, `video-gen`, `video-prep`.

So a portable core largely exists and is unnamed. What does not exist is the
inversion. The portable modules do not receive their capabilities through
interfaces; they simply avoid needing any. Where a capability is genuinely
required, the coupling sits in the stage module instead, which is why those
eight are large and thinly tested.

The clearest candidates for inverted capabilities, each currently reached
directly rather than supplied:

- **Storage.** `localStorage` is read and written in at least four modules.
- **A drawing surface.** Canvas work forced the decision not to supply one in
  tests, which is why five stage modules have no unit tests at all.
- **The network.** Already inverted on the server through `createApp(fetchImpl)`,
  and not inverted at all in the browser.
- **Time and scheduling.** `setTimeout` appears in several polling loops.
- **Randomness.** Seeds are drawn with `Math.random` inside generation paths.

### Why this is worth doing here

Not merely for symmetry with the Rust projects. Five modules totalling roughly
4,700 lines have no unit tests, and the reason is uniformly that they reach
for a canvas or the document. Inverting those capabilities is the same work as
making them testable, so the architectural change and the coverage gap have
one answer.

### Traps specific to this task

`tsconfig.browser.json` withholds the node types and `tsconfig.json` withholds
the document library, which already enforces part of this separation. A
portable core needs a project that has neither, as `tsconfig.worker.json`
already demonstrates for the workers. Expect the project layout to change, and
expect `eslint.config.mjs` to need matching scopes, since it names projects
explicitly.

Do not move files before the interfaces exist. A rename that merely relocates
the coupling costs the same review effort and buys nothing.

## Open matters

Recorded in [decisions/OPEN.md](../decisions/OPEN.md).

- Five stage modules have no unit tests. See above; this task subsumes it.
- The Windows and Linux binary builds have never been run.
- Nothing has been exercised against live keys, a real ComfyUI, or a real
  Grok subscription. Every provider test uses mocked routes. The request
  shapes are faithful to what upstream established empirically, but a
  specification derived from another person's debugging is not verification.
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
