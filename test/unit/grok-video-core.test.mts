import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_DURATION_SECONDS,
    MIN_DURATION_SECONDS,
    buildGrokVideoRequest,
    classifyPoll,
    describeError,
    isQuotaRefusal,
    extractRequestId,
    extractVideoUrl,
    throttleBackoffMs,
} from '../../src/core/grok-video-core.mts';

const DATA_URI = 'data:image/png;base64,AAAA';

describe('buildGrokVideoRequest', () => {
    it('carries every field the service requires', () => {
        const body = buildGrokVideoRequest({ prompt: 'idle sway', imageDataUri: DATA_URI, durationSeconds: 6 });
        assert.equal(body.model, 'grok-imagine-video-1.5');
        assert.equal(body.prompt, 'idle sway');
        assert.equal(body.image.url, DATA_URI);
        assert.equal(body.duration, 6);
        assert.equal(body.aspect_ratio, '16:9');
        assert.equal(body.resolution, '720p');
    });

    it('clamps the duration into the accepted range', () => {
        // Outside this range the service answers 422.
        assert.equal(buildGrokVideoRequest({ prompt: 'x', imageDataUri: DATA_URI, durationSeconds: 0 }).duration, MIN_DURATION_SECONDS);
        assert.equal(buildGrokVideoRequest({ prompt: 'x', imageDataUri: DATA_URI, durationSeconds: -4 }).duration, MIN_DURATION_SECONDS);
        assert.equal(buildGrokVideoRequest({ prompt: 'x', imageDataUri: DATA_URI, durationSeconds: 99 }).duration, MAX_DURATION_SECONDS);
    });

    it('truncates a fractional duration and defaults a non-finite one', () => {
        assert.equal(buildGrokVideoRequest({ prompt: 'x', imageDataUri: DATA_URI, durationSeconds: 7.8 }).duration, 7);
        assert.equal(buildGrokVideoRequest({ prompt: 'x', imageDataUri: DATA_URI, durationSeconds: NaN }).duration, 6);
    });

    it('prefixes the prompt in keyframe mode only', () => {
        const key = buildGrokVideoRequest({ prompt: 'sway', imageDataUri: DATA_URI, durationSeconds: 6, mode: 'keyframe' });
        assert.match(key.prompt, /^Starting from this image as the first frame/);
        assert.match(key.prompt, /sway$/);
        const plain = buildGrokVideoRequest({ prompt: 'sway', imageDataUri: DATA_URI, durationSeconds: 6, mode: 'loop' });
        assert.equal(plain.prompt, 'sway');
    });
});

describe('extractRequestId', () => {
    it('reads every shape the service has been seen to return', () => {
        assert.equal(extractRequestId({ request_id: 'a' }), 'a');
        assert.equal(extractRequestId({ id: 'b' }), 'b');
        assert.equal(extractRequestId({ requestId: 'c' }), 'c');
        assert.equal(extractRequestId({ data: { request_id: 'd' } }), 'd');
        assert.equal(extractRequestId({ data: { id: 'e' } }), 'e');
    });

    it('prefers the outer forms over the nested ones', () => {
        assert.equal(extractRequestId({ request_id: 'outer', data: { id: 'inner' } }), 'outer');
    });

    it('yields undefined when no identifier is present', () => {
        for (const bad of [{}, null, undefined, 'text', 42, { request_id: '' }, { data: {} }]) {
            assert.equal(extractRequestId(bad), undefined);
        }
    });
});

describe('extractVideoUrl', () => {
    it('reads every shape the service has been seen to return', () => {
        assert.equal(extractVideoUrl({ video: { url: 'a' } }), 'a');
        assert.equal(extractVideoUrl({ url: 'b' }), 'b');
        assert.equal(extractVideoUrl({ video_url: 'c' }), 'c');
        assert.equal(extractVideoUrl({ data: { video: { url: 'd' } } }), 'd');
        assert.equal(extractVideoUrl({ data: { url: 'e' } }), 'e');
        assert.equal(extractVideoUrl({ result: { video: { url: 'f' } } }), 'f');
    });

    it('yields undefined when absent', () => {
        for (const bad of [{}, null, { video: {} }, { url: '' }]) {
            assert.equal(extractVideoUrl(bad), undefined);
        }
    });
});

