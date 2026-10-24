import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Starting the server on a port that is already taken.
 *
 * Express 5 changed `app.listen` to register its callback for the `error`
 * event as well as for listening. A callback that ignores its argument then
 * reports success when the bind failed: it prints that the server is running,
 * and without `AS_NO_OPEN` opens a browser on whatever else holds the port.
 * Express 4 never called the callback on error, and the unhandled `error`
 * event ended the process with a nonzero status.
 *
 * The test runs the real entry point in a child process, because the claim is
 * about what an operator sees and about the exit status, neither of which an
 * imported `createApp` exercises.
 */

const ROOT: string = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SERVER: string = join(ROOT, 'server.mts');

/** The longest the child may take to give up. Exceeding it fails the test. */
const EXIT_BUDGET_MS = 15_000;

/** Hold a port so the server cannot have it, on every interface it would use. */
const occupyPort = async (): Promise<Server> => {
    const blocker = createServer();
    await new Promise<void>((resolveListen, rejectListen) => {
        blocker.once('error', rejectListen);
        blocker.listen(0, () => { resolveListen(); });
    });
    return blocker;
};

const portOf = (server: Server): number => {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
    const info: AddressInfo = address;
    return info.port;
};

interface ChildOutcome {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

const runServer = async (port: number): Promise<ChildOutcome> => {
    const child = spawn(process.execPath, [SERVER], {
        cwd: ROOT,
        env: { ...process.env, PORT: port.toString(), AS_NO_OPEN: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    return new Promise<ChildOutcome>((resolveRun) => {
        // A server that did bind would never exit, so the budget ends the wait
        // and the null code it leaves fails the status assertion.
        const timer = setTimeout(() => { child.kill(); }, EXIT_BUDGET_MS);
        child.once('exit', (code) => {
            clearTimeout(timer);
            resolveRun({ code, stdout, stderr });
        });
    });
};

describe('Startup on an occupied port', () => {
    it('exits with a failure status and does not claim to be running', async () => {
        const blocker = await occupyPort();
        try {
            const outcome = await runServer(portOf(blocker));

            assert.notEqual(outcome.code, null, 'the server did not exit within the budget');
            assert.notEqual(outcome.code, 0, `exited 0; stdout: ${outcome.stdout}`);
            assert.ok(!outcome.stdout.includes('Server running'), `claimed to be running: ${outcome.stdout}`);
            assert.match(outcome.stderr, /EADDRINUSE/);
        } finally {
            await new Promise<void>((resolveClose) => { blocker.close(() => { resolveClose(); }); });
        }
    });
});
