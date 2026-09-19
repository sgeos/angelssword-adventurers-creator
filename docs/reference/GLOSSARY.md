# Glossary

> **Navigation**: [Reference](./README.md) | [Documentation Root](../README.md)

Terms that carry a specific meaning in this repository.

**Chroma key.** Removal of a background of known colour, making it
transparent. The colour is chosen in sprite preparation and flows through the
pipeline as `handoff.keyColor`.

**Core module.** A sibling module holding logic that needs no Document Object
Model, named `*-core.mts`, or `exporter-math.mts` for the exporter. Where the
tested logic lives.

**Handoff.** The shared mutable object through which pipeline stages pass
values, declared in `src/browser/app.mts` and published on the global object.
Distinct from the session handoff protocol in
[process/HANDOFF.md](../process/HANDOFF.md), which is unrelated and shares only
the word.

**Key colour.** The colour treated as background by the chroma key.

**Loop point.** The frame at which a clip returns to its beginning, chosen in
video preparation.

**Onion skin.** Overlaying the first frame semi-transparently over the current
one, so that a loop can be aligned by eye.

**Single executable application.** Node's mechanism for producing a standalone
binary, by injecting a preparation blob into a copy of the Node binary.

**Stage.** One of the four steps of the pipeline. Also the module implementing
it.

**Type stripping.** Node's removal of type annotations at load time, allowing
TypeScript to run without a build step. Requires Node 22.18 or newer, and is
why the server needs no compilation while the browser half does.
