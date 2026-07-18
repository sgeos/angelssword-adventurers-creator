'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { debounce, base64ToBlob, hexToRgb, colorName } = require('../../public/lib/app-utils.js');

describe('app-utils', () => {
    it('hexToRgb(#00FF00) → {r:0,g:255,b:0}', () => {
        assert.deepEqual(hexToRgb('#00FF00'), { r: 0, g: 255, b: 0 });
    });

    it('colorName maps five key colors and passthrough unknown', () => {
        assert.equal(colorName('#00FF00'), 'Green');
        assert.equal(colorName('#FF00FF'), 'Magenta');
        assert.equal(colorName('#0000FF'), 'Blue');
        assert.equal(colorName('#FFFF00'), 'Yellow');
        assert.equal(colorName('#00FFFF'), 'Cyan');
        assert.equal(colorName('#abcdef'), '#abcdef');
        assert.equal(colorName('#123456'), '#123456');
    });

    it('base64ToBlob without data: prefix', async () => {
        // 1x1 red PNG-ish raw bytes as base64 of "hi"
        const b64 = Buffer.from([0, 1, 2, 255]).toString('base64');
        const blob = base64ToBlob(b64, 'application/octet-stream');
        assert.ok(blob instanceof Blob);
        assert.equal(blob.type, 'application/octet-stream');
        const buf = Buffer.from(await blob.arrayBuffer());
        assert.deepEqual([...buf], [0, 1, 2, 255]);
    });

    it('base64ToBlob with data: prefix', async () => {
        const b64 = Buffer.from([10, 20, 30]).toString('base64');
        const blob = base64ToBlob(`data:image/png;base64,${b64}`, 'image/png');
        assert.ok(blob instanceof Blob);
        assert.equal(blob.type, 'image/png');
        const buf = Buffer.from(await blob.arrayBuffer());
        assert.deepEqual([...buf], [10, 20, 30]);
    });

    it('debounce fires once after quiet period', () => {
        const realSetTimeout = global.setTimeout;
        const realClearTimeout = global.clearTimeout;
        let now = 0;
        const timers = new Map();
        let nextId = 1;

        global.setTimeout = (fn, ms) => {
            const id = nextId++;
            timers.set(id, { fn, due: now + ms });
            return id;
        };
        global.clearTimeout = (id) => { timers.delete(id); };

        try {
            let calls = 0;
            const fn = debounce(() => { calls++; }, 100);
            fn();
            fn();
            fn();
            assert.equal(calls, 0);

            now = 99;
            for (const [id, t] of [...timers]) {
                if (t.due <= now) { timers.delete(id); t.fn(); }
            }
            assert.equal(calls, 0);

            now = 100;
            for (const [id, t] of [...timers]) {
                if (t.due <= now) { timers.delete(id); t.fn(); }
            }
            assert.equal(calls, 1);

            now = 300;
            for (const [id, t] of [...timers]) {
                if (t.due <= now) { timers.delete(id); t.fn(); }
            }
            assert.equal(calls, 1);
        } finally {
            global.setTimeout = realSetTimeout;
            global.clearTimeout = realClearTimeout;
        }
    });
});
