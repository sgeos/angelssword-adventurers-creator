/**
 * Start the Express app in a child process for browser tests.
 *
 * Nothing imports this. It was written against a future in which server.js
 * grew an entry-point guard so tests could import the app without the
 * listen-and-open-a-browser path; that guard now exists in server.mts, but
 * playwright.config.ts uses Playwright's own webServer instead, which does
 * the same job with less machinery.
 *
 * Kept and converted rather than deleted, because deleting it is a judgement
 * call worth making deliberately. If it is still unreferenced next time
 * someone passes through here, delete it.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerOptions {
    readonly port?: number | string;
    readonly cwd?: string;
}

export interface RunningServer {
    readonly child: ChildProcess;
    readonly baseURL: string;
    readonly port: string;
    readonly stop: () => Promise<void>;
}

/** How long to wait for a graceful exit before SIGKILL. */
const SHUTDOWN_GRACE_MS = 3000;

export function startBrowserServer(opts: ServerOptions = {}): RunningServer {
    const port = String(opts.port ?? process.env['PORT'] ?? 3001);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const cwd = opts.cwd ?? path.resolve(here, '../..');
    const baseURL = `http://localhost:${port}`;

    const child = spawn(process.execPath, ['server.mts'], {
        cwd,
        env: { ...process.env, PORT: port },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    async function stop(): Promise<void> {
        if (child.killed) return;
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                // Already exited is fine; anything else we cannot act on here.
                try { child.kill('SIGKILL'); } catch { /* ignore */ }
                resolve();
            }, SHUTDOWN_GRACE_MS);
            child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    return { child, baseURL, port, stop };
}
