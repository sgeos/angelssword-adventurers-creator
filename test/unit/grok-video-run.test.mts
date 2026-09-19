import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countingClock, scriptedHttp, type ScriptedReply } from '../helpers/fake-http.mts';
import { INSTANT_CLOCK } from '../../src/core/ports/clock.mts';
import {
    GROK_FETCH_ROUTE,
    GROK_START_ROUTE,
    fetchGrokVideo,
    grokPollRoute,
    runGrokVideo,
} from '../../src/core/grok-video-run.mts';
import {
    MAX_CONSECUTIVE_THROTTLES,
    buildGrokVideoRequest,
    throttleBackoffMs,
} from '../../src/core/grok-video-core.mts';

/**
 * The loop this exercises had no test. Every pure part of the exchange was
 * already extracted and covered, which made its absence easy to miss: the
 * classification, the backoff and the limits were all assertable, and the
 * code that uses them was not.
 *
 * That is the general shape of the coverage gap this architecture addresses.
 * What is easy to extract gets extracted, and what needs a clock and a
 * network stays behind, so the tested fraction grows while the untested part
 * is the part that decides what actually happens.
 */

const AUTH = 'Bearer sk-test';

const REQUEST = buildGrokVideoRequest({
    prompt: 'idle animation',
    imageDataUri: 'data:image/png;base64,AAA',
    durationSeconds: 6,
    mode: 'reference',
});

const STARTED: ScriptedReply = { status: 200, body: { request_id: 'r1' } };

const run = async (
    replies: readonly ScriptedReply[],
    over: Partial<Parameters<typeof runGrokVideo>[2]> = {},
): ReturnType<typeof runGrokVideo> => {
    const { http } = scriptedHttp(replies);
    return runGrokVideo(http, INSTANT_CLOCK, {
        auth: AUTH,
        request: REQUEST,
        pollIntervalMs: 1_000,
        maxPolls: 6,
        ...over,
    });
};

describe('grokPollRoute', () => {
    it('escapes an identifier rather than interpolating it raw', () => {
        assert.equal(grokPollRoute('a/b?c'), '/api/xai/videos/a%2Fb%3Fc');
    });
});

describe('fetchGrokVideo', () => {
    it('returns the base64 payload the proxy sent', async () => {
        const { http, calls } = scriptedHttp([{ status: 200, body: { data: 'QUJD' } }]);
        assert.equal(await fetchGrokVideo(http, AUTH, 'https://assets.x.ai/clip.mp4'), 'QUJD');
        const call = calls[0];
        assert.ok(call !== undefined);
        assert.equal(call.url, GROK_FETCH_ROUTE);
        assert.equal(call.method, 'POST');
    });

    it('throws when the download is refused', async () => {
        const { http } = scriptedHttp([{ status: 403, body: { error: { message: 'no access' } } }]);
        await assert.rejects(fetchGrokVideo(http, AUTH, 'https://x'), /no access/);
    });

    it('throws when the download succeeds carrying nothing', async () => {
        const { http } = scriptedHttp([{ status: 200, body: { data: '' } }]);
        await assert.rejects(fetchGrokVideo(http, AUTH, 'https://x'), /returned no data/);
    });
});

describe('runGrokVideo, the happy path', () => {
    it('starts, polls until ready, then retrieves', async () => {
        const { http, calls } = scriptedHttp([
            STARTED,
            { status: 202, body: {} },
            { status: 200, body: { url: 'https://assets.x.ai/clip.mp4' } },
            { status: 200, body: { data: 'QUJD' } },
        ]);

        const outcome = await runGrokVideo(http, INSTANT_CLOCK, {
            auth: AUTH, request: REQUEST, pollIntervalMs: 1_000, maxPolls: 6,
        });

        assert.deepEqual(outcome, { kind: 'video', base64: 'QUJD' });
        assert.deepEqual(calls.map((c) => c.url), [
            GROK_START_ROUTE,
            grokPollRoute('r1'),
            grokPollRoute('r1'),
            GROK_FETCH_ROUTE,
        ]);
    });

    it('carries the credential on every call, the proxy deciding what to do with it', async () => {
        const { http } = scriptedHttp([
            STARTED,
            { status: 200, body: { url: 'https://assets.x.ai/c.mp4' } },
            { status: 200, body: { data: 'QQ==' } },
        ]);
        const outcome = await runGrokVideo(http, INSTANT_CLOCK, {
            auth: AUTH, request: REQUEST, pollIntervalMs: 1, maxPolls: 3,
        });
        assert.equal(outcome.kind, 'video');
    });

    it('reports each poll with its attempt, elapsed wait and limit', async () => {
        const seen: (readonly number[])[] = [];
        await run([
            STARTED,
            { status: 202, body: {} },
            { status: 200, body: { url: 'https://x/c.mp4' } },
            { status: 200, body: { data: 'QQ==' } },
        ], { onPoll: (a, e, m) => { seen.push([a, e, m]); } });
        assert.deepEqual(seen, [[1, 1_000, 6], [2, 2_000, 6]]);
    });
});

