# Layering

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

Status. **Structurally complete, and thinly populated.** All three layers
exist and each boundary is enforced by a check rather than by convention. What
remains is the long part: the four stage modules are entry points that still
hold their logic, so the core has the pure parts and the platform layer has
everything that touches a canvas. The capability interfaces are declared as
their consumers arrive rather than in advance.

## The rule

Every deployable is built from three layers. The pattern is taken from the
operator's Rust projects, and the reasoning transfers without modification.

1. **Core.** All logic, and no platform assumptions. Declares an interface for
   every capability it needs from outside, so that facilities a platform would
   normally supply are injected rather than imported.
2. **Platform.** Implements those interfaces for one target. This is the only
   layer permitted to know about the Document Object Model, a Web Worker,
   node, or a network.
3. **Entry point.** Constructs the platform, hands it to the core, and runs.
   Holds no logic.

The rule is enforceable by inspection. If a core module needs a clock, a random
number, a stored value, or a network call, it declares an interface and the
platform supplies an implementation.

## How the layers are expressed

A Rust project draws these boundaries with crates, and a manifest states what
each crate may see. The equivalent here is the TypeScript project. Each layer
is a `tsconfig.*.json` whose `lib` and `types` settings decide which globals
exist, which makes the boundary a compile error rather than a convention.

| Layer | Directory | Project | Sees |
|---|---|---|---|
| Core | `src/core/` | `tsconfig.core.json` | ECMAScript only |
| Platform, browser | `src/platform-browser/` | `tsconfig.browser.json` | ECMAScript and the Document Object Model |
| Platform, worker | `src/platform-worker/` | `tsconfig.worker.json` | ECMAScript and the Web Worker scope |
| Entry, browser | `src/entry-browser/` | `tsconfig.browser.json` | ECMAScript and the Document Object Model |
| Platform and entry, node | `server.mts`, `build-exe.mts` | `tsconfig.json` | ECMAScript and node |
| Tests | `test/` | `tsconfig.test.json` | Everything |

The browser platform and entry layers share one project, because both see
exactly the same globals. What separates them is not what they may see but the
direction imports may run, which no `tsconfig` can express. That half of the
rule lives in `eslint.config.mjs` and is described below.

The core project is the analogue of `no_std`. It withholds both the Document
Object Model library and the node types, so a core module reaching for
`document`, `localStorage`, `fetch`, `setTimeout`, `console`,
`URLSearchParams`, `Blob`, or `process` fails to compile.

The test project alone sees every library, because a test legitimately stands
on both sides of a boundary it is examining. That asymmetry is deliberate and
is what lets a test use `URLSearchParams` as an oracle for the core's own
encoder.

## The direction rule

An entry point constructs the platform, hands it over, and runs. The property
that makes it one is that **nothing imports it**.

That property was false. All four stage modules imported `app.mts` for the
shared handoff object and the page chrome, which made the entry point a
dependency of everything that depended on it. Separating the layers meant
splitting that module: the shared surface became `platform-browser/shell.mts`
at 790 lines, and what remained is a 54 line entry point that publishes the
handoff and calls four initialisers on `DOMContentLoaded`.

Two `no-restricted-imports` zones keep it that way. The platform layer may not
import an entry point, and an entry point may not import another entry point,
each of the five being loaded independently by its own script tag. Both zones
have been exercised against a deliberately failing file.

The core needs no zone. Importing a platform module would pull that file into
the core program, where the globals it uses do not exist, so the core project
already refuses it.

## What the gate cannot catch, and what covers the gap

`Math.random`, `Date.now`, and `new Date` are ECMAScript rather than platform
facilities, so no library setting excludes them. Rust's `no_std` has no
equivalent hole, because its clock and its generator live in `std`.

Those three are banned for `src/core/` in `eslint.config.mjs`. That ban is the
only thing standing between the core and an ambient source of non-determinism,
so it is worth knowing that it exists rather than assuming the compiler covers
it. Both gates have been exercised against a deliberately failing file rather
than assumed to work.

## What the gate found immediately

A search of the sources for browser globals, stripping comments and string
literals first, reported twelve modules as free of any platform reference.
Compiling those twelve under the core project refused two of them.

