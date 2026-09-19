#!/usr/bin/env node
/**
 * Build script: compiles AS Adventurer into a standalone binary for the
 * platform it is run on.
 *
 * Usage: node build-exe.mts
 *
 * Output goes to: dist/ASAdventurer/
 *   ├── ASAdventurer[.exe]
 *   ├── public/          (UI, including js/ compiled from src/browser)
 *   └── Start AS Adventurer.[bat|command|sh]
 *
 * ── How the binary is produced ──────────────────────────────────────────
 *
 * Node's single executable applications feature. The server is bundled to one
 * CommonJS file with esbuild, that bundle is turned into a preparation blob by
 * Node itself, and the blob is injected into a copy of the running Node binary
 * with postject.
 *
 * The bundling step exists because the source is ESM TypeScript and the
 * feature wants a CommonJS entry point. Two `import.meta` reads in the server
 * are substituted for their CommonJS equivalents by the --define flags below.
 *
 * This replaced a pkg-based build. pkg 5.8.1 is the final release and is
 * archived upstream, its Babel pass rejects `import.meta`, and its newest base
 * binary is Node 18, so a binary built with it ran an older runtime than the
 * one the project is developed and tested against. The feature used here is
 * maintained by the Node project and embeds whichever Node produced it.
 *
 * Neither approach cross-compiles. The binary is for the host platform, and
 * the BSDs are unsupported because Node publishes no build for them. `npm
 * start` works everywhere regardless.
 */
import { execFileSync, execSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

/** Output name and launcher flavour for one host platform. */
interface HostTarget {
  readonly binary: string;
  readonly launcher: "bat" | "command" | "sh";
}

/** Node publishes builds for these architectures on the desktop platforms. */
const ARCHES: Readonly<Record<string, string>> = { x64: "x64", arm64: "arm64" };
const ARCH: string | undefined = ARCHES[process.arch];

const HOSTS: Readonly<Record<string, HostTarget>> = {
  win32: { binary: "ASAdventurer.exe", launcher: "bat" },
  darwin: { binary: "ASAdventurer", launcher: "command" },
  linux: { binary: "ASAdventurer", launcher: "sh" },
};

const HOST: HostTarget | undefined = ARCH === undefined ? undefined : HOSTS[process.platform];

if (HOST === undefined) {
  console.error();
  console.error(`  No single executable build is supported for ${process.platform}/${process.arch}.`);
  console.error("  Run the application directly instead:");
  console.error();
  console.error("      npm start");
  console.error();
  process.exit(1);
}

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, "dist", "ASAdventurer");
const PUBLIC_SRC = path.join(ROOT, "public");
const PUBLIC_DEST = path.join(DIST, "public");
/** The CommonJS bundle pkg consumes. Build output, not a source file. */
const BUNDLE = path.join(ROOT, "dist", "server.bundle.cjs");

const log = (msg: string): void => { console.log(`  ${msg}`); };

/** Whether a command exists, for the POSIX archivers used further down. */
function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe", shell: "/bin/sh" });
    return true;
  } catch {
    return false;
  }
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

console.log();
console.log("  ============================================");
console.log("   ⚔️  AS Adventurer — Binary Builder");
console.log("  ============================================");
console.log();

// 1. Compile the browser half. The binary ships public/js, which is build
//    output; without this the packaged app would serve a stale bundle or none.
log("Building browser modules...");
execSync("npm run build:browser", { stdio: "inherit", cwd: ROOT });

// 2. Clean dist
log("Cleaning dist folder...");
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 3. Bundle the server to CommonJS for pkg. See the note at the top.
log("Bundling server.mts → CommonJS...");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes", "esbuild", "server.mts",
    "--bundle",
    "--platform=node",
    "--target=node18",
    "--format=cjs",
    // pkg's Node 18 base binary has no import.meta; these are the only two uses.
    "--define:import.meta.dirname=__dirname",
    "--define:import.meta.filename=__filename",
    `--outfile=${BUNDLE}`,
  ],
  { stdio: "inherit", cwd: ROOT },
);

// 4. Turn the bundle into a single executable preparation blob.
log("Preparing the single executable blob...");
const SEA_CONFIG = path.join(ROOT, "dist", "sea-config.json");
const SEA_BLOB = path.join(ROOT, "dist", "sea-prep.blob");
fs.writeFileSync(SEA_CONFIG, JSON.stringify({
  main: BUNDLE,
  output: SEA_BLOB,
  disableExperimentalSEAWarning: true,
}, null, 2));
execFileSync(process.execPath, ["--experimental-sea-config", SEA_CONFIG], {
  stdio: "inherit",
  cwd: ROOT,
});

// 5. Copy the running Node binary and inject the blob into it.
const ICON = path.join(ROOT, "icon.ico");
const BIN = path.join(DIST, HOST.binary);
log(`Building ${HOST.binary} from ${path.basename(process.execPath)} (${os.platform()}/${os.arch()}) ...`);
fs.copyFileSync(process.execPath, BIN);
fs.chmodSync(BIN, 0o755);

// An existing signature must come off before the binary is modified, and a
// fresh one goes back on afterwards. Only macOS enforces this.
if (process.platform === "darwin") {
  try {
    execFileSync("codesign", ["--remove-signature", BIN], { stdio: "pipe" });
  } catch {
    log("Note: no existing signature to remove.");
  }
}

