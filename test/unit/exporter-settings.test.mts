import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SLIDER_STORAGE_KEY,
    asCropRatio,
    asExportMode,
    asPreviewMode,
    parsePersistedSliders,
    positiveOr,
    storedBoolean,
    storedNumber,
} from '../../src/browser/exporter-math.mts';

/**
 * These cover the narrowing and validation added during the TypeScript
 * conversion. The stored-settings parser reads localStorage, which anything
 * running on the origin can write, so its rejection paths matter more than
 * its happy path and are tested accordingly.
 */

describe('asExportMode', () => {
    it('accepts exactly the three modes', () => {
        assert.equal(asExportMode('adventurer'), 'adventurer');
        assert.equal(asExportMode('normal'), 'normal');
        assert.equal(asExportMode('premium'), 'premium');
    });

    it('rejects anything else, including case variants and near misses', () => {
        for (const bad of ['Adventurer', 'ADVENTURER', 'adventurer ', '', 'free', 'gif']) {
            assert.equal(asExportMode(bad), undefined, `expected ${JSON.stringify(bad)} rejected`);
        }
    });
});

describe('asCropRatio', () => {
    it('accepts exactly the five ratios', () => {
        for (const ratio of ['1:1', '4:3', '3:4', '16:9', '9:16'] as const) {
            assert.equal(asCropRatio(ratio), ratio);
        }
    });

    it('rejects unsupported and malformed ratios', () => {
        for (const bad of ['', '1:2', '21:9', '1x1', '1:1 ', ':', '11']) {
            assert.equal(asCropRatio(bad), undefined, `expected ${JSON.stringify(bad)} rejected`);
        }
    });
});

describe('asPreviewMode', () => {
    it('accepts exactly the four backdrops', () => {
        for (const mode of ['checker', 'black', 'white', 'original'] as const) {
            assert.equal(asPreviewMode(mode), mode);
        }
    });

    it('rejects anything else', () => {
        for (const bad of ['', 'Checker', 'transparent', 'none', 'grey']) {
            assert.equal(asPreviewMode(bad), undefined, `expected ${JSON.stringify(bad)} rejected`);
        }
    });
});

describe('positiveOr', () => {
    it('keeps a positive value', () => {
        assert.equal(positiveOr(2.5, 1), 2.5);
    });

    it('falls back on zero, negatives, and non-finite values', () => {
        assert.equal(positiveOr(0, 1), 1);
        assert.equal(positiveOr(-3, 1), 1);
        assert.equal(positiveOr(NaN, 1), 1);
        assert.equal(positiveOr(Infinity, 1), 1);
        assert.equal(positiveOr(-Infinity, 1), 1);
    });
});

describe('storedNumber', () => {
    it('keeps a finite number, zero and negatives included', () => {
        assert.equal(storedNumber(42), 42);
        assert.equal(storedNumber(0), 0);
        assert.equal(storedNumber(-7.5), -7.5);
    });

    it('parses the strings older builds wrote', () => {
        // Pre-conversion code stored input.value directly, so these entries
        // are still present in users' browsers.
        assert.equal(storedNumber('50'), 50);
        assert.equal(storedNumber('0'), 0);
        assert.equal(storedNumber('-2.25'), -2.25);
        assert.equal(storedNumber(' 50 '), 50);
    });

    it('rejects non-finite numbers', () => {
        assert.equal(storedNumber(NaN), undefined);
        assert.equal(storedNumber(Infinity), undefined);
        assert.equal(storedNumber(-Infinity), undefined);
    });

    it('rejects empty, blank, and unparseable strings', () => {
        assert.equal(storedNumber(''), undefined);
        assert.equal(storedNumber('   '), undefined);
        assert.equal(storedNumber('abc'), undefined);
        assert.equal(storedNumber('12px'), undefined);
    });

    it('rejects every non-number, non-string type', () => {
        for (const bad of [undefined, null, true, false, {}, [], () => 0]) {
            assert.equal(storedNumber(bad), undefined);
        }
    });

    it('does not coerce an empty array to zero the way Number() would', () => {
        // Number([]) is 0; a blanket Number() coercion would have accepted this.
        assert.equal(storedNumber([]), undefined);
    });
});

