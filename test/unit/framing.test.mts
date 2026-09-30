import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../helpers/memory-store.mts';
import {
    DEFAULT_FRAMING,
    DEFAULT_STYLE,
    FRAMING_DIRECTIVES,
    FRAMING_SIZES,
    STYLE_DIRECTIVES,
    asFraming,
    asSpriteStyle,
    buildGenerateRequest,
    buildPrompt,
    describeSize,
    framingCanvas,
} from '../../src/core/sprite-prep-core.mts';
import {
    WAN_DEFAULTS,
    WAN_NEGATIVE_PROMPT,
    buildWanI2VWorkflow,
    wanNegativePrompt,
} from '../../src/core/comfyui-core.mts';
import {
    FRAMING_KEY,
    SPRITE_STYLE_KEY,
    loadFraming,
    loadSpriteStyle,
    saveFraming,
    saveSpriteStyle,
} from '../../src/core/preferences.mts';

/**
 * The product brief specifies a sprite with "Full body visible from head to
 * toe". The shipped prompt has always asked for the opposite, and said so in
 * the upstream JavaScript before this fork existed, so the brief described a
 * workflow abandoned before the code shipped.
 *
 * Meanwhile the video half still expects full body: the Wan negative prompt
 * guards against cropped feet and the letterboxing exists for the same
 * reason. Neither answer was wrong for every user, so it is a choice.
 */

const BASE = { name: 'Brannok', keyHex: '#00FF00' } as const;

describe('asFraming', () => {
    it('accepts the two framings', () => {
        assert.equal(asFraming('bust'), 'bust');
        assert.equal(asFraming('fullBody'), 'fullBody');
    });

    it('refuses anything else, the value coming from a data attribute', () => {
        for (const bad of ['', 'BUST', 'full-body', 'head', 'true']) {
            assert.equal(asFraming(bad), undefined, JSON.stringify(bad));
        }
    });
});

describe('buildPrompt framing', () => {
    /**
     * THE COMPATIBILITY CLAIM. Bust is the shipped wording unchanged, so a
     * prompt built without asking for a framing is byte for byte the prompt
     * this tool has always produced.
     */
    it('defaults to the shipped wording, so nothing changes for anyone', () => {
        assert.equal(DEFAULT_FRAMING, 'bust');
        assert.equal(buildPrompt(BASE), buildPrompt({ ...BASE, framing: 'bust' }));
    });

    it('asks for a waist-up shot and says no feet', () => {
        const prompt = buildPrompt({ ...BASE, framing: 'bust' });
        assert.match(prompt, /waist up/i);
        assert.match(prompt, /no feet visible/i);
        assert.doesNotMatch(prompt, /head to toe/i);
    });

    it('asks for head to toe and says both feet', () => {
        const prompt = buildPrompt({ ...BASE, framing: 'fullBody' });
        assert.match(prompt, /head to toe/i);
        assert.match(prompt, /including both feet/i);
        assert.doesNotMatch(prompt, /waist up/i);
        assert.doesNotMatch(prompt, /no feet visible/i);
    });

    /**
     * Two lines rather than one because they do different jobs. The first
     * places the character; the second states the composition and what must
     * NOT appear. Asking for a waist-up shot without saying "no feet"
     * reliably produces feet.
     */
    it('contributes both of its directive lines', () => {
        for (const framing of ['bust', 'fullBody'] as const) {
            const prompt = buildPrompt({ ...BASE, framing });
            for (const line of FRAMING_DIRECTIVES[framing]) {
                assert.ok(prompt.includes(line), `${framing} is missing a directive`);
            }
        }
    });

    it('contributes neither of the other framing lines', () => {
        const bust = buildPrompt({ ...BASE, framing: 'bust' });
        for (const line of FRAMING_DIRECTIVES.fullBody) {
            assert.ok(!bust.includes(line), 'a bust prompt must not carry full-body wording');
        }
    });

    it('changes its two directives and the canvas, and nothing else', () => {
        // The canvas is part of the framing: a standing figure down the
        // middle of a landscape canvas spends most of its pixels on
        // background the chroma key then discards. Everything else, the
        // background rules and the style rules, must be identical.
        const lines = (framing: 'bust' | 'fullBody'): string[] =>
            buildPrompt({ ...BASE, framing })
                .split('\n')
                .filter((line) => !FRAMING_DIRECTIVES[framing].includes(line))
                .filter((line) => !line.startsWith('The image must be exactly'));
        assert.deepEqual(lines('bust'), lines('fullBody'));
    });

    it('keeps working with the other options, which are independent', () => {
        const prompt = buildPrompt({
            ...BASE, framing: 'fullBody', raceMode: 'zoalith', desc: 'a knight',
        });
        assert.match(prompt, /head to toe/i);
        assert.match(prompt, /ANTHROPOMORPHIC/);
        assert.match(prompt, /a knight/);
    });

    /**
     * A STANDING FIGURE DOES NOT FIT A LANDSCAPE CANVAS. Full body in 3:2
     * puts the character down the middle and leaves both sides empty.
     */
    it('asks for landscape for a bust and portrait for a full body', () => {
        assert.match(buildPrompt({ ...BASE, framing: 'bust' }), /exactly 1536×1024 pixels/);
        assert.match(buildPrompt({ ...BASE, framing: 'fullBody' }), /exactly 1024×1536 pixels/);
    });

    /**
     * THE PROMPT USED TO CONTRADICT THE REQUEST. It claimed 1280×720 while
     * the request asked for 1536×1024, two different sizes AND two different
     * aspect ratios, so the placement guidance was calibrated against a
     * canvas that never existed. One source now, asserted rather than hoped.
     */
    it('states in the prompt exactly the size it asks the service for', () => {
        for (const framing of ['bust', 'fullBody'] as const) {
            const requested = buildGenerateRequest({ prompt: 'x', framing }).body.size;
            assert.match(
                buildPrompt({ ...BASE, framing }),
                new RegExp(`exactly ${describeSize(requested)} pixels`),
                framing,
            );
            assert.equal(requested, FRAMING_SIZES[framing]);
        }
    });

    it('keeps the bust canvas unchanged, so nothing moves for anyone who keeps it', () => {
        assert.equal(FRAMING_SIZES.bust, '1536x1024');
        assert.equal(buildGenerateRequest({ prompt: 'x' }).body.size, '1536x1024');
    });

    it('offers the same canvas as numbers, for ComfyUI which takes a pair', () => {
        assert.deepEqual(framingCanvas('bust'), { width: 1536, height: 1024 });
        assert.deepEqual(framingCanvas('fullBody'), { width: 1024, height: 1536 });
    });
});