// The fuse string is the sentinel Node itself looks for. It is fixed by the
// Node project rather than chosen here.
const postjectArgs = [
  "--yes", "postject", BIN, "NODE_SEA_BLOB", SEA_BLOB,
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];
if (process.platform === "darwin") postjectArgs.push("--macho-segment-name", "NODE_SEA");

try {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", postjectArgs, {
    stdio: "inherit",
    cwd: ROOT,
  });
} catch {
  console.error("\n  ❌ Injection failed. Make sure you have run: npm install");
  process.exit(1);
}

// Apple Silicon refuses to execute an unsigned binary outright, and the
// injection above invalidated whatever signature the copy carried. An ad-hoc
// signature costs nothing and makes the build runnable on this machine.
// This is NOT notarization. Another Mac will still quarantine the download
// unless the user clears the attribute, or the binary is signed with a
// Developer ID and notarized through Apple.
if (process.platform === "darwin") {
  try {
    execFileSync("codesign", ["--sign", "-", BIN], { stdio: "pipe" });
    log("Applied an ad-hoc signature (runs here; not notarized for others).");
  } catch {
    log("⚠️  codesign failed — the binary may be blocked on Apple Silicon.");
  }
}

// Windows resource editing, so the executable carries the project icon.
if (process.platform === "win32" && fs.existsSync(ICON)) {
  try {
    execFileSync("npx.cmd", ["--yes", "rcedit", BIN, "--set-icon", ICON], { stdio: "pipe" });
    log("Applied the application icon.");
  } catch {
    log("⚠️  rcedit failed — the executable will carry the default Node icon.");
  }
}

// 6. Copy public/, which now includes the compiled js/ from step 1
log("Copying public/ files...");
copyDirSync(PUBLIC_SRC, PUBLIC_DEST);

// 7. Launcher for the host platform
if (HOST.launcher === "bat") {
  fs.writeFileSync(path.join(DIST, "Start AS Adventurer.bat"),
`@echo off
echo.
echo  ============================================
echo   AS Adventurer - Starting...
echo  ============================================
echo.
echo  Open your browser to: http://localhost:3001
echo.
cd /d "%~dp0"
start http://localhost:3001
ASAdventurer.exe
pause
`);
} else {
  // Named .command so Finder will run it on a double-click. Harmless on
  // Linux, where it is an ordinary POSIX script.
  const launcher = path.join(DIST, `Start AS Adventurer.${HOST.launcher}`);
  fs.writeFileSync(launcher,
`#!/bin/sh
set -eu
cd "$(CDPATH='' cd -- "$(dirname "$0")" && pwd)"
printf '\\n  AS Adventurer\\n  Open your browser to: http://localhost:3001\\n\\n'
exec ./${HOST.binary}
`);
  fs.chmodSync(launcher, 0o755);
}

// 8. Icon alongside the binary for reference (Windows resource format)
if (process.platform === "win32" && fs.existsSync(ICON)) {
  fs.copyFileSync(ICON, path.join(DIST, "icon.ico"));
}

// 9. README
const README = path.join(ROOT, "README.md");
if (fs.existsSync(README)) {
  fs.copyFileSync(README, path.join(DIST, "README.md"));
  log("Included README.md");
}

// Remove the intermediates; none of them belong in the distribution.
fs.rmSync(BUNDLE, { force: true });
fs.rmSync(SEA_BLOB, { force: true });
fs.rmSync(SEA_CONFIG, { force: true });

// 11. Distributable archive
const ZIP_PATH = path.join(ROOT, "dist", "ASAdventurer.zip");
log("Creating distributable ZIP...");
try {
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${DIST}' -DestinationPath '${ZIP_PATH}' -Force"`,
      { stdio: "pipe" },
    );
  } else if (process.platform === "darwin" && hasCommand("ditto")) {
    // ditto preserves the executable bit and the ad-hoc signature, both of
    // which a plain zip round-trip can lose.
    execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", DIST, ZIP_PATH],
      { stdio: "pipe" });
  } else if (hasCommand("zip")) {
    execFileSync("zip", ["-r", "-q", "-y", ZIP_PATH, "ASAdventurer"],
      { stdio: "pipe", cwd: path.join(ROOT, "dist") });
  } else {
    throw new Error("no archiver found; install zip or archive dist/ASAdventurer by hand");
  }
  const zipSize = (fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(1);
  log(`Created ASAdventurer.zip (${zipSize} MB)`);
} catch (err) {
  log("⚠️  ZIP creation failed — you can zip manually");
  console.error(err instanceof Error ? err.message : String(err));
}

console.log();
log("✅ Build complete!");
console.log();
log(`Output: ${DIST}`);
log(`   ZIP: ${ZIP_PATH}`);
log("");
log("Contents:");
log(`  ${HOST.binary.padEnd(28)} — Double-click to run`);
log(`  ${`Start AS Adventurer.${HOST.launcher}`.padEnd(28)} — Launcher (opens browser automatically)`);
log("  README.md                    — Documentation");
log("  public/                      — UI files");
console.log();
log("Send ASAdventurer.zip to distribute!");
console.log();
