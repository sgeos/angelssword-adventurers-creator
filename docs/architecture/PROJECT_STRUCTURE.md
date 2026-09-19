# Project Structure

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

## The two halves

The server runs directly. Node strips the types as it loads `server.mts`, so
there is no build step and nothing to keep synchronised. This requires Node
22.18 or newer, which is the first release where type stripping works without
a flag.

The browser half is compiled, because no browser strips types. `src/` becomes
`public/js/`, one directory per layer, so `src/core/pixels.mts` becomes
`public/js/core/pixels.mjs` and `src/entry-browser/app.mts` becomes
`public/js/entry-browser/app.mjs`. `public/index.html` loads the five entry
modules from there. `npm start` builds first, so the application never serves a stale
bundle.

The layer segment in the emitted path is a consequence of the browser project
rooting at `src` rather than at one layer, which it must do because those
modules import the core and each other across layers.

## Five TypeScript projects

They differ in which global types each may see, and that separation is
enforced rather than assumed. A project is this codebase's equivalent of a
crate, and its `lib` and `types` settings are its manifest.

| Project | Covers | Sees |
|---|---|---|
| `tsconfig.core.json` | `src/core` | ECMAScript alone. Neither node nor the Document Object Model |
| `tsconfig.json` | Server and build scripts | Node, no Document Object Model |
| `tsconfig.browser.json` | `src/platform-browser`, `src/entry-browser` | Document Object Model, no node |
| `tsconfig.worker.json` | The two Web Workers and the encoder they drive | WebWorker, neither |
| `tsconfig.test.json` | Tests and the Playwright configuration | Everything |

The core project is the layering rule made executable and is described in
[LAYERING.md](./LAYERING.md). It emits nothing, existing to answer one
question, and it refused two modules the first time it was run.

The worker project exists because the WebWorker and Document Object Model
libraries both declare `self` and cannot be loaded together. Splitting it also
proved that the Graphics Interchange Format codec was not free of Document
Object Model dependencies, which is how a stray `document` reference in it was
found. The core project now makes the stronger claim about that codec, and the
worker project continues to make the narrower one, that it survives the
WebWorker library.

The browser and worker projects both compile the core sources they import, and
emit identical output for what they share. That overlap predates the core,
having already held for the shared encoder.

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
