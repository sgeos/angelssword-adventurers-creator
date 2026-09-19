import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import {
    callAt,
    callBodyText,
    getFetchCalls,
    getFormBodyString,
    mockFetch,
    mockFetchReject,
    mockFetchResponse,
    resetMockFetch,
    wasFetchCalled,
} from '../../helpers/mock-fetch.mts';
import { createApp, isAllowedVideoUrl } from '../../../server.mts';

// The mock is a constructor argument, not a global. Nothing is patched and
// the production module has no seam to patch.
const app = createApp(mockFetch);

/**
 * The `error` string from a proxy error body. supertest types `res.body` as
 * `any`, so this narrows once rather than letting `any` spread through every
 * assertion that touches it.
 */
function errorText(body: unknown): string {
    if (typeof body !== 'object' || body === null || !('error' in body)) {
        throw new Error(`expected an error body, got ${JSON.stringify(body)}`);
    }
    const message: unknown = body.error;
    if (typeof message !== 'string') {
        throw new Error(`expected error to be a string, got ${typeof message}`);
    }
    return message;
}

describe('AS Adventurer API characterization', () => {
    beforeEach(() => {
        resetMockFetch();
    });

    // --- 1–2: Auth required on OpenAI proxies ---

    it('POST /api/generate without Authorization → 401 and fetch not called', async () => {
        const res = await request(app)
            .post('/api/generate')
            .send({ prompt: 'test' });

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'No Authorization header provided' });
        assert.equal(wasFetchCalled(), false);
    });

    it('POST /api/edits without Authorization → 401 and fetch not called', async () => {
        const res = await request(app)
            .post('/api/edits')
            .send({ prompt: 'test' });

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'No Authorization header provided' });
        assert.equal(wasFetchCalled(), false);
    });

    it('POST /api/chat without Authorization → 401 and fetch not called', async () => {
        const res = await request(app)
            .post('/api/chat')
            .send({ messages: [] });

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'No Authorization header provided' });
        assert.equal(wasFetchCalled(), false);
    });

    // --- 3–5: Video key / operationName validation ---

    it('POST /api/video/generate without key → 401', async () => {
        const res = await request(app)
            .post('/api/video/generate')
            .send({ model: 'x' });

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'No Google API key provided' });
        assert.equal(wasFetchCalled(), false);
    });

    it('POST /api/video/poll without key → 401', async () => {
        const res = await request(app)
            .post('/api/video/poll')
            .send({ operationName: 'operations/abc' });

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, { error: 'No Google API key provided' });
        assert.equal(wasFetchCalled(), false);
    });

    it('POST /api/video/poll with key but no operationName → 400', async () => {
        const res = await request(app)
            .post('/api/video/poll')
            .set('x-api-key', 'test-google-key')
            .send({});

        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { error: 'No operationName provided' });
        assert.equal(wasFetchCalled(), false);
    });

    // --- 6: /api/generate forwards JSON + Authorization ---

    it('POST /api/generate forwards JSON body and Authorization; status/body passthrough', async () => {
        const upstreamBody = { data: [{ url: 'https://example.com/img.png' }] };
        mockFetchResponse(201, upstreamBody);

        const payload = { model: 'gpt-image-1', prompt: 'a knight', n: 1, size: '1024x1024' };
        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', 'Bearer sk-test')
            .send(payload);

        assert.equal(res.status, 201);
        assert.deepEqual(res.body, upstreamBody);

        const calls = getFetchCalls();
        assert.equal(calls.length, 1);
        assert.equal(callAt().url, 'https://api.openai.com/v1/images/generations');
        assert.equal(callAt().method, 'POST');
        assert.equal(callAt().headers['Authorization'], 'Bearer sk-test');
        assert.equal(callAt().headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(callBodyText()), payload);
    });

    // --- 7: /api/chat forwards; non-2xx passthrough ---

    it('POST /api/chat forwards to chat completions; upstream non-2xx passthrough', async () => {
        const upstreamBody = { error: { message: 'invalid_api_key' } };
        mockFetchResponse(401, upstreamBody);

        const payload = {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'hi' }]
        };
        const res = await request(app)
            .post('/api/chat')
            .set('Authorization', 'Bearer sk-bad')
            .send(payload);

        assert.equal(res.status, 401);
        assert.deepEqual(res.body, upstreamBody);

        const calls = getFetchCalls();
        assert.equal(calls.length, 1);
        assert.equal(callAt().url, 'https://api.openai.com/v1/chat/completions');
        assert.equal(callAt().method, 'POST');
        assert.equal(callAt().headers['Authorization'], 'Bearer sk-bad');
        assert.deepEqual(JSON.parse(callBodyText()), payload);
    });

    // --- 8: /api/edits multipart conversion ---

    it('POST /api/edits converts to multipart with default model, labeled filename, ref0.png, data-URI strip', async () => {
        mockFetchResponse(200, { data: [{ b64_json: 'abc' }] });

        const tinyPngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
        const res = await request(app)
            .post('/api/edits')
            .set('Authorization', 'Bearer sk-edit')
            .send({
                prompt: 'edit me',
                images: [
                    tinyPngB64,
                    { label: 'character_reference', data: `data:image/png;base64,${tinyPngB64}` }
                ]
            });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { data: [{ b64_json: 'abc' }] });

        const calls = getFetchCalls();
        assert.equal(calls.length, 1);
        assert.equal(callAt().url, 'https://api.openai.com/v1/images/edits');
        assert.equal(callAt().method, 'POST');
        assert.equal(callAt().headers['Authorization'], 'Bearer sk-edit');

        const formBody = getFormBodyString(callAt().body);
        assert.match(formBody, /name="model"/);
        assert.match(formBody, /gpt-image-2/);
        assert.match(formBody, /filename="ref0\.png"/);
        assert.match(formBody, /filename="character_reference\.png"/);
        assert.doesNotMatch(formBody, /data:image\/png;base64/);
        assert.ok(formBody.includes('\x89PNG') || formBody.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('binary')));
    });

    // --- 9: /api/video/generate key from x-api-key ---

    it('POST /api/video/generate puts x-api-key into query string and forwards body', async () => {
        mockFetchResponse(200, { name: 'operations/xyz' });

        const payload = { model: 'omni-flash', contents: [{ role: 'user', parts: [{ text: 'go' }] }] };
        const res = await request(app)
            .post('/api/video/generate')
            .set('x-api-key', 'google-secret')
            .send(payload);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { name: 'operations/xyz' });

        const calls = getFetchCalls();
        assert.equal(calls.length, 1);
        assert.equal(
            callAt().url,
            'https://generativelanguage.googleapis.com/v1beta/interactions?key=google-secret'
        );
        assert.equal(callAt().method, 'POST');
        assert.deepEqual(JSON.parse(callBodyText()), payload);
    });

    // --- 10: /api/video/poll GET operation ---

    it('POST /api/video/poll GETs v1beta/${operationName}?key=…', async () => {
        mockFetchResponse(200, { done: true });

        const res = await request(app)
            .post('/api/video/poll')
            .set('x-api-key', 'poll-key')
            .send({ operationName: 'operations/op-123' });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { done: true });

        const calls = getFetchCalls();
        assert.equal(calls.length, 1);
        assert.equal(
            callAt().url,
            'https://generativelanguage.googleapis.com/v1beta/operations/op-123?key=poll-key'
        );
        assert.equal(callAt().method, 'GET');
    });

    // --- 11: fetch reject → 502 Proxy error ---

    it('POST /api/generate fetch reject → 502 with /^Proxy error:/', async () => {
        mockFetchReject('socket hang up');

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', 'Bearer sk-test')
            .send({ prompt: 'x' });

        assert.equal(res.status, 502);
        assert.match(errorText(res.body), /^Proxy error:/);
    });

    it('POST /api/video/generate fetch reject → 502 with /^Proxy error:/', async () => {
        mockFetchReject('network down');

        const res = await request(app)
            .post('/api/video/generate')
            .set('x-api-key', 'k')
            .send({ model: 'x' });

        assert.equal(res.status, 502);
        assert.match(errorText(res.body), /^Proxy error:/);
    });

    // --- 12: OPTIONS CORS ---

    it('OPTIONS → 200 + Access-Control-Allow-Origin *', async () => {
        const res = await request(app).options('/api/generate');

        assert.equal(res.status, 200);
        assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    // --- 13: GET / serves public/index.html ---

    it('GET / serves public/index.html (200, HTML)', async () => {
        const res = await request(app).get('/');

        assert.equal(res.status, 200);
        const contentType = res.headers['content-type'];
        assert.ok(contentType !== undefined, 'response carried no content-type');
        assert.match(contentType, /html/);
        assert.ok(typeof res.text === 'string' && res.text.length > 0);
        assert.match(res.text, /<!DOCTYPE html>|<html/i);
    });

    // --- xAI / Grok image generation ---

    it('POST /api/xai/images/generations forwards to xAI with the bearer key', async () => {
        mockFetchResponse(200, { data: [{ url: 'https://x.ai/img.png' }] });

        const res = await request(app)
            .post('/api/xai/images/generations')
            .set('Authorization', 'Bearer xai-test')
            .send({ prompt: 'a knight', n: 1, model: 'grok-2-image' });

        assert.equal(res.status, 200);
        assert.equal(callAt().url, 'https://api.x.ai/v1/images/generations');
        assert.equal(callAt().method, 'POST');
        assert.equal(callAt().headers['Authorization'], 'Bearer xai-test');
        assert.deepEqual(JSON.parse(callBodyText()), { prompt: 'a knight', n: 1, model: 'grok-2-image' });
    });

    it('POST /api/xai/images/generations rejects with 401 when no key is available', async () => {
        const res = await request(app)
            .post('/api/xai/images/generations')
            .send({ prompt: 'x', n: 1 });

        assert.equal(res.status, 401);
        assert.equal(wasFetchCalled(), false, 'no upstream call without a key');
    });

    it('POST /api/xai/images/generations passes an upstream non-2xx through unchanged', async () => {
        mockFetchResponse(422, { error: 'size is not supported' });

        const res = await request(app)
            .post('/api/xai/images/generations')
            .set('Authorization', 'Bearer xai-test')
            .send({ prompt: 'x', n: 1, size: '1024x1024' });

        assert.equal(res.status, 422);
        assert.match(res.text, /size is not supported/);
    });

    it('POST /api/xai/images/generations answers 502 when the upstream call rejects', async () => {
        mockFetchReject('network down');

        const res = await request(app)
            .post('/api/xai/images/generations')
            .set('Authorization', 'Bearer xai-test')
            .send({ prompt: 'x', n: 1 });

        assert.equal(res.status, 502);
        assert.match(errorText(res.body), /^Proxy error:/);
    });

    it('POST /api/xai/images/generations rejects a repeated Authorization header', async () => {
        // A repeated header arrives as an array. Reaching a string operation
        // with one is the defect that crashes the Gemini routes upstream.
        const res = await request(app)
            .post('/api/xai/images/generations')
            .set('Authorization', 'Bearer a')
            .set('Authorization', 'Bearer b')
            .send({ prompt: 'x', n: 1 });

        assert.ok(res.status === 401 || res.status === 200, `unexpected ${res.status.toString()}`);
        assert.notEqual(res.status, 502, 'must not crash into a 502');
    });

    it('POST /api/xai/images/generations falls back to XAI_API_KEY when no header is sent', async () => {
        // The environment path is what lets an operator run the tool for
        // others without each of them holding a key. Upstream pull request 1
        // introduced it for container deployments.
        const previous = process.env['XAI_API_KEY'];
        process.env['XAI_API_KEY'] = 'env-key';
        try {
            mockFetchResponse(200, { data: [] });
            const res = await request(app)
                .post('/api/xai/images/generations')
                .send({ prompt: 'x', n: 1 });

            assert.equal(res.status, 200);
            assert.equal(callAt().headers['Authorization'], 'Bearer env-key');
        } finally {
            if (previous === undefined) delete process.env['XAI_API_KEY'];
            else process.env['XAI_API_KEY'] = previous;
        }
    });

    it('prefers a request header over XAI_API_KEY, so a browser key never needs the environment', async () => {
        const previous = process.env['XAI_API_KEY'];
        process.env['XAI_API_KEY'] = 'env-key';
        try {
            mockFetchResponse(200, { data: [] });
            await request(app)
                .post('/api/xai/images/generations')
                .set('Authorization', 'Bearer header-key')
                .send({ prompt: 'x', n: 1 });

            assert.equal(callAt().headers['Authorization'], 'Bearer header-key');
        } finally {
            if (previous === undefined) delete process.env['XAI_API_KEY'];
            else process.env['XAI_API_KEY'] = previous;
        }
    });

    // --- xAI / Grok video ---

    it('POST /api/xai/videos/generations forwards the body to xAI', async () => {
        mockFetchResponse(200, { request_id: 'req-1' });
        const res = await request(app)
            .post('/api/xai/videos/generations')
            .set('Authorization', 'Bearer xai-test')
            .send({ model: 'grok-imagine-video-1.5', duration: 6 });

        assert.equal(res.status, 200);
        assert.equal(callAt().url, 'https://api.x.ai/v1/videos/generations');
        assert.deepEqual(JSON.parse(callBodyText()), { model: 'grok-imagine-video-1.5', duration: 6 });
    });

    it('GET /api/xai/videos/:id polls the generation by id', async () => {
        mockFetchResponse(202, {});
        const res = await request(app)
            .get('/api/xai/videos/req-1')
            .set('Authorization', 'Bearer xai-test');

        assert.equal(res.status, 202);
        assert.equal(callAt().url, 'https://api.x.ai/v1/videos/req-1');
        assert.equal(callAt().method, 'GET');
    });

    it('GET /api/xai/videos/:id escapes an id rather than splicing it into the path', async () => {
        mockFetchResponse(200, {});
        await request(app)
            .get('/api/xai/videos/' + encodeURIComponent('a/../../secret'))
            .set('Authorization', 'Bearer xai-test');

        assert.ok(!callAt().url.includes('/../'), `path traversal reached upstream: ${callAt().url}`);
    });
});

