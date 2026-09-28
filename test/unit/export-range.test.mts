import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExportFrameList,
    getOutputFrameCount,
    strideFromSkip,
} from '../../src/core/exporter-math.mts';
import {
    exportRangeFromHandoff,
    loopSummary,
} from '../../src/core/video-prep-core.mts';

/**
 * `loopPoint` was written into the handoff and never read. The exporter took
 * `loopMode` from it, so ping-pong and reverse carried across, and then took
 * its frame range from its own inputs, which are reset to the whole clip on
 * every load.
 *
 * The test that matters here is the last one, which reproduces the reported
 * case and shows the promise and the delivery now agreeing.
 */

describe('exportRangeFromHandoff', () => {
    it('asks for frames zero to the loop point', () => {
        assert.deepEqual(exportRangeFromHandoff({ loopPoint: 74, totalFrames: 300 }), { start: 0, end: 74 });
    });

    /**
     * Below 2 is how the control expresses "no loop set", and it refuses to
     * set one lower. Asking for nothing leaves the exporter on its own
     * default of the whole clip, which is what anyone who never set a loop
     * point already has.
     */
    it('asks for nothing when no loop was set', () => {
        assert.equal(exportRangeFromHandoff({ loopPoint: -1, totalFrames: 300 }), undefined);
        assert.equal(exportRangeFromHandoff({ loopPoint: 0, totalFrames: 300 }), undefined);
        assert.equal(exportRangeFromHandoff({ loopPoint: 1, totalFrames: 300 }), undefined);
    });

    it('accepts the lowest loop point the control permits', () => {
        assert.deepEqual(exportRangeFromHandoff({ loopPoint: 2, totalFrames: 300 }), { start: 0, end: 2 });
    });

    it('accepts a loop point at the last frame', () => {
        assert.deepEqual(exportRangeFromHandoff({ loopPoint: 299, totalFrames: 300 }), { start: 0, end: 299 });
    });

    /**
     * Cannot arise from the control, which takes the value from the current
     * frame. The handoff is an object another stage could write, and the two
     * stages can disagree about the frame count when their rate detection
     * differs, so it is clamped rather than trusted.
     */
    it('clamps a loop point beyond the clip rather than selecting nothing', () => {
        assert.deepEqual(exportRangeFromHandoff({ loopPoint: 9_999, totalFrames: 300 }), { start: 0, end: 299 });
    });

    it('survives a clip with no frames', () => {
        assert.deepEqual(exportRangeFromHandoff({ loopPoint: 5, totalFrames: 0 }), { start: 0, end: 0 });
    });
});

describe('the panel promise and the export now agree', () => {
    /**
     * THE REPORTED CASE, REPRODUCED. A loop set at frame 74 of a 300 frame
     * clip, ping-pong, with the panel reporting 148 output frames.
     *
     * Before the range crossed the handoff the exporter ran 0 to 299, so it
     * produced 598 frames over the whole ten seconds instead of 148 over two
     * and a half. Both numbers appear below so the size of the discrepancy is
     * on the record rather than in a commit message.
     */
    it('produces the frame count the panel showed, for the reported case', () => {
        const summary = loopSummary('pingpong', 74, 300);
        assert.equal(summary.outputFrames, 148, 'what Video Prep promises');

        const range = exportRangeFromHandoff({ loopPoint: 74, totalFrames: 300 });
        assert.ok(range !== undefined);
        const exported = buildExportFrameList(range.start, range.end, strideFromSkip(0), 'pingpong');
        assert.equal(exported.length, 148, 'what the exporter now delivers');
    });

    it('would have produced 598 from the old full-clip range, which is the bug', () => {
        const ignored = buildExportFrameList(0, 299, strideFromSkip(0), 'pingpong');
        assert.equal(ignored.length, 598);
        assert.notEqual(ignored.length, loopSummary('pingpong', 74, 300).outputFrames);
    });

    it('agrees for forward and reverse as well as ping-pong', () => {
        for (const mode of ['none', 'reverse'] as const) {
            const summary = loopSummary(mode, 74, 300);
            const range = exportRangeFromHandoff({ loopPoint: 74, totalFrames: 300 });
            assert.ok(range !== undefined);
            const exported = buildExportFrameList(
                range.start,
                range.end,
                strideFromSkip(0),
                mode === 'reverse' ? 'reverse' : 'forward',
            );
            assert.equal(exported.length, summary.outputFrames, mode);
        }
    });

    it('agrees across a range of loop points and both counting routes', () => {
        for (const loopPoint of [2, 10, 74, 150, 299]) {
            const range = exportRangeFromHandoff({ loopPoint, totalFrames: 300 });
            assert.ok(range !== undefined, loopPoint.toString());
            assert.equal(
                getOutputFrameCount(range.start, range.end, 0, true),
                loopSummary('pingpong', loopPoint, 300).outputFrames,
                `loop point ${loopPoint.toString()}`,
            );
        }
    });
});

