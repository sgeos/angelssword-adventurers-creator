/**
 * Standalone-binary builder — currently unavailable.
 *
 * The server is ESM TypeScript (server.mts). pkg 5.8.1 is the final
 * release, is archived upstream, and its Babel pass rejects
 * `import.meta`, so it can consume neither the source nor tsc's ESM
 * output. Verified: "import.meta may appear only with sourceType: module",
 * then "Failed to make bytecode node18-arm64".
 *
 * Two ways forward, neither a small edit:
 *
 *   1. Bundle server.mts to a single CommonJS file first, with esbuild or
 *      similar, and point pkg at that. Keeps a dependency that is archived.
 *   2. Move to Node's single executable applications feature, the
 *      maintained path. It also wants a CommonJS entry point, plus
 *      postject and a codesign step on macOS.
 *
 * The previous pkg implementation — target selection, launcher
 * generation, archiving, and the macOS ad-hoc signing step — is in git
 * history and is the starting point for either route. It is not kept here
 * as unreachable code behind this message.
 *
 * Nothing about the application requires a binary. `npm start` runs it on
 * every supported platform.
 */

console.error();
console.error("  A standalone binary cannot be built from the TypeScript server.");
console.error();
console.error("  pkg is archived and rejects ESM. See the note at the top of this");
console.error("  file for the two supported ways to restore this.");
console.error();
console.error("  To run the application:");
console.error();
console.error("      npm start");
console.error();
process.exit(1);
