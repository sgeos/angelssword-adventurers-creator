# Reverse Prompt

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Assistant to human. The block above the supersession line describes the
present. Everything below it is history and may be wrong.

See [COMMUNICATION.md](./COMMUNICATION.md) for the protocol, and for why this
file is arranged this way rather than being rewritten wholesale.

---

## Last Updated

2026-09-19. Three-layer rearchitecture, five increments. Structurally
complete, and every capability the core needs inverted.

## Verification

`npm run check` passes across all five projects. 396 unit tests, 44
application programming interface tests, 24 browser specifications, all
passing. Every gate added was exercised against a deliberately failing file:
the core project, the two determinism bans, the two import-direction zones,
the storage ban, and the network ban. The container was not rebuilt and is
marked unverified at the anchor in [HANDOFF.md](./HANDOFF.md).

## Summary

The pattern is from `~/projects/re/1830/`, whose architecture document states
the part that matters: the rule is enforceable by inspection, and a core that
needs a clock or a socket declares an interface for it. A layering nobody can
check is a naming convention.

A TypeScript project is this codebase's crate and its `lib` and `types` are
its manifest, so `tsconfig.core.json` withholds both platform libraries and
the core sees the language alone. Two lint zones carry the half no tsconfig
can express, namely the direction imports may run.

Three capabilities are inverted end to end. Storage, the network, and time.
Randomness is resolved by passing a seed rather than a generator, following
the reference project's rules crate. Two entries on the original list,
logging and binary payloads, were examined and are not capabilities.

The inversions were not the point in themselves. They made four things
testable that had never been reachable from a node test: the Graphics
Interchange Format compositor, the ComfyUI exchange, the Grok exchange, and
the storage round trips. 120 tests were added across the five increments.

## Questions for Human Pilot

Two decisions are recorded in [../decisions/OPEN.md](../decisions/OPEN.md) and
neither is mine to take.

The Graphics Interchange Format decode path has no production consumer.
`GifDecoder` and `compositeFrames` are reached only by tests. Either an import
path returns, which is what upstream had, or roughly 200 lines go. That
decides whether the two format divergences pinned beside them are worth
correcting.

## Technical Concerns

**The capability list was wrong when first written, and the correction matters
more than the entries.** It began as a count of what the browser layers reach
for, which is not the same question as what the core needs handed to it. Two
of seven entries did not survive being asked the right question. Anything
added to such a list in future should be asked whether the core would call it.

The core's freedom from the platform is checked by the compiler, but
`Math.random`, `Date.now`, and `new Date` are ECMAScript and outside what any
library setting excludes. A lint rule is the only instrument there.

The storage adapter drops a failed write silently, which is a stated trade: a
lost preference against a page that will not load where site data is blocked.

Neither extracted exchange has run against a live service. Both are covered by
unit tests against a scripted client and by a browser specification against
mocked routes, which establishes that the sequence is right and not that the
service agrees with it.

## Intended Next Step

Separating the arithmetic still tangled with the Document Object Model in the
five largest modules. Not architectural, and needing no new interface.
`169cd1b` is the worked example: read a function, ask which lines would still
mean something without a document, move those. `model-exporter` at 1,660 lines
is the largest and the least examined.

## Session Context

`main` at `169cd1b` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

---

## Superseded history

Nothing below this line describes the present.

### Superseded 2026-09-19 — rearchitecture, first three increments

#### Last Updated

2026-09-19. Three-layer rearchitecture, three increments. Structurally
complete, one capability of six inverted.

#### Verification

`npm run check` passes across all five projects. 347 unit tests, 44
application programming interface tests, 24 browser specifications, all
passing. Every gate added was exercised against a deliberately failing file
before being believed: the core project, the two determinism bans, the two
import-direction zones, and the storage ban. The container was not rebuilt and
is marked unverified at the anchor in [HANDOFF.md](./HANDOFF.md).

#### Summary

The pattern is taken from `~/projects/re/1830/`, whose architecture document
states it plainly: a core holding all logic and declaring an interface for
every capability it needs, a platform implementing those interfaces, and an
entry point that constructs the platform and holds no logic.

