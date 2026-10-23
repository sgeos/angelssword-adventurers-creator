# AGENTS.md

Guidance for AI coding assistants working in this repository. Despite the
conventional filename used by some tools, the content is agent-agnostic.

## Which tool reads what

- **Codex** loads this file. It does not load `CLAUDE.md`, so every rule a
  session must obey is stated here rather than only linked.
- **Grok Build** loads both this file and `CLAUDE.md` from the repository root,
  per its own documentation, and loads them at startup only once the folder is
  trusted. The two files therefore must not disagree, and they are checked
  against the tree by `test/integration/api/agent-docs.test.mts`.
- **Claude Code** loads `CLAUDE.md`.

The per-session protocol and the process documents under `docs/process/` name
no tool-specific features and apply to all three.

## Authoritative source

Project context, conventions, and the per-session protocol live in
[`CLAUDE.md`](./CLAUDE.md) and in the knowledge graph under
[`docs/`](./docs/README.md). Read `CLAUDE.md` before any non-trivial change.

## Reading order for a new session

1. [`CLAUDE.md`](./CLAUDE.md) for conventions.
2. [`docs/process/HANDOFF.md`](./docs/process/HANDOFF.md) and run its validity
   check.
3. [`docs/process/AGENT_PITFALLS.md`](./docs/process/AGENT_PITFALLS.md). Short,
   and every entry is a mistake actually made here.
4. [`docs/process/TASKLOG.md`](./docs/process/TASKLOG.md) for current state.
5. [`docs/process/REVERSE_PROMPT.md`](./docs/process/REVERSE_PROMPT.md), the
   block above the supersession line.

Then stop and wait for a prompt.

## Quick orientation

A VTuber asset pipeline in a single page, with a local server proxying two
external services. Four stages, communicating through a shared handoff object.
TypeScript throughout, a hard fork of a JavaScript upstream that is dormant.

## Conventions likely to be got wrong on a first attempt

- **The configuration is stricter than most.** `any`, type assertions,
  non-null assertions, and `eslint-disable` comments are all rejected. A rule
  that obstructs is to be argued with, not routed around, because routing
  around it does not work.
- **Narrow by returning a value, not a predicate.** Type predicates are
  banned. A narrowing helper returns the narrowed value or `undefined`.
- **Element types come from the markup.** Read the tag in
  `public/index.html`. Inferring an element type from an identifier has
  already produced five runtime failures here.
- **Three layers, and the direction is enforced.** `src/core/` is portable and
  compiles without the Document Object Model and without the node types. A
  capability it needs is an interface in `src/core/ports/` that a platform
  implements. Lint bans `Math.random`, `Date.now` and `new Date` there, since no
  compiler setting can. `localStorage` and `fetch` are reachable only from their
  named adapters in `src/platform-browser/`. Nothing imports
  `src/entry-browser/`. Pure logic belongs in the core, where tests reach it.
- **The server needs no build. The browser half does.** `src/<layer>/*.mts`
  compiles to `public/js/<layer>/*.mjs`. Editing the compiled output is
  pointless, and a path written by hand into documentation or a build file is
  the most common way this repository has broken.
- **Node 22.18 or newer**, which is what native type stripping requires.
- **Verify by exit code.** Grepping output for the word error has already
  reported a broken configuration as clean.
- **A sandbox can make correct code look broken.** The proxy tests and the
  browser specifications bind local ports. Under a sandbox that forbids it, every
  one fails with `listen EPERM`, which is the sandbox and not the server.
  `npm ci` and the Playwright browser download also need network access. Report
  such a run as not executed rather than as failing, and say which restriction
  caused it. Continuous integration runs the same suites unsandboxed. On
  macOS, Chromium also needs a system service that Claude Code's sandbox
  withholds even when port binding is allowed, so the browser specifications
  need the sandbox lifted there.
- **Never commit `secret/` or `tmp/` contents.** Both carry a tracked
  `.gitkeep` and ignore everything else.
- **No commits or pushes without explicit authorisation**, even when the work
  is finished.

## Build, test, lint

```sh
npm install
npm start              # builds the browser half, then serves on port 3001
npm run check          # typecheck across five projects, then lint
npm test               # unit and application programming interface tests
npm run test:browser   # browser specifications, rebuilding first
npm run test:all       # all of the above
node build-exe.mts     # standalone binary for the host platform
```

Use `npm run test:browser`, never a bare `npx playwright test`, which reuses a
running server and skips the rebuild. Full verification before considering work
complete is `npm run test:all`. Continuous integration additionally builds the
container and the Linux and Windows binaries and fetches from each. See
[`docs/process/VERIFICATION.md`](./docs/process/VERIFICATION.md) for what the
word means here.

## Documentation entry points

| Section | Path |
|---|---|
| Graph root | [`docs/`](./docs/README.md) |
| Architecture | [`docs/architecture/`](./docs/architecture/README.md) |
| Process | [`docs/process/`](./docs/process/README.md) |
| Decisions | [`docs/decisions/`](./docs/decisions/README.md) |
| Reference | [`docs/reference/`](./docs/reference/README.md) |
