/**
 * GREEN characterization tests for video-prep-core.
 * Locks CURRENT behavior including known quirks — do not "fix" production.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { at } from '../helpers/at.mts';
import type { VideoPrepState } from '../../src/core/video-prep-core.mts';
import {
    getOutputFrameCount,
    buildLoopSequence,
    buildCrossfadeAlphas,
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

describe('video-prep-core buildCrossfadeAlphas', () => {
    it('crossfade endpoint alphas: first (1,0) and last (0,1)', () => {
        const alphas = buildCrossfadeAlphas(5);
        assert.equal(alphas.length, 5);
        assert.equal(at(alphas, 0).alpha1, 1);
        assert.equal(at(alphas, 0).alpha2, 0);
        assert.equal(at(alphas, 0).t, 0);
        assert.equal(at(alphas, 4).alpha1, 0);
        assert.equal(at(alphas, 4).alpha2, 1);
        assert.equal(at(alphas, 4).t, 1);
        // midpoint
        assert.equal(at(alphas, 2).t, 0.5);
        assert.equal(at(alphas, 2).alpha1, 0.5);
        assert.equal(at(alphas, 2).alpha2, 0.5);
    });
});

describe('video-prep-core buildVideoPrepHandoffPayload', () => {
    function makeState(overrides: Partial<VideoPrepState> = {}): VideoPrepState {
        return Object.assign({
            video: { src: 'blob:primary' },
            videoWidth: 512,
            videoHeight: 512,
            duration: 2.5,
            fps: 30,
            totalFrames: 75,
            loopMode: 'pingpong',
            loopPoint: 10,
            concatVideo: { src: 'blob:second' },
            concatWidth: 512,
            concatHeight: 512,
            concatDuration: 1.2,
            concatFps: 24,
        }, overrides);
    }

    it('handoff payload shape without concat', () => {
        const payload = buildVideoPrepHandoffPayload(makeState(), {
            concatEnabled: false,
            crossfade: false,
            crossfadeDuration: 0,
        });

        assert.deepEqual(payload, {
            videoSrc: 'blob:primary',
            videoWidth: 512,
            videoHeight: 512,
            duration: 2.5,
            fps: 30,
            totalFrames: 75,
            loopMode: 'pingpong',
            loopPoint: 10,
            outputFrameCount: 20, // 2 * L
            concat: null,
        });
    });

    it('handoff payload shape with concat + crossfade', () => {
        const payload = buildVideoPrepHandoffPayload(makeState(), {
            concatEnabled: true,
            crossfade: true,
            crossfadeDuration: 300,
        });

        assert.equal(payload.videoSrc, 'blob:primary');
        assert.equal(payload.outputFrameCount, 20);
        assert.deepEqual(payload.concat, {
            videoSrc: 'blob:second',
            videoWidth: 512,
            videoHeight: 512,
            duration: 1.2,
            fps: 24,
            crossfade: true,
            crossfadeDuration: 300,
        });
    });

    it('handoff with concat enabled but crossfade off', () => {
        const payload = buildVideoPrepHandoffPayload(makeState(), {
            concatEnabled: true,
            crossfade: false,
            crossfadeDuration: 0,
        });
        const concat = payload.concat;
        if (concat === null) throw new Error('concat payload must be present when enabled');
        assert.equal(concat.crossfade, false);
        assert.equal(concat.crossfadeDuration, 0);
    });
});