describe('classifyPoll', () => {
    it('treats 202 as work in progress', () => {
        assert.deepEqual(classifyPoll(202, {}), { kind: 'pending' });
    });

    it('treats throttling as retryable', () => {
        assert.deepEqual(classifyPoll(403, {}), { kind: 'throttled' });
        assert.deepEqual(classifyPoll(429, {}), { kind: 'throttled' });
    });

    /**
     * A PLAIN RATE LIMIT, which is the case that must keep retrying. This is
     * the shape a service sends when the caller is genuinely going too fast,
     * and a delay clears it.
     */
    it('retries a 429 that carries no quota marker', () => {
        const rateLimited = {
            error: {
                message: 'Rate limit reached for requests',
                type: 'requests',
                code: 'rate_limit_exceeded',
            },
        };
        assert.deepEqual(classifyPoll(429, rateLimited), { kind: 'throttled' });
    });

    /**
     * AN EXHAUSTED BALANCE WEARING THE SAME STATUS. Observed on OpenAI during
     * a live session, verbatim below. No delay clears it, so retrying spends
     * five requests across fifty-five seconds and then reports the wrong
     * reason.
     */
    it('refuses a 429 that carries a quota marker, since no delay clears it', () => {
        const exhausted = {
            error: {
                message: 'You have no credits remaining. Add credits to continue using the API.',
                type: 'insufficient_quota',
                code: 'insufficient_quota',
            },
        };
        const outcome = classifyPoll(429, exhausted);
        // assert.equal narrows the union, so `reason` is reachable directly.
        assert.equal(outcome.kind, 'fatal');
        assert.match(
            outcome.reason,
            /no credits remaining/,
            'the service own wording reaches the user, not ours',
        );
    });

    /**
     * 403 is deliberately unchanged. It probably wants the same treatment,
     * being a more common shape for a hard refusal than a transient one, but
     * that is a separate question and this pins the present answer.
     */
    it('still retries a 403 carrying a quota marker, the change being scoped to 429', () => {
        assert.deepEqual(
            classifyPoll(403, { error: { code: 'insufficient_quota' } }),
            { kind: 'throttled' },
        );
    });
});