describe('a loop that does not start at zero', () => {
    /**
     * The control could only ever set an end, so every loop ran from frame 0
     * and the label "Set Loop Point" described that accurately. These pin the
     * generalisation, and the first pins that it IS a generalisation: an
     * absent or zero start reproduces every previous answer exactly.
     */
    it('reproduces the old answers when the start is zero or absent', () => {
        for (const loopPoint of [2, 10, 74, 299]) {
            const withStart = loopSummary('pingpong', loopPoint, 300, 0);
            const without = loopSummary('pingpong', loopPoint, 300);
            assert.deepEqual(withStart, without, loopPoint.toString());
        }
    });

    it('counts the frames the loop actually spans', () => {
        // 50 to 74 inclusive is 25 frames.
        assert.equal(loopSummary('none', 74, 300, 50).outputFrames, 25);
        assert.equal(loopSummary('reverse', 74, 300, 50).outputFrames, 25);
        // Ping-pong returns through the interior, so 25 + 23.
        assert.equal(loopSummary('pingpong', 74, 300, 50).outputFrames, 48);
    });

    it('names both ends on the control', () => {
        assert.equal(loopSummary('none', 74, 300, 50).label, 'Forward: 50 → 74');
        assert.equal(loopSummary('reverse', 74, 300, 50).label, 'Reverse: 74 → 50');
        assert.equal(loopSummary('pingpong', 74, 300, 50).label, 'Ping-Pong: 50 → 74 → 50');
    });

    it('reports the whole clip when the span is too short to loop', () => {
        // The span rather than the end is what decides, which is the whole
        // point: frames 50 to 51 is as unusable as frames 0 to 1.
        assert.equal(loopSummary('none', 51, 300, 50).outputFrames, 300);
        assert.equal(loopSummary('none', 50, 300, 50).outputFrames, 300);
    });

    it('carries both ends to the exporter', () => {
        assert.deepEqual(
            exportRangeFromHandoff({ loopStart: 50, loopPoint: 74, totalFrames: 300 }),
            { start: 50, end: 74 },
        );
    });

    it('asks for nothing when the span is too short, whatever the start', () => {
        assert.equal(exportRangeFromHandoff({ loopStart: 50, loopPoint: 51, totalFrames: 300 }), undefined);
    });

    it('treats a negative start as zero rather than selecting before the clip', () => {
        assert.deepEqual(
            exportRangeFromHandoff({ loopStart: -10, loopPoint: 74, totalFrames: 300 }),
            { start: 0, end: 74 },
        );
    });

    /**
     * THE PROMISE AND THE DELIVERY, for an offset loop. The same agreement
     * the zero-start case asserts, which is what makes the generalisation
     * worth having rather than merely present.
     */
    it('produces the frame count the panel shows, for an offset loop', () => {
        for (const mode of ['none', 'reverse', 'pingpong'] as const) {
            const summary = loopSummary(mode, 74, 300, 50);
            const range = exportRangeFromHandoff({ loopStart: 50, loopPoint: 74, totalFrames: 300 });
            assert.ok(range !== undefined);
            const exported = buildExportFrameList(
                range.start,
                range.end,
                strideFromSkip(0),
                mode === 'none' ? 'forward' : mode,
            );
            assert.equal(exported.length, summary.outputFrames, mode);
        }
    });
});
