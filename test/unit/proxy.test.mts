import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    NO_ENVIRONMENT,
    encodeMultipart,
    failureReply,
    isAllowedComfyRequest,
    isAllowedVideoUrl,
    normaliseComfyOrigin,
    planProxyRequest,
    shapeReply,
    type ProxyEnvironment,
    type ProxyPlan,
    type ProxyRequest,
    type UpstreamPlan,
    type UrlParser,
} from '../../src/core/proxy.mts';

/**
 * The proxy's decisions, tested where they are made.
 *
 * The API tests drive the Express server through these plans and pin every
 * status and message. These tests reach the planner directly, which is how a
 * phone runs it, with no server around it, so a route that works only because
 * Express did something for it would show here.
 *
 * The URL parser is node's, the one both platforms provide in practice.
 */

const nodeUrl: UrlParser = (raw) => {
    try {
        const url = new URL(raw);
        return { protocol: url.protocol, hostname: url.hostname, origin: url.origin };
    } catch {
        return undefined;
    }
};

const request = (overrides: Partial<ProxyRequest>): ProxyRequest => ({
    method: 'POST',
    path: '/api/generate',
    queryKey: undefined,
    authorization: undefined,
    apiKey: undefined,
    body: undefined,
    ...overrides,
});

const plan = (overrides: Partial<ProxyRequest>, env: ProxyEnvironment = NO_ENVIRONMENT): ProxyPlan =>
    planProxyRequest(request(overrides), env, nodeUrl);

/** The upstream request of a plan that forwards, or a failure naming what came back. */
const upstreamOf = (p: ProxyPlan): UpstreamPlan => {
    // assert.equal narrows the plan's kind, so no further check is needed.
    assert.equal(p.kind, 'forward', `expected a forward, got ${JSON.stringify(p)}`);
    return p.upstream;
};

const replyOf = (p: ProxyPlan): { status: number; body: Readonly<Record<string, unknown>> } => {
    assert.equal(p.kind, 'reply', `expected a reply, got ${JSON.stringify(p)}`);
    return p.reply;
};

describe('planProxyRequest: credentials', () => {
    it('refuses every keyed route that has no key, with the route\'s own message', () => {
        const cases: readonly (readonly [string, string, string])[] = [
            ['POST', '/api/generate', 'No Authorization header provided'],
            ['POST', '/api/edits', 'No Authorization header provided'],
            ['POST', '/api/chat', 'No Authorization header provided'],
            ['POST', '/api/xai/images/generations', 'No xAI API key provided'],
            ['POST', '/api/xai/videos/generations', 'No xAI API key provided'],
            ['GET', '/api/xai/videos/abc', 'No xAI API key provided'],
            ['POST', '/api/xai/video-fetch', 'No xAI API key provided'],
            ['POST', '/api/video/generate', 'No Google API key provided'],
            ['POST', '/api/video/poll', 'No Google API key provided'],
        ];
        for (const [method, path, message] of cases) {
            assert.deepEqual(replyOf(plan({ method, path })), { status: 401, body: { error: message } }, path);
        }
    });

    it('prefers the request header to the environment', () => {
        const env = { ...NO_ENVIRONMENT, openaiKey: 'from-env' };
        assert.equal(upstreamOf(plan({ authorization: 'Bearer from-header' }, env)).headers['Authorization'], 'Bearer from-header');
        assert.equal(upstreamOf(plan({}, env)).headers['Authorization'], 'Bearer from-env');
    });

    it('takes a Gemini key from the header, then the query, then the environment', () => {
        const env = { ...NO_ENVIRONMENT, googleKey: 'env' };
        const urlFor = (o: Partial<ProxyRequest>): string =>
            upstreamOf(plan({ path: '/api/video/generate', ...o }, env)).url;
        assert.match(urlFor({ apiKey: 'header', queryKey: 'query' }), /key=header$/);
        assert.match(urlFor({ queryKey: 'query' }), /key=query$/);
        assert.match(urlFor({}), /key=env$/);
    });
});

