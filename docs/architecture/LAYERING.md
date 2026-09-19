# Layering

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

Status. **Structurally complete. Three capabilities inverted, three to go.**
All three layers exist and each boundary is enforced by a check rather than by
convention. Storage, the network, and time are inverted end to end, from
declared interfaces through browser adapters to every call site. Randomness
needs no interface and is resolved. What remains is logging, binary payloads,
and the largest part, the Document Object Model work still held inside the
four stage modules. Capability interfaces are declared as their consumers
arrive rather than in advance.

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

Counts below were measured on 2026-09-19 over code with comments and string
literals stripped, because a naive search reports a module that merely
discusses a facility.

| Capability | Status | Reached directly today, by layer |
|---|---|---|
| A raster to read and write | **Declared**, as `RgbaImage` in `src/core/pixels.mts` | Satisfied structurally by `ImageData`. No adapter exists or is wanted |
| Storage | **Declared and implemented**, `KeyValueStore` and `local-storage.mts` | Platform 3, all inside the adapter. Entry 0, down from 27 |
| The network | **Declared and implemented**, `HttpClient` and `http.mts` | Platform 3, in two named files. Entry 0, down from 9 |
| Time and scheduling | **Declared and implemented**, `Clock` and `clock.mts` | Platform 7, entry 22, worker 2. Every polling loop is now core |
| Randomness | **Resolved without an interface**, see below | Platform 2, entry 0, down from 2 |
| A scratch surface to composite onto | **Not needed after all**, see below | Nothing. `gif-composite` used a canvas and did not need one |
| Logging | Not declared | Entry 10, platform 2 |
| Binary payloads | Not declared | Entry 33, platform 7. `Blob`, `File`, and object URLs |

The core column is absent from that table because every count in it is zero.
That is checked rather than asserted, `tsconfig.core.json` refusing to compile
a core module that names any of these.

The remaining time count in the entry layer is not a polling loop. It is
playback and animation, meaning `requestAnimationFrame` and the debounced
redraws, which are presentation and belong where they are.

`RgbaImage` is the model for a capability with no behaviour. The keyer and the
exporters need somewhere to read and write pixels. They do not need a canvas, a
rendering context, or a document, so the core declares the shape it uses and a
browser `ImageData` satisfies it without an adapter. A test satisfies it with
an object literal, which is the property that makes the keyer testable at all.

`KeyValueStore` is the model for one with behaviour, and it is worth reading
as a worked example.

The core decides what is worth remembering, how it is encoded, and whether what
comes back can be trusted. It does not decide where the bytes live. So the
interface has three methods and the browser adapter is the only file in the
project that knows the answer is Web Storage, which a lint rule enforces by
naming that one file as the exemption.

Three things came out of writing it that were not the point of writing it.

**The platform's idea of absence had reached into the core.** Four core parsers
took `string | null`, which is the Web Storage return type and not this
project's convention. They take `string | undefined` now, and the adapter
translates, which is one line and is the adapter's job.

**A predicate that did not narrow became a narrowing that does.**
`hasCredential` returned a boolean, so its caller re-checked for absence
immediately afterwards, in the shape the repository's own convention exists to
prevent. `credentialFrom` returns the credential or `undefined`.

**Twenty-seven call sites had no handling for a store that throws.** A browser
configured to block site data raises on the first property access to
`localStorage`, before any method runs, which would have taken the page down.
The adapter probes once and catches on every operation, degrading to a store
that forgets. That trade is stated where it is made, because a dropped write
means a preference can appear saved and not be.

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

## The network, and what inverting it was actually for

The interface itself is small, and unifying the two halves was the easy part.
`server.mts` had declared `FetchLike` before any of this began, and the
browser had declared nothing. They are the same capability, so `server.mts`
now imports the core's `HttpClient` and `nodeFetch` still satisfies it as the
default argument, which the compiler checks.

One design decision is worth stating. The request body is a type parameter.
It is the one axis on which the two halves genuinely differ, the server
additionally sending a multipart stream whose type comes from node and cannot
be named in the core. A base interface the server extends does not work,
because widening `body` from `string` to `string | FormData` in a subtype is
not assignable, which the compiler refuses for the same reason this project
wants it to.

**The point was never the interface.** It was what the interface made
possible. Two sequences moved into the core and became testable.

`comfyui-run.mts` holds the ComfyUI exchange, meaning upload, queue, poll the
history, retrieve. That sequence was written twice, once in the sprite stage
and once in the video stage, and the two copies agreed on every step. They
differed in which graph was built, how long they were willing to wait, and
what they wrapped the result in, none of which is presentation. Neither copy
had a test, because each sat in a module that needs a browser.

`grok-video-run.mts` holds the Grok exchange. Its case is sharper and worth
dwelling on. **Every pure part of it had already been extracted and covered**,
namely the request shape, the classification of a poll response, the backoff
schedule, the limits. What had not been extracted was the loop that uses them,
because the loop needs a clock and a network. So the tested fraction looked
healthy while the code that decides what actually happens was untested. That
is the coverage gap this architecture exists to close, and it is invisible to
a count of tests.

Both now return bytes or base64 rather than a `Blob`. What to wrap a payload
in is the platform's decision, and returning the language's own type is what
lets one function serve two callers that want different wrappers.

## Randomness, resolved without an interface

The core draws no random number, and it has no `RandomSource` to be handed
one. It takes a seed.

That follows the reference project, whose rules crate states the property
directly: a complete run is reproducible from a seed and an ordered list of
inputs. A core that receives the value rather than the generator cannot be
non-deterministic even by accident, and needs no interface to be handed one.
The generator lives in `platform-browser/random.mts`, where `Math.random` is
permitted, and the value crosses the boundary rather than the source.

The general lesson is that not every capability wants an interface. Ask first
whether the core needs to *call* the facility or only to *receive* its result.

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

- The four stage modules are entry points that still hold their Document
  Object Model work, which is 320 of the 372 platform references left outside
  the platform layer. Some of it is presentation and belongs there. What does
  not is the arithmetic still tangled with it, and separating the two is the
  long part of this work.
- Declare the logging and binary payload interfaces as the logic that needs
  them moves into the core. Binary payloads are the larger of the two at
  forty sites, and are what block `Handoff` from moving.
- `Handoff` cannot move to the core as it stands, carrying an
  `HTMLCanvasElement` and two `Blob` fields. It moves when the drawing surface
  and the binary payload are inverted, not before.
- There is no node platform layer. `server.mts` is an entry point with its
  platform inline. It now shares the core's network interface, so what remains
  is a structural question rather than a duplication one.

## Related

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for what each project
  withholds and why.
- [PIPELINE.md](./PIPELINE.md) for what the four stages do.
- [../decisions/OPEN.md](../decisions/OPEN.md) for the untested modules.
