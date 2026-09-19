import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, recordingStore } from '../helpers/memory-store.mts';
import {
    CHARACTER_NAME_KEY,
    SOUND_ENABLED_KEY,
    SPRITE_OFFSET_DEFAULT,
    SPRITE_OFFSET_KEY,
    SPRITE_ZOOM_DEFAULT,
    SPRITE_ZOOM_KEY,
    loadCharacterName,
    loadSoundEnabled,
    loadSpriteOffset,
    loadSpriteZoom,
    saveCharacterName,
    saveSoundEnabled,
    saveSpriteOffset,
    saveSpriteZoom,
    storedInteger,
} from '../../src/core/preferences.mts';

/**
 * None of this was testable before the storage capability existed. Each of
 * these preferences was read with a literal key and its own handling of an
 * unparsable value, inline in a module that needs a browser.
 */

describe('storedInteger', () => {
    it('returns the fallback when nothing is stored', () => {
        assert.equal(storedInteger(undefined, 42), 42);
    });

    it('returns the fallback for text that is not a number at all', () => {
        assert.equal(storedInteger('nonsense', 42), 42);
        assert.equal(storedInteger('', 42), 42);
    });

    it('reads a plain integer', () => {
        assert.equal(storedInteger('17', 42), 17);
        assert.equal(storedInteger('-17', 42), -17);
    });

    it('tolerates a trailing suffix, which parseInt has always done', () => {
        // Preserved deliberately. Refusing this now would silently reset a
        // slider for anyone whose stored value carries a unit.
        assert.equal(storedInteger('120px', 42), 120);
    });

    it('truncates rather than rounding, parseInt stopping at the point', () => {
        assert.equal(storedInteger('17.9', 0), 17);
    });
});

describe('character name', () => {
    it('reads back what was written', () => {
        const store = memoryStore();
        saveCharacterName(store, 'Brannok');
        assert.equal(loadCharacterName(store), 'Brannok');
    });

    it('reports an empty string when nothing is stored', () => {
        assert.equal(loadCharacterName(memoryStore()), '');
    });

    it('uses the documented key, which two stages share', () => {
        const { store, ops } = recordingStore();
        saveCharacterName(store, 'x');
        assert.deepEqual(ops, [{ op: 'write', key: CHARACTER_NAME_KEY, value: 'x' }]);
    });
});

describe('sound enabled', () => {
    it('defaults to enabled when nothing is stored', () => {
        assert.equal(loadSoundEnabled(memoryStore()), true);
    });

    it('is disabled only by the exact string the shell writes', () => {
        assert.equal(loadSoundEnabled(memoryStore({ [SOUND_ENABLED_KEY]: 'false' })), false);
    });

    it('treats anything unrecognised as the default rather than its opposite', () => {
        for (const raw of ['0', 'no', 'FALSE', 'off', '']) {
            assert.equal(loadSoundEnabled(memoryStore({ [SOUND_ENABLED_KEY]: raw })), true, raw);
        }
    });

    it('round-trips both states', () => {
        const store = memoryStore();
        saveSoundEnabled(store, false);
        assert.equal(loadSoundEnabled(store), false);
        saveSoundEnabled(store, true);
        assert.equal(loadSoundEnabled(store), true);
    });
});

describe('sprite offset and zoom', () => {
    it('falls back to the declared defaults', () => {
        const store = memoryStore();
        assert.equal(loadSpriteOffset(store), SPRITE_OFFSET_DEFAULT);
        assert.equal(loadSpriteZoom(store), SPRITE_ZOOM_DEFAULT);
    });

    it('round-trips a value, including a negative offset', () => {
        const store = memoryStore();
        saveSpriteOffset(store, -30);
        saveSpriteZoom(store, 250);
        assert.equal(loadSpriteOffset(store), -30);
        assert.equal(loadSpriteZoom(store), 250);
    });

    it('falls back when the stored value is corrupt', () => {
        const store = memoryStore({ [SPRITE_OFFSET_KEY]: 'x', [SPRITE_ZOOM_KEY]: '' });
        assert.equal(loadSpriteOffset(store), SPRITE_OFFSET_DEFAULT);
        assert.equal(loadSpriteZoom(store), SPRITE_ZOOM_DEFAULT);
    });

    it('keeps the two under separate keys', () => {
        const store = memoryStore();
        saveSpriteOffset(store, 5);
        assert.notEqual(SPRITE_OFFSET_KEY, SPRITE_ZOOM_KEY);
        assert.equal(loadSpriteZoom(store), SPRITE_ZOOM_DEFAULT);
    });
});
