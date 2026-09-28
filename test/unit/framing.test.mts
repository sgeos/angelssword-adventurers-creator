import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../helpers/memory-store.mts';
import {
    DEFAULT_FRAMING,
    FRAMING_DIRECTIVES,
    asFraming,
    buildPrompt,
} from '../../src/core/sprite-prep-core.mts';
import { FRAMING_KEY, loadFraming, saveFraming } from '../../src/core/preferences.mts';

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

    it('changes nothing else about the prompt', () => {
        // Every line that is not a framing directive must be identical, so
        // the choice cannot quietly alter the background or the style rules.
        const lines = (framing: 'bust' | 'fullBody'): string[] =>
            buildPrompt({ ...BASE, framing })
                .split('\n')
                .filter((line) => !FRAMING_DIRECTIVES[framing].includes(line));
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

    it('states the same canvas size for both, the framing deciding content not size', () => {
        for (const framing of ['bust', 'fullBody'] as const) {
            assert.match(buildPrompt({ ...BASE, framing }), /exactly 1280×720 pixels/);
        }
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