- `chroma-key.mts` named `ImageData` in nine signatures. It is a Document
  Object Model type, and the search had not looked for a type.
- `comfyui-core.mts` built one query string with `URLSearchParams`, which
  neither the language nor this layer provides.

Neither had been visible to a reading of the code, and both would have crossed
the boundary silently. The general lesson is that a search establishes what a
pattern matches and a compiler establishes what a file requires. Only the
second is the question the layering rule asks.

## Capabilities

The core does not go without time, randomness, storage, or a network. It
receives them. A capability the core needs becomes a parameter that the
platform supplies, which is also what makes the core testable, since an
injected clock can be driven and an ambient one cannot.

Interfaces are declared when a consumer for them exists, not in advance. A
declared interface that nothing implements and nothing calls records an
intention rather than a contract, and it ages badly.

| Capability | Status | Where it is reached directly today |
|---|---|---|
| A raster to read and write | **Declared**, as `RgbaImage` in `src/core/pixels.mts` | Satisfied structurally by `ImageData`. No adapter exists or is wanted |
| A scratch surface to composite onto | **Not needed after all**, see below | Nothing. `gif-composite` used a canvas and did not need one |
| Storage | Not declared | `localStorage` at twenty-seven sites across four stage modules |
| Time and scheduling | Not declared | `setTimeout` and `requestAnimationFrame` in polling and playback loops |
| The network | Not declared in the browser | Already inverted on the server as `FetchLike` in `server.mts` |
| Randomness | Not declared | `Math.random` at three sites, all generating seeds |
| Logging | Not declared | `console` at twelve sites |

`RgbaImage` is the model for the rest. The keyer and the exporters need
somewhere to read and write pixels. They do not need a canvas, a rendering
context, or a document, so the core declares the shape it uses and a browser
`ImageData` satisfies it without an adapter. A test satisfies it with an object
literal, which is the property that makes the keyer testable at all.

## Why this is worth doing here

Not for symmetry with the Rust projects. Five modules totalling roughly 4,700
lines have no unit tests, and in every case the obstacle is that they reach for
a canvas or the document. Inverting those capabilities and making those modules
testable are the same work, so the architectural change and the coverage gap
have one answer.

The test helper is the smallest instance of that already paying off. It used to
declare `ImageData` and manufacture a `colorSpace` field it never read, because
that was the only way to satisfy a type node cannot construct. Its own comment
said the keyer reads three fields and nothing else, which was true and which
the types could not express. The core now declares that shape, so the stand-in
states exactly what it provides and the fabricated field is gone.

## A capability that turned out not to be one

`gif-composite` declared in its own header that it was the one part of
Graphics Interchange Format handling that needed a canvas. It was not. It used
a canvas as a scratch buffer and called only `putImageData`, `getImageData`,
and `clearRect`, none of which asks the platform for anything an array cannot
do. Rewritten against plain buffers it became core, and it gained twelve tests
where it had none.

The lesson generalises and is worth applying before any capability is
declared. A module that reaches for a platform facility has not thereby
established that it needs one. Ask what the facility is being asked to
compute, and whether the answer is arithmetic.

Two divergences from the format came to light while writing those tests, both
preserved rather than corrected, and both recorded in
[../decisions/OPEN.md](../decisions/OPEN.md).

## What remains

- The four stage modules are entry points that still hold their logic. Moving
  that logic into the core is the long part of this work, and it is the same
  work as the untested-module problem.
- Declare the storage, clock, network, randomness, and logging interfaces as
  the logic that needs them moves into the core.
- The four core parsers that accept `string | null` take that shape from the
  Web Storage interface rather than from the core's own conventions. They
  become `string | undefined` when the storage capability is declared.
- `Handoff` cannot move to the core as it stands, carrying an
  `HTMLCanvasElement` and two `Blob` fields. It moves when the drawing surface
  and the binary payload are inverted, not before.
- There is no node platform layer. `server.mts` is an entry point with its
  platform inline, and it already declares the one capability it inverts,
  `FetchLike`. That interface and the browser's eventual network port are the
  same interface and should be one.

## Related

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for what each project
  withholds and why.
- [PIPELINE.md](./PIPELINE.md) for what the four stages do.
- [../decisions/OPEN.md](../decisions/OPEN.md) for the untested modules.
