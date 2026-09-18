import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { at } from '../helpers/at.mts';
import { alphaAt, makeImageData, pixelAt, solid } from '../helpers/image-data.mts';
import { ChromaKey } from '../../src/browser/chroma-key.mts';

describe('ChromaKey', () => {
    it('setKeyColorHex(#FF00FF) updates keyR/G/B', () => {
        const ck = new ChromaKey();
        ck.setKeyColorHex('#FF00FF');
        assert.equal(ck.keyR, 255);
        assert.equal(ck.keyG, 0);
        assert.equal(ck.keyB, 255);
    });

    it('edgeFloodFill: 8×8 green border + red center → border α=0, center opaque', () => {
        const ck = new ChromaKey();
        ck.setKeyColorHex('#00FF00');
        const img = makeImageData(8, 8, (x: number, y: number) => {
            const edge = x === 0 || y === 0 || x === 7 || y === 7;
            return edge ? [0, 255, 0, 255] : [255, 0, 0, 255];
        });
        const bg = { r: 0, g: 255, b: 0 };
        ck.edgeFloodFill(img, bg, 40);

        // Border pixels transparent
        for (let x = 0; x < 8; x++) {
            assert.equal(at(img.data, (0 * 8 + x) * 4 + 3), 0, `top ${x}`);
            assert.equal(at(img.data, (7 * 8 + x) * 4 + 3), 0, `bot ${x}`);
        }
        for (let y = 0; y < 8; y++) {
            assert.equal(at(img.data, (y * 8 + 0) * 4 + 3), 0, `left ${y}`);
            assert.equal(at(img.data, (y * 8 + 7) * 4 + 3), 0, `right ${y}`);
        }
        // Center red stays opaque
        assert.equal(at(img.data, (3 * 8 + 3) * 4 + 3), 255);
        assert.equal(at(img.data, (3 * 8 + 3) * 4), 255);
    });

    it('edgeFloodFill: enclosed green pocket stays opaque', () => {
        // 8x8: green border, red ring, green pocket at center — pocket not edge-connected
        const ck = new ChromaKey();
        ck.setKeyColorHex('#00FF00');
        const img = makeImageData(8, 8, (x: number, y: number) => {
            const edge = x === 0 || y === 0 || x === 7 || y === 7;
            if (edge) return [0, 255, 0, 255];
            // pocket at (3,3)-(4,4)
            if (x >= 3 && x <= 4 && y >= 3 && y <= 4) return [0, 255, 0, 255];
            return [255, 0, 0, 255];
        });
        ck.edgeFloodFill(img, { r: 0, g: 255, b: 0 }, 40);

        // Enclosed pocket remains opaque after flood fill alone
        assert.equal(at(img.data, (3 * 8 + 3) * 4 + 3), 255);
        assert.equal(at(img.data, (4 * 8 + 4) * 4 + 3), 255);
        // Outer border cleared
        assert.equal(at(img.data, 3), 0);
    });

    it('process solid green frame → all transparent', () => {
        const ck = new ChromaKey();
        ck.setKeyColorHex('#00FF00');
        const img = makeImageData(4, 4, () => [0, 255, 0, 255]);
        ck.process(img);
        for (let i = 0; i < 16; i++) {
            assert.equal(at(img.data, i * 4 + 3), 0, `pixel ${i}`);
        }
    });

    it('isBackgroundPixel tolerance vs green key', () => {
        const ck = new ChromaKey();
        const data = new Uint8ClampedArray([0, 255, 0, 255, 10, 245, 10, 255, 255, 0, 0, 255]);
        const bg = { r: 0, g: 255, b: 0 };
        assert.equal(ck.isBackgroundPixel(data, 0, bg, 5), true);
        // avg |diff| = (10+10+10)/3 ≈ 10 → within 15, not within 5
        assert.equal(ck.isBackgroundPixel(data, 4, bg, 5), false);
        assert.equal(ck.isBackgroundPixel(data, 4, bg, 15), true);
        assert.equal(ck.isBackgroundPixel(data, 8, bg, 40), false);
    });

    it('applyEdgeFade: corners more transparent than mid-edge when fadeWidth>0', () => {
        const ck = new ChromaKey();
        const img = makeImageData(20, 20, () => [255, 255, 255, 255]);
        ck.applyEdgeFade(img, 10);

        const cornerA = at(img.data, (0 * 20 + 0) * 4 + 3);
        const midTop = at(img.data, (0 * 20 + 10) * 4 + 3);
        // A corner is nearer two edges at once, so it fades further than a
        // point the same distance from a single edge: (1,1) has minDist 1
        // against (10,5) with minDist 5.
        const c = at(img.data, (1 * 20 + 1) * 4 + 3);
        const mid = at(img.data, (5 * 20 + 10) * 4 + 3);
        assert.ok(c < mid, `corner alpha ${c} should be < mid-edge ${mid}`);
        assert.equal(cornerA, 0);
        assert.ok(midTop === 0 || midTop < 255); // on top edge
    });

    it('applyAntiAlias: no pixel alpha increases', () => {
        const ck = new ChromaKey();
        // Opaque square with jagged edge against transparent
        const img = makeImageData(8, 8, (x: number, y: number) => {
            if (x >= 3 && y >= 3) return [200, 100, 50, 255];
            return [0, 0, 0, 0];
        });
        const before = Uint8Array.from(img.data.filter((_, i) => i % 4 === 3));
        ck.applyAntiAlias(img);
        for (let i = 0; i < 64; i++) {
            const after = at(img.data, i * 4 + 3);
            const wasBefore = at(before, i);
            assert.ok(after <= wasBefore, `alpha increased at ${i}: ${wasBefore} → ${after}`);
        }
    });
});