describe('storedBoolean', () => {
    it('keeps real booleans', () => {
        assert.equal(storedBoolean(true), true);
        assert.equal(storedBoolean(false), false);
    });

    it('rejects truthy and falsy stand-ins', () => {
        for (const bad of ['true', 'false', 1, 0, '', null, undefined, {}]) {
            assert.equal(storedBoolean(bad), undefined);
        }
    });
});

describe('parsePersistedSliders', () => {
    it('reads a full settings object', () => {
        const parsed = parsePersistedSliders(JSON.stringify({
            similarity: 40, smoothness: 10, spillSuppress: 25, scale: 100,
            vOffset: -5, saturation: 120, brightness: 95, edgeFade: 2,
            antiAlias: true, smokeCleanup: false,
        }));
        assert.ok(parsed !== undefined);
        assert.equal(parsed.similarity, 40);
        assert.equal(parsed.vOffset, -5);
        assert.equal(parsed.antiAlias, true);
        assert.equal(parsed.smokeCleanup, false);
    });

    it('reads settings written by older builds as strings', () => {
        const parsed = parsePersistedSliders(JSON.stringify({
            similarity: '40', scale: '100', edgeFade: '0', antiAlias: true,
        }));
        assert.ok(parsed !== undefined);
        assert.equal(parsed.similarity, 40);
        assert.equal(parsed.scale, 100);
        assert.equal(parsed.edgeFade, 0, 'a stored zero must survive, not fall back');
    });

    it('rejects malformed JSON rather than throwing', () => {
        for (const bad of ['', '{', 'not json', '{"a":}', '[1,2']) {
            assert.equal(parsePersistedSliders(bad), undefined);
        }
    });

    it('rejects JSON that is not an object', () => {
        for (const bad of ['null', '42', '"text"', 'true', '[]', '[{"similarity":40}]']) {
            assert.equal(parsePersistedSliders(bad), undefined, `expected ${bad} rejected`);
        }
    });

    it('sets every key even when the stored object is empty', () => {
        const parsed = parsePersistedSliders('{}');
        assert.ok(parsed !== undefined);
        // Declared `T | undefined` rather than optional, so the keys exist.
        for (const key of ['similarity', 'smoothness', 'spillSuppress', 'scale',
                           'vOffset', 'saturation', 'brightness', 'edgeFade',
                           'antiAlias', 'smokeCleanup'] as const) {
            assert.ok(key in parsed, `${key} missing`);
            assert.equal(parsed[key], undefined);
        }
    });

    it('drops individually invalid fields but keeps the valid ones', () => {
        const parsed = parsePersistedSliders(JSON.stringify({
            similarity: 40, smoothness: 'abc', antiAlias: 'yes', scale: null,
        }));
        assert.ok(parsed !== undefined);
        assert.equal(parsed.similarity, 40);
        assert.equal(parsed.smoothness, undefined);
        assert.equal(parsed.antiAlias, undefined);
        assert.equal(parsed.scale, undefined);
    });

    it('ignores unknown keys rather than carrying them through', () => {
        const parsed = parsePersistedSliders('{"similarity":40,"injected":"x"}');
        assert.ok(parsed !== undefined);
        assert.ok(!('injected' in parsed));
    });

    it('is not confused by a stored prototype-polluting key', () => {
        const parsed = parsePersistedSliders('{"__proto__":{"similarity":99},"scale":50}');
        assert.ok(parsed !== undefined);
        assert.equal(parsed.similarity, undefined);
        assert.equal(parsed.scale, 50);
        const probe: Record<string, unknown> = {};
        assert.equal(probe['similarity'], undefined, 'Object.prototype was polluted');
    });

    it('names the storage key it reads', () => {
        assert.equal(SLIDER_STORAGE_KEY, 'ex_slider_values');
    });
});
