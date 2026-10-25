import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordingStore } from '../helpers/memory-store.mts';
import { browserStore, setStoreBacking } from '../../src/platform-browser/local-storage.mts';
import { loadSpriteZoom, saveSpriteZoom } from '../../src/core/preferences.mts';

/**
 * The seam the mobile application's web view uses for its settings.
 *
 * Expo's web view has no Web Storage, so the host replaces where
 * `browserStore` reads and writes. The property that matters is that a module
 * which imported `browserStore` before the replacement still reaches the
 * replacement, because the stages import it long before any host code runs.
 * Node has no `localStorage` either, so before a replacement every read here
 * reports absence, which is the adapter's behaviour for a blocked store.
 */
describe('the browser store backing', () => {
    it('reaches a replacement through the binding imported before it', () => {
        const { store, ops } = recordingStore({ 'as-zoom': '1.5' });
        setStoreBacking(store);

        assert.equal(browserStore.read('as-zoom'), '1.5');
        browserStore.write('as-name', 'Nix');
        browserStore.remove('as-zoom');

        assert.equal(browserStore.read('as-name'), 'Nix');
        assert.equal(browserStore.read('as-zoom'), undefined);
        assert.deepEqual(ops.filter((o) => o.op !== 'read'), [
            { op: 'write', key: 'as-name', value: 'Nix' },
            { op: 'remove', key: 'as-zoom' },
        ]);
    });

    it('serves the core functions that the stages call', () => {
        const { store } = recordingStore({});
        setStoreBacking(store);
        saveSpriteZoom(browserStore, 125);
        assert.equal(loadSpriteZoom(browserStore), 125);
    });
});