/**
 * Added coverage for the keyer. Every method takes a buffer or an
 * ImageData-shaped object, so all of it is reachable in node via the shared
 * stand-in — no DOM implementation is involved.
 *
 * These lock current behaviour. Where a property is a real design choice
 * rather than an accident, the test says which choice it is, so that a
 * rewrite has to disagree deliberately.
 */

const GREEN: readonly [number, number, number, number] = [0, 255, 0, 255];
const RED: readonly [number, number, number, number] = [255, 0, 0, 255];

describe('ChromaKey key colour', () => {
    it('setKeyColor and setKeyColorHex agree', () => {
        const byComponent = new ChromaKey();
        byComponent.setKeyColor(18, 52, 86);
        const byHex = new ChromaKey();
        byHex.setKeyColorHex('#123456');
        assert.equal(byHex.keyR, byComponent.keyR);
        assert.equal(byHex.keyG, byComponent.keyG);
        assert.equal(byHex.keyB, byComponent.keyB);
    });

    it('accepts a hex string with or without the leading hash', () => {
        const withHash = new ChromaKey();
        withHash.setKeyColorHex('#00FF00');
        const without = new ChromaKey();
        without.setKeyColorHex('00FF00');
        assert.equal(without.keyR, withHash.keyR);
        assert.equal(without.keyG, withHash.keyG);
        assert.equal(without.keyB, withHash.keyB);
    });

    it('is case-insensitive about hex digits', () => {
        const upper = new ChromaKey();
        upper.setKeyColorHex('#ABCDEF');
        const lower = new ChromaKey();
        lower.setKeyColorHex('#abcdef');
        assert.equal(lower.keyR, upper.keyR);
        assert.equal(lower.keyG, upper.keyG);
        assert.equal(lower.keyB, upper.keyB);
    });

    it('defaults to a green key before anything sets one', () => {
        const ck = new ChromaKey();
        assert.equal(ck.keyR, 0);
        assert.equal(ck.keyG, 255);
        assert.equal(ck.keyB, 0);
    });
});

describe('ChromaKey.isBackgroundPixel', () => {
    const ck = new ChromaKey();
    const bg = { r: 0, g: 255, b: 0 };
    /** One pixel, so index 0 is the only one. */
    const pixel = (r: number, g: number, b: number): Uint8ClampedArray =>
        new Uint8ClampedArray([r, g, b, 255]);

    it('matches the background colour exactly', () => {
        assert.equal(ck.isBackgroundPixel(pixel(0, 255, 0), 0, bg, 0), true);
    });

    it('compares the mean absolute channel difference, not the max', () => {
        // One channel off by 30, the others exact: mean is 10, max is 30.
        // A max-based test would reject this at tolerance 10.
        assert.equal(ck.isBackgroundPixel(pixel(30, 255, 0), 0, bg, 10), true);
    });

    it('includes the boundary, so tolerance is inclusive', () => {
        // Mean difference of exactly 10.
        assert.equal(ck.isBackgroundPixel(pixel(30, 255, 0), 0, bg, 10), true);
        assert.equal(ck.isBackgroundPixel(pixel(33, 255, 0), 0, bg, 10), false);
    });

    it('rejects a colour far from the key', () => {
        assert.equal(ck.isBackgroundPixel(pixel(255, 0, 0), 0, bg, 10), false);
    });

    it('accepts anything once tolerance reaches the maximum mean difference', () => {
        assert.equal(ck.isBackgroundPixel(pixel(255, 0, 255), 0, bg, 255), true);
    });

    it('reads the pixel at the index it is given, not the first', () => {
        const two = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
        assert.equal(ck.isBackgroundPixel(two, 0, bg, 10), false);
        assert.equal(ck.isBackgroundPixel(two, 4, bg, 10), true);
    });

    it('ignores alpha entirely', () => {
        const transparentGreen = new Uint8ClampedArray([0, 255, 0, 0]);
        assert.equal(ck.isBackgroundPixel(transparentGreen, 0, bg, 0), true);
    });
});

describe('ChromaKey.process', () => {
    it('mutates the buffer in place rather than returning a copy', () => {
        const img = solid(2, 2, GREEN);
        const before = img.data;
        new ChromaKey().process(img);
        assert.equal(img.data, before, 'process must not replace the buffer');
    });

    it('leaves a colour far from the key opaque', () => {
        const img = solid(2, 2, RED);
        new ChromaKey().process(img);
        assert.equal(alphaAt(img, 0, 0), 255);
    });

    it('follows the key colour when it changes', () => {
        const img = solid(2, 2, RED);
        const ck = new ChromaKey();
        ck.setKeyColor(255, 0, 0);
        ck.process(img);
        assert.equal(alphaAt(img, 0, 0), 0, 'red should key out against a red key');
    });
});

