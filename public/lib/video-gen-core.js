/**
 * Pure logic extracted from video-gen.js (characterization / unit-testable).
 * Dual CJS + browser global export.
 *
 * Known quirks locked as-is (do NOT "fix" here):
 * - duration is accepted by the generator UI but is NOT placed in the POST body
 * - keyframe mode requires a start+end image in the UI, but only the FIRST image
 *   is sent; the end frame is described in text only
 * - pollOperation exists in the IIFE but is dead (never called)
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VideoGenCore = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DEFAULT_PROMPT =
        'Generate a gentle breathing idle animation with slight body sway. Keep the character on the same background.';

    var MODEL = 'gemini-omni-flash-preview';

    function stripDataUrl(dataUrl) {
        if (!dataUrl) return dataUrl;
        return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    }

    function detectMime(dataUrl) {
        return dataUrl && dataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';
    }

    /**
     * Build the Gemini Omni Flash Interactions API request body.
     * Quirk: `duration` is intentionally omitted — UI collects it but POST body
     * does not include it today.
     *
     * @param {{ prompt?: string, mode?: string, referenceImages?: Array<{dataUrl:string}> }} opts
     * @returns {object}
     */
    function buildVideoRequestBody(opts) {
        opts = opts || {};
        var prompt = opts.prompt || '';
        var mode = opts.mode || 'reference';
        var referenceImages = opts.referenceImages || [];

        var textPrompt = prompt || DEFAULT_PROMPT;

        var requestBody = {
            model: MODEL
        };

        // Quirk: keyframe end image is NOT sent — only the first (start) image.
        if (mode === 'keyframe' && referenceImages.length >= 2) {
            var startRef = referenceImages[0];
            var startRaw = stripDataUrl(startRef.dataUrl);
            var startMime = detectMime(startRef.dataUrl);

            requestBody.input = [
                { type: 'image', data: startRaw, mime_type: startMime },
                {
                    type: 'text',
                    text: 'Starting from this image (start frame), animate the character transitioning to the end pose. ' + textPrompt
                }
            ];
            requestBody.generation_config = {
                video_config: { task: 'image_to_video' }
            };
        } else if (referenceImages.length > 0) {
            var ref = referenceImages[0];
            var raw = stripDataUrl(ref.dataUrl);
            var mimeType = detectMime(ref.dataUrl);

            requestBody.input = [
                { type: 'image', data: raw, mime_type: mimeType },
                { type: 'text', text: textPrompt }
            ];
            requestBody.generation_config = {
                video_config: { task: 'image_to_video' }
            };
        } else {
            requestBody.input = textPrompt;
        }

        // duration is NOT in body today — do not add it
        return requestBody;
    }

    /**
     * Pure extract: returns { mimeType, base64 } or null.
     * Blob / URL.createObjectURL stay in the IIFE wrapper.
     *
     * @param {object} data
     * @returns {{ mimeType: string, base64: string } | null}
     */
    function extractVideoPayload(data) {
        if (!data) return null;

        // Pattern 1: Interactions API — steps[] with model_output
        if (data.steps && Array.isArray(data.steps)) {
            for (var s = 0; s < data.steps.length; s++) {
                var step = data.steps[s];
                if (step.type === 'model_output' && step.content) {
                    for (var c = 0; c < step.content.length; c++) {
                        var item = step.content[c];
                        if (item.type === 'video' && item.data) {
                            return {
                                mimeType: item.mime_type || 'video/mp4',
                                base64: item.data
                            };
                        }
                    }
                }
            }
        }

        // Pattern 2: generateContent format (candidates/parts) — fallback
        if (data.candidates) {
            for (var i = 0; i < data.candidates.length; i++) {
                var candidate = data.candidates[i];
                var parts = candidate.content && candidate.content.parts;
                if (parts) {
                    for (var p = 0; p < parts.length; p++) {
                        var part = parts[p];
                        if (part.inlineData &&
                            part.inlineData.mimeType &&
                            part.inlineData.mimeType.indexOf('video/') === 0) {
                            return {
                                mimeType: part.inlineData.mimeType,
                                base64: part.inlineData.data
                            };
                        }
                    }
                }
            }
        }

        // Pattern 3: Nested result (from polled operation)
        if (data.result) {
            return extractVideoPayload(data.result);
        }

        return null;
    }

    /**
     * Multi-select UI vs single handoff: only the first selected index is used.
     *
     * @param {Array} generatedVideos
     * @param {Array<number>|Iterable<number>} selectedIndicesOrdered
     * @returns {*} first selected video or undefined
     */
    function pickHandoffVideo(generatedVideos, selectedIndicesOrdered) {
        var indices = Array.from(selectedIndicesOrdered || []);
        if (indices.length === 0) return undefined;
        var idx = indices[0];
        return generatedVideos[idx];
    }

    /**
     * Trivial helper: genCount button value → N (default 1).
     * @param {string|number|null|undefined} count
     * @returns {number}
     */
    function parseGenCount(count) {
        var n = parseInt(count, 10);
        return Number.isFinite(n) && n > 0 ? n : 1;
    }

    return {
        DEFAULT_PROMPT: DEFAULT_PROMPT,
        MODEL: MODEL,
        buildVideoRequestBody: buildVideoRequestBody,
        extractVideoPayload: extractVideoPayload,
        pickHandoffVideo: pickHandoffVideo,
        parseGenCount: parseGenCount
    };
}));
