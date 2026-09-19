# Task Log

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

Shared source of truth for current work. Both the operator and the assistant
read and write this file.

A task marked complete carries verification evidence. A blocked task names its
blocker. Same-day entries are consolidated so history does not grow without
bound.

## Active

**Three-layer rearchitecture.** Structurally complete, one capability of six
inverted. Specified in [HANDOFF.md](./HANDOFF.md) and designed in
[../architecture/LAYERING.md](../architecture/LAYERING.md).

Success is a portable core that names its required capabilities as interfaces
rather than avoiding the need for them, a platform layer supplying them for
the browser and for node, and the currently untested stage modules brought
under test as a consequence rather than as separate work.

Done. The three layers exist as four directories under `src/`, and each
boundary is checked rather than promised: `tsconfig.core.json` withholds both
platform libraries, and two lint zones carry the import-direction rule no
tsconfig can express. Storage is inverted end to end.

Remaining, in the order the handoff argues for. The network, which the server
has already inverted and which unlocks the twice-written ComfyUI call
sequence. Time, which every polling loop reaches directly. Randomness, three
sites. Logging and binary payloads, the latter being what blocks `Handoff`
from moving to the core.

## Recently Completed

| Task | Status | Verification |
|---|---|---|
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
