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

## Verifying the container

Also outside the gate, and for a while nothing verified it at all. The image
built, the tests passed, and the container exited at startup on a missing
module, because the runtime stage copied `server.mts` and `public/` while the
server had gained an import from `src/core/`. Two lists maintained by hand in
different files, with nothing checking that they agreed.

`test/integration/api/deployment.test.mts` now checks the agreement, and runs
inside `npm test`. It reads text rather than running anything, so it
establishes that the copied set covers the server's import graph and nothing
more. That the image starts is a separate claim, and only the steps below
support it.

```sh
docker build -t as-adventurer-check .
docker run -d --name as-check -p 3101:3001 as-adventurer-check
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/js/entry-browser/sprite-prep.mjs
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{}' http://127.0.0.1:3101/api/generate
docker rm -f as-check
```

Host port 3101 rather than 3001, because a development server is usually
already holding 3001 and the resulting bind failure looks like a fault in the
image. The container's own port is unchanged.

The first two should report 200. The second matters more, for the reason it
matters for the binary: it proves the browser modules were compiled in the
build stage and carried into the runtime stage.

The third should report 401, and a 404 there means the routes did not
register, which is the shape the missing-module failure took. Probing a route
name that does not exist also returns 404, so check the path against
`server.mts` before concluding anything from one.

Last exercised on 2026-09-30, on macOS with Docker 29.8.1: built, served the
page and the compiled modules, refused the proxy routes with 401 and 400, and
reported healthy. Not exercised on any other host platform.
