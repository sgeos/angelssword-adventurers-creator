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
| `src/platform-browser/*.mts` | Browser platform. The shell, tab and toast stores, element helpers |
| `src/platform-browser/stages/*.mts` | The four media stages' controllers |
| `src/platform-worker/*.mts` | The two Web Workers |
| `src/entry-browser/` | The React application on Tamagui and TanStack Start. Nothing imports it |
| `test/unit/` | Unit tests |
| `test/integration/` | Server and browser tests |
| `build-exe.mts` | Standalone binary build |
| `docs/` | Knowledge graph |

Seven TypeScript projects separate which globals each layer may see. See
[`docs/architecture/PROJECT_STRUCTURE.md`](./docs/architecture/PROJECT_STRUCTURE.md)
and [`docs/architecture/LAYERING.md`](./docs/architecture/LAYERING.md). The port
to Tamagui and TanStack Start is described in
[`docs/architecture/MIGRATION.md`](./docs/architecture/MIGRATION.md).

## Conventions

**The configuration is deliberately strict.** `any`, type assertions,
non-null assertions, and `eslint-disable` comments are rejected.
`isolatedDeclarations` requires exported symbols to state their types. Two
narrow exemptions exist and each states its reasoning where declared. The port
to Tamagui and TanStack Start added four, confined to where they are needed and
argued in the file that declares each: `tsconfig.app.json` skips third-party
declaration checks and `isolatedDeclarations` for the entry layer,
`tsconfig.tools.json` skips third-party declaration checks for the Vite
configuration, and `eslint.config.mjs` excludes the generated route tree by its
exact name. A rule that obstructs is to be argued with rather than routed
around, and routing around it does not work.

**Narrowing returns a value.** Type predicates are banned, because a predicate
asserts a relationship the compiler must take on trust. A narrowing helper
returns the narrowed value or `undefined`.

**Types come from the source of truth.** Element types come from the tag in
the component that renders the element, under `src/entry-browser/tabs/`, never
from what an identifier suggests.

**A stage component renders once.** The four media stages are memoized
components with no props. After they mount, a controller in
`src/platform-browser/stages/` owns their subtree, toggling classes and
rewriting contents, which a re-render would undo. Interface that is meant to
change belongs in React state, as the settings panel and the chrome are.

**Pure logic belongs in the core.** If it needs no platform, it goes in
`src/core/`, which compiles without the Document Object Model and without the
node types, and where a test can reach it. A capability the core genuinely
needs becomes an interface in `src/core/ports/` that the platform implements,
never an import. The compiler enforces the first half of that and
`eslint.config.mjs` bans the three ECMAScript facilities it cannot, namely
`Math.random`, `Date.now`, and `new Date`.

**A capability gets one adapter, and lint names it.** `localStorage` is
reachable only from `src/platform-browser/local-storage.mts`, and `fetch` only
from `http.mts` and `binary.mts`. A second reach for a capability that already
has an adapter has to be argued for.

**A protocol is core, not presentation.** A request sequence, a poll loop, or
a retry schedule goes in `src/core/*-run.mts` behind `HttpClient` and `Clock`,
never inline beside the progress bar it updates.

**Nothing imports an entry point.** `src/entry-browser/`, the React
application, is the top of the graph. Its components import each other; nothing
outside it imports them. Shared code belongs in the platform layer or the core.

**Verification is by exit code**, and a claim states what was not covered. See
[`docs/process/VERIFICATION.md`](./docs/process/VERIFICATION.md).

**`secret/` and `tmp/` are never committed** beyond their tracked `.gitkeep`.

## Commands

```sh
npm start              # build the browser half, serve on port 3001
npm run dev            # Vite's dev server; run the server on 3001 for /api
npm run check          # typecheck, then lint
npm test               # unit and application programming interface tests
npm run test:browser   # browser specifications, rebuilding first
npm run test:all       # everything
node build-exe.mts     # standalone binary for the host platform
```

Requires Node 22.18 or newer, which is what native type stripping demands.

Use `npm run test:browser` rather than `npx playwright test`. Playwright reuses
a server that is already running and then skips its own rebuild, so the bare
command can test a stale bundle and report regressions that are not there.

## Before editing many files

Read [`docs/process/AGENT_PITFALLS.md`](./docs/process/AGENT_PITFALLS.md). It
is short, and every entry records a mistake made in this repository rather
than a hypothetical one.

## Open matters

Tracked in [`docs/decisions/OPEN.md`](./docs/decisions/OPEN.md). In brief,
the four stage controllers have no unit tests because they are coupled to a
live canvas, though their wiring is covered by browser specifications and their
arithmetic lives in the core. Continuous integration builds the container and
the binary for Linux and Windows on every push, and macOS is built by hand.
OpenAI sprites and Gemini video have been run against live keys by the
operator. Grok and ComfyUI have not. The decisions awaiting the operator are
listed in the handoff.