describe('planProxyRequest: forwarding', () => {
    it('forwards a JSON body unchanged, and an absent one as {}', () => {
        const withBody = upstreamOf(plan({ authorization: 'Bearer k', body: { prompt: 'x', n: 2 } }));
        assert.deepEqual(withBody.body, { kind: 'text', text: JSON.stringify({ prompt: 'x', n: 2 }) });
        const without = upstreamOf(plan({ authorization: 'Bearer k' }));
        assert.deepEqual(without.body, { kind: 'text', text: '{}' });
    });

    it('builds the image edit as multipart, with the default model and labelled files', () => {
        const p = plan({
            path: '/api/edits',
            authorization: 'Bearer k',
            body: { prompt: 'a knight', n: 1, images: ['data:image/png;base64,QUJD', { label: 'character_reference', data: 'REVG' }, 42] },
        });
        assert.equal(p.kind, 'forward');
        assert.deepEqual(p.warnings, ['entry 2 skipped: not a base64 string or { data }']);
        assert.equal(p.upstream.url, 'https://api.openai.com/v1/images/edits');
        const body = p.upstream.body;
        assert.equal(body?.kind, 'multipart');
        const fields = body.parts.filter((part) => part.kind === 'field').map((part) => [part.name, part.value]);
        assert.deepEqual(fields, [['model', 'gpt-image-2'], ['prompt', 'a knight'], ['n', '1']]);
        const files = body.parts.filter((part) => part.kind === 'file').map((part) => [part.filename, part.base64]);
        // The data-URI prefix is stripped; the label names the file.
        assert.deepEqual(files, [['ref0.png', 'QUJD'], ['character_reference.png', 'REVG']]);
    });

    it('refuses an image edit without a prompt or without an object body', () => {
        assert.deepEqual(replyOf(plan({ path: '/api/edits', authorization: 'Bearer k', body: { n: 1 } })), {
            status: 400,
            body: { error: 'prompt is required' },
        });
        assert.deepEqual(replyOf(plan({ path: '/api/edits', authorization: 'Bearer k', body: 'text' })), {
            status: 400,
            body: { error: 'Body must be a JSON object' },
        });
    });

    it('escapes a Grok generation id rather than splicing it into the path', () => {
        const u = upstreamOf(plan({ method: 'GET', path: `/api/xai/videos/${encodeURIComponent('a/../../secret')}`, authorization: 'Bearer k' }));
        assert.ok(!u.url.includes('/../'), u.url);
        assert.equal(u.url, `https://api.x.ai/v1/videos/${encodeURIComponent('a/../../secret')}`);
    });

    it('answers a malformed Grok generation id with a 400 rather than throwing', () => {
        assert.deepEqual(replyOf(plan({ method: 'GET', path: '/api/xai/videos/%E0%A4%A', authorization: 'Bearer k' })), {
            status: 400,
            body: { error: 'No generation id provided' },
        });
    });

    it('needs an operation name to poll Gemini', () => {
        assert.deepEqual(replyOf(plan({ path: '/api/video/poll', apiKey: 'g', body: {} })), {
            status: 400,
            body: { error: 'No operationName provided' },
        });
        assert.equal(
            upstreamOf(plan({ path: '/api/video/poll', apiKey: 'g', body: { operationName: 'operations/1' } })).url,
            'https://generativelanguage.googleapis.com/v1beta/operations/1?key=g',
        );
    });

    it('matches no route for an unknown path or the wrong method', () => {
        assert.deepEqual(plan({ path: '/api/nothing' }), { kind: 'no-route' });
        assert.deepEqual(plan({ method: 'GET', path: '/api/generate' }), { kind: 'no-route' });
        assert.deepEqual(plan({ method: 'GET', path: '/' }), { kind: 'no-route' });
    });
});

