/**
 * GREEN characterization tests for video-gen-core.
 * Locks CURRENT behavior including known quirks — do not "fix" production.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { at } from '../helpers/at.mts';
import { imagePart, parts, textPart } from '../helpers/request-parts.mts';
import {
    DEFAULT_PROMPT,
    MODEL,
    buildVideoRequestBody,
    detectMime,
    extractVideoPayload,
    pickHandoffVideo,
    parseGenCount,
    stripDataUrl,
} from '../../src/core/video-gen-core.mts';

describe('video-gen-core buildVideoRequestBody', () => {
    it('reference body strips data-URL prefix, sets image_to_video, detects png mime', () => {
        const body = buildVideoRequestBody({
            prompt: 'walk cycle',
            mode: 'reference',
            referenceImages: [{ dataUrl: 'data:image/png;base64,AAAA' }],
        });

        assert.equal(body.model, MODEL);
        assert.equal(body.model, 'gemini-omni-flash-preview');
        assert.equal(body.input.length, 2);
        assert.deepEqual(at(parts(body.input), 0), {
            type: 'image',
            data: 'AAAA',
            mime_type: 'image/png',
        });
        assert.deepEqual(at(parts(body.input), 1), { type: 'text', text: 'walk cycle' });
        assert.deepEqual(body.generation_config, {
            video_config: { task: 'image_to_video' },
        });
    });

    it('reference body detects jpeg mime when data-URL is not png', () => {
        const body = buildVideoRequestBody({
            prompt: 'idle',
            mode: 'reference',
            referenceImages: [{ dataUrl: 'data:image/jpeg;base64,JPEGDATA' }],
        });
        assert.equal(imagePart(body.input, 0).mime_type, 'image/jpeg');
        assert.equal(imagePart(body.input, 0).data, 'JPEGDATA');
    });

    it('empty prompt → default breathing idle string from source', () => {
        const body = buildVideoRequestBody({
            prompt: '',
            mode: 'reference',
            referenceImages: [{ dataUrl: 'data:image/png;base64,XX' }],
        });
        assert.equal(
            textPart(body.input, 1).text,
            'Generate a gentle breathing idle animation with slight body sway. Keep the character on the same background.'
        );
        assert.equal(textPart(body.input, 1).text, DEFAULT_PROMPT);
    });

    /**
     * RESOLVED 2026-09-28. Keyframe mode REFUSED to proceed without a second
     * image and then discarded it, describing the end pose in prose. Both
     * images are now sent and the prose names which is which.
     *
     * The old behaviour was an omission rather than a finding, so nothing is
     * lost by changing it. What Gemini makes of two images is not
     * established, and neither was what it made of one.
     */
    it('keyframe: both images sent, and the text says which is which', () => {
        const body = buildVideoRequestBody({
            prompt: 'morph',
            mode: 'keyframe',
            referenceImages: [
                { dataUrl: 'data:image/png;base64,START' },
                { dataUrl: 'data:image/png;base64,END' },
            ],
        });

        assert.equal(body.input.length, 3, 'two images and the text');
        assert.equal(imagePart(body.input, 0).data, 'START');
        assert.equal(imagePart(body.input, 1).data, 'END');
        assert.match(
            textPart(body.input, 2).text,
            /^The first image is the start frame and the last image is the end frame\. Animate a smooth transition between them\. morph$/
        );
        assert.equal(body.generation_config?.video_config.task, 'image_to_video');
    });

    /**
     * The operator's decision of 2026-10-07. A two image run came back
     * landscape where a one image run came back portrait, and the operator
     * chose the single image rather than settle the cause by experiment.
     */
    describe('reference mode sends the first image only', () => {
        const three = [
            { dataUrl: 'data:image/png;base64,ONE' },
            { dataUrl: 'data:image/jpeg;base64,TWO' },
            { dataUrl: 'data:image/png;base64,THREE' },
        ];

        it('drops every image after the first', () => {
            const body = buildVideoRequestBody({ prompt: 'idle', mode: 'reference', referenceImages: three });
            assert.equal(body.input.length, 2, 'one image and the text');
            assert.equal(imagePart(body.input, 0).data, 'ONE');
            assert.equal(textPart(body.input, 1).text, 'idle');
        });

        it('sends the same request for one image as for three', () => {
            const one = buildVideoRequestBody({ prompt: 'x', mode: 'reference', referenceImages: three.slice(0, 1) });
            const all = buildVideoRequestBody({ prompt: 'x', mode: 'reference', referenceImages: three });
            assert.deepEqual(all, one);
        });

        it('applies when no mode is named, reference being the default', () => {
            const body = buildVideoRequestBody({ prompt: 'x', referenceImages: three });
            assert.equal(body.input.length, 2);
        });

        it('keeps the first image own mime type', () => {
            const body = buildVideoRequestBody({
                prompt: 'x', mode: 'reference',
                referenceImages: [{ dataUrl: 'data:image/jpeg;base64,J' }, { dataUrl: 'data:image/png;base64,P' }],
            });
            assert.equal(imagePart(body.input, 0).mime_type, 'image/jpeg');
        });
    });

    /** Outside the decision: a keyframe request means a start and an end. */
    describe('keyframe mode still sends its start and end frames', () => {
        it('sends both, start first, and says which is which', () => {
            const body = buildVideoRequestBody({
                prompt: 'jump', mode: 'keyframe',
                referenceImages: [{ dataUrl: 'data:image/png;base64,START' }, { dataUrl: 'data:image/png;base64,END' }],
            });
            assert.equal(body.input.length, 3);
            assert.equal(imagePart(body.input, 0).data, 'START');
            assert.equal(imagePart(body.input, 1).data, 'END');
            assert.match(textPart(body.input, 2).text, /first image is the start frame/);
        });
    });

    it('duration is unused in POST body (quirk — UI collects it, body omits it)', () => {
        // Quirk: generateOneVideo receives duration but buildVideoRequestBody never accepts/adds it.
        const body = buildVideoRequestBody({
            prompt: 'x',
            mode: 'reference',
            referenceImages: [{ dataUrl: 'data:image/png;base64,Y' }],
            duration: 8, // even if a caller passes it, it must not appear
        });
        assert.ok(!('duration' in body), 'duration must not reach the request body');
        assert.ok(!('video_length' in (body.generation_config?.video_config ?? {})));
    });
});