describe('ChromaKey.edgeFloodFill', () => {
    const ck = new ChromaKey();
    const bg = { r: 0, g: 255, b: 0 };

    it('leaves a frame containing no background untouched', () => {
        const img = solid(4, 4, RED);
        const out = ck.edgeFloodFill(img, bg, 10);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                assert.equal(alphaAt(out, x, y), 255, `pixel ${x.toString()},${y.toString()}`);
            }
        }
    });

    it('clears a frame that is entirely background', () => {
        const img = solid(4, 4, GREEN);
        const out = ck.edgeFloodFill(img, bg, 10);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                assert.equal(alphaAt(out, x, y), 0, `pixel ${x.toString()},${y.toString()}`);
            }
        }
    });

    it('spreads through a four-way gap', () => {
        // Green everywhere except a red wall with a one-pixel orthogonal gap.
        const img = makeImageData(5, 5, (x, y) => {
            if (y === 2 && x !== 2) return RED;
            return GREEN;
        });
        const out = ck.edgeFloodFill(img, bg, 10);
        assert.equal(alphaAt(out, 2, 4), 0, 'background below the wall should be reached');
    });

    it('does not spread diagonally: connectivity is four-way, not eight', () => {
        // Row 0 is background and seeds from the top edge. (1,1) and (2,2)
        // are the only other background pixels and touch only at a corner;
        // everything else is red, so no other edge can seed them.
        const img = makeImageData(5, 5, (x, y) => {
            if (y === 0) return GREEN;
            if (y === 1 && x === 1) return GREEN;
            if (y === 2 && x === 2) return GREEN;
            return RED;
        });
        const out = ck.edgeFloodFill(img, bg, 10);
        assert.equal(alphaAt(out, 1, 1), 0,
            '(1,1) sits directly below row 0 and must be reached');
        assert.equal(alphaAt(out, 2, 2), 255,
            '(2,2) touches (1,1) only at a corner, so four-way fill must not reach it');
    });

    it('keeps an enclosed pocket of background that no edge path reaches', () => {
        // Red border, green interior: the interior is background-coloured but
        // walled off from every edge.
        const img = makeImageData(5, 5, (x, y) =>
            (x === 0 || y === 0 || x === 4 || y === 4) ? RED : GREEN);
        const out = ck.edgeFloodFill(img, bg, 10);
        assert.equal(alphaAt(out, 2, 2), 255, 'enclosed pocket must survive');
    });

    it('preserves the colour of pixels it keeps', () => {
        const img = solid(3, 3, RED);
        const out = ck.edgeFloodFill(img, bg, 10);
        assert.deepEqual(pixelAt(out, 1, 1), [255, 0, 0, 255]);
    });
});

describe('ChromaKey.applyEdgeFade', () => {
    it('is a no-op when fadeWidth is 0', () => {
        const img = solid(6, 6, RED);
        new ChromaKey().applyEdgeFade(img, 0);
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
                assert.equal(alphaAt(img, x, y), 255, `pixel ${x.toString()},${y.toString()}`);
            }
        }
    });

    it('never increases alpha', () => {
        const img = makeImageData(8, 8, () => [255, 0, 0, 200]);
        new ChromaKey().applyEdgeFade(img, 3);
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                assert.ok(alphaAt(img, x, y) <= 200, `pixel ${x.toString()},${y.toString()} rose`);
            }
        }
    });

    it('leaves the centre of a large frame fully opaque', () => {
        const img = solid(16, 16, RED);
        new ChromaKey().applyEdgeFade(img, 2);
        assert.equal(alphaAt(img, 8, 8), 255);
    });
});

describe('ChromaKey.applyAntiAlias', () => {
    it('leaves a fully opaque frame alone', () => {
        const img = solid(6, 6, RED);
        new ChromaKey().applyAntiAlias(img);
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
                assert.equal(alphaAt(img, x, y), 255, `pixel ${x.toString()},${y.toString()}`);
            }
        }
    });

    it('leaves a fully transparent frame alone', () => {
        const img = solid(6, 6, [0, 0, 0, 0]);
        new ChromaKey().applyAntiAlias(img);
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
                assert.equal(alphaAt(img, x, y), 0, `pixel ${x.toString()},${y.toString()}`);
            }
        }
    });

    it('reuses its scratch buffer across calls without corrupting results', () => {
        const ck = new ChromaKey();
        const build = (): ImageData => makeImageData(6, 6, (x) => x < 3 ? RED : [0, 0, 0, 0]);
        const first = build();
        ck.applyAntiAlias(first);
        const second = build();
        ck.applyAntiAlias(second);
        assert.deepEqual(Array.from(second.data), Array.from(first.data),
            'a second call must produce the same result as the first');
    });
});
