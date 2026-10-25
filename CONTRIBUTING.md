# Contributing

Issues and pull requests are welcome. The project is on hold, so a response
may be slow. This file describes the workflow. The conventions and their
reasoning live in [`CLAUDE.md`](CLAUDE.md), which despite its name addresses
every contributor, and in [`docs/`](docs/README.md).

This repository is a hard fork of
[AngelsSwordStudios/angelssword-adventurers-creator](https://github.com/AngelsSwordStudios/angelssword-adventurers-creator),
converted to TypeScript. Contributions belong here rather than upstream, which
is dormant.

## Getting started

Node 22.18 or newer is required.

```sh
git clone https://github.com/sgeos/angelssword-adventurers-creator
cd angelssword-adventurers-creator
npm ci
npm ci --prefix mobile    # the gate typechecks the mobile application too
./scripts/check.sh        # repository hygiene, then typecheck eight projects and lint
npm test                  # unit and server tests
npm run test:browser      # browser specifications, rebuilding first
```

`scripts/check.sh` is the gate continuous integration runs. It checks the
repository's hygiene first, needing `python3` and `shellcheck`, then runs
`npm run check`. `git config core.hooksPath scripts/hooks` runs it before every
push. Use `npm run test:browser` rather than `npx playwright test`, which can
test a stale bundle. The full procedure, including what the gate does not cover, is
in [`docs/process/VERIFICATION.md`](docs/process/VERIFICATION.md).

## The rules most likely to surprise

- The configuration is strict. `any`, type assertions, non-null assertions,
  type predicates and `eslint-disable` comments are rejected. Argue with a rule
  rather than route around it.
- Logic that needs no platform belongs in `src/core/`, which compiles without
  the Document Object Model or Node's types and is where unit tests reach.
- Storage and the network each have one adapter, and lint rejects a second
  reach for either.
- `secret/` is never committed. `tmp/` is never committed beyond its
  `.gitkeep`.

[`docs/process/AGENT_PITFALLS.md`](docs/process/AGENT_PITFALLS.md) records
mistakes actually made in this repository, and is worth reading before a
change that touches many files.

## Branches and commits

`main` is the working line. Larger work happens on a branch cut from it and
merges back with `--no-ff`, so the merge records when a body of work arrived.
Force-pushing to `main` and deleting it are blocked. See
[`docs/process/GIT_STRATEGY.md`](docs/process/GIT_STRATEGY.md).

A commit message states what changed and, where that is not self-evident,
why. A message that records a verification result states what was actually
run. A defect found during other work is committed separately, and a refactor
does not carry a change in behaviour.

## Pull requests

Continuous integration runs the gate, the unit, server and browser tests,
bundles the mobile application, builds and runs the container, and builds the
standalone binary on Linux and Windows. A pull request should pass all of it.
State in the description what was verified and what was not.

## Conduct

Participation in the project's spaces follows the
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Contributions are judged on their
technical merits.

## Security

Report a vulnerability privately, as described in [`SECURITY.md`](SECURITY.md),
rather than in an issue.

## Licence

Contributions are made under the [MIT licence](LICENSE) that covers the
repository.
