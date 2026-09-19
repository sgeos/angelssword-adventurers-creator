# Design Journal

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Append-only. Reasoning that would otherwise make
[REVERSE_PROMPT.md](./REVERSE_PROMPT.md) grow without bound belongs here.
Entries are never edited or removed, and newest goes at the bottom.

---

## 2026-09-19 — Knowledge graph adopted

Adapted from a reference project at the operator's direction. Three
adaptations were deliberate rather than mechanical.

The reference separates a bounded reverse prompt from an unbounded journal,
and records honestly that the split failed to bound anything, because each
session prepended to the bounded file and kept the rest. The lesson taken is
that bounded currency matters and bounded size does not. `REVERSE_PROMPT.md`
here carries an explicit supersession line, so a reader knows where the
present ends without anyone having to delete another session's record.

The reference validates its handoff by ancestry and by content, having had
hash-based checks fail three times. Only content checks were carried across.
Ancestry validation assumes a long-lived version branch, which this project
does not have.

`AGENT_PITFALLS.md` has no counterpart in the reference. Every entry is a
mistake made during the TypeScript conversion of this repository. It exists
because those mistakes were individually cheap to avoid and collectively
expensive to discover, and because none of them are the kind a model avoids by
being careful in general.
