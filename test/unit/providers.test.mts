import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PROVIDERS,
    PROVIDER_ORDER,
    asProviderId,
    buildImageRequest,
    hasCredential,
    providerFrom,
} from '../../src/core/providers.mts';

describe('asProviderId', () => {
    it('accepts the known providers', () => {
        assert.equal(asProviderId('openai'), 'openai');
        assert.equal(asProviderId('xai'), 'xai');
        assert.equal(asProviderId('comfyui'), 'comfyui');
    });

    it('rejects anything else, including case variants', () => {
        for (const bad of ['', 'OpenAI', 'grok', 'XAI', 'ComfyUI', 'openai ']) {
            assert.equal(asProviderId(bad), undefined, `expected ${JSON.stringify(bad)} rejected`);
        }
    });
});

describe('providerFrom', () => {
    it('resolves a stored preference', () => {
        assert.equal(providerFrom('xai').id, 'xai');
    });

    it('falls back to OpenAI for absent or unusable values', () => {
        assert.equal(providerFrom(null).id, 'openai');
        assert.equal(providerFrom('').id, 'openai');
        assert.equal(providerFrom('nonsense').id, 'openai');
    });
});

describe('provider table', () => {
    it('lists every provider in the selector order', () => {
        assert.deepEqual([...PROVIDER_ORDER].sort(), Object.keys(PROVIDERS).sort());
    });

    it('routes every provider through the local proxy, never upstream directly', () => {
        for (const id of PROVIDER_ORDER) {
            const route = PROVIDERS[id].imageRoute;
            assert.ok(route.startsWith('/api/'), `${id} must use a local route, got ${route}`);
            assert.ok(!route.includes('://'), `${id} must not name an upstream host`);
        }
    });

    it('gives each provider a distinct storage key', () => {
        const keys = PROVIDER_ORDER.map((id) => PROVIDERS[id].storageKey);
        assert.equal(new Set(keys).size, keys.length, 'storage keys must not collide');
    });
});

describe('buildImageRequest', () => {
    const openai = PROVIDERS.openai;
    const xai = PROVIDERS.xai;

    it('carries the prompt, count and model', () => {
        const body = buildImageRequest(openai, { prompt: 'a knight', count: 2 });
        assert.equal(body.prompt, 'a knight');
        assert.equal(body.n, 2);
        assert.equal(body.model, openai.defaultModel);
    });

    it('lets the caller override the model', () => {
        assert.equal(buildImageRequest(openai, { prompt: 'x', count: 1, model: 'custom' }).model, 'custom');
    });

    it('includes size for OpenAI when one is given', () => {
        const body = buildImageRequest(openai, { prompt: 'x', count: 1, size: '1024x1024' });
        assert.equal(body.size, '1024x1024');
    });

    it('omits size for xAI even when one is given', () => {
        // xAI rejects the request when size is present. Upstream pull request
        // 1 removed the parameter across two commits after hitting this.
        const body = buildImageRequest(xai, { prompt: 'x', count: 1, size: '1024x1024' });
        assert.ok(!('size' in body), 'size must not reach xAI');
    });

    it('omits size when none is given, for either provider', () => {
        assert.ok(!('size' in buildImageRequest(openai, { prompt: 'x', count: 1 })));
        assert.ok(!('size' in buildImageRequest(xai, { prompt: 'x', count: 1 })));
    });

    it('clamps the count to at least one and to a whole number', () => {
        assert.equal(buildImageRequest(openai, { prompt: 'x', count: 0 }).n, 1);
        assert.equal(buildImageRequest(openai, { prompt: 'x', count: -5 }).n, 1);
        assert.equal(buildImageRequest(openai, { prompt: 'x', count: 2.9 }).n, 2);
    });
});

describe('hasCredential', () => {
    it('accepts a non-blank value', () => {
        assert.equal(hasCredential('sk-test'), true);
    });

    it('rejects absent, empty and whitespace-only values', () => {
        assert.equal(hasCredential(null), false);
        assert.equal(hasCredential(''), false);
        assert.equal(hasCredential('   '), false);
        assert.equal(hasCredential('\t\n'), false);
    });
});
