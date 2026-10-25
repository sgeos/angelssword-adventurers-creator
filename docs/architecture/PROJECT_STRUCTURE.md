# Project Structure

> **Navigation**: [Architecture](./README.md) | [Documentation Root](../README.md)

## The three parts

The server runs directly. Node strips the types as it loads `server.mts`, so
there is no build step and nothing to keep synchronised. This requires Node
22.18 or newer, which is the first release where type stripping works without
a flag.

The browser half is built, because no browser strips types. It is a React
application on Tamagui, built by TanStack Start on Vite in single-page mode.
The build prerenders the document shell once into `dist/client/index.html` and
bundles the application, the workers and their imports into hashed files in
`dist/client/assets/`. The files in `public/`, the fonts, logo, sounds and the
stage stylesheet, are copied beside them unchanged. The server serves
`dist/client/` as static files beside the proxy routes, so nothing is rendered
per request and the standalone binary carries the same files. `npm start`
builds first, so the application never serves a stale bundle.

TanStack Start's server bundle, `dist/server/`, exists only for that one
prerender and is never run. The reasons for each part of the build's
configuration are in `vite.config.mts`. How the page was moved onto this stack,
and what it does and does not change, is in [MIGRATION.md](./MIGRATION.md).

The mobile application, in `mobile/`, is an Expo package with its own
dependencies, kept out of the web build's install so that the page and the
server do not carry React Native. Metro bundles it, with the core, the shared
interface in `src/ui/` and the browser platform imported from `../src`, and the
fonts and sounds from `../public`. The four media stages run in a web view as
one Expo DOM component, `mobile/dom/Stages.tsx`, and the chrome and settings are
native. `mobile/metro.config.mts` and `mobile/babel-transformer.mts` give the
reasons for how the shared sources are resolved and transformed, and
[MIGRATION.md](./MIGRATION.md) gives what has been verified on a device.

Anything left in `public/` ships. A stale copy of the previous build's output
there once made the worker specifications pass against files the application
no longer used.

## Eight TypeScript projects

They differ in which global types each may see, and that separation is
enforced rather than assumed. A project is this codebase's equivalent of a
crate, and its `lib` and `types` settings are its manifest.

| Project | Covers | Sees |
|---|---|---|
| `tsconfig.core.json` | `src/core` | ECMAScript alone. Neither node nor the Document Object Model |
| `tsconfig.json` | Server and build scripts | Node, no Document Object Model |
| `tsconfig.browser.json` | `src/platform-browser` | Document Object Model, no node, no framework |
| `tsconfig.app.json` | `src/entry-browser`, the web page, and `src/ui`, the interface it shares | Document Object Model, JSX, React, Tamagui, TanStack |
| `tsconfig.worker.json` | The two Web Workers and the encoder they drive | WebWorker, neither |
| `tsconfig.tools.json` | `vite.config.mts`, and Metro's configuration and transformer in `mobile/` | Node and the Document Object Model |
| `tsconfig.test.json` | Tests and the Playwright configuration | Everything |
| `mobile/tsconfig.json` | The mobile application, and the shared code it imports | Document Object Model, JSX, React Native, Expo, Tamagui |

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

None of the projects emits. Vite builds the browser half, and the projects
exist to check it. The browser project's claim is that the platform compiles
with the Document Object Model and nothing else, and checks it with
third-party declarations included. The application project sees the frameworks
and argues, in its header, the two settings it relaxes: third-party
declaration checks, which fail inside Tamagui, React Native and TanStack and
nowhere in this code, and `isolatedDeclarations`, which protects modules that
others import and so has nothing to protect in a layer nothing imports. The
tools project relaxes the first of those for the same reason, for the two
bundlers' configurations alone.

The mobile project relaxes the same two settings as the application project,
and argues them in its header. It sees the Document Object Model because the
DOM component and the shared code need it, which means native code could name
a browser global and still compile. `eslint.config.mjs` refuses those globals
in `mobile/app/`, where they would fail on the phone. Its packages resolve from
`mobile/node_modules` for every file, the shared ones included, as Metro
resolves them, so the shared interface is checked against the copy of React
the phone runs. `npm run typecheck` checks it, so the gate needs
`npm ci --prefix mobile` first, and continuous integration runs both installs.

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
exemptions existed before the port and each states its reasoning where it is
declared. The port added the project settings above and one lint exclusion,
the generated route tree, named exactly so that a new generated file elsewhere
is still linted.

## The binary

`node build-exe.mts` builds the page, bundles the server to one CommonJS file
with esbuild, has Node turn that into a single executable preparation blob, and
injects the blob into a copy of the running Node binary with postject. The
page, `dist/client/`, is copied to a `public/` folder beside the executable,
which is where the server looks when it runs as one.

The bundling step exists because the source is an ECMAScript module and the
feature wants CommonJS. An earlier build used `pkg`, which is archived, rejects
`import.meta`, and shipped a Node 18 base binary, meaning the packaged
application ran an older runtime than the one it was tested against.
