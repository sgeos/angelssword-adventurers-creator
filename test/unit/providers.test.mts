import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PROVIDERS,
    PROVIDER_ORDER,
    MAX_REFERENCE_IMAGES,
    VIDEO_PROVIDER_ORDER,
    asProviderId,
    buildImageRequest,
    credentialFrom,
    describeReferenceUse,
    describeVideoOutput,
    providerFrom,
} from '../../src/core/providers.mts';
import { buildGrokVideoRequest } from '../../src/core/grok-video-core.mts';

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
        assert.equal(providerFrom(undefined).id, 'openai');
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

describe('credentialFrom', () => {
    it('returns a non-blank value unchanged, rather than reporting a boolean', () => {
        assert.equal(credentialFrom('sk-test'), 'sk-test');
    });

    it('returns the value as stored, without trimming what is sent upstream', () => {
        assert.equal(credentialFrom(' sk-test '), ' sk-test ');
    });

    it('rejects absent, empty and whitespace-only values', () => {
        assert.equal(credentialFrom(undefined), undefined);
        assert.equal(credentialFrom(''), undefined);
        assert.equal(credentialFrom('   '), undefined);
        assert.equal(credentialFrom('\t\n'), undefined);
    });
});

describe('describeVideoOutput says what each provider actually produces', () => {
    /**
     * The interface carried one static line, "Aspect ratio: 16:9 (locked) ·
     * ~$0.10/sec", shown for every provider beside a button naming Gemini.
     * Three assertions, and the ratio was true of exactly one provider, which
     * was not the one named.
     */
    it('tells Gemini users the shape follows their reference, because nothing is sent', () => {
        const note = describeVideoOutput('google');
        assert.match(note, /Follows your reference image/);
        assert.doesNotMatch(note, /16:9/, 'no aspect ratio is sent to Gemini');
    });

    /**
     * The lock is real for Grok and it is OURS. `buildGrokVideoRequest` sets
     * it, so a user who wants another shape changes the tool rather than
     * arguing with the service, and the wording has to say which.
     */
    it('tells Grok users the lock is this tool doing it', () => {
        const note = describeVideoOutput('xai');
        assert.match(note, /16:9 at 720p/);
        assert.match(note, /set by this tool/);
    });

    it('agrees with the request Grok is actually sent', () => {
        const request = buildGrokVideoRequest({
            prompt: 'idle', imageDataUri: 'data:image/png;base64,AA',
            durationSeconds: 6, mode: 'reference',
        });
        assert.equal(request.aspect_ratio, '16:9');
        assert.match(describeVideoOutput('xai'), new RegExp(request.aspect_ratio));
    });

    it('reports the ComfyUI canvas it is given, that being a default not a lock', () => {
        assert.match(describeVideoOutput('comfyui', { width: 480, height: 832 }), /480×832 from Settings/);
        assert.match(describeVideoOutput('comfyui'), /canvas from Settings/);
    });

    /**
     * The old label charged per second for a provider that runs on the user's
     * own machine.
     */
    it('charges nothing per second for the local provider', () => {
        const note = describeVideoOutput('comfyui', { width: 832, height: 480 });
        assert.match(note, /no per-second cost/);
        assert.doesNotMatch(note, /\$/);
    });

    /**
     * The figure predates this fork and nobody has verified it, so it is
     * marked rather than asserted, and it is not invented for the provider it
     * was never measured on.
     */
    it('marks the only price it carries as an estimate', () => {
        assert.match(describeVideoOutput('google'), /estimate, unverified/);
        assert.doesNotMatch(describeVideoOutput('xai'), /\$/, 'no invented price for Grok');
    });

    it('says something for every provider in the table', () => {
        for (const id of VIDEO_PROVIDER_ORDER) {
            assert.ok(describeVideoOutput(id).length > 0, id);
        }
    });
});

describe('describeReferenceUse tells the user what becomes of the extras', () => {
    it('says Gemini uses them all, and names the limit', () => {
        assert.match(describeReferenceUse('google'), /every image you add, up to 3/);
        assert.equal(MAX_REFERENCE_IMAGES, 3);
    });

    /**
     * The other two take one image by the SHAPE of their request rather than
     * by omission. Grok's body carries a single `image.url`; the Wan graph
     * takes one uploaded filename.
     */
    it('says the other two use the first only', () => {
        assert.match(describeReferenceUse('xai'), /first image only/);
        assert.match(describeReferenceUse('comfyui'), /first image only/);
    });

    it('says something for every provider in the table', () => {
        for (const id of VIDEO_PROVIDER_ORDER) {
            assert.ok(describeReferenceUse(id).length > 0, id);
        }
    });
});
