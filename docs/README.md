# AS Adventurer Documentation

> A VTuber creation pipeline. TypeScript fork.

This documentation is a **knowledge graph** encoded in the file system. Each
file holds one concept. Navigate by following links from the section indexes.
It serves human readers and agentic assistants equally, and it is the external
memory an assistant reads in place of rediscovering the project each session.

## Sections

| Section | Path | Description |
|---|---|---|
| Architecture | [architecture/](./architecture/README.md) | How the application is put together |
| Process | [process/](./process/README.md) | Development workflow, communication, and handoff |
| Decisions | [decisions/](./decisions/README.md) | What was decided, and what is still open |
| Reference | [reference/](./reference/README.md) | Terminology |

## Quick reference

| If the question is | Start here |
|---|---|
| What is this project for | [architecture/PRODUCT_BRIEF.md](./architecture/PRODUCT_BRIEF.md) |
| How the stages fit together | [architecture/PIPELINE.md](./architecture/PIPELINE.md) |
| Why there are five TypeScript projects | [architecture/PROJECT_STRUCTURE.md](./architecture/PROJECT_STRUCTURE.md) |
| How the core, platform, and entry layers are separated | [architecture/LAYERING.md](./architecture/LAYERING.md) |
| How to build the standalone binary | [architecture/PROJECT_STRUCTURE.md](./architecture/PROJECT_STRUCTURE.md) |
| What a resuming session does first | [process/HANDOFF.md](./process/HANDOFF.md) |
| How human and assistant communicate | [process/COMMUNICATION.md](./process/COMMUNICATION.md) |
| What counts as verified | [process/VERIFICATION.md](./process/VERIFICATION.md) |
| Mistakes already made here | [process/AGENT_PITFALLS.md](./process/AGENT_PITFALLS.md) |
| Why something is the way it is | [decisions/RESOLVED.md](./decisions/RESOLVED.md) |
| What is unresolved | [decisions/OPEN.md](./decisions/OPEN.md) |
| What a term means | [reference/GLOSSARY.md](./reference/GLOSSARY.md) |

## Conventions

Every file opens with an upward navigation link to its section index. Every
directory carries a `README.md` acting as its table of contents. Files hold one
concept, so that an assistant loads what it needs rather than the whole
specification.

Documents state what is true and what is not verified. A claim that outruns its
evidence is worse than a narrower claim, because it is believed.
