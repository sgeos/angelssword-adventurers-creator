'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('path');

const {
    installMockFetch,
    resetMockFetch,
    mockFetchResponse,
    mockFetchReject,
    getFetchCalls,
    wasFetchCalled,
    getFormBodyString
} = require('../../helpers/mock-fetch');

// Install injectable fetch BEFORE loading the server module.
installMockFetch();
const serverPath = path.resolve(__dirname, '../../../server.js');
delete require.cache[serverPath];
const { app } = require('../../../server');

describe('AS Adventurer API characterization', () => {
    beforeEach(() => {
        resetMockFetch();
        installMockFetch();
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
        assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-test');
        assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(calls[0].options.body), payload);
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
        assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-bad');
        assert.deepEqual(JSON.parse(calls[0].options.body), payload);
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
        assert.equal(calls[0].url, 'https://api.openai.com/v1/images/edits');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-edit');

        const formBody = await getFormBodyString(calls[0].options.body);
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
            calls[0].url,
            'https://generativelanguage.googleapis.com/v1beta/interactions?key=google-secret'
        );
        assert.equal(calls[0].options.method, 'POST');
        assert.deepEqual(JSON.parse(calls[0].options.body), payload);
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
            calls[0].url,
            'https://generativelanguage.googleapis.com/v1beta/operations/op-123?key=poll-key'
        );
        assert.equal(calls[0].options.method, 'GET');
    });

    // --- 11: fetch reject → 502 Proxy error ---

    it('POST /api/generate fetch reject → 502 with /^Proxy error:/', async () => {
        mockFetchReject('socket hang up');

        const res = await request(app)
            .post('/api/generate')
            .set('Authorization', 'Bearer sk-test')
            .send({ prompt: 'x' });

        assert.equal(res.status, 502);
        assert.match(res.body.error, /^Proxy error:/);
    });

    it('POST /api/video/generate fetch reject → 502 with /^Proxy error:/', async () => {
        mockFetchReject('network down');

        const res = await request(app)
            .post('/api/video/generate')
            .set('x-api-key', 'k')
            .send({ model: 'x' });

        assert.equal(res.status, 502);
        assert.match(res.body.error, /^Proxy error:/);
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
        assert.match(res.headers['content-type'], /html/);
        assert.ok(typeof res.text === 'string' && res.text.length > 0);
        assert.match(res.text, /<!DOCTYPE html>|<html/i);
    });
});
