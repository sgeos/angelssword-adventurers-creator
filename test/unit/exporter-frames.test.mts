import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExportFrameList,
    getOutputFrameCount,
    selectExportFrames,
    strideFromSkip,
} from '../../src/core/exporter-math.mts';

/**
 * The frame selection existed four times: twice with the ordering, in the
 * WebM and Graphics Interchange Format paths; once without it, to find the
 * frames that must be decoded; and once more inside `getOutputFrameCount`,
 * counting rather than collecting.
 *
 * The fourth is the one that mattered. It produced the estimate shown to the
 * user before an export, so a disagreement between it and the export would
 * have been a number promised and not delivered. It now defers to the list.
 */

describe('strideFromSkip', () => {
    /**
     * The field asks how many frames to SKIP between the ones kept, so zero
     * means every frame. The stride is one more than that. Two names, because
     * a parameter meaning "skip 0" in one place and "step 1" in another is
     * exactly the confusion this separates.
     */
    it('turns a skip of zero into a stride of one', () => {
        assert.equal(strideFromSkip(0), 1);
    });

    it('turns a skip of one into a stride of two, keeping every other frame', () => {
        assert.equal(strideFromSkip(1), 2);
        assert.deepEqual(selectExportFrames(0, 6, strideFromSkip(1)), [0, 2, 4, 6]);
    });

    it('refuses a stride of zero, which would never terminate', () => {
        assert.equal(strideFromSkip(-1), 1);
        assert.equal(strideFromSkip(-99), 1);
    });

    it('refuses an unparsable field, which a cleared input produces', () => {
        assert.equal(strideFromSkip(NaN), 1);
    });
});

describe('selectExportFrames', () => {
    it('includes both endpoints', () => {
        assert.deepEqual(selectExportFrames(3, 7, 1), [3, 4, 5, 6, 7]);
    });

    it('steps by the stride and stops at or before the end', () => {
        assert.deepEqual(selectExportFrames(0, 10, 3), [0, 3, 6, 9]);
    });

    it('yields one frame when the range is a single frame', () => {
        assert.deepEqual(selectExportFrames(4, 4, 1), [4]);
    });

    it('yields nothing when the end precedes the start', () => {
        assert.deepEqual(selectExportFrames(9, 3, 1), []);
    });

    it('terminates even when handed a stride of zero', () => {
        assert.deepEqual(selectExportFrames(0, 3, 0), [0, 1, 2, 3]);
    });
});

describe('buildExportFrameList ordering', () => {
    it('leaves the selection alone going forward', () => {
        assert.deepEqual(buildExportFrameList(0, 4, 1, 'forward'), [0, 1, 2, 3, 4]);
    });

    it('reverses the selection', () => {
        assert.deepEqual(buildExportFrameList(0, 4, 1, 'reverse'), [4, 3, 2, 1, 0]);
    });

    /**
     * Ping-pong returns through the interior, so neither endpoint repeats.
     * A run that repeated them would stutter at each turn.
     */
    it('returns through the interior without repeating either endpoint', () => {
        assert.deepEqual(buildExportFrameList(0, 4, 1, 'pingpong'), [0, 1, 2, 3, 4, 3, 2, 1]);
    });

    it('ping-pongs a strided selection through the frames it actually kept', () => {
        assert.deepEqual(buildExportFrameList(0, 6, 2, 'pingpong'), [0, 2, 4, 6, 4, 2]);
    });

    it('leaves two frames alone under ping-pong, there being no interior', () => {
        assert.deepEqual(buildExportFrameList(0, 1, 1, 'pingpong'), [0, 1]);
    });

    it('leaves one frame alone under either mode', () => {
        assert.deepEqual(buildExportFrameList(5, 5, 1, 'pingpong'), [5]);
        assert.deepEqual(buildExportFrameList(5, 5, 1, 'reverse'), [5]);
    });

    it('leaves an empty selection alone under every mode', () => {
        for (const mode of ['forward', 'reverse', 'pingpong'] as const) {
            assert.deepEqual(buildExportFrameList(9, 3, 1, mode), [], mode);
        }
    });
});

describe('getOutputFrameCount agrees with the list it now builds', () => {
    /**
     * THE REASON THE COUNT DEFERS TO THE LIST. It is shown to the user as an
     * estimate before an export they then wait for, so a count that can
     * disagree with what is produced is worse than no count at all.
     */
    it('matches the list length across a range of selections', () => {
        for (const start of [0, 3]) {
            for (const end of [0, 1, 2, 5, 20]) {
                for (const skip of [0, 1, 4]) {
                    for (const pingPong of [false, true]) {
                        const mode = pingPong ? 'pingpong' : 'forward';
                        assert.equal(
                            getOutputFrameCount(start, end, skip, pingPong),
                            buildExportFrameList(start, end, strideFromSkip(skip), mode).length,
                            `${start.toString()}..${end.toString()} skip ${skip.toString()} ${mode}`,
                        );
                    }
                }
            }
        }
    });

    it('reproduces the old closed-form expression, which is what it replaced', () => {
        // count + (count - 2) for ping-pong above two frames, count otherwise.
        for (const [start, end, skip] of [[0, 4, 0], [0, 10, 2], [2, 3, 0], [7, 7, 0]] as const) {
            const plain = getOutputFrameCount(start, end, skip, false);
            const expected = plain > 2 ? plain + (plain - 2) : plain;
            assert.equal(getOutputFrameCount(start, end, skip, true), expected,
                `${start.toString()}..${end.toString()} skip ${skip.toString()}`);
        }
    });

    it('is unaffected by reverse, which reorders without adding frames', () => {
        assert.equal(
            buildExportFrameList(0, 9, 1, 'reverse').length,
            buildExportFrameList(0, 9, 1, 'forward').length,
        );
    });

    it('takes a skip, not a stride, unlike buildExportFrameList', () => {
        // The two conventions are the trap this pair of tests guards.
        assert.equal(getOutputFrameCount(0, 6, 1, false), 4, 'skip 1 keeps every other frame');
        assert.equal(buildExportFrameList(0, 6, 1, 'forward').length, 7, 'stride 1 keeps them all');
    });
});
