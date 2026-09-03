#!/usr/bin/env node
/**
 * Build script: compiles AS Adventurer into a standalone binary for the
 * platform it is run on.
 *
 * Usage: node build-exe.js
 * Or on Windows, double-click: build-exe.bat
 *
 * Output goes to: dist/ASAdventurer/
 *   ├── ASAdventurer[.exe]
 *   ├── public/          (UI files: sprite-prep, video-prep, model-exporter)
 *   └── Start AS Adventurer.[bat|command|sh]
 *
 * pkg ships prebuilt base binaries for Windows, macOS, and Linux only. It
 * recognises a freebsd target name, but no binary is published for it and
 * pkg will not cross-build one, so on the BSDs this script refuses rather
 * than producing something broken. `npm start` works there regardless.
 *
 * pkg itself is archived upstream, which is why the targets stop at Node 18.
 * Node's own single executable applications feature is the eventual
 * replacement, and it will need the same macOS signing step handled below.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Host platform ────────────────────────────────
// pkg target triples, output name, and launcher flavour all follow from this.
const ARCH = { x64: 'x64', arm64: 'arm64' }[process.arch];
const HOST = !ARCH ? null : {
  win32:  { target: `node18-win-${ARCH}`,   binary: 'ASAdventurer.exe', launcher: 'bat' },
  darwin: { target: `node18-macos-${ARCH}`, binary: 'ASAdventurer',     launcher: 'command' },
  linux:  { target: `node18-linux-${ARCH}`, binary: 'ASAdventurer',     launcher: 'sh' }
}[process.platform];

if (!HOST) {
  console.error();
  console.error(`  pkg has no prebuilt target for ${process.platform}/${process.arch}.`);
  console.error('  Run the application directly instead:');
  console.error();
  console.error('      npm start');
  console.error();
  process.exit(1);
}

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist', 'ASAdventurer');
const PUBLIC_SRC = path.join(ROOT, 'public');
const PUBLIC_DEST = path.join(DIST, 'public');

// ── Helpers ──────────────────────────────────────
function log(msg) { console.log(`  ${msg}`); }

// Availability probe for POSIX archivers. Not used on Windows, which has
// PowerShell's Compress-Archive unconditionally.
function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe', shell: '/bin/sh' });
    return true;
  } catch (e) {
    return false;
  }
}

function copyDirSync(src, dest, exclude = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, []);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Main ─────────────────────────────────────────
console.log();
console.log('  ============================================');
console.log('   ⚔️  AS Adventurer — EXE Builder');
console.log('  ============================================');
console.log();

// 1. Check for pkg
log('Checking for pkg...');
try {
  execSync('npx --yes pkg --version', { stdio: 'pipe' });
} catch (e) {
  log('Installing pkg globally...');
  execSync('npm install -g pkg', { stdio: 'inherit' });
}

// 2. Clean dist
log('Cleaning dist folder...');
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 3. Compile the binary with pkg
log(`Compiling server.js → ${HOST.binary} (${HOST.target}) ...`);
const ICON = path.join(ROOT, 'icon.ico');
const BIN = path.join(DIST, HOST.binary);
const pkgCmd = [
  'npx --yes pkg',
  `"${path.join(ROOT, 'server.js')}"`,
  `--targets ${HOST.target}`,
  '--output', `"${BIN}"`,
  '--compress GZip',
  // --icon writes Windows PE resources and is rejected on other targets.
  (process.platform === 'win32' && fs.existsSync(ICON)) ? `--icon "${ICON}"` : ''
].filter(Boolean).join(' ');

try {
  execSync(pkgCmd, { stdio: 'inherit', cwd: ROOT });
} catch (e) {
  console.error('\n  ❌ pkg compilation failed! Make sure you have run: npm install');
  process.exit(1);
}

// 3b. Executable bit, and a signature on macOS
if (process.platform !== 'win32') {
  fs.chmodSync(BIN, 0o755);
}

// Apple Silicon refuses to execute an unsigned binary outright. An ad-hoc
// signature costs nothing and makes the build runnable on this machine.
// This is NOT notarization: another Mac will still quarantine the download
// unless the user clears the attribute, or the binary is signed with a
// Developer ID and notarized through Apple.
if (process.platform === 'darwin') {
  try {
    execSync(`codesign --force --sign - "${BIN}"`, { stdio: 'pipe' });
    log('Applied an ad-hoc signature (runs here; not notarized for others).');
  } catch (e) {
    log('⚠️  codesign failed — the binary may be blocked on Apple Silicon.');
  }
}

// 4. Copy public/ folder
log('Copying public/ files...');
copyDirSync(PUBLIC_SRC, PUBLIC_DEST, []);




// 6. Create a launcher for the host platform
if (HOST.launcher === 'bat') {
  fs.writeFileSync(path.join(DIST, 'Start AS Adventurer.bat'),
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
printf '\n  AS Adventurer\n  Open your browser to: http://localhost:3001\n\n'
exec ./${HOST.binary}
`);
  fs.chmodSync(launcher, 0o755);
}

// 7. Copy icon alongside the binary for reference (Windows resource format)
if (process.platform === 'win32' && fs.existsSync(ICON)) {
  fs.copyFileSync(ICON, path.join(DIST, 'icon.ico'));
}

// 8. Copy README
const README = path.join(ROOT, 'README.md');
if (fs.existsSync(README)) {
  fs.copyFileSync(README, path.join(DIST, 'README.md'));
  log('Included README.md');
}

// 9. Create distributable ZIP
const ZIP_PATH = path.join(ROOT, 'dist', 'ASAdventurer.zip');
log('Creating distributable ZIP...');
try {
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${DIST}' -DestinationPath '${ZIP_PATH}' -Force"`, { stdio: 'pipe' });
  } else if (process.platform === 'darwin' && hasCommand('ditto')) {
    // ditto preserves the executable bit and the ad-hoc signature, both of
    // which a plain zip round-trip can lose.
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${DIST}" "${ZIP_PATH}"`, { stdio: 'pipe' });
  } else if (hasCommand('zip')) {
    execSync(`zip -r -q -y "${ZIP_PATH}" "ASAdventurer"`, { stdio: 'pipe', cwd: path.join(ROOT, 'dist') });
  } else {
    throw new Error('no archiver found; install zip or archive dist/ASAdventurer by hand');
  }
  const zipSize = (fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(1);
  log(`Created ASAdventurer.zip (${zipSize} MB)`);
} catch (e) {
  log('⚠️  ZIP creation failed — you can zip manually');
  console.error(e.message);
}

// 10. Summary
console.log();
log('✅ Build complete!');
console.log();
log(`Output: ${DIST}`);
log(`   ZIP: ${ZIP_PATH}`);
log('');
log('Contents:');
log(`  ${HOST.binary.padEnd(28)} — Double-click to run`);
log(`  ${('Start AS Adventurer.' + HOST.launcher).padEnd(28)} — Launcher (opens browser automatically)`);
log('  README.md                    — Documentation');
log('  public/                      — UI files');
console.log();
log('Send ASAdventurer.zip to distribute!');
console.log();