describe('the framing is remembered', () => {
    it('defaults when nothing is stored', () => {
        assert.equal(loadFraming(memoryStore()), DEFAULT_FRAMING);
    });

    it('round-trips each choice', () => {
        const store = memoryStore();
        for (const framing of ['fullBody', 'bust'] as const) {
            saveFraming(store, framing);
            assert.equal(loadFraming(store), framing);
        }
    });

    it('falls back for a stored value that names no framing', () => {
        assert.equal(loadFraming(memoryStore({ [FRAMING_KEY]: 'nonsense' })), DEFAULT_FRAMING);
    });

    /**
     * Remembered because it describes the CHARACTER rather than the request.
     * A user with a full-body reference wants full body every time, and
     * re-picking it per generation is a chore that silently produces the
     * wrong sprite when forgotten.
     */
    it('survives independently of the other preferences', () => {
        const store = memoryStore();
        saveFraming(store, 'fullBody');
        assert.equal(store.read('sp-zoom'), undefined, 'it has its own key');
        assert.equal(loadFraming(store), 'fullBody');
    });
});

describe('the art style is a choice too', () => {
    /**
     * THE REPORTED CASE. A claymation reference supplied in the CHARACTER
     * slot produced an anime sprite, and correctly so. The character
     * reference asks only that the character match, never the style, so the
     * hardcoded anime line was the single substantive appearance instruction
     * in the prompt and nothing contested it.
     *
     * With every text field left blank, which is a reasonable way to use a
     * reference, the whole prompt reduced to one sentence plus that line.
     */
    it('no longer forces anime when the reference supplies the style', () => {
        const matched = buildPrompt({ ...BASE, style: 'reference' });
        assert.doesNotMatch(matched, /anime/i, 'nothing may compete with the reference');
        assert.doesNotMatch(matched, /bold dark outlines/i, 'that is an anime instruction too');
        assert.match(matched, /Match the art style of the provided reference image/);
        assert.match(matched, /Do not substitute a different art style/);
    });

    it('defaults to the shipped wording, so nothing changes for anyone', () => {
        assert.equal(DEFAULT_STYLE, 'anime');
        assert.equal(buildPrompt(BASE), buildPrompt({ ...BASE, style: 'anime' }));
        assert.match(buildPrompt(BASE), /high-quality anime\/JRPG art style/);
        assert.match(buildPrompt(BASE), /bold dark outlines/);
    });

    it('asks for each style and for no other', () => {
        // Typed pairs rather than Object.entries, because
        // exactOptionalPropertyTypes refuses a possibly-undefined style where
        // the option is optional rather than nullable.
        const wanted = [
            ['anime', /anime\/JRPG/],
            ['claymation', /modelling clay/],
            ['painterly', /visible brushwork/],
            ['pixel', /pixel art/],
        ] as const;
        for (const [style, pattern] of wanted) {
            const prompt = buildPrompt({ ...BASE, style });
            assert.match(prompt, pattern, style);
            for (const [other, otherPattern] of wanted) {
                if (other === style) continue;
                assert.doesNotMatch(prompt, otherPattern, `${style} must not ask for ${other}`);
            }
        }
    });

    /**
     * WHY THE EDGE LINE IS PER STYLE. "Bold dark outlines" is an anime
     * instruction, and asking for it alongside claymation asks for two
     * incompatible things. Every style still keeps what keying depends on.
     */
    it('keeps the keying requirement in every style', () => {
        for (const style of ['anime', 'claymation', 'painterly', 'pixel', 'reference'] as const) {
            const prompt = buildPrompt({ ...BASE, style });
            assert.match(prompt, /crisp, clean edges/, style);
            assert.match(prompt, /well-defined silhouette against the flat colored background/, style);
        }
    });

    it('asks for bold dark outlines only where they belong', () => {
        for (const style of ['claymation', 'painterly', 'pixel', 'reference'] as const) {
            assert.doesNotMatch(buildPrompt({ ...BASE, style }), /bold dark outlines/, style);
        }
    });

    it('changes nothing but its own two lines', () => {
        const lines = (style: 'anime' | 'claymation'): string[] =>
            buildPrompt({ ...BASE, style })
                .split('\n')
                .filter((line) => line !== STYLE_DIRECTIVES[style].style
                    && line !== STYLE_DIRECTIVES[style].edges);
        assert.deepEqual(lines('anime'), lines('claymation'));
    });

    it('is independent of the framing', () => {
        const prompt = buildPrompt({ ...BASE, style: 'claymation', framing: 'fullBody' });
        assert.match(prompt, /modelling clay/);
        assert.match(prompt, /head to toe/i);
    });

    it('refuses a value that names no style', () => {
        for (const bad of ['', 'ANIME', 'clay', '3d', 'true']) {
            assert.equal(asSpriteStyle(bad), undefined, JSON.stringify(bad));
        }
    });

    it('round-trips through the store and falls back when corrupt', () => {
        const store = memoryStore();
        saveSpriteStyle(store, 'claymation');
        assert.equal(loadSpriteStyle(store), 'claymation');
        assert.equal(loadSpriteStyle(memoryStore({ [SPRITE_STYLE_KEY]: 'nope' })), DEFAULT_STYLE);
    });

    /**
     * The scenario as reported: every field blank, one reference image. The
     * prompt is then almost entirely the tool's own wording, which is what
     * made the hardcoded style line decisive.
     */
    it('leaves the reference in charge when every field is blank', () => {
        const bare = buildPrompt({ keyHex: '#00FF00', style: 'reference', framing: 'fullBody' });
        assert.match(bare, /A single Character, standing in a neutral idle position\./);
        assert.doesNotMatch(bare, /anime/i);
        assert.match(bare, /head to toe/i);
    });
});

