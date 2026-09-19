# Open Questions

> **Navigation**: [Decisions](./README.md) | [Documentation Root](../README.md)

Matters not settled. Each states what would resolve it.

## Five modules have no unit tests

`model-exporter` at 1,642 lines, `sprite-prep` at 1,011, `video-prep` at 952,
`app` at 656, and `video-gen` at 470. All are coupled to `document` and to a
live canvas, which the test environment does not provide.

Two routes exist. Continue extracting pure logic into core modules, which is
slower but adds nothing. Or supply a canvas implementation, which reaches more
code at the cost of asserting against a surface whose fidelity is unknown.

## Neither the Windows nor the Linux binary has been built

Only macOS on arm64 has been exercised. Both paths are structurally unchanged
from an implementation that worked before the conversion, but neither has been
run since. Resolving this needs access to those platforms, or continuous
integration runners that build rather than merely test.

## No stage has been exercised against live keys

The account available had no remaining credit, so the generation stages were
tested only against mocked responses. The proxy is covered by the application
programming interface tests, but the round trip against a real service is not.

## No release has been cut

The binary is how a non-technical user obtains this tool, and at present the
only way to get one is to build it. A release would need the platform builds
above, or an honest statement that only macOS is published.

## The `test/fixtures/pixels` directory is empty

It holds a tracked `.gitkeep` and nothing else, the fixture it existed for
having been removed as unreferenced. Either a fixture returns or the directory
goes.