describe('planProxyRequest: the guards', () => {
    it('fetches a video with the credential only from xAI\'s hosts', () => {
        const fetchOf = (url: string): ProxyPlan =>
            plan({ path: '/api/xai/video-fetch', authorization: 'Bearer k', body: { url } });
        assert.equal(upstreamOf(fetchOf('https://assets.x.ai/v.mp4')).reply, 'videoData');
        for (const url of ['https://evil.example/v.mp4', 'http://x.ai/v.mp4', 'https://x.ai.evil.example/v', 'not a url']) {
            const r = replyOf(fetchOf(url));
            assert.equal(r.status, 400, url);
        }
        assert.deepEqual(replyOf(plan({ path: '/api/xai/video-fetch', authorization: 'Bearer k', body: {} })), {
            status: 400,
            body: { error: 'No video url provided' },
        });
    });

    it('reaches ComfyUI only on the local network and only at the endpoints the client uses', () => {
        const comfy = (body: Readonly<Record<string, unknown>>): ProxyPlan => plan({ path: '/api/comfyui/proxy', body });
        const ok = upstreamOf(comfy({ baseUrl: 'http://192.168.1.50:8188/', path: '/system_stats', method: 'GET' }));
        assert.equal(ok.url, 'http://192.168.1.50:8188/system_stats');
        assert.equal(ok.body, undefined);
        assert.equal(replyOf(comfy({ baseUrl: 'https://example.com', path: '/prompt', method: 'POST' })).status, 400);
        assert.deepEqual(replyOf(comfy({ baseUrl: 'http://127.0.0.1:8188', path: '/free', method: 'POST' })), {
            status: 400,
            body: { error: 'Refusing to proxy POST /free' },
        });
        const posted = upstreamOf(comfy({ baseUrl: 'http://127.0.0.1:8188', path: 'prompt', method: 'post', body: { a: 1 } }));
        assert.deepEqual([posted.method, posted.url, posted.body], ['POST', 'http://127.0.0.1:8188/prompt', { kind: 'text', text: '{"a":1}' }]);
    });

    it('falls back to the configured ComfyUI address', () => {
        const env = { ...NO_ENVIRONMENT, comfyUrl: 'http://10.0.0.2:8188' };
        assert.equal(upstreamOf(plan({ path: '/api/comfyui/proxy', body: { path: '/history/abc', method: 'GET' } }, env)).url, 'http://10.0.0.2:8188/history/abc');
    });

    it('keeps the checks as the server exported them', () => {
        assert.equal(isAllowedVideoUrl('https://imgen.x.ai/a', nodeUrl), true);
        assert.equal(isAllowedComfyRequest('/view', 'get'), true);
        assert.equal(isAllowedComfyRequest('/view', 'POST'), false);
        assert.equal(normaliseComfyOrigin('http://192.168.0.5/8188', nodeUrl), 'http://192.168.0.5:8188');
        assert.equal(normaliseComfyOrigin('ftp://192.168.0.5', nodeUrl), undefined);
    });
});

describe('replies', () => {
    it('relays any status and text unchanged', () => {
        assert.deepEqual(shapeReply('relay', 429, '{"x":1}'), { status: 429, text: '{"x":1}' });
    });

    it('wraps a fetched video as data, and turns a failure into an error with its status', () => {
        assert.deepEqual(shapeReply('videoData', 200, 'BYTES'), { status: 200, text: '{"data":"BYTES"}' });
        assert.deepEqual(shapeReply('videoData', 404, 'nope'), { status: 404, text: '{"error":"Failed to fetch video: 404"}' });
    });

    it('reports a transport failure as a 502 naming it', () => {
        assert.deepEqual(failureReply(new Error('ECONNRESET')), { status: 502, text: '{"error":"Proxy error: ECONNRESET"}' });
        assert.deepEqual(failureReply('odd'), { status: 502, text: '{"error":"Proxy error: unknown error"}' });
    });
});

describe('encodeMultipart', () => {
    /**
     * Checked against an independent parser: node's own multipart reader, the
     * one its fetch uses, which has no knowledge of this encoder.
     */
    it('produces a body a standard multipart parser reads back exactly', async () => {
        const file = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x00, 0xff]);
        const body = encodeMultipart(
            [
                { kind: 'field', name: 'model', value: 'gpt-image-2' },
                { kind: 'field', name: 'prompt', value: 'a knight, ünïcode' },
                { kind: 'file', name: 'image[]', filename: 'ref0.png', contentType: 'image/png', base64: file.toString('base64') },
            ],
            'test-boundary-1234',
            (text) => new TextEncoder().encode(text),
            (base64) => new Uint8Array(Buffer.from(base64, 'base64')),
        );
        const parsed = await new Response(body, {
            headers: { 'Content-Type': 'multipart/form-data; boundary=test-boundary-1234' },
        }).formData();
        assert.equal(parsed.get('model'), 'gpt-image-2');
        assert.equal(parsed.get('prompt'), 'a knight, ünïcode');
        const image = parsed.get('image[]');
        assert.ok(image instanceof Blob, 'the file part was not read as a file');
        assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [...file]);
        assert.equal(image.type, 'image/png');
    });
});
