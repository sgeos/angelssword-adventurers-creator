# AGENTS.md

Guidance for AI coding assistants working in this repository. Despite the
conventional filename used by some tools, the content is agent-agnostic.

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
- **The server needs no build. The browser half does.** `src/**/*.mts`
  compiles to `public/js/*.mjs`. Editing the compiled output is pointless.
- **Node 22.18 or newer**, which is what native type stripping requires.
- **Verify by exit code.** Grepping output for the word error has already
  reported a broken configuration as clean.
- **Never commit `secret/` or `tmp/` contents.** Both carry a tracked
  `.gitkeep` and ignore everything else.
- **No commits or pushes without explicit authorisation**, even when the work
  is finished.

## Build, test, lint

```sh
npm install
npm start              # builds the browser half, then serves on port 3001
npm run check          # typecheck across four projects, then lint
npm test               # unit and application programming interface tests
npx playwright test    # browser specifications
npm run test:all       # all of the above
```

Full verification before considering work complete is `npm run test:all`. See
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
