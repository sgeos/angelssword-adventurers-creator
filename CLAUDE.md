# CLAUDE.md

Authoritative project context for agentic assistants. Agent-agnostic despite
the filename. [`AGENTS.md`](./AGENTS.md) points here.

## What this project is

A VTuber and PNGtuber asset pipeline, presented as a single page with four
stages, backed by a local server that proxies two external services. The
audience is streamers on modest hardware, and the stated value is that a
beginner can produce a model in minutes.

This repository is a **hard fork** of
`AngelsSwordStudios/angelssword-adventurers-creator`, converted to TypeScript
throughout. Upstream is dormant, with three commits in total, and adoption of
the conversion is not expected. The fork's `main` is the working line.

## Per-session protocol

Read [`docs/process/HANDOFF.md`](./docs/process/HANDOFF.md) and run its
validity check. Read [`docs/process/TASKLOG.md`](./docs/process/TASKLOG.md) and
the current block of
[`docs/process/REVERSE_PROMPT.md`](./docs/process/REVERSE_PROMPT.md). Then stop
and wait for a prompt.

On completing a task, update `TASKLOG.md` and rewrite the current block of
`REVERSE_PROMPT.md`. The full protocol is in
[`docs/process/COMMUNICATION.md`](./docs/process/COMMUNICATION.md).

Do not commit or push without explicit authorisation, even when work is
complete.

## Shape of the code

| Path | Contains |
|---|---|
| `server.mts` | Express server and the proxy. Runs directly, no build |
| `src/core/*.mts` | The portable core. No platform at all. Where tests reach |
| `src/platform-browser/*.mts` | Browser platform. The shell and the element helpers |
| `src/platform-worker/*.mts` | The two Web Workers |
| `src/entry-browser/*.mts` | The five entry points. Nothing imports these |
| `test/unit/` | Unit tests |
| `test/integration/` | Server and browser tests |
| `build-exe.mts` | Standalone binary build |
| `docs/` | Knowledge graph |

Five TypeScript projects separate which globals each layer may see. See
[`docs/architecture/PROJECT_STRUCTURE.md`](./docs/architecture/PROJECT_STRUCTURE.md)
and [`docs/architecture/LAYERING.md`](./docs/architecture/LAYERING.md).

## Conventions

**The configuration is deliberately strict.** `any`, type assertions,
non-null assertions, and `eslint-disable` comments are rejected.
`isolatedDeclarations` requires exported symbols to state their types. Two
narrow exemptions exist and each states its reasoning where declared. A rule
that obstructs is to be argued with rather than routed around, and routing
around it does not work.

**Narrowing returns a value.** Type predicates are banned, because a predicate
asserts a relationship the compiler must take on trust. A narrowing helper
returns the narrowed value or `undefined`.

**Types come from the source of truth.** Element types come from the tag in
`public/index.html`, never from what an identifier suggests.

**Pure logic belongs in the core.** If it needs no platform, it goes in
`src/core/`, which compiles without the Document Object Model and without the
node types, and where a test can reach it. A capability the core genuinely
needs becomes an interface the platform implements, never an import. The
compiler enforces the first half of that and `eslint.config.mjs` bans the
three ECMAScript facilities it cannot, namely `Math.random`, `Date.now`, and
`new Date`.

**Verification is by exit code**, and a claim states what was not covered. See
[`docs/process/VERIFICATION.md`](./docs/process/VERIFICATION.md).

**`secret/` and `tmp/` are never committed** beyond their tracked `.gitkeep`.

## Commands

```sh
npm start              # build the browser half, serve on port 3001
npm run check          # typecheck, then lint
npm test               # unit and application programming interface tests
npx playwright test    # browser specifications
npm run test:all       # everything
node build-exe.mts     # standalone binary for the host platform
```

Requires Node 22.18 or newer, which is what native type stripping demands.

## Before editing many files

Read [`docs/process/AGENT_PITFALLS.md`](./docs/process/AGENT_PITFALLS.md). It
is short, and every entry records a mistake made in this repository rather
than a hypothetical one.

## Open matters

Tracked in [`docs/decisions/OPEN.md`](./docs/decisions/OPEN.md). In brief,
five modules have no unit tests because they are coupled to a live canvas,
only the macOS binary has been built, and no stage has been exercised against
live keys.