describe('video-gen-core extractVideoPayload', () => {
    it('extracts from Interactions steps model_output video', () => {
        const payload = extractVideoPayload({
            steps: [
                { type: 'thought', content: [] },
                {
                    type: 'model_output',
                    content: [
                        { type: 'video', mime_type: 'video/mp4', data: 'VIDB64' },
                    ],
                },
            ],
        });
        assert.deepEqual(payload, { mimeType: 'video/mp4', base64: 'VIDB64' });
    });

    it('defaults mime_type to video/mp4 when missing on Interactions video item', () => {
        const payload = extractVideoPayload({
            steps: [{
                type: 'model_output',
                content: [{ type: 'video', data: 'NODATA' }],
            }],
        });
        // A guard rather than notEqual: the matcher asserts at runtime but
        // does not narrow, and optional chaining after it reads as if the
        // absence were tolerable, which the next two lines say it is not.
        if (payload === null) throw new Error('a video payload must be found');
        assert.equal(payload.mimeType, 'video/mp4');
        assert.equal(payload.base64, 'NODATA');
    });

    it('extracts from candidates inlineData (generateContent fallback)', () => {
        const payload = extractVideoPayload({
            candidates: [{
                content: {
                    parts: [{
                        inlineData: {
                            mimeType: 'video/webm',
                            data: 'CAND64',
                        },
                    }],
                },
            }],
        });
        assert.deepEqual(payload, { mimeType: 'video/webm', base64: 'CAND64' });
    });

    it('extracts from nested data.result (polled operation shape)', () => {
        const payload = extractVideoPayload({
            result: {
                steps: [{
                    type: 'model_output',
                    content: [{ type: 'video', mime_type: 'video/mp4', data: 'NESTED' }],
                }],
            },
        });
        assert.deepEqual(payload, { mimeType: 'video/mp4', base64: 'NESTED' });
    });

    it('missing video returns null (IIFE wrapper throws — pure core returns null)', () => {
        assert.equal(extractVideoPayload({ status: 'completed' }), null);
        assert.equal(extractVideoPayload({ steps: [] }), null);
        assert.equal(extractVideoPayload({ candidates: [] }), null);
        assert.equal(extractVideoPayload(null), null);
    });
});

describe('video-gen-core pickHandoffVideo', () => {
    it('handoff picker: first selected index only (multi-select UI vs single handoff quirk)', () => {
        const videos = [
            { id: 'a' },
            { id: 'b' },
            { id: 'c' },
        ];
        // Selection order [2, 0] — handoff still uses first entry only
        assert.deepEqual(pickHandoffVideo(videos, [2, 0]), { id: 'c' });
        assert.deepEqual(pickHandoffVideo(videos, [0, 1, 2]), { id: 'a' });
        assert.equal(pickHandoffVideo(videos, []), undefined);
    });
});

describe('video-gen-core parseGenCount', () => {
    it('maps genCount → N (default 1)', () => {
        assert.equal(parseGenCount('3'), 3);
        assert.equal(parseGenCount(2), 2);
        assert.equal(parseGenCount(null), 1);
        assert.equal(parseGenCount(''), 1);
    });
});

// pollOperation is dead in production (never called) — no need to test poll.

/**
 * stripDataUrl and detectMime read strings the browser hands over from a file
 * the user chose. Both were exercised only indirectly through
 * buildVideoRequestBody until now.
 */
describe('stripDataUrl', () => {
    it('drops the data-URL prefix and returns the payload', () => {
        assert.equal(stripDataUrl('data:image/png;base64,AAAA'), 'AAAA');
        assert.equal(stripDataUrl('data:image/jpeg;base64,/9j/4AAQ'), '/9j/4AAQ');
    });

    it('splits on the first comma, so a payload containing one survives', () => {
        assert.equal(stripDataUrl('data:text/plain,a,b,c'), 'a,b,c');
    });

    it('returns the input unchanged when there is no comma', () => {
        assert.equal(stripDataUrl('AAAA'), 'AAAA');
        assert.equal(stripDataUrl(''), '');
        assert.equal(stripDataUrl('data:image/png;base64'), 'data:image/png;base64');
    });

    it('yields an empty payload when the comma is last', () => {
        assert.equal(stripDataUrl('data:image/png;base64,'), '');
    });
});

describe('detectMime', () => {
    it('reports png when the data URL declares it', () => {
        assert.equal(detectMime('data:image/png;base64,AAAA'), 'image/png');
    });

    it('falls back to jpeg for anything else', () => {
        assert.equal(detectMime('data:image/jpeg;base64,AAAA'), 'image/jpeg');
        assert.equal(detectMime('data:image/webp;base64,AAAA'), 'image/jpeg');
        assert.equal(detectMime(''), 'image/jpeg');
    });

    it('matches anywhere in the string, including inside the payload', () => {
        // A substring check, not a prefix parse: base64 content that happens
        // to contain "image/png" is reported as png. Recorded as current
        // behaviour rather than endorsed — the inputs it sees are data URLs
        // this app built itself.
        assert.equal(detectMime('data:image/jpeg;base64,aW1hZ2image/pngUvcG5n'), 'image/png');
    });
});