describe('xAI video fetch allowlist', () => {
    it('allows xAI hosts over https', () => {
        assert.equal(isAllowedVideoUrl('https://api.x.ai/v1/videos/a.mp4'), true);
        assert.equal(isAllowedVideoUrl('https://assets.x.ai/a.mp4'), true);
        assert.equal(isAllowedVideoUrl('https://cdn.assets.x.ai/a.mp4'), true);
    });

    it('refuses a host that merely ends with the allowed name', () => {
        // The credential must not follow a suffix-confusion address.
        assert.equal(isAllowedVideoUrl('https://x.ai.attacker.example/c'), false);
        assert.equal(isAllowedVideoUrl('https://notx.ai/a.mp4'), false);
        assert.equal(isAllowedVideoUrl('https://evilx.ai/a.mp4'), false);
    });

    it('refuses plaintext, so a credential is never sent unencrypted', () => {
        assert.equal(isAllowedVideoUrl('http://api.x.ai/a.mp4'), false);
    });

    it('refuses link-local and loopback addresses', () => {
        assert.equal(isAllowedVideoUrl('http://169.254.169.254/latest/meta-data/'), false);
        assert.equal(isAllowedVideoUrl('https://127.0.0.1/a.mp4'), false);
        assert.equal(isAllowedVideoUrl('https://localhost/a.mp4'), false);
    });

    it('refuses non-http schemes and malformed input', () => {
        for (const bad of ['file:///etc/passwd', 'ftp://api.x.ai/a', 'not a url', '', 'javascript:alert(1)']) {
            assert.equal(isAllowedVideoUrl(bad), false, `expected ${JSON.stringify(bad)} refused`);
        }
    });
});

describe('xAI video fetch route', () => {
    beforeEach(() => { resetMockFetch(); });

    it('refuses an address outside the allowlist without calling it', async () => {
        const res = await request(app)
            .post('/api/xai/video-fetch')
            .set('Authorization', 'Bearer xai-test')
            .send({ url: 'https://attacker.example/collect' });

        assert.equal(res.status, 400);
        assert.equal(wasFetchCalled(), false, 'the credential must not leave for an unlisted host');
    });

    it('fetches an allowed address and attaches the credential', async () => {
        mockFetchResponse(200, 'AAAA');
        const res = await request(app)
            .post('/api/xai/video-fetch')
            .set('Authorization', 'Bearer xai-test')
            .send({ url: 'https://assets.x.ai/v/a.mp4' });

        assert.equal(res.status, 200);
        assert.equal(callAt().url, 'https://assets.x.ai/v/a.mp4');
        assert.equal(callAt().headers['Authorization'], 'Bearer xai-test');
    });

    it('rejects a request with no url', async () => {
        const res = await request(app)
            .post('/api/xai/video-fetch')
            .set('Authorization', 'Bearer xai-test')
            .send({});
        assert.equal(res.status, 400);
        assert.equal(wasFetchCalled(), false);
    });
});
