# Reverse Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Assistant to human. The block above the supersession line describes the
present. Everything below it is history and may be wrong.

See [COMMUNICATION.md](./COMMUNICATION.md) for the protocol, and for why this
file is arranged this way rather than being rewritten wholesale.

---

## Last Updated

2026-09-19. Reimplementation of upstream pull request 1. Complete.

## Verification

`npm run check`, `npm test` and `npx playwright test` all pass. 276 unit
tests, 44 application programming interface tests, 22 browser
specifications. The container was verified by building and running it.

## Summary

Upstream pull request 1 is fully reimplemented across five increments: a
provider abstraction with Grok sprites, Grok video, ComfyUI sprites, ComfyUI
Wan video, and container deployment. Three parts were deliberately not
reproduced, each for a stated reason recorded beside the code that would have
held them.

## Questions for Human Pilot

None outstanding. The next task is stated in
[HANDOFF.md](./HANDOFF.md) and is a rearchitecture into three layers.

## Technical Concerns

Nothing added for Grok or ComfyUI has run against a live service. Every
provider test uses mocked routes, so the request shapes are faithful to what
upstream established empirically rather than independently verified.

Completing the environment key support made six tests environment-dependent:
they passed in continuous integration and failed on a workstation with a key
exported. A `withoutEnv` helper fixed it, but the class of problem will recur
wherever a fallback reads the environment.

Five stage modules totalling roughly 4,700 lines still have no unit tests.
The next task subsumes this, the cause being the same coupling in both cases.

## Intended Next Step

The three-layer rearchitecture described in [HANDOFF.md](./HANDOFF.md). Read
the two reference projects first. Measure before moving anything, because a
portable core already exists in fourteen modules without being named.

## Session Context

`main` at `69addb8`. Upstream carries two open pull requests and one open
issue, all from this fork.

---

## Superseded history

Nothing below this line describes the present.
