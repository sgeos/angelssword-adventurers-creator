# Reverse Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Assistant to human. The block above the supersession line describes the
present. Everything below it is history and may be wrong.

See [COMMUNICATION.md](./COMMUNICATION.md) for the protocol, and for why this
file is arranged this way rather than being rewritten wholesale.

---

## Last Updated

2026-09-19. Handoff validity corrected to anchor on commit N minus one.
Complete.

## Verification

`npm test` reports 276 unit tests and 44 application programming interface
tests passing. `npx playwright test` reports 22 passing browser
specifications. `git merge-base --is-ancestor 2c0aef0 HEAD` succeeds, which is
the new ancestry check exercised against the anchor it records. The container
assertion was not re-run and is marked unverified at the anchor in
[HANDOFF.md](./HANDOFF.md) rather than restated.

## Summary

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

## Questions for Human Pilot

None outstanding. The next task remains the rearchitecture stated in
[HANDOFF.md](./HANDOFF.md).

## Technical Concerns

The ancestry check detects a history rewrite and nothing else. It cannot tell
that the content assertions have gone stale, which is why both halves exist
and why neither substitutes for the other.

Concerns carried forward unchanged. Nothing added for Grok or ComfyUI has run
against a live service. Six tests were environment-dependent until a
`withoutEnv` helper fixed them, and the class of problem will recur wherever a
fallback reads the environment. Five stage modules totalling roughly 4,700
lines still have no unit tests.

## Intended Next Step

The three-layer rearchitecture described in [HANDOFF.md](./HANDOFF.md). Not
started. Read the two reference projects first, and measure before moving
anything, because a portable core already exists in fourteen modules without
being named.

## Session Context

`main` at `2c0aef0` before this change. Upstream carries two open pull
requests and one open issue, all from this fork.

---

## Superseded history

Nothing below this line describes the present.

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
