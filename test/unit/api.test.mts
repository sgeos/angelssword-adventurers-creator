import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reasonText, responseErrorMessage } from '../../src/core/api.mts';

/**
 * Both helpers read values the app does not control: a rejection reason, and a
 * proxy response body. Every branch here is a shape that arrives at runtime
 * and cannot be checked at compile time.
 */

describe('reasonText', () => {
    it('takes the message from an Error', () => {
        assert.equal(reasonText(new Error('upstream refused')), 'upstream refused');
    });

    it('takes the message from an Error subclass', () => {
        assert.equal(reasonText(new TypeError('bad input')), 'bad input');
    });

    it('stringifies non-Error rejections rather than yielding undefined', () => {
        assert.equal(reasonText('plain string'), 'plain string');
        assert.equal(reasonText(404), '404');
        assert.equal(reasonText(null), 'null');
        assert.equal(reasonText(undefined), 'undefined');
    });

    it('survives an Error with an empty message', () => {
        assert.equal(reasonText(new Error('')), '');
    });
});

describe('responseErrorMessage', () => {
    it('reads the nested error.message the OpenAI proxy returns', () => {
        assert.equal(
            responseErrorMessage({ error: { message: 'no credits remaining' } }),
            'no credits remaining',
        );
    });

    it('reads a bare message', () => {
        assert.equal(responseErrorMessage({ message: 'quota exceeded' }), 'quota exceeded');
    });

    it('prefers the nested message when both are present', () => {
        assert.equal(
            responseErrorMessage({ error: { message: 'nested' }, message: 'bare' }),
            'nested',
        );
    });

    it('falls through to the bare message when the nested one is unusable', () => {
        assert.equal(responseErrorMessage({ error: {}, message: 'bare' }), 'bare');
        assert.equal(responseErrorMessage({ error: null, message: 'bare' }), 'bare');
        assert.equal(responseErrorMessage({ error: 'text', message: 'bare' }), 'bare');
        assert.equal(responseErrorMessage({ error: { message: 42 }, message: 'bare' }), 'bare');
    });

    it('treats an empty message as absent, so callers can use the HTTP status', () => {
        assert.equal(responseErrorMessage({ error: { message: '' } }), undefined);
        assert.equal(responseErrorMessage({ message: '' }), undefined);
        assert.equal(responseErrorMessage({ error: { message: '' }, message: 'bare' }), 'bare');
    });

    it('yields undefined for bodies carrying no message', () => {
        assert.equal(responseErrorMessage({}), undefined);
        assert.equal(responseErrorMessage({ error: { code: 500 } }), undefined);
        assert.equal(responseErrorMessage({ detail: 'something' }), undefined);
    });

    it('yields undefined for non-object bodies', () => {
        for (const body of [null, undefined, 'error', 42, true]) {
            assert.equal(responseErrorMessage(body), undefined);
        }
    });

    it('handles an array body without throwing', () => {
        assert.equal(responseErrorMessage([]), undefined);
        assert.equal(responseErrorMessage([{ message: 'x' }]), undefined);
    });
});
