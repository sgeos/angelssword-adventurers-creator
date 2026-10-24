/**
 * GREEN characterization tests for video-prep-core.
 * Locks CURRENT behavior including known quirks — do not "fix" production.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VideoPrepState } from '../../src/core/video-prep-core.mts';
import {
    getOutputFrameCount,
    buildLoopSequence,
    buildVideoPrepHandoffPayload,
} from '../../src/core/video-prep-core.mts';

describe('video-prep-core getOutputFrameCount', () => {
    it('loopPoint -1 (unset) → totalFrames', () => {
        assert.equal(
            getOutputFrameCount({ loopPoint: -1, loopMode: 'none', totalFrames: 90 }),
            90
        );
        assert.equal(
            getOutputFrameCount({ loopPoint: -1, loopMode: 'pingpong', totalFrames: 40 }),
            40
        );
    });

    it('loopPoint < 2 → totalFrames (threshold quirk)', () => {
        assert.equal(
            getOutputFrameCount({ loopPoint: 0, loopMode: 'none', totalFrames: 50 }),
            50
        );
        assert.equal(
            getOutputFrameCount({ loopPoint: 1, loopMode: 'reverse', totalFrames: 50 }),
            50
        );
    });

    it('none/reverse at L → L+1 frames (n = loopPoint+1)', () => {
        const L = 10;
        assert.equal(
            getOutputFrameCount({ loopPoint: L, loopMode: 'none', totalFrames: 100 }),
            L + 1
        );
        assert.equal(
            getOutputFrameCount({ loopPoint: L, loopMode: 'reverse', totalFrames: 100 }),
            L + 1
        );
    });

    it('pingpong at L (= 2*L)', () => {
        // n = L+1; pingpong = n + max(0,n-2) = (L+1)+(L-1) = 2L
        const L = 10;
        assert.equal(
            getOutputFrameCount({ loopPoint: L, loopMode: 'pingpong', totalFrames: 100 }),
            2 * L
        );
        assert.equal(
            getOutputFrameCount({ loopPoint: 5, loopMode: 'pingpong', totalFrames: 60 }),
            10
        );
        assert.equal(
            getOutputFrameCount({ loopPoint: 2, loopMode: 'pingpong', totalFrames: 60 }),
            4
        );
    });
});

describe('video-prep-core buildLoopSequence', () => {
    it('none / reverse / pingpong for cachedLength 5 (previewLoop Phase 2)', () => {
        assert.deepEqual(buildLoopSequence(5, 'none'), [0, 1, 2, 3, 4]);
        assert.deepEqual(buildLoopSequence(5, 'reverse'), [4, 3, 2, 1, 0]);
        // pingpong: 0..N then N-2..1 → 0,1,2,3,4,3,2,1
        assert.deepEqual(buildLoopSequence(5, 'pingpong'), [0, 1, 2, 3, 4, 3, 2, 1]);
    });

    it('unknown mode falls through to none (0..N)', () => {
        assert.deepEqual(buildLoopSequence(3, 'weird'), [0, 1, 2]);
    });
});

describe('video-prep-core buildVideoPrepHandoffPayload', () => {
    function makeState(overrides: Partial<VideoPrepState> = {}): VideoPrepState {
        return Object.assign({
            video: { src: 'blob:primary' },
            videoWidth: 512,
            videoHeight: 512,
            duration: 2.5,
            sourceFps: 30,
            sourceFpsOrigin: 'detected',
            totalFrames: 75,
            loopMode: 'pingpong',
            loopPoint: 10,
        }, overrides);
    }

    it('handoff payload shape', () => {
        const payload = buildVideoPrepHandoffPayload(makeState());

        assert.deepEqual(payload, {
            videoSrc: 'blob:primary',
            videoWidth: 512,
            videoHeight: 512,
            duration: 2.5,
            sourceFps: 30,
            sourceFpsOrigin: 'detected',
            totalFrames: 75,
            loopMode: 'pingpong',
            // Defaults to 0 for a state predating the control's start point,
            // which keeps every existing loop meaning what it meant.
            loopStart: 0,
            loopPoint: 10,
            outputFrameCount: 20, // 2 * L
        });
    });

    /**
     * The second clip and its crossfade were removed on 2026-10-24. The
     * exporter never read them, here or upstream. Nothing about them may
     * reappear in the handoff without the exporter reading it.
     */
    it('carries nothing about a second clip', () => {
        const payload = buildVideoPrepHandoffPayload(makeState());
        assert.ok(!('concat' in payload));
    });
});
