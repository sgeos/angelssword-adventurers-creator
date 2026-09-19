# Reverse Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Assistant to human. The block above the supersession line describes the
present. Everything below it is history and may be wrong.

See [COMMUNICATION.md](./COMMUNICATION.md) for the protocol, and for why this
file is arranged this way rather than being rewritten wholesale.

---

## Last Updated

2026-09-19. Knowledge graph adaptation. Complete.

## Verification

`npm run check`, `npm test`, and `npx playwright test` all pass. 182 unit
tests, 15 application programming interface tests, 10 browser specifications.

## Summary

A Markdown knowledge graph was added under `docs/`, adapted from the reference
project named by the operator. The communication and handoff protocols were
carried across and rewritten for this project's scale. The upstream product
brief, previously at the repository root, moved into the graph.

## Questions for Human Pilot

None outstanding.

## Technical Concerns

The graph is new and has not been used by a resuming session, so its handoff
validity check has never actually been run in anger.

Five modules totalling roughly 4,700 lines remain without unit tests, being
coupled to a live canvas.

## Intended Next Step

None. Awaiting a prompt.

## Session Context

Fork `main` at the commit that introduced this file. Upstream carries two open
pull requests and one open issue from this fork.

---

## Superseded history

Nothing below this line describes the present.
