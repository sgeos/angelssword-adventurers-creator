# Project Structure

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

## The two halves

The server runs directly. Node strips the types as it loads `server.mts`, so
there is no build step and nothing to keep synchronised. This requires Node
22.18 or newer, which is the first release where type stripping works without
a flag.

The browser half is compiled, because no browser strips types.
`src/browser/*.mts` becomes `public/js/*.mjs`, which `public/index.html` loads
as modules. `npm start` builds it first, so the application never serves a
stale bundle.

## Four TypeScript projects

They differ in which global types each half may see, and that separation is
enforced rather than assumed.

| Project | Covers | Sees |
|---|---|---|
| `tsconfig.json` | Server and build scripts | Node, no Document Object Model |
| `tsconfig.browser.json` | `src/browser` | Document Object Model, no Node |
| `tsconfig.worker.json` | The two Web Workers | WebWorker, neither |
| `tsconfig.test.json` | Tests and the Playwright configuration | Both |

The worker project exists because the WebWorker and Document Object Model
libraries both declare `self` and cannot be loaded together. Splitting it also
proved that the Graphics Interchange Format codec was not free of Document
Object Model dependencies, which is how a stray `document` reference in it was
found.

## Strictness

`eslint.config.mjs` carries roughly two thirds of the enforcement, because
compiler settings alone cannot ban `any`, type assertions, or non-null
assertions. `isolatedDeclarations` requires every exported symbol to state a
type the compiler need not infer.

Type predicates are banned. Code that narrows an untrusted value returns the
narrowed value or `undefined` rather than asserting a relationship the compiler
must take on trust.

`eslint-disable` comments do not work, being disabled configuration-wide. A
rule that obstructs is to be argued with, not routed around. Two narrow
exemptions exist and each states its reasoning where it is declared.

## The binary

`node build-exe.mts` bundles the server to one CommonJS file with esbuild, has
Node turn that into a single executable preparation blob, and injects the blob
into a copy of the running Node binary with postject.

The bundling step exists because the source is an ECMAScript module and the
feature wants CommonJS. An earlier build used `pkg`, which is archived, rejects
`import.meta`, and shipped a Node 18 base binary, meaning the packaged
application ran an older runtime than the one it was tested against.