describe('isQuotaRefusal', () => {
    it('recognises a marker in any of the three fields services use', () => {
        for (const field of ['code', 'type', 'status']) {
            assert.equal(isQuotaRefusal({ error: { [field]: 'insufficient_quota' } }), true, field);
        }
    });

    it('recognises the markers the observed services and Google use', () => {
        for (const marker of ['insufficient_quota', 'quota_exceeded', 'RESOURCE_EXHAUSTED']) {
            assert.equal(isQuotaRefusal({ error: { status: marker } }), true, marker);
        }
    });

    it('is case-insensitive, Google shouting its status codes', () => {
        assert.equal(isQuotaRefusal({ error: { status: 'RESOURCE_EXHAUSTED' } }), true);
    });

    it('reports nothing for a plain rate limit', () => {
        assert.equal(isQuotaRefusal({ error: { code: 'rate_limit_exceeded' } }), false);
    });

    it('reports nothing for a body that carries no error at all', () => {
        for (const body of [undefined, null, {}, 'text', 42, [], { error: null }]) {
            assert.equal(isQuotaRefusal(body), false, JSON.stringify(body ?? null));
        }
    });

    /**
     * THE HONEST LIMIT OF THIS CHECK, and the reason it is written down. The
     * message Google was observed sending says "Rate limit exceeded" with a
     * limit of zero, which is an entitlement refusal in throttling clothing.
     * It carries no structured marker in that text, so this returns false and
     * the loop retries.
     *
     * Matching the prose instead would catch that wording today and break on
     * the next one, in a path no test can exercise against the real service.
     * The waste is a minute and a misleading message. The alternative fails in
     * the worse direction, calling a genuine rate limit fatal.
     */
    it('does NOT recognise exhaustion reported only in prose', () => {
        const googleShaped = {
            error: {
                message: 'Rate limit exceeded for model gemini-omni-flash '
                    + '(limit: 0 input tokens per minute on Free Tier).',
            },
        };
        assert.equal(isQuotaRefusal(googleShaped), false);
    });

    it('treats an expired credential as fatal, since retrying cannot help', () => {
        const out = classifyPoll(401, {});
        assert.equal(out.kind, 'fatal');
    });

    it('treats a server error as transient', () => {
        assert.deepEqual(classifyPoll(500, {}), { kind: 'pending' });
        assert.deepEqual(classifyPoll(503, {}), { kind: 'pending' });
    });

    it('reports a URL as ready', () => {
        const out = classifyPoll(200, { status: 'completed', video: { url: 'https://x/v.mp4' } });
        assert.deepEqual(out, { kind: 'ready', url: 'https://x/v.mp4' });
    });

    it('accepts a URL with no status at all, which the service sometimes sends', () => {
        assert.deepEqual(classifyPoll(200, { url: 'https://x/v.mp4' }), { kind: 'ready', url: 'https://x/v.mp4' });
    });

    it('accepts every spelling of success', () => {
        for (const state of ['done', 'completed', 'succeeded', 'success', 'DONE', 'Completed']) {
            assert.equal(classifyPoll(200, { status: state, url: 'https://x/v.mp4' }).kind, 'ready', state);
        }
    });

    it('reports completion without a URL as a failure rather than hanging', () => {
        const out = classifyPoll(200, { status: 'completed' });
        assert.equal(out.kind, 'failed');
    });

    it('reports every spelling of failure', () => {
        for (const state of ['failed', 'error', 'cancelled', 'expired']) {
            assert.equal(classifyPoll(200, { status: state }).kind, 'failed', state);
        }
    });

    it('keeps polling on an unrecognised in-progress state', () => {
        assert.deepEqual(classifyPoll(200, { status: 'queued' }), { kind: 'pending' });
        assert.deepEqual(classifyPoll(200, {}), { kind: 'pending' });
    });

    it('reads state from either status or state', () => {
        assert.equal(classifyPoll(200, { state: 'failed' }).kind, 'failed');
    });

    it('treats an unexpected client error as a failure carrying its reason', () => {
        const out = classifyPoll(422, { error: { message: 'duration out of range' } });
        // assert.equal from node:assert/strict carries an assertion
        // signature, so this narrows the union and out.reason is reachable.
        assert.equal(out.kind, 'failed');
        assert.equal(out.reason, 'duration out of range');
    });
});

describe('describeError', () => {
    it('prefers a nested message, then a direct one', () => {
        assert.equal(describeError({ error: { message: 'nested' }, message: 'direct' }, 400), 'nested');
        assert.equal(describeError({ message: 'direct' }, 400), 'direct');
        assert.equal(describeError({ error: 'plain' }, 400), 'plain');
        assert.equal(describeError({ detail: 'detail' }, 400), 'detail');
    });

    it('falls back to the status when the body says nothing usable', () => {
        assert.match(describeError({}, 503), /503/);
        assert.match(describeError(null, 'timeout'), /timeout/);
    });
});

describe('throttleBackoffMs', () => {
    it('grows with consecutive throttles', () => {
        assert.equal(throttleBackoffMs(1), 3_000);
        assert.equal(throttleBackoffMs(3), 9_000);
        assert.ok(throttleBackoffMs(2) > throttleBackoffMs(1));
    });

    it('never returns zero, so a loop cannot spin', () => {
        assert.ok(throttleBackoffMs(0) > 0);
    });
});
