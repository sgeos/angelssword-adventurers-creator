# Verification

> **Navigation**: [Process](./README.md) | [Documentation Root](../README.md)

A task without verification is not complete. This document states what
verification means here, so that the phrase carries the same meaning for every
session.

## The full gate

```sh
npm run check          # typecheck across four projects, then lint
npm test               # unit and application programming interface tests
npx playwright test    # browser specifications
```

`npm run test:all` runs all three. The browser suite needs a browser, which
`npx playwright install chromium` supplies once.

## Rules

**Judge by exit code.** Grepping output for the word error misses
`SyntaxError:` and similar, and has already reported a broken configuration as
clean.

```sh
npm run check >/dev/null 2>&1 && echo PASS || echo FAIL
```

**Assert on test counts.** A suite that matches no files exits zero. The
current counts are 182 unit, 15 application programming interface, and 10
browser. A lower number means tests were removed or a glob stopped matching.

**Verify after the last edit.** Results from earlier in a session describe a
different tree.

**State what was not covered.** Five modules have no unit tests, the Windows
and Linux binary builds have never been run, and no stage has been exercised
against live keys. A report that omits these overstates its evidence.

## Continuous integration

`.github/workflows/verify.yml` runs the same three commands as three jobs on
push and pull request. Nothing in it is unique to continuous integration, so a
failure there reproduces locally with one command.

## Verifying the binary

The binary build is not covered by the gate above and must be exercised by
hand.

```sh
node build-exe.mts
(cd dist/ASAdventurer && PORT=3999 AS_NO_OPEN=1 ./ASAdventurer)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3999/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3999/js/app.mjs
```

Both requests should report 200. The second matters more than the first,
because it proves the compiled browser modules were built and packaged rather
than merely that the server started.
