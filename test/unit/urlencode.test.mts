import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formUrlEncode, formUrlEncodeComponent } from '../../src/core/urlencode.mts';

/**
 * The core cannot use URLSearchParams, because it compiles without the DOM lib
 * and without the node types. This suite is what keeps the replacement honest.
 * The claim is not that the encoder resembles URLSearchParams but that it
 * agrees with it, so the assertions compare against it directly rather than
 * against a table of expected strings written by the same hand as the encoder.
 *
 * The test project has URLSearchParams, and that asymmetry is the point. The
 * oracle is available exactly where it is permitted to be.
 */

const CASES: readonly string[] = [
    '',
    'plain',
    'a b.png',
    'ComfyUI_00001_.png',
    'sub/folder',
    'a+b',
    'a&b=c',
    'percent%20already',
    "quote'apostrophe",
    'bang!tilde~star*',
    'parens(and)more',
    'dash-underscore_dot.',
    'accented éü',
    'ideographic 中文',
    'astral \u{1f600}',
    'newline \n and tab \t',
    '  leading and trailing  ',
];

describe('formUrlEncodeComponent agrees with URLSearchParams', () => {
    for (const input of CASES) {
        it(`encodes ${JSON.stringify(input)} as URLSearchParams does`, () => {
            // URLSearchParams has no single-component API, so the oracle is a
            // one-pair serialisation with an empty name, whose value half is
            // exactly the component encoding.
            const oracle = new URLSearchParams([['', input]]).toString().slice(1);
            assert.equal(formUrlEncodeComponent(input), oracle);
        });
    }
});

describe('formUrlEncode agrees with URLSearchParams on whole query strings', () => {
    it('encodes names as well as values', () => {
        const pairs: readonly (readonly [string, string])[] = [
            ['a name', 'a value'],
            ['sym!bol', "it's"],
            ['é', '中'],
        ];
        const oracle = new URLSearchParams(pairs.map(([n, v]) => [n, v])).toString();
        assert.equal(formUrlEncode(pairs), oracle);
    });

    it('yields an empty string for no pairs, not a bare separator', () => {
        assert.equal(formUrlEncode([]), '');
    });

    it('preserves pair order', () => {
        assert.equal(formUrlEncode([['b', '1'], ['a', '2']]), 'b=1&a=2');
    });

    it('keeps an empty value as a bare equals, which is what round-trips', () => {
        assert.equal(formUrlEncode([['k', '']]), 'k=');
        assert.equal(new URLSearchParams('k=').get('k'), '');
    });
});
