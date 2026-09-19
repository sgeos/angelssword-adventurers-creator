# Layering

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

Status. **Partly implemented.** The core layer exists, is enforced, and holds
thirteen modules. The platform and entry layers are not yet separated from one
another, both still living under `src/browser/`. The capability interfaces are
declared as their consumers arrive rather than in advance.

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

| Layer | Project | Sees | Directory |
|---|---|---|---|
| Core | `tsconfig.core.json` | ECMAScript only | `src/core/` |
| Platform and entry, browser | `tsconfig.browser.json` | ECMAScript and the Document Object Model | `src/browser/` |
| Platform, worker | `tsconfig.worker.json` | ECMAScript and the Web Worker scope | `src/browser/*-worker.mts` |
| Platform and entry, node | `tsconfig.json` | ECMAScript and node | `server.mts`, `build-exe.mts` |
| Tests | `tsconfig.test.json` | Everything | `test/` |

The core project is the analogue of `no_std`. It withholds both the Document
Object Model library and the node types, so a core module reaching for
`document`, `localStorage`, `fetch`, `setTimeout`, `console`,
`URLSearchParams`, `Blob`, or `process` fails to compile.

The test project alone sees every library, because a test legitimately stands
on both sides of a boundary it is examining. That asymmetry is deliberate and
is what lets a test use `URLSearchParams` as an oracle for the core's own
encoder.

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

## What remains

- Separate the platform layer from the entry layer. Both are currently
  `src/browser/`, where `dom.mts`, `app-utils.mts`, and the two workers are
  platform, and `app.mts` with the four stage modules are entry.
- `app.mts` is imported by all four stage modules, so the entry layer is
  currently depended upon. An entry point that anything imports is not an entry
  point.
- Declare the storage, clock, network, randomness, and logging interfaces as
  the logic that needs them moves into the core.
- The four core parsers that accept `string | null` take that shape from the
  Web Storage interface rather than from the core's own conventions. They
  become `string | undefined` when the storage capability is declared.

## Related

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for what each project
  withholds and why.
- [PIPELINE.md](./PIPELINE.md) for what the four stages do.
- [../decisions/OPEN.md](../decisions/OPEN.md) for the untested modules.
