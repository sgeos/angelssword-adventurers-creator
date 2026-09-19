import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countingClock, scriptedHttp, type ScriptedReply } from '../helpers/fake-http.mts';
import { INSTANT_CLOCK } from '../../src/core/ports/clock.mts';
import {
    COMFY_PROXY_ROUTE,
    runWorkflow,
    uploadReference,
    uploadedName,
} from '../../src/core/comfyui-run.mts';
import type { BuiltWorkflow } from '../../src/core/comfyui-core.mts';

/**
 * The first tests this sequence has ever had.
 *
 * It was written twice, in two modules that each need a browser, so neither
 * copy was reachable from a node test. Inverting the network and the clock is
 * what made it one function and made that function assertable, which is the
 * coverage argument for the layering stated concretely.
 *
 * A poll loop is the clearest case for an injected clock. The video path
 * waits three seconds between two hundred attempts, so the timeout below
 * describes ten minutes of real waiting and runs in microseconds.
 */

const BUILT: BuiltWorkflow = {
    workflow: { '9': { class_type: 'SaveImage', inputs: {} } },
    saveNodeId: '9',
};

const BASE = 'http://127.0.0.1:8188';

/** A history answer in which the save node reports one image. */
const historyWith = (promptId: string, filename: string): Record<string, unknown> => ({
    [promptId]: { outputs: { '9': { images: [{ filename, subfolder: '', type: 'output' }] } } },
});

const QUEUED: ScriptedReply = { status: 200, body: { prompt_id: 'p1' } };

const run = async (
    replies: readonly ScriptedReply[],
    over: Partial<Parameters<typeof runWorkflow>[2]> = {},
): ReturnType<typeof runWorkflow> => {
    const { http } = scriptedHttp(replies);
    return runWorkflow(http, INSTANT_CLOCK, {
        baseUrl: BASE,
        built: BUILT,
        pollIntervalMs: 1_000,
        maxPolls: 5,
        ...over,
    });
};

describe('uploadedName', () => {
    it('reads the name ComfyUI assigned, which may differ from the one sent', () => {
        assert.equal(uploadedName({ name: 'renamed_00001_.png' }), 'renamed_00001_.png');
    });

    it('reports nothing for a body that carries no usable name', () => {
        for (const body of [undefined, null, 42, 'text', {}, { name: '' }, { name: 7 }, []]) {
            assert.equal(uploadedName(body), undefined, JSON.stringify(body ?? null));
        }
    });
});

describe('uploadReference', () => {
    it('posts the image through the proxy and returns the assigned name', async () => {
        const { http, calls } = scriptedHttp([{ status: 200, body: { name: 'ref_1.png' } }]);
        const name = await uploadReference(http, BASE, 'data:image/png;base64,AAA', 'sent.png');

        assert.equal(name, 'ref_1.png');
        assert.equal(calls.length, 1);
        const call = calls[0];
        assert.ok(call !== undefined);
        assert.equal(call.url, COMFY_PROXY_ROUTE);
        assert.equal(call.method, 'POST', 'the proxy is always reached by POST');
        assert.equal(call.path, '/upload/image');
        assert.equal(call.upstreamMethod, 'POST', 'and asks the proxy to POST upstream');
        assert.equal(call.baseUrl, BASE);
        assert.deepEqual(call.payload, { image: 'data:image/png;base64,AAA', filename: 'sent.png' });
    });

    it('reports nothing when ComfyUI refuses the upload', async () => {
        const { http } = scriptedHttp([{ status: 500, body: { error: 'nope' } }]);
        assert.equal(await uploadReference(http, BASE, 'data:x', 'f.png'), undefined);
    });

    it('reports nothing when the upload succeeds but names nothing', async () => {
        const { http } = scriptedHttp([{ status: 200, body: {} }]);
        assert.equal(await uploadReference(http, BASE, 'data:x', 'f.png'), undefined);
    });
});

