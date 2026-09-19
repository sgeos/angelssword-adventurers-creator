import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { debounce, base64ToBlob } from '../../src/platform-browser/app-utils.mts';
// hexToRgb and colorName moved to the core, neither touching the platform.
// The assertions below stay here as well as in color.test.mts, so that the
// move is proved not to have changed what they answer.
import { hexToRgb, colorName } from '../../src/core/color.mts';

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
        // node:test's fake timers replace the originals in a typed,
        // supported way. The previous version assigned an untyped stub over
        // global.setTimeout, which no longer typechecks and never matched
        // Node's signature anyway.
        mock.timers.enable({ apis: ['setTimeout'] });
        try {
            let calls = 0;
            const fn = debounce(() => { calls++; }, 100);
            fn();
            fn();
            fn();
            assert.equal(calls, 0);

            mock.timers.tick(99);
            assert.equal(calls, 0, 'must not fire before the quiet period elapses');

            mock.timers.tick(1);
            assert.equal(calls, 1, 'fires once at the end of the quiet period');

            mock.timers.tick(200);
            assert.equal(calls, 1, 'does not fire again for the same burst');
        } finally {
            mock.timers.reset();
        }
    });
});
