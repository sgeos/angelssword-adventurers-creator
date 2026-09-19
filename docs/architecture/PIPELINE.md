# Pipeline

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

Four stages in one page, communicating through a shared object rather than
through a router or a store.

| Stage | Module | Produces |
|---|---|---|
| Sprite preparation | `src/browser/sprite-prep.mts` | A keyed sprite and the key colour |
| Video generation | `src/browser/video-gen.mts` | A generated clip |
| Video preparation | `src/browser/video-prep.mts` | A trimmed and looped clip |
| Model export | `src/browser/model-exporter.mts` | An animated Graphics Interchange Format image or WebM file |

## The handoff object

`ASAdventurer.handoff`, declared in `src/browser/app.mts`, carries values
between stages. It is the one piece of genuinely shared mutable state in the
application, and it is published on the global object deliberately, because the
browser specifications assert on its shape.

Two properties of it have caused defects and are worth stating.

**The key colour lives on the handoff root, not inside `videoPrepData`.**
Sprite preparation assigns `handoff.keyColor` as the user chooses a colour. The
exporter reads it from there. Reading it from `videoPrepData` was the original
defect, because that payload has never carried the field.

**`videoPrepData` is owned by video preparation.** Its shape is declared as
`HandoffPayload` in `video-prep-core.mts`, and a browser specification
characterises it. Adding a field that no producer assigns creates an
unreachable branch, which is how the key colour defect survived.

## Pure cores

Each stage has a sibling module holding the logic that needs no Document Object
Model, named `*-core.mts` or, for the exporter, `exporter-math.mts`. These are
where the tested logic lives. A stage module is the part that reads elements
and attaches listeners.

When adding logic to a stage, ask whether it needs the Document Object Model.
If it does not, it belongs in the core, where a test can reach it.
