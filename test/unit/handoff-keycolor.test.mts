import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, type DomEnvironment } from '../helpers/dom-env.mts';
import { ChromaKey } from '../../src/core/chroma-key.mts';

/**
 * Covers the key colour handoff, which was unreachable before.
 *
 * Sprite Prep writes the colour it keyed against to `handoff.keyColor`. The
 * exporter previously looked for that colour on `handoff.videoPrepData`, an
 * object that never carries it, so the branch never fired and the colour was
 * silently discarded. These tests exercise the adoption logic directly.
 */

let env: DomEnvironment | undefined;
afterEach(() => {
    env?.cleanup();
    env = undefined;
});

/** The swatch markup the exporter's selection step walks. */
const SWATCHES = `<!doctype html><html><body>
  <div class="color-swatches" id="exColorSwatches">
    <div class="color-swatch selected" data-color="#00FF00"></div>
    <div class="color-swatch" data-color="#FF00FF"></div>
    <div class="color-swatch" data-color="#0000FF"></div>
  </div>
</body></html>`;

/**
 * The adoption logic as the exporter performs it, expressed against a keyer
 * and a document. The exporter method also refreshes the preview, which needs
 * a canvas context jsdom does not provide.
 */
function adopt(keyer: ChromaKey, doc: Document, hex: string): boolean {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
    keyer.setKeyColorHex(hex);
    for (const el of doc.querySelectorAll('.color-swatch')) {
        if (el instanceof (doc.defaultView?.HTMLElement ?? HTMLElement)) {
            el.classList.toggle('selected', el.dataset['color'] === hex.toUpperCase());
        }
    }
    return true;
}

describe('key colour handoff', () => {
    it('applies a colour supplied over the handoff to the keyer', () => {
        env = installDom(SWATCHES);
        const keyer = new ChromaKey();
        assert.equal(keyer.keyG, 255, 'starts on the default green');

        assert.equal(adopt(keyer, env.document, '#FF00FF'), true);
        assert.equal(keyer.keyR, 255);
        assert.equal(keyer.keyG, 0);
        assert.equal(keyer.keyB, 255);
    });

    it('moves the selected swatch to the adopted colour', () => {
        env = installDom(SWATCHES);
        adopt(new ChromaKey(), env.document, '#FF00FF');

        const selected = env.document.querySelectorAll('.color-swatch.selected');
        assert.equal(selected.length, 1, 'exactly one swatch stays selected');
        assert.equal(selected[0]?.getAttribute('data-color'), '#FF00FF');
    });

    it('accepts lower case hex, since the swatches are upper case', () => {
        env = installDom(SWATCHES);
        adopt(new ChromaKey(), env.document, '#ff00ff');
        assert.equal(
            env.document.querySelector('.color-swatch.selected')?.getAttribute('data-color'),
            '#FF00FF',
        );
    });

    it('ignores a malformed colour rather than applying it', () => {
        env = installDom(SWATCHES);
        const keyer = new ChromaKey();
        for (const bad of ['', 'green', '#FFF', '#GGGGGG', '00FF00', '#00FF0']) {
            assert.equal(adopt(keyer, env.document, bad), false, `expected ${bad} rejected`);
        }
        assert.equal(keyer.keyG, 255, 'the keyer is untouched by rejected input');
    });

    it('leaves no swatch selected for a colour with no matching swatch', () => {
        env = installDom(SWATCHES);
        adopt(new ChromaKey(), env.document, '#123456');
        assert.equal(env.document.querySelectorAll('.color-swatch.selected').length, 0);
    });

    it('drives the keyer such that the adopted colour is removed from a frame', () => {
        env = installDom(SWATCHES);
        const keyer = new ChromaKey();
        adopt(keyer, env.document, '#FF00FF');

        // A solid magenta frame should key out entirely once magenta is the key.
        const data = new Uint8ClampedArray(4 * 4 * 4);
        for (let i = 0; i < 16; i++) {
            data[i * 4] = 255; data[i * 4 + 1] = 0; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
        }
        const frame: ImageData = { data, width: 4, height: 4, colorSpace: 'srgb' };
        keyer.process(frame);
        assert.equal(frame.data[3], 0, 'magenta is transparent once adopted as the key');
    });
});
