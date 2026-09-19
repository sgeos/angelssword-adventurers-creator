# Resolved Decisions

> **Navigation**: [Decisions](./README.md) | [Documentation Root](../README.md)

Decisions taken and the reasoning behind them, so that a later session
inherits the argument rather than only the outcome. Newest first.

## Node single executable applications in place of pkg

`pkg` is archived, its final release rejects `import.meta`, and its newest base
binary is Node 18, so a packaged application ran an older runtime than the one
the project is tested against. Node's own feature is maintained and embeds
whichever Node produced it. The binary grew from 47 to 78 megabytes, because it
embeds a current Node and does not compress. The feature remains marked
experimental, which was accepted as the lesser risk against an archived tool.

## jsdom for tests, canvas deliberately absent

Adding a Document Object Model implementation was declined three times during
the conversion, on the grounds that a dependency was not a contributor's to
introduce, and taken once the fork had a maintainer. Canvas is not implemented,
because jsdom provides no two-dimensional context and a fake one would mean
asserting against a drawing surface that does nothing. Pixel work is tested
through the core modules, which take buffers.

## The key colour is read from the handoff root

First diagnosed as a feature never connected, which was wrong. The field is
assigned by sprite preparation in five places. The exporter was reading it from
`videoPrepData`, which has never carried it. The remedy was a corrected read.
The original diagnosis was formed from the converted code, where the branch had
already been removed as unreachable, rather than by tracing the field to its
producer.

## Ambient declarations confined to declaration files

`declare global` is banned outside `*.d.ts`, because such a declaration usually
fabricates a type for something the checker never sees. The one that exists
imports the type it declares from the module that publishes the value, so the
specifications stop compiling if the handoff shape changes.

## isolatedDeclarations enabled

Turning it on required removing `allowJs`, with which it is mutually
exclusive, and that was possible only once no JavaScript remained in scope.
Enabling it found four symbols relying on inference across a module boundary.
It moves a guarantee from the lint level to the compiler level, where it cannot
be suspended per file.

## The handoff singleton is published on the global object

ECMAScript modules create no globals, so four browser specifications broke when
the scripts became modules. The handoff is the documented boundary between
stages and the specifications assert on its shape, so it is published
deliberately, through `Object.defineProperty` rather than an assertion, since
the configuration bans both assertions and `declare global`. Nothing else is
global.

## Workers are modules, not strings

Two encoders lived in template literals compiled at runtime, placing roughly
150 lines of the most performance-sensitive code beyond the reach of any
checker, linter, or test. No configuration can inspect a string, so the only
remedy was to stop them being strings.