describe('runWorkflow, the happy path', () => {
    it('queues, polls until the image appears, then retrieves its bytes', async () => {
        const payload = new Uint8Array(new ArrayBuffer(3));
        payload.set([1, 2, 3]);
        const { http, calls } = scriptedHttp([
            QUEUED,
            { status: 200, body: {} },
            { status: 200, body: historyWith('p1', 'out_1.png') },
            { status: 200, bytes: payload },
        ]);

        const outcome = await runWorkflow(http, INSTANT_CLOCK, {
            baseUrl: BASE,
            built: BUILT,
            pollIntervalMs: 1_000,
            maxPolls: 5,
        });

        // assert.equal carries an `asserts actual is T` signature, so this
        // narrows the union and the bytes are reachable without a re-check.
        assert.equal(outcome.kind, 'image');
        assert.deepEqual([...outcome.bytes], [1, 2, 3]);
        assert.deepEqual(calls.map((c) => c.path), [
            '/prompt',
            '/history/p1',
            '/history/p1',
            '/view?filename=out_1.png&subfolder=&type=output',
        ]);
    });

    it('sends the built graph, not the pair that carries it', async () => {
        const { http, calls } = scriptedHttp([
            QUEUED,
            { status: 200, body: historyWith('p1', 'o.png') },
            { status: 200 },
        ]);
        await runWorkflow(http, INSTANT_CLOCK, {
            baseUrl: BASE, built: BUILT, pollIntervalMs: 1, maxPolls: 3,
        });
        assert.deepEqual(calls[0]?.payload, { prompt: BUILT.workflow });
    });

    it('reports each poll with its attempt number and cumulative wait', async () => {
        const seen: (readonly [number, number])[] = [];
        const { http } = scriptedHttp([
            QUEUED,
            { status: 200, body: {} },
            { status: 200, body: {} },
            { status: 200, body: historyWith('p1', 'o.png') },
            { status: 200 },
        ]);
        await runWorkflow(http, INSTANT_CLOCK, {
            baseUrl: BASE,
            built: BUILT,
            pollIntervalMs: 3_000,
            maxPolls: 9,
            onPoll: (attempt, elapsedMs) => { seen.push([attempt, elapsedMs]); },
        });
        assert.deepEqual(seen, [[1, 3_000], [2, 6_000], [3, 9_000]]);
    });

    it('waits the requested interval before every poll and never before the queue', async () => {
        const { clock, waits } = countingClock();
        const { http } = scriptedHttp([
            QUEUED,
            { status: 200, body: {} },
            { status: 200, body: historyWith('p1', 'o.png') },
            { status: 200 },
        ]);
        await runWorkflow(http, clock, {
            baseUrl: BASE, built: BUILT, pollIntervalMs: 2_500, maxPolls: 9,
        });
        assert.deepEqual(waits, [2_500, 2_500], 'two polls, two waits, none before queueing');
    });
});

describe('runWorkflow, outcomes that are not errors', () => {
    it('gives up after the requested number of polls', async () => {
        const replies: ScriptedReply[] = [QUEUED];
        for (let i = 0; i < 5; i++) replies.push({ status: 200, body: {} });
        const outcome = await run(replies);
        assert.deepEqual(outcome, { kind: 'timedOut', attempts: 5 });
    });

    it('stops before the first wait when the caller has already cancelled', async () => {
        const { clock, waits } = countingClock();
        const { http, calls } = scriptedHttp([QUEUED]);
        const outcome = await runWorkflow(http, clock, {
            baseUrl: BASE,
            built: BUILT,
            pollIntervalMs: 1_000,
            maxPolls: 5,
            isCancelled: () => true,
        });
        assert.deepEqual(outcome, { kind: 'cancelled' });
        assert.deepEqual(waits, [], 'a cancelled run must not wait');
        assert.equal(calls.length, 1, 'only the queue call should have been made');
    });

    it('stops after a wait when the caller cancels during it', async () => {
        let cancelled = false;
        const clock = {
            now: () => 0,
            sleep: async (): Promise<void> => { cancelled = true; await Promise.resolve(); },
        };
        const { http, calls } = scriptedHttp([QUEUED]);
        const outcome = await runWorkflow(http, clock, {
            baseUrl: BASE,
            built: BUILT,
            pollIntervalMs: 1_000,
            maxPolls: 5,
            isCancelled: () => cancelled,
        });
        assert.deepEqual(outcome, { kind: 'cancelled' });
        assert.equal(calls.length, 1, 'the poll after the wait must not have been made');
    });

    it('treats a failed poll as not-yet rather than as a failure', async () => {
        const outcome = await run([
            QUEUED,
            { status: 404, body: {} },
            { status: 500, body: {} },
            { status: 200, body: historyWith('p1', 'o.png') },
            { status: 200 },
        ]);
        assert.equal(outcome.kind, 'image');
    });

    it('treats a history without the save node as not-yet', async () => {
        const outcome = await run([
            QUEUED,
            { status: 200, body: { p1: { outputs: { '99': { images: [{ filename: 'x.png' }] } } } } },
            { status: 200, body: historyWith('p1', 'o.png') },
            { status: 200 },
        ]);
        assert.equal(outcome.kind, 'image');
    });
});

describe('runWorkflow, refusals that leave nothing to wait for', () => {
    it('throws the message ComfyUI supplied when the queue is refused', async () => {
        await assert.rejects(
            run([{ status: 400, body: { error: { message: 'node 9 is unknown' } } }]),
            /node 9 is unknown/,
        );
    });

    it('throws with the status when the refusal carries no message', async () => {
        await assert.rejects(run([{ status: 503, body: {} }]), /503/);
    });

    it('throws when the queue succeeds without a prompt id', async () => {
        await assert.rejects(run([{ status: 200, body: { queued: true } }]), /did not return a prompt id/);
    });

    it('throws when a body that is not JSON arrives with a refusal', async () => {
        // The status still decides; the unparsable body simply yields no
        // message, so the status text is what reaches the user.
        await assert.rejects(run([{ status: 502, body: '<html>bad gateway</html>' }]), /502/);
    });

    it('throws when the history promised an image that cannot be retrieved', async () => {
        await assert.rejects(
            run([
                QUEUED,
                { status: 200, body: historyWith('p1', 'o.png') },
                { status: 404 },
            ]),
            /could not be retrieved/,
        );
    });
});
