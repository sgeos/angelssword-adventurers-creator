# Security Policy

## Supported versions

There are no releases. `main` is the only supported line, and a fix lands
there. The project is on hold, so a response may be slower than usual.

## Reporting a vulnerability

Please report a security issue privately, so that a fix can be prepared before
public disclosure. Open a private security advisory at
https://github.com/sgeos/angelssword-adventurers-creator/security/advisories/new.
Please do not open a public issue for one.

Include enough to reproduce it.

- The commit under inspection, from `git rev-parse HEAD`.
- How the application was run, whether the web page with `npm start`, the
  standalone binary, the container, or the mobile application, and on which
  platform.
- A minimal demonstration, such as the request sent to the local server and
  its response.
- The expected and the observed behaviour, and your assessment of severity.

The issue will be acknowledged, then either confirmed or explained as outside
the scope below. A confirmed issue is fixed on `main` and the reporter is
credited in the advisory unless they prefer otherwise.

## Trust model

The application handles API keys for paid services, so the boundaries that
keep those keys from going anywhere but their provider are the ones that
matter most. They are described in full in
[`docs/architecture/LAYERING.md`](docs/architecture/LAYERING.md) and
[`docs/decisions/OPEN.md`](docs/decisions/OPEN.md).

- **Keys are held on the user's own device.** The web page keeps them in the
  browser's local storage, and the mobile application in the platform's
  secure store. Neither sends a key anywhere except through the proxy.
- **The proxy is a fixed planner, not an open relay.** Every route is planned
  by `src/core/proxy.mts`, which the server and the mobile application both
  run. It addresses OpenAI, Google and xAI only at their fixed `https:`
  origins, fetches xAI assets only from xAI's hosts, and accepts a ComfyUI
  address only on loopback or a private network range.
- **The local server grants no other origin.** It sends no cross-origin
  headers and reads only JSON bodies, so a page on another site cannot drive
  the proxy through the user's browser. Upstream granted every origin; that
  was removed on 2026-10-25.
- **The local server has no authentication.** It listens on every network
  interface. Whoever can reach its port can use the proxy, and, when keys are
  supplied through `OPENAI_API_KEY`, `GOOGLE_API_KEY` or `XAI_API_KEY`, can
  spend them. That is intended for a shared deployment and is the operator's
  responsibility to place behind a network boundary. Do not set environment
  keys on a machine whose port is reachable by people who should not use them.

## Scope

In scope:

- A request through the proxy that reaches a host other than the planned
  provider origins, or a ComfyUI address outside loopback and the private
  ranges.
- A key sent anywhere other than its own provider, or written to a log, a
  file, or a tracked part of the repository.
- A browser-supplied key or an environment key disclosed to a client that did
  not supply it.
- A way for a web page on another origin to use the local server's proxy
  through the user's browser, including by rebinding a domain name, which is
  known to be open and recorded in `docs/decisions/OPEN.md`.
- A layering or capability ban that fails to hold, where it would let one of
  the above occur.

Not security issues, and welcome as ordinary issues:

- A provider rejecting a valid request, or a generation of poor quality.
- Anyone who can reach the server's port using it, when that exposure was
  chosen by the operator, as described under the trust model.
- Vulnerabilities in Expo's development tooling that do not reach the built
  application; those already known are recorded in
  [`docs/process/GIT_STRATEGY.md`](docs/process/GIT_STRATEGY.md).
