import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, type DomEnvironment } from '../helpers/dom-env.mts';
import type { BinaryHttpClient } from '../../src/core/ports/http.mts';
import type { UpstreamPlan } from '../../src/core/proxy.mts';
import type { UpstreamResult } from '../../src/platform-browser/in-page-proxy.mts';
import type * as InPageProxy from '../../src/platform-browser/in-page-proxy.mts';

/**
 * The transport the mobile application's web view installs in place of the
 * local server.
 *
 * What matters is that a stage calling `/api/...` gets the answer the server
 * would have given, that only a planned upstream request ever reaches the
 * native side, and that the bytes of a binary reply survive the base64 bridge.
 * The module reads `location`, so the page environment is installed first.
 */

let env: DomEnvironment;
let proxy: typeof InPageProxy;

before(async () => {
    env = installDom();
    proxy = await import('../../src/platform-browser/in-page-proxy.mts');
});

after(() => {
    env.cleanup();
});

const toBase64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

/** A sender that records what it was asked and answers with a fixed result. */
const recordingSender = (result: UpstreamResult): { readonly sent: UpstreamPlan[]; readonly send: (p: UpstreamPlan) => Promise<UpstreamResult> } => {
    const sent: UpstreamPlan[] = [];
    return { sent, send: async (p) => { sent.push(p); return Promise.resolve(result); } };
};

const unused: BinaryHttpClient = async () => Promise.reject(new Error('the fallback was not expected to be called'));

describe('inPageProxy', () => {
    it('answers a refusal on the page without sending anything', async () => {
        const { sent, send } = recordingSender({ status: 200, base64: '' });
        const http = proxy.inPageProxy(send, unused);
        const response = await http('/api/generate', { method: 'POST', body: '{"prompt":"x"}' });
        assert.equal(response.status, 401);
        assert.deepEqual(JSON.parse(await response.text()), { error: 'No Authorization header provided' });
        assert.equal(sent.length, 0);
    });

    it('sends the planned upstream request and relays its status and text', async () => {
        const { sent, send } = recordingSender({ status: 201, base64: toBase64('{"data":[1]}') });
        const http = proxy.inPageProxy(send, unused);
        const response = await http('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer sk-test' },
            body: '{"prompt":"x"}',
        });
        assert.equal(response.status, 201);
        assert.equal(await response.text(), '{"data":[1]}');
        assert.equal(sent.length, 1);
        assert.equal(sent[0]?.url, 'https://api.openai.com/v1/images/generations');
        // The header name's case did not matter.
        assert.equal(sent[0].headers['Authorization'], 'Bearer sk-test');
    });

    it('keeps a relayed body\'s exact bytes', async () => {
        const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
        const { send } = recordingSender({ status: 200, base64: binary.toString('base64') });
        const http = proxy.inPageProxy(send, unused);
        const response = await http('/api/comfyui/proxy', {
            method: 'POST',
            body: JSON.stringify({ baseUrl: 'http://127.0.0.1:8188', path: '/view?filename=a.png', method: 'GET' }),
        });
        assert.deepEqual([...await response.bytes()], [...binary]);
    });

    it('takes the Gemini key from the query string', async () => {
        const { sent, send } = recordingSender({ status: 200, base64: toBase64('{}') });
        const http = proxy.inPageProxy(send, unused);
        await http('/api/video/generate?key=g-key', { method: 'POST', body: '{}' });
        assert.match(sent[0]?.url ?? '', /interactions\?key=g-key$/);
    });

    it('applies the server\'s guards before anything is sent', async () => {
        const { sent, send } = recordingSender({ status: 200, base64: '' });
        const http = proxy.inPageProxy(send, unused);
        const response = await http('/api/xai/video-fetch', {
            method: 'POST',
            headers: { Authorization: 'Bearer xai' },
            body: JSON.stringify({ url: 'https://attacker.example/steal' }),
        });
        assert.equal(response.status, 400);
        assert.equal(sent.length, 0);
    });

    it('reports a native failure as the server reports a transport failure', async () => {
        const http = proxy.inPageProxy(async () => Promise.reject(new Error('offline')), unused);
        const response = await http('/api/chat', { method: 'POST', headers: { Authorization: 'Bearer k' }, body: '{}' });
        assert.equal(response.status, 502);
        assert.deepEqual(JSON.parse(await response.text()), { error: 'Proxy error: offline' });
    });

    it('passes anything that is not a local /api route to the other transport', async () => {
        const seen: string[] = [];
        const other: BinaryHttpClient = async (url) => {
            seen.push(url);
            return Promise.resolve({ status: 204, text: async () => Promise.resolve(''), bytes: async () => Promise.resolve(new Uint8Array(0)) });
        };
        const http = proxy.inPageProxy(async () => Promise.reject(new Error('not expected')), other);
        await http('https://generativelanguage.googleapis.com/v1beta/models?key=k');
        await http('https://elsewhere.example/api/generate', { method: 'POST' });
        assert.deepEqual(seen, [
            'https://generativelanguage.googleapis.com/v1beta/models?key=k',
            'https://elsewhere.example/api/generate',
        ]);
    });

    it('answers an unknown local route with a 404', async () => {
        const http = proxy.inPageProxy(async () => Promise.reject(new Error('not expected')), unused);
        assert.equal((await http('/api/nothing', { method: 'POST' })).status, 404);
    });
});
