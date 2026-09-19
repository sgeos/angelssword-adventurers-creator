/**
 * GREEN characterization tests — sprite-prep-core.js
 * Documents current behavior; must pass against extracted algorithms.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { at } from '../helpers/at.mts';

import * as Core from '../../src/core/sprite-prep-core.mts';

const {
    KEY_COLORS,
    pickKeyByEuclideanMinDist,
    findBottomOpaqueRow,
    computeSpriteDrawRect,
    buildPrompt,
    defaultColorName,
    buildPromptWithRefs,
    buildGenerateRequest
} = Core;

function rgbaBuffer(
    w: number,
    h: number,
    fillFn: (x: number, y: number, i: number) => readonly [number, number, number, number],
): Uint8ClampedArray {
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const [r, g, b, a] = fillFn(x, y, i);
            buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
        }
    }
    return buf;
}

describe('KEY_COLORS', () => {
    it('exposes the same 5 chroma key colors', () => {
        assert.equal(KEY_COLORS.length, 5);
        assert.deepEqual(KEY_COLORS.map(k => k.hex), [
            '#00FF00', '#FF00FF', '#0000FF', '#FFFF00', '#00FFFF'
        ]);
    });
});

describe('pickKeyByEuclideanMinDist', () => {
    it('prefers magenta when sprite is mostly green (golden hex #FF00FF)', () => {
        // Solid green opaque sprite — green key has minDist 0; magenta is farthest
        const w = 4, h = 4;
        const rgba = rgbaBuffer(w, h, () => [0, 255, 0, 255]);
        const result = pickKeyByEuclideanMinDist(rgba, w, h);
        assert.equal(result.hex, '#FF00FF');
        assert.equal(result.bestIdx, 1);
        assert.equal(at(KEY_COLORS, result.bestIdx).hex, '#FF00FF');
        assert.equal(at(result.minDist, 0), 0); // green touches itself
        assert.ok(at(result.minDist, 1) > at(result.minDist, 0));
    });

    it('skips pixels with α < 128', () => {
        // Opaque green + near-opaque-threshold magenta (α=127) that must be ignored.
        // If α=127 magenta counted, magenta key minDist would be ~0 and lose.
        const w = 2, h = 2;
        const rgba = new Uint8ClampedArray([
            // (0,0) green opaque
            0, 255, 0, 255,
            // (1,0) magenta transparent-ish (α=127) — MUST be skipped
            255, 0, 255, 127,
            // (0,1) magenta α=0
            255, 0, 255, 0,
            // (1,1) green α=128 (boundary — included)
            0, 255, 0, 128
        ]);
        const result = pickKeyByEuclideanMinDist(rgba, w, h);
        assert.equal(result.hex, '#FF00FF', 'transparent magenta must not poison green-sprite key pick');
        assert.equal(at(result.minDist, 0), 0);
        assert.ok(at(result.minDist, 1) > 100);
    });
});

describe('buildPrompt', () => {
    function colorNameFn(hex: string): string {
        const names: Readonly<Record<string, string>> = {
            '#00FF00': 'Green', '#FF00FF': 'Magenta', '#0000FF': 'Blue',
            '#FFFF00': 'Yellow', '#00FFFF': 'Cyan'
        };
        return names[hex.toUpperCase()] ?? hex;
    }

    it('includes solid key name/hex, 1280×720, waist-up; empty action → idle default', () => {
        const prompt = buildPrompt({
            name: 'Luna',
            desc: 'silver hair',
            action: '',
            keyHex: '#00FF00',
            raceMode: 'normal',
            colorNameFn
        });

        assert.match(prompt, /standing in a neutral idle position/);
        assert.match(prompt, /solid, uniform GREEN \(#00FF00\)/);
        assert.match(prompt, /exact same shade of green/);
        assert.match(prompt, /exactly 1280×720 pixels/);
        assert.match(prompt, /waist up/i);
        assert.match(prompt, /Waist-up portrait/);
        assert.match(prompt, /A single Luna, silver hair, standing in a neutral idle position\./);
    });

    it('kanolith injects KEMONOMIMI / FULLY HUMAN face directive substrings', () => {
        const prompt = buildPrompt({
            name: 'Miko',
            desc: '',
            action: 'waving',
            keyHex: '#FF00FF',
            raceMode: 'kanolith',
            colorNameFn
        });
        assert.match(prompt, /CRITICAL - KEMONOMIMI STYLE/);
        assert.match(prompt, /FULLY HUMAN face/);
        assert.match(prompt, /NO snout/);
        assert.match(prompt, /MAGENTA \(#FF00FF\)/);
        assert.match(prompt, /waving/);
        assert.doesNotMatch(prompt, /standing in a neutral idle position/);
    });

    it('zoalith injects FULL ANTHROPOMORPHIC / snout-muzzle directive substrings', () => {
        const prompt = buildPrompt({
            name: 'Rex',
            desc: 'warrior',
            action: 'roaring',
            keyHex: '#0000FF',
            raceMode: 'zoalith',
            colorNameFn
        });
        assert.match(prompt, /CRITICAL - FULL ANTHROPOMORPHIC STYLE/);
        assert.match(prompt, /snout or muzzle/);
        assert.match(prompt, /Breath of Fire/);
        assert.match(prompt, /BLUE \(#0000FF\)/);
    });
});

describe('buildPromptWithRefs', () => {
    const base = 'BASE_PROMPT';

    it('both char+style refs prefix dual-reference language', () => {
        const out = buildPromptWithRefs(base, { charRef: true, styleRef: true });
        assert.match(out, /^Two reference images are provided/);
        assert.match(out, /character_reference\.png/);
        assert.match(out, /style_reference\.png/);
        assert.match(out, /CRITICAL: The character must look like the one in character_reference\.png\./);
        assert.ok(out.includes(base));
    });

    it('char-only appends look-exactly language', () => {
        const out = buildPromptWithRefs(base, { charRef: true, styleRef: false });
        assert.equal(
            out,
            base + '\n\nThe character should look exactly like the one in the provided reference image.'
        );
    });

    it('style-only prefixes match-art-style language', () => {
        const out = buildPromptWithRefs(base, { charRef: false, styleRef: true });
        assert.equal(
            out,
            'Match the exact art style shown in the provided style reference image. ' + base
        );
    });

    it('neither ref returns prompt unchanged', () => {
        assert.equal(buildPromptWithRefs(base, { charRef: false, styleRef: false }), base);
    });
});

describe('buildGenerateRequest', () => {
    it('without images → /api/generate with gpt-image-2 / 1536x1024 / high / n:1', () => {
        const { endpoint, body } = buildGenerateRequest({ prompt: 'hello', images: [] });
        assert.equal(endpoint, '/api/generate');
        assert.equal(body.model, 'gpt-image-2');
        assert.equal(body.size, '1536x1024');
        assert.equal(body.quality, 'high');
        assert.equal(body.n, 1);
        assert.equal(body.prompt, 'hello');
        assert.equal(body.images, undefined);
    });

    it('with images → /api/edits and includes images on body', () => {
        const images = [{ label: 'character_reference', data: 'data:image/png;base64,abc' }];
        const { endpoint, body } = buildGenerateRequest({ prompt: 'edit me', images });
        assert.equal(endpoint, '/api/edits');
        assert.deepEqual(body.images, images);
        assert.equal(body.model, 'gpt-image-2');
        assert.equal(body.size, '1536x1024');
        assert.equal(body.quality, 'high');
        assert.equal(body.n, 1);
    });
});

describe('findBottomOpaqueRow', () => {
    it('returns exact bottom opaque row on a tiny buffer', () => {
        // 3×3: only middle row (y=1) has α>30; rows 0 and 2 fully transparent
        const w = 3, h = 3;
        const rgba = rgbaBuffer(w, h, (_x, y) => {
            if (y === 1) return [10, 20, 30, 255];
            return [0, 0, 0, 0];
        });
        assert.equal(findBottomOpaqueRow(rgba, w, h, 30), 1);

        // Opaque only on top row → bottomRow 0
        const topOnly = rgbaBuffer(2, 2, (_x, y) => (y === 0 ? [1, 1, 1, 40] : [0, 0, 0, 0]));
        assert.equal(findBottomOpaqueRow(topOnly, 2, 2, 30), 0);

        // α=30 is NOT > 30 → treated as transparent; α=31 counts
        const edge = new Uint8ClampedArray([
            0, 0, 0, 30, // (0,0) — skipped (not > 30)
            0, 0, 0, 31, // (1,0)
            0, 0, 0, 0,  // (0,1)
            0, 0, 0, 0   // (1,1)
        ]);
        assert.equal(findBottomOpaqueRow(edge, 2, 2, 30), 0);
    });
});

describe('computeSpriteDrawRect', () => {
    it('matches current bottom-anchor + zoom math for fixed inputs', () => {
        // Mirror formulas from original renderCanvas:
        // spriteY = CH - bottomRow - 1 + offset
        // spriteX = Math.round((CW - sw) / 2)
        // drawW/H = round(s * zoom/100)
        // zoomX = spriteX + round((sw - drawW) / 2)
        // zoomY = spriteY + (sh - drawH)
        const input = { sw: 200, sh: 400, bottomRow: 350, offset: 10, zoom: 150, CW: 1280, CH: 720 };
        const rect = computeSpriteDrawRect(input);

        const spriteY = 720 - 350 - 1 + 10; // 379
        const spriteX = Math.round((1280 - 200) / 2); // 540
        const drawW = Math.round(200 * 1.5); // 300
        const drawH = Math.round(400 * 1.5); // 600
        const zoomX = spriteX + Math.round((200 - 300) / 2); // 540 - 50 = 490
        const zoomY = spriteY + (400 - 600); // 379 - 200 = 179

        assert.equal(rect.drawW, drawW);
        assert.equal(rect.drawH, drawH);
        assert.equal(rect.zoomX, zoomX);
        assert.equal(rect.zoomY, zoomY);
        assert.deepEqual(
            { zoomX: rect.zoomX, zoomY: rect.zoomY, drawW: rect.drawW, drawH: rect.drawH },
            { zoomX: 490, zoomY: 179, drawW: 300, drawH: 600 }
        );
    });

    it('defaults CW/CH to 1280×720', () => {
        const a = computeSpriteDrawRect({ sw: 100, sh: 100, bottomRow: 99, offset: 0, zoom: 100 });
        const b = computeSpriteDrawRect({ sw: 100, sh: 100, bottomRow: 99, offset: 0, zoom: 100, CW: 1280, CH: 720 });
        assert.deepEqual(
            { zoomX: a.zoomX, zoomY: a.zoomY, drawW: a.drawW, drawH: a.drawH },
            { zoomX: b.zoomX, zoomY: b.zoomY, drawW: b.drawW, drawH: b.drawH }
        );
    });
});

describe('defaultColorName', () => {
    it('names each of the five key colours', () => {
        assert.equal(defaultColorName('#00FF00'), 'Green');
        assert.equal(defaultColorName('#FF00FF'), 'Magenta');
        assert.equal(defaultColorName('#0000FF'), 'Blue');
        assert.equal(defaultColorName('#FFFF00'), 'Yellow');
        assert.equal(defaultColorName('#00FFFF'), 'Cyan');
    });

    it('is case-insensitive about the hex it is given', () => {
        assert.equal(defaultColorName('#00ff00'), 'Green');
        assert.equal(defaultColorName('#00Ff00'), 'Green');
    });

    it('falls back to the input for a colour it does not name', () => {
        assert.equal(defaultColorName('#123456'), '#123456');
        assert.equal(defaultColorName(''), '');
    });

    it('returns the original casing on fallback, not the upper-cased lookup key', () => {
        assert.equal(defaultColorName('#abcdef'), '#abcdef');
    });

    it('does not resolve inherited object properties as colour names', () => {
        // A plain record lookup would find these on Object.prototype.
        assert.equal(defaultColorName('constructor'), 'constructor');
        assert.equal(defaultColorName('toString'), 'toString');
    });
});
