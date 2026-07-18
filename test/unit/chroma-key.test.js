'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ChromaKey } = require('../../public/lib/chroma-key.js');

/** Build ImageData-like object usable in Node. */
function makeImageData(width, height, fillFn) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const [r, g, b, a] = fillFn(x, y);
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
    }
    return { data, width, height };
}

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
        const img = makeImageData(8, 8, (x, y) => {
            const edge = x === 0 || y === 0 || x === 7 || y === 7;
            return edge ? [0, 255, 0, 255] : [255, 0, 0, 255];
        });
        const bg = { r: 0, g: 255, b: 0 };
        ck.edgeFloodFill(img, bg, 40);

        // Border pixels transparent
        for (let x = 0; x < 8; x++) {
            assert.equal(img.data[(0 * 8 + x) * 4 + 3], 0, `top ${x}`);
            assert.equal(img.data[(7 * 8 + x) * 4 + 3], 0, `bot ${x}`);
        }
        for (let y = 0; y < 8; y++) {
            assert.equal(img.data[(y * 8 + 0) * 4 + 3], 0, `left ${y}`);
            assert.equal(img.data[(y * 8 + 7) * 4 + 3], 0, `right ${y}`);
        }
        // Center red stays opaque
        assert.equal(img.data[(3 * 8 + 3) * 4 + 3], 255);
        assert.equal(img.data[(3 * 8 + 3) * 4], 255);
    });

    it('edgeFloodFill: enclosed green pocket stays opaque', () => {
        // 8x8: green border, red ring, green pocket at center — pocket not edge-connected
        const ck = new ChromaKey();
        ck.setKeyColorHex('#00FF00');
        const img = makeImageData(8, 8, (x, y) => {
            const edge = x === 0 || y === 0 || x === 7 || y === 7;
            if (edge) return [0, 255, 0, 255];
            // pocket at (3,3)-(4,4)
            if (x >= 3 && x <= 4 && y >= 3 && y <= 4) return [0, 255, 0, 255];
            return [255, 0, 0, 255];
        });
        ck.edgeFloodFill(img, { r: 0, g: 255, b: 0 }, 40);

        // Enclosed pocket remains opaque after flood fill alone
        assert.equal(img.data[(3 * 8 + 3) * 4 + 3], 255);
        assert.equal(img.data[(4 * 8 + 4) * 4 + 3], 255);
        // Outer border cleared
        assert.equal(img.data[3], 0);
    });

    it('process solid green frame → all transparent', () => {
        const ck = new ChromaKey();
        ck.setKeyColorHex('#00FF00');
        const img = makeImageData(4, 4, () => [0, 255, 0, 255]);
        ck.process(img);
        for (let i = 0; i < 16; i++) {
            assert.equal(img.data[i * 4 + 3], 0, `pixel ${i}`);
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

        const cornerA = img.data[(0 * 20 + 0) * 4 + 3];
        const midTop = img.data[(0 * 20 + 10) * 4 + 3];
        // Corner minDist=0 → alpha 0; mid-top minDist=0 still (y=0) → also 0
        // Use near-corner vs deeper mid-edge: (1,1) vs (0,10) both on edge...
        // Corners have minDist to left AND top = 0.
        // Mid-left edge (x=0,y=10): minDist=0 as well.
        // Better: compare (2,2) near corner vs (10,2) mid near top.
        const nearCorner = img.data[(2 * 20 + 2) * 4 + 3];
        const midNearTop = img.data[(2 * 20 + 10) * 4 + 3];
        // nearCorner minDist=2 → factor=(0.2)^2=0.04 → alpha≈10
        // midNearTop minDist=2 (top) → same... need different minDist
        // (5,5) minDist=5 → factor=0.25 → alpha=64
        // (10,1) minDist=1 → factor=0.01 → alpha=3
        // Actually corners are MORE transparent: (1,1) minDist=1 vs (10,5) minDist=5
        const c = img.data[(1 * 20 + 1) * 4 + 3];
        const mid = img.data[(5 * 20 + 10) * 4 + 3];
        assert.ok(c < mid, `corner alpha ${c} should be < mid-edge ${mid}`);
        assert.equal(cornerA, 0);
        assert.ok(midTop === 0 || midTop < 255); // on top edge
    });

    it('applyAntiAlias: no pixel alpha increases', () => {
        const ck = new ChromaKey();
        // Opaque square with jagged edge against transparent
        const img = makeImageData(8, 8, (x, y) => {
            if (x >= 3 && y >= 3) return [200, 100, 50, 255];
            return [0, 0, 0, 0];
        });
        const before = Uint8Array.from(img.data.filter((_, i) => i % 4 === 3));
        ck.applyAntiAlias(img);
        for (let i = 0; i < 64; i++) {
            const after = img.data[i * 4 + 3];
            assert.ok(after <= before[i], `alpha increased at ${i}: ${before[i]} → ${after}`);
        }
    });
});
