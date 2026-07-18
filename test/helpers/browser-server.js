/**
 * Optional helper: start the Express app for browser tests.
 * Prefer Playwright webServer (`node server.js` with PORT) — this helper
 * exists if a future require.main guard lands and tests need to require
 * the app without the listen/auto-open path.
 *
 * Current main always listens + auto-opens a browser on listen; no
 * OPEN_BROWSER env is supported yet.
 */
const path = require('path');
const { spawn } = require('child_process');

/**
 * @param {{ port?: number|string, cwd?: string }} [opts]
 * @returns {{ child: import('child_process').ChildProcess, baseURL: string, stop: () => Promise<void> }}
 */
function startBrowserServer(opts = {}) {
  const port = String(opts.port || process.env.PORT || 3001);
  const cwd = opts.cwd || path.resolve(__dirname, '../..');
  const baseURL = `http://localhost:${port}`;

  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  async function stop() {
    if (child.killed) return;
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  return { child, baseURL, stop, port };
}

module.exports = { startBrowserServer };