A TypeScript project is this codebase's crate, and its `lib` and `types`
settings are its manifest. `tsconfig.core.json` withholds the Document Object
Model library and the node types together, so `src/core/` sees the language
and nothing else.

Three increments landed. The core was established and enforced. The platform
and entry layers were separated, which required splitting an 821 line module
that all four stages imported, since an entry point nothing imports is the
property that makes it one. Storage was inverted end to end, from
`KeyValueStore` through a browser adapter to twenty-seven converted call
sites, all of which are now tested against a Map.

#### Questions for Human Pilot

Two decisions are recorded in [../decisions/OPEN.md](../decisions/OPEN.md) and
neither is mine to take.

The Graphics Interchange Format decode path has no production consumer at all.
`GifDecoder` and `compositeFrames` are reached only by tests. Either an import
path returns, which is what upstream had, or roughly 200 lines go.

That decides the second. `gif-composite` diverges from the format in two ways,
applying a frame's own disposal method rather than its predecessor's, and
clearing the whole canvas for disposal 2 rather than the disposed frame's
area. Both predate this fork and are now pinned by characterisation tests.
Correcting them is only worth doing if the path is kept.

#### Technical Concerns

The core's freedom from the platform is checked by the compiler, but three
ECMAScript facilities are outside what any library setting can exclude, namely
`Math.random`, `Date.now`, and `new Date`. A lint rule is the only thing
standing between the core and an ambient source of non-determinism. Rust's
`no_std` has no equivalent hole.

The storage adapter drops a failed write silently. The judgement is that for a
slider position or a remembered provider, a lost preference is a smaller harm
than a page that will not load in a browser with site data blocked. For a
credential that judgement is arguable, and the settings panel reading the value
back is the only thing that surfaces it.

Concerns carried forward unchanged. Nothing added for Grok or ComfyUI has run
against a live service. The four stage modules still have no unit tests, which
the remaining capability work subsumes.

#### Intended Next Step

The network capability, argued for in [HANDOFF.md](./HANDOFF.md). The server
already inverted it as `FetchLike`, the browser has not inverted it at all,
and they are the same interface. It unlocks the ComfyUI call sequence, which
is written twice and is logic rather than presentation.

#### Session Context

`main` at `9cf2a11` before this refresh. Upstream carries two open pull
requests and one open issue, all from this fork.

### Superseded 2026-09-19 — handoff validity anchored on commit N minus one

#### Last Updated

2026-09-19. Handoff validity corrected to anchor on commit N minus one.
Complete.

#### Verification

`npm test` reports 276 unit tests and 44 application programming interface
tests passing. `npx playwright test` reports 22 passing browser
specifications. `git merge-base --is-ancestor 2c0aef0 HEAD` succeeds, which is
the new ancestry check exercised against the anchor it records. The container
assertion was not re-run and is marked unverified at the anchor in
[HANDOFF.md](./HANDOFF.md) rather than restated.

#### Summary

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

#### Questions for Human Pilot

None outstanding. The next task remains the rearchitecture stated in
[HANDOFF.md](./HANDOFF.md).

#### Technical Concerns

The ancestry check detects a history rewrite and nothing else. It cannot tell
that the content assertions have gone stale, which is why both halves exist
and why neither substitutes for the other.

Concerns carried forward unchanged. Nothing added for Grok or ComfyUI has run
against a live service. Six tests were environment-dependent until a
`withoutEnv` helper fixed them, and the class of problem will recur wherever a
fallback reads the environment. Five stage modules totalling roughly 4,700
lines still have no unit tests.

#### Intended Next Step

The three-layer rearchitecture described in [HANDOFF.md](./HANDOFF.md). Not
started. Read the two reference projects first, and measure before moving
anything, because a portable core already exists in fourteen modules without
being named.

#### Session Context

`main` at `2c0aef0` before this change. Upstream carries two open pull
requests and one open issue, all from this fork.

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