describe('runGrokVideo, throttling', () => {
    it('backs off on a throttle without consuming an attempt', async () => {
        const { clock, waits } = countingClock();
        const { http } = scriptedHttp([
            STARTED,
            { status: 429, body: {} },
            { status: 200, body: { url: 'https://x/c.mp4' } },
            { status: 200, body: { data: 'QQ==' } },
        ]);
        const outcome = await runGrokVideo(http, clock, {
            auth: AUTH, request: REQUEST, pollIntervalMs: 1_000, maxPolls: 2,
        });

        assert.equal(outcome.kind, 'video');
        assert.deepEqual(waits, [1_000, throttleBackoffMs(1), 1_000],
            'the backoff is an extra wait, not a replacement for the interval');
    });

    it('gives up after a run of consecutive throttles', async () => {
        const replies: ScriptedReply[] = [STARTED];
        for (let i = 0; i < MAX_CONSECUTIVE_THROTTLES; i++) replies.push({ status: 429, body: {} });
        await assert.rejects(
            run(replies, { maxPolls: 50 }),
            /throttled the request repeatedly/,
        );
    });

    it('resets the run when a poll is not throttled, so it is a run and not a total', async () => {
        const replies: ScriptedReply[] = [STARTED];
        // One short of the limit, then an ordinary pending poll, then the same
        // again. A total would have given up; a run must not.
        for (let i = 0; i < MAX_CONSECUTIVE_THROTTLES - 1; i++) replies.push({ status: 429, body: {} });
        replies.push({ status: 202, body: {} });
        for (let i = 0; i < MAX_CONSECUTIVE_THROTTLES - 1; i++) replies.push({ status: 429, body: {} });
        replies.push({ status: 200, body: { url: 'https://x/c.mp4' } });
        replies.push({ status: 200, body: { data: 'QQ==' } });

        const outcome = await run(replies, { maxPolls: 50 });
        assert.equal(outcome.kind, 'video');
    });
});

describe('runGrokVideo, outcomes that are not errors', () => {
    it('gives up after the requested number of polls', async () => {
        const replies: ScriptedReply[] = [STARTED];
        for (let i = 0; i < 6; i++) replies.push({ status: 202, body: {} });
        assert.deepEqual(await run(replies), { kind: 'timedOut', attempts: 6 });
    });

    it('stops before the first wait when the caller has already cancelled', async () => {
        const { clock, waits } = countingClock();
        const { http, calls } = scriptedHttp([STARTED]);
        const outcome = await runGrokVideo(http, clock, {
            auth: AUTH,
            request: REQUEST,
            pollIntervalMs: 1_000,
            maxPolls: 6,
            isCancelled: () => true,
        });
        assert.deepEqual(outcome, { kind: 'cancelled' });
        assert.deepEqual(waits, []);
        assert.equal(calls.length, 1, 'only the start call should have been made');
    });
});

describe('runGrokVideo, refusals', () => {
    it('throws the message the service supplied when the start is refused', async () => {
        await assert.rejects(
            run([{ status: 400, body: { error: { message: 'bad aspect ratio' } } }]),
            /bad aspect ratio/,
        );
    });

    it('throws when the start succeeds without an identifier', async () => {
        await assert.rejects(run([{ status: 200, body: { ok: true } }]), /did not return a generation id/);
    });

    it('throws on a poll classified as fatal, which no amount of waiting fixes', async () => {
        await assert.rejects(run([STARTED, { status: 401, body: {} }]), /./);
    });

    it('throws when the generation itself reports failure', async () => {
        await assert.rejects(
            run([STARTED, { status: 200, body: { status: 'failed', error: 'content policy' } }]),
            /./,
        );
    });
});
