/**
 * Pure logic extracted from video-prep.js (characterization / unit-testable).
 * Dual CJS + browser global export.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VideoPrepCore = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * Output frame count based on loop mode and loop point.
     * Exact current switch from video-prep getOutputFrameCount.
     *
     * @param {{ loopPoint: number, loopMode: string, totalFrames: number }} opts
     * @returns {number}
     */
    function getOutputFrameCount(opts) {
        opts = opts || {};
        var loopPoint = opts.loopPoint;
        var loopMode = opts.loopMode;
        var totalFrames = opts.totalFrames;

        if (loopPoint < 2) return totalFrames;
        var n = loopPoint + 1; // frames 0..loopPoint
        switch (loopMode) {
            case 'pingpong': return n + Math.max(0, n - 2); // 0→N→0 (no duplicate of endpoints)
            case 'reverse':  return n;                       // N→0
            case 'none':
            default:         return n;                       // 0→N
        }
    }

    /**
     * Build playback index sequence matching previewLoop Phase 2.
     *
     * @param {number} cachedLength - N (number of cached frames)
     * @param {string} loopMode - 'none' | 'reverse' | 'pingpong'
     * @returns {number[]}
     */
    function buildLoopSequence(cachedLength, loopMode) {
        var sequence = [];
        var N = cachedLength;
        switch (loopMode) {
            case 'pingpong':
                // 0 → N then N-2 → 1
                for (var i = 0; i < N; i++) sequence.push(i);
                for (var j = N - 2; j >= 1; j--) sequence.push(j);
                break;
            case 'reverse':
                // N → 0
                for (var r = N - 1; r >= 0; r--) sequence.push(r);
                break;
            case 'none':
            default:
                // 0 → N
                for (var f = 0; f < N; f++) sequence.push(f);
                break;
        }
        return sequence;
    }

    /**
     * Crossfade alphas for frame blender: t = i / (count - 1),
     * alphas (1-t) for video1 and t for video2.
     *
     * @param {number} count
     * @returns {Array<{ t: number, alpha1: number, alpha2: number }>}
     */
    function buildCrossfadeAlphas(count) {
        var result = [];
        for (var i = 0; i < count; i++) {
            var t = i / (count - 1); // 0 → 1 (matches buildCrossfadeFrames)
            result.push({ t: t, alpha1: 1 - t, alpha2: t });
        }
        return result;
    }

    /**
     * Build handoff payload matching sendToExporter field shape exactly.
     *
     * @param {object} state - video-prep state (needs video.src, optional concatVideo.src)
     * @param {{ concatEnabled: boolean, crossfade: boolean, crossfadeDuration: number }} opts
     * @returns {object}
     */
    function buildVideoPrepHandoffPayload(state, opts) {
        opts = opts || {};
        var concatEnabled = !!opts.concatEnabled;
        var crossfade = !!opts.crossfade;
        var crossfadeDuration = opts.crossfadeDuration || 0;

        return {
            videoSrc: state.video && state.video.src,
            videoWidth: state.videoWidth,
            videoHeight: state.videoHeight,
            duration: state.duration,
            fps: state.fps,
            totalFrames: state.totalFrames,

            loopMode: state.loopMode,
            loopPoint: state.loopPoint,
            outputFrameCount: getOutputFrameCount({
                loopPoint: state.loopPoint,
                loopMode: state.loopMode,
                totalFrames: state.totalFrames
            }),

            concat: concatEnabled ? {
                videoSrc: state.concatVideo && state.concatVideo.src,
                videoWidth: state.concatWidth,
                videoHeight: state.concatHeight,
                duration: state.concatDuration,
                fps: state.concatFps,
                crossfade: crossfade,
                crossfadeDuration: crossfadeDuration
            } : null
        };
    }

    return {
        getOutputFrameCount: getOutputFrameCount,
        buildLoopSequence: buildLoopSequence,
        buildCrossfadeAlphas: buildCrossfadeAlphas,
        buildVideoPrepHandoffPayload: buildVideoPrepHandoffPayload
    };
}));
