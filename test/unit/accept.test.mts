import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANY_TYPE, acceptToMediaTypes } from '../../src/core/accept.mts';

/**
 * The translation from an input's `accept` attribute to the media types the
 * phone's document picker filters by. The cases are the stages' own inputs,
 * and the failure direction that matters: an attribute the table cannot
 * translate must widen the filter, never hide a file the input would take.
 */
describe('acceptToMediaTypes', () => {
    it('translates the video inputs, extension included, without repeating a type', () => {
        assert.deepEqual(acceptToMediaTypes('video/mp4,video/webm,video/quicktime,.mov'), [
            'video/mp4',
            'video/webm',
            'video/quicktime',
        ]);
    });

    it('keeps the sprite input\'s explicit image types', () => {
        assert.deepEqual(acceptToMediaTypes('image/png,image/jpeg,image/webp'), ['image/png', 'image/jpeg', 'image/webp']);
    });

    it('passes a wildcard subtype through', () => {
        assert.deepEqual(acceptToMediaTypes('image/*'), ['image/*']);
    });

    it('ignores spacing and case, and empty entries', () => {
        assert.deepEqual(acceptToMediaTypes(' Image/PNG , ,.JPG '), ['image/png', 'image/jpeg']);
    });

    it('allows anything for an absent attribute', () => {
        assert.deepEqual(acceptToMediaTypes(''), [ANY_TYPE]);
        assert.deepEqual(acceptToMediaTypes(' , '), [ANY_TYPE]);
    });

    it('widens to anything for an extension it does not know, rather than hiding files', () => {
        assert.deepEqual(acceptToMediaTypes('video/mp4,.mkv'), [ANY_TYPE]);
    });

    it('widens to anything for an entry that is not a media type', () => {
        assert.deepEqual(acceptToMediaTypes('image/png,not a type'), [ANY_TYPE]);
        assert.deepEqual(acceptToMediaTypes('image/png;q=1'), [ANY_TYPE]);
    });

    it('widens to anything when the attribute already says so', () => {
        assert.deepEqual(acceptToMediaTypes('image/png,*/*'), [ANY_TYPE]);
    });
});
