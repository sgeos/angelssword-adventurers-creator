# Task Log

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Shared source of truth for current work. Both the operator and the assistant
read and write this file.

A task marked complete carries verification evidence. A blocked task names its
blocker. Same-day entries are consolidated so history does not grow without
bound.

## Active

**A decision for the operator: whether to keep extracting.** Recorded in
[../decisions/OPEN.md](../decisions/OPEN.md) and argued in
[HANDOFF.md](./HANDOFF.md).

The arithmetic tangled with the Document Object Model has largely come out of
the five largest modules, and what remains in them is increasingly element
wiring and canvas drawing. Continuing means progressively thinner slices.
Stopping means accepting that those five hold presentation and that the core
holds what is worth testing.

## Completed: the three-layer rearchitecture

Structurally complete, and every capability the core needs inverted. Designed
in [../architecture/LAYERING.md](../architecture/LAYERING.md).

The three layers exist as four directories under `src/`, and each boundary is
checked rather than promised. `tsconfig.core.json` withholds both platform
libraries; two lint zones carry the import-direction rule no tsconfig can
express; storage and the network are each confined to named adapter files.

Storage, the network, and time are inverted end to end. Randomness is resolved
by passing a seed rather than a generator. Logging and binary payloads were
examined and are not capabilities, which is recorded rather than quietly
dropped.

## Recently Completed

| Task | Status | Verification |
|---|---|---|
| Frame selection collapsed from four copies to one | Complete | 20 new tests; count and list asserted to agree |
| Seek arithmetic unified, one number split into two names | Complete | 16 new tests; no `0.001` left in either stage |
| Key scoring, crop and size estimate extracted | Complete | 43 new tests; six constants named and pinned |
| Colour detection and placement extracted | Complete | 45 new tests; five placement copies became one |
| Loop arithmetic extracted; capability list closed | Complete | 14 new tests; two formulas asserted to agree |
| Network and time capabilities inverted | Complete | 35 new tests; server shares the port; ban exercised |
| Storage capability inverted | Complete | 27 sites converted to 0; 37 new tests; ban exercised |
| Platform and entry layers separated | Complete | Both import zones refuse a failing file; workers exercised |
| Portable core established and enforced | Complete | Core project refuses a failing file; two couplings found |
| Handoff validity anchored on commit N minus one | Complete | Ancestry check run against the anchor it records |
| Container deployment, environment keys completed | Complete | Image built and run; 276/44/22 pass |
| ComfyUI Wan image-to-video | Complete | Letterbox verified at 832x480 |
| ComfyUI sprites, wired | Complete | Generates with no key set |
| Grok video, wired | Complete | Start, poll and fetch sequence |
| Provider abstraction and Grok sprites | Complete | Toggle reaches generation |
| Knowledge graph adopted under `docs/` | Complete | Full gate passes |
| `tmp/` and `secret/` markers tracked | Complete | Ignore rules exercised both ways |
| Attribution, `keyColor`, jsdom, Node single executable | Complete | 182 unit tests, binary runs |
| Playwright harness converted to TypeScript | Complete | 10 specifications pass |
| Conversion merged to `main` | Complete | Tagged `initial-typescript-conversion` |

## Open Items

Tracked in [decisions/OPEN.md](../decisions/OPEN.md) rather than duplicated
here.
