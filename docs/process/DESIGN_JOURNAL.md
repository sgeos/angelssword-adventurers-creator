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

## 2026-09-19 — Upstream pull request 1 reimplemented

Five increments rather than one change, following the decomposition that the
audit of that pull request recommended. It bundled roughly eleven concerns
across 96 commits under a title naming one of them.

Three parts were not reproduced, and the reasoning is worth keeping because
each is a pattern rather than an incident. An OAuth flow presenting as another
vendor's own client risks the user's account rather than the developer's. A
convenience button that needs the Docker socket mounted trades host root for a
restart. A proxy that attaches a credential to any address a caller names is a
credential exfiltration route, whatever its intent.

The general lesson from the exercise: in each case the safe version cost
nothing in capability. The allowlisted video fetch, the restricted ComfyUI
endpoint set, and the API-key path all do what the original did. Security and
capability were not in tension here, which suggests the original's choices
were expedience rather than trade-offs.

One recurring process failure. Twice a count assertion in a browser
specification broke because a provider was added, and the first time I patched
the number instead of deriving it. The second occurrence cost the same
diagnosis again. Deriving from the exported provider order was two lines and
should have been the first response.

A second, sharper one. Completing the environment key fallback made six tests
pass in continuous integration and fail on my own machine, because a key was
exported in my shell. A test that depends on ambient environment is worse than
a failing test, since it fails only where nobody is looking.

