import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, recordingStore } from '../helpers/memory-store.mts';
import { NULL_STORE } from '../../src/core/ports/storage.mts';
import {
    COMFY_DEFAULTS,
    COMFY_SETTINGS_KEY,
    WAN_DEFAULTS,
    WAN_SETTINGS_KEY,
    loadComfySettings,
    loadWanSettings,
    saveComfySettings,
    saveWanSettings,
} from '../../src/core/comfyui-core.mts';
import {
    PROVIDERS,
    PROVIDER_PREFERENCE_KEY,
    VIDEO_PROVIDERS,
    VIDEO_PROVIDER_PREFERENCE_KEY,
    loadCredential,
    loadProvider,
    loadVideoProvider,
    saveCredential,
    saveProvider,
    saveVideoProvider,
} from '../../src/core/providers.mts';
import {
    SLIDER_STORAGE_KEY,
    loadPersistedSliders,
    savePersistedSliders,
} from '../../src/core/exporter-math.mts';

/**
 * The storage capability, exercised through every core function that takes
 * one. Each of these was a `localStorage` call inside a module that needs a
 * browser, so none of it could be asserted on before.
 */

describe('NULL_STORE', () => {
    it('reports absence for everything, so the core takes its defaults', () => {
        assert.equal(NULL_STORE.read('anything'), undefined);
        assert.deepEqual(loadComfySettings(NULL_STORE), COMFY_DEFAULTS);
        assert.equal(loadProvider(NULL_STORE).id, 'openai');
    });

    it('accepts writes and forgets them, which is what a blocked store does', () => {
        NULL_STORE.write('k', 'v');
        NULL_STORE.remove('k');
        assert.equal(NULL_STORE.read('k'), undefined);
    });
});

describe('provider preference', () => {
    it('defaults when nothing is stored', () => {
        assert.equal(loadProvider(memoryStore()).id, 'openai');
        assert.equal(loadVideoProvider(memoryStore()).id, 'google');
    });

    it('defaults when the stored value names no provider', () => {
        assert.equal(loadProvider(memoryStore({ [PROVIDER_PREFERENCE_KEY]: 'nonsense' })).id, 'openai');
        assert.equal(
            loadVideoProvider(memoryStore({ [VIDEO_PROVIDER_PREFERENCE_KEY]: 'nonsense' })).id,
            'google',
        );
    });

    it('round-trips each choice', () => {
        const store = memoryStore();
        for (const id of ['openai', 'xai', 'comfyui'] as const) {
            saveProvider(store, id);
            assert.equal(loadProvider(store).id, id);
        }
        for (const id of ['google', 'xai', 'comfyui'] as const) {
            saveVideoProvider(store, id);
            assert.equal(loadVideoProvider(store).id, id);
        }
    });

    it('keeps the sprite and video preferences apart', () => {
        const store = memoryStore();
        saveProvider(store, 'comfyui');
        assert.equal(loadVideoProvider(store).id, 'google', 'the video choice must be untouched');
    });
});

describe('credentials', () => {
    it('reports absence rather than an empty string', () => {
        assert.equal(loadCredential(memoryStore(), PROVIDERS.openai), undefined);
    });

    it('round-trips a key under the provider own storage key', () => {
        const store = memoryStore();
        saveCredential(store, PROVIDERS.openai, 'sk-test');
        assert.equal(loadCredential(store, PROVIDERS.openai), 'sk-test');
        assert.equal(store.read(PROVIDERS.openai.storageKey), 'sk-test');
    });

    it('REMOVES rather than writing an empty string for a blank value', () => {
        // A key present and useless reads back as a configured provider with
        // an unusable credential, which is worse than no key at all. Asserted
        // on the operation, because the contents alone cannot tell the two
        // apart.
        const { store, ops } = recordingStore();
        saveCredential(store, PROVIDERS.xai, '   ');
        assert.deepEqual(ops, [{ op: 'remove', key: PROVIDERS.xai.storageKey }]);
    });

    it('clears a previously stored key when a blank one is saved over it', () => {
        const store = memoryStore();
        saveCredential(store, PROVIDERS.xai, 'sk-old');
        saveCredential(store, PROVIDERS.xai, '');
        assert.equal(loadCredential(store, PROVIDERS.xai), undefined);
    });

    it('keeps providers apart, ComfyUI sharing its key between the two tables', () => {
        const store = memoryStore();
        saveCredential(store, PROVIDERS.openai, 'sk-openai');
        assert.equal(loadCredential(store, VIDEO_PROVIDERS.google), undefined);
        // Both ComfyUI entries name the same key deliberately: it is one
        // address, not two credentials.
        assert.equal(PROVIDERS.comfyui.storageKey, VIDEO_PROVIDERS.comfyui.storageKey);
    });
});

