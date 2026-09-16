/**
 * GREEN characterization tests for video-gen-core.
 * Locks CURRENT behavior including known quirks — do not "fix" production.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_PROMPT,
    MODEL,
    buildVideoRequestBody,
    extractVideoPayload,
    pickHandoffVideo,
    parseGenCount,
} = require('../../public/lib/video-gen-core.js');

describe('video-gen-core buildVideoRequestBody', () => {
    it('reference body strips data-URL prefix, sets image_to_video, detects png mime', () => {
        const body = buildVideoRequestBody({
            prompt: 'walk cycle',
            mode: 'reference',
            referenceImages: [
                { dataUrl: 'data:image/png;base64,AAAA' },
                { dataUrl: 'data:image/png;base64,BBBB' }, // second ignored in reference
            ],
        });

        assert.equal(body.model, MODEL);
        assert.equal(body.model, 'gemini-omni-flash-preview');
        assert.equal(body.input.length, 2);
        assert.deepEqual(body.input[0], {
            type: 'image',
            data: 'AAAA',
            mime_type: 'image/png',
        });
        assert.deepEqual(body.input[1], { type: 'text', text: 'walk cycle' });
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
        assert.equal(body.input[0].mime_type, 'image/jpeg');
        assert.equal(body.input[0].data, 'JPEGDATA');
    });

    it('empty prompt → default breathing idle string from source', () => {
        const body = buildVideoRequestBody({
            prompt: '',
            mode: 'reference',
            referenceImages: [{ dataUrl: 'data:image/png;base64,XX' }],
        });
        assert.equal(
            body.input[1].text,
            'Generate a gentle breathing idle animation with slight body sway. Keep the character on the same background.'
        );
        assert.equal(body.input[1].text, DEFAULT_PROMPT);
    });

    it('keyframe: only first image sent; motion text prefixed (end image NOT sent — quirk)', () => {
        // Quirk: keyframe UI requires start+end, but POST body only includes the first image.
        const body = buildVideoRequestBody({
            prompt: 'morph',
            mode: 'keyframe',
            referenceImages: [
                { dataUrl: 'data:image/png;base64,START' },
                { dataUrl: 'data:image/png;base64,END' },
            ],
        });

        assert.equal(body.input.length, 2);
        assert.equal(body.input[0].data, 'START');
        assert.ok(!JSON.stringify(body).includes('END'));
        assert.match(
            body.input[1].text,
            /^Starting from this image \(start frame\), animate the character transitioning to the end pose\. morph$/
        );
        assert.equal(body.generation_config.video_config.task, 'image_to_video');
    });

    it('duration is unused in POST body (quirk — UI collects it, body omits it)', () => {
        // Quirk: generateOneVideo receives duration but buildVideoRequestBody never accepts/adds it.
        const body = buildVideoRequestBody({
            prompt: 'x',
            mode: 'reference',
            referenceImages: [{ dataUrl: 'data:image/png;base64,Y' }],
            duration: 8, // even if a caller passes it, it must not appear
        });
        assert.equal(body.duration, undefined);
        assert.ok(!('duration' in body));
        assert.ok(!('video_length' in (body.generation_config?.video_config || {})));
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
