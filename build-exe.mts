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
 * ── Why there is a bundling step ────────────────────────────────────────
 *
 * The server is ESM TypeScript. pkg 5.8.1 is the final release, is archived
 * upstream, and its Babel pass rejects `import.meta`, so it can consume
 * neither server.mts nor tsc's ESM output.
 *
 * esbuild resolves that: it bundles the server and its dependencies into one
 * CommonJS file, substituting __dirname and __filename for the two
 * `import.meta` reads, which is what --define below does. pkg then has an
 * ordinary CommonJS entry point and is happy. The source stays idiomatic ESM;
 * only the binary target sees the CommonJS form.
 *
 * pkg remains archived. Node's own single executable applications feature is
 * the eventual replacement, and it wants exactly the same CommonJS bundle
 * this step already produces, so that migration starts from here.
 *
 * pkg ships prebuilt base binaries for Windows, macOS, and Linux only. It
 * recognises a freebsd target name, but publishes no binary for it and will
 * not cross-build one, so on the BSDs this script refuses rather than
 * producing something broken. `npm start` works there regardless.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** pkg target triple, output name, and launcher flavour for one host. */
interface HostTarget {
  readonly target: string;
  readonly binary: string;
  readonly launcher: "bat" | "command" | "sh";
}

/** pkg publishes base binaries for these two architectures only. */
const ARCHES: Readonly<Record<string, string>> = { x64: "x64", arm64: "arm64" };
const ARCH: string | undefined = ARCHES[process.arch];

const HOSTS: Readonly<Record<string, HostTarget>> = ARCH === undefined ? {} : {
  win32: { target: `node18-win-${ARCH}`, binary: "ASAdventurer.exe", launcher: "bat" },
  darwin: { target: `node18-macos-${ARCH}`, binary: "ASAdventurer", launcher: "command" },
  linux: { target: `node18-linux-${ARCH}`, binary: "ASAdventurer", launcher: "sh" },
};

const HOST: HostTarget | undefined = HOSTS[process.platform];

if (HOST === undefined) {
  console.error();
  console.error(`  pkg has no prebuilt target for ${process.platform}/${process.arch}.`);
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

// 4. Compile the binary with pkg
log(`Compiling → ${HOST.binary} (${HOST.target}) ...`);
const ICON = path.join(ROOT, "icon.ico");
const BIN = path.join(DIST, HOST.binary);
const pkgArgs = [
  "--yes", "pkg", BUNDLE,
  "--targets", HOST.target,
  "--output", BIN,
  "--compress", "GZip",
];
// --icon writes Windows PE resources and is rejected on other targets.
if (process.platform === "win32" && fs.existsSync(ICON)) pkgArgs.push("--icon", ICON);

try {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", pkgArgs, {
    stdio: "inherit",
    cwd: ROOT,
  });
} catch {
  console.error("\n  ❌ pkg compilation failed. Make sure you have run: npm install");
  process.exit(1);
}

// 5. Executable bit, and a signature on macOS
if (process.platform !== "win32") fs.chmodSync(BIN, 0o755);

// Apple Silicon refuses to execute an unsigned binary outright. An ad-hoc
// signature costs nothing and makes the build runnable on this machine.
// This is NOT notarization: another Mac will still quarantine the download
// unless the user clears the attribute, or the binary is signed with a
// Developer ID and notarized through Apple.
if (process.platform === "darwin") {
  try {
    execFileSync("codesign", ["--force", "--sign", "-", BIN], { stdio: "pipe" });
    log("Applied an ad-hoc signature (runs here; not notarized for others).");
  } catch {
    log("⚠️  codesign failed — the binary may be blocked on Apple Silicon.");
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

// 10. Remove the intermediate bundle; it is not part of the distribution.
fs.rmSync(BUNDLE, { force: true });

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