describe('ComfyUI and Wan settings', () => {
    it('returns the defaults when nothing is stored', () => {
        assert.deepEqual(loadComfySettings(memoryStore()), COMFY_DEFAULTS);
        assert.deepEqual(loadWanSettings(memoryStore()), WAN_DEFAULTS);
    });

    it('returns the defaults for a corrupt entry rather than throwing', () => {
        assert.deepEqual(loadComfySettings(memoryStore({ [COMFY_SETTINGS_KEY]: '{' })), COMFY_DEFAULTS);
        assert.deepEqual(loadWanSettings(memoryStore({ [WAN_SETTINGS_KEY]: '[]' })), WAN_DEFAULTS);
    });

    it('round-trips settings through the store', () => {
        const store = memoryStore();
        const settings = { ...COMFY_DEFAULTS, url: 'http://127.0.0.1:8188', model: 'custom.safetensors' };
        saveComfySettings(store, settings);
        assert.deepEqual(loadComfySettings(store), settings);
    });

    it('round-trips Wan settings through the store', () => {
        const store = memoryStore();
        const wan = { ...WAN_DEFAULTS, width: 640, height: 640 };
        saveWanSettings(store, wan);
        assert.deepEqual(loadWanSettings(store), wan);
    });

    it('keeps the two settings objects under separate keys', () => {
        const store = memoryStore();
        saveComfySettings(store, { ...COMFY_DEFAULTS, url: 'http://127.0.0.1:8188' });
        assert.deepEqual(loadWanSettings(store), WAN_DEFAULTS);
    });
});

describe('persisted sliders', () => {
    it('reports absence when nothing is stored', () => {
        assert.equal(loadPersistedSliders(memoryStore()), undefined);
    });

    it('reports absence for an empty entry, which is not the same as a default', () => {
        assert.equal(loadPersistedSliders(memoryStore({ [SLIDER_STORAGE_KEY]: '' })), undefined);
    });

    it('reports absence for a corrupt entry rather than throwing', () => {
        assert.equal(loadPersistedSliders(memoryStore({ [SLIDER_STORAGE_KEY]: '{' })), undefined);
        assert.equal(loadPersistedSliders(memoryStore({ [SLIDER_STORAGE_KEY]: '[]' })), undefined);
    });

    it('round-trips positions, and numbers survive as numbers', () => {
        const store = memoryStore();
        const sliders = {
            similarity: 40,
            smoothness: 10,
            spillSuppress: 25,
            scale: 100,
            vOffset: 0,
            saturation: 100,
            brightness: 100,
            edgeFade: 0,
            antiAlias: true,
            smokeCleanup: false,
        };
        savePersistedSliders(store, sliders);
        assert.deepEqual(loadPersistedSliders(store), sliders);
    });

    it('reports an absent field as undefined rather than inventing a value', () => {
        const store = memoryStore({ [SLIDER_STORAGE_KEY]: JSON.stringify({ similarity: 40 }) });
        const loaded = loadPersistedSliders(store);
        assert.ok(loaded !== undefined, 'a usable entry must parse');
        assert.equal(loaded.similarity, 40);
        assert.equal(loaded.smoothness, undefined);
        assert.equal(loaded.antiAlias, undefined);
    });
});
