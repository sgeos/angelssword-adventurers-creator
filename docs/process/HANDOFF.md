# Handoff Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

**Refreshed 2026-09-19, describing `main` at `eafb924`.** Read this block, run
the validity check, then stop and wait for a human prompt.

---

## Validity

Validate by content, never by a hash match. A check requiring the tip to equal
a recorded commit claims that nothing else ever lands, and such a check fails
the first time anybody commits. The assertions below are cheap, independent,
and each was true when this file was refreshed.

1. `git ls-files` reports **51** TypeScript files and exactly **one**
   JavaScript file, `eslint.config.mjs`. A second JavaScript file means either
   a regression or a deliberate exception that this file predates.
2. **Four** `tsconfig.*.json` projects exist at the repository root. Their
   purposes are described in
   [PROJECT_STRUCTURE.md](../architecture/PROJECT_STRUCTURE.md).
3. `npm test` reports **182** unit tests and **15** application programming
   interface tests, all passing. A lower count means tests were removed.
4. `npx playwright test` reports **10** passing browser specifications.
5. The tag `initial-typescript-conversion` exists and points at the merge that
   brought TypeScript to `main`.

If an assertion fails, this file is stale. Trust the repository and say so in
`REVERSE_PROMPT.md` rather than trusting this document.

## What a resuming session should do first

1. Run the validity check above.
2. Read [TASKLOG.md](./TASKLOG.md) and the current-state block of
   [REVERSE_PROMPT.md](./REVERSE_PROMPT.md).
3. Read [AGENT_PITFALLS.md](./AGENT_PITFALLS.md). It is short, and every entry
   records a mistake actually made in this repository.
4. Stop and wait for a prompt.

## Current state

The project is a hard fork of `AngelsSwordStudios/angelssword-adventurers-creator`,
converted to TypeScript throughout. The fork's `main` branch is the working
line. Upstream is dormant, with three commits in total.

The application is a four-stage pipeline in a single page. Sprite preparation,
video generation, video preparation, and model export. Stages communicate
through a shared handoff object described in
[PIPELINE.md](../architecture/PIPELINE.md).

Verification passes in full. Typecheck and lint across four projects, 182 unit
tests, 15 application programming interface tests, 10 browser specifications,
and a continuous integration workflow observed to succeed.

## Open matters

These are recorded in [decisions/OPEN.md](../decisions/OPEN.md) and summarised
here because a resuming session will meet them.

- Five modules totalling roughly 4,700 lines have no unit tests. They are
  coupled to a live canvas, which the test environment deliberately does not
  provide.
- The Windows and Linux binary builds have never been run. Only macOS on arm64
  has been exercised.
- No stage has been tested against live application programming interface
  keys.
- No release has been cut, so the only way to obtain a binary is to build one.

## Relationship to upstream

Two pull requests and one issue are open upstream. The pull requests are a
portability change and a notice that this fork exists. The issue reports four
defects present in the upstream JavaScript.

One correction was posted to that issue and matters to anyone reading it. The
key colour defect was first reported as a feature never connected. That was
wrong. The field is assigned on the handoff root and the exporter was reading
it from the wrong object, so the remedy is a corrected read rather than a
design decision.

## Refreshing this file

Rewrite the block above when the assertions stop being true. Do not append a
new section and leave the old one in place, which is how the reference
project's equivalent file reached 118 kilobytes. Superseded detail belongs in
[DESIGN_JOURNAL.md](./DESIGN_JOURNAL.md).