describe('the framing reaches the video stage', () => {
    /**
     * The Wan negative prompt guarded "cropped feet" and the ComfyUI video
     * prompt asked for a full body in frame, whatever the sprite contained.
     * On a bust sprite there are no feet to preserve, "upper body only" is
     * exactly what was asked for, and the model was being told to avoid the
     * framing it had been handed.
     */
    it('refuses cropped feet only when there are feet to lose', () => {
        const full = wanNegativePrompt(true);
        const bust = wanNegativePrompt(false);
        assert.match(full, /cropped feet/);
        assert.doesNotMatch(bust, /cropped feet/);
        assert.doesNotMatch(bust, /feet cut off/);
    });

    it('does not tell a bust to avoid being an upper body', () => {
        assert.match(wanNegativePrompt(true), /upper body only/);
        assert.doesNotMatch(wanNegativePrompt(false), /upper body only/);
        assert.doesNotMatch(wanNegativePrompt(false), /close-up/);
    });

    it('keeps what every framing refuses', () => {
        for (const full of [true, false]) {
            const prompt = wanNegativePrompt(full);
            for (const term of ['blurry', 'watermark', 'camera move', 'zoom', 'pan', 'cropped head']) {
                assert.ok(prompt.includes(term), `${String(full)} lost ${term}`);
            }
        }
    });

    it('preserves the shipped constant as the full-body case', () => {
        assert.equal(WAN_NEGATIVE_PROMPT, wanNegativePrompt(true));
    });

    it('builds a Wan graph whose negative prompt follows the framing', () => {
        const settings = { ...WAN_DEFAULTS };
        const opts = { imageName: 'ref.png', positiveText: 'idle', seed: 1 };
        const full = JSON.stringify(buildWanI2VWorkflow(settings, { ...opts, fullBody: true }).workflow);
        const bust = JSON.stringify(buildWanI2VWorkflow(settings, { ...opts, fullBody: false }).workflow);
        assert.ok(full.includes('cropped feet'));
        assert.ok(!bust.includes('cropped feet'));
    });

    it('defaults a graph to full body, which is what the constant always asked for', () => {
        const settings = { ...WAN_DEFAULTS };
        const stated = buildWanI2VWorkflow(settings, {
            imageName: 'r.png', positiveText: 'x', seed: 1, fullBody: true,
        });
        const absent = buildWanI2VWorkflow(settings, {
            imageName: 'r.png', positiveText: 'x', seed: 1,
        });
        assert.deepEqual(absent.workflow, stated.workflow);
    });
});
