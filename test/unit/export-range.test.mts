import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExportFrameList,
    getOutputFrameCount,
    selectExportFrames,
    strideFromSkip,
} from '../../src/core/exporter-math.mts';
import {
    circularFrameCount,
    describeLoop,
    exportRangeFromHandoff,
    loopFrameIndices,
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

    it('asks for nothing when the clip has no frames', () => {
        // A clip with no frames has no range to select, and a wrap cannot be
        // resolved without a length.
        assert.equal(exportRangeFromHandoff({ loopPoint: 5, totalFrames: 0 }), undefined);
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

describe('playback is circular, so every pair of ends is a loop', () => {
    /**
     * THE DOMAIN FACT I HAD WRONG. A clip returns to its first frame after
     * its last, so an end BEFORE a start is not an error. It is a loop that
     * crosses the seam.
     *
     * Refusing it also made frame 0 unreachable from INSIDE a loop rather
     * than only as its beginning, which matters precisely because frame 0 is
     * the master neutral frame.
     */
    it('plays the middle when the end follows the start', () => {
        assert.deepEqual(
            [...loopFrameIndices(70, 250, 300)].slice(0, 3),
            [70, 71, 72],
        );
        assert.equal(circularFrameCount(70, 250, 300), 181);
    });

    it('crosses the seam when the end precedes the start', () => {
        const frames = loopFrameIndices(250, 70, 300);
        assert.equal(frames.length, 121, '50 in the tail and 71 in the head');
        assert.equal(frames[0], 250);
        assert.equal(frames[49], 299, 'the last frame of the clip');
        assert.equal(frames[50], 0, 'then the first, with no gap');
        assert.equal(frames[frames.length - 1], 70);
    });

    it('passes through frame 0 rather than beginning there', () => {
        assert.ok(loopFrameIndices(250, 70, 300).includes(0));
        assert.notEqual(loopFrameIndices(250, 70, 300)[0], 0);
    });

    it('counts the two directions differently, as it must', () => {
        assert.equal(circularFrameCount(70, 250, 300), 181);
        assert.equal(circularFrameCount(250, 70, 300), 121);
        assert.equal(181 + 121, 300 + 2, 'both ends are inclusive, so each is counted twice');
    });

    it('treats a start equal to an end as one frame', () => {
        assert.deepEqual(loopFrameIndices(70, 70, 300), [70]);
        assert.equal(circularFrameCount(70, 70, 300), 1);
    });

    it('covers the whole clip when the end is one before the start', () => {
        assert.equal(circularFrameCount(70, 69, 300), 300);
        assert.equal(new Set(loopFrameIndices(70, 69, 300)).size, 300, 'each frame once');
    });

    it('judges a seam-crossing loop usable', () => {
        assert.equal(describeLoop('none', 250, 70, 300).kind, 'ok');
        assert.equal(describeLoop('none', 70, 250, 300).kind, 'ok');
    });

    it('marks a seam crossing in the label, the two ends alone reading as a mistake', () => {
        assert.match(loopSummary('none', 70, 300, 250).label, /250 → 70 ↻/);
        assert.doesNotMatch(loopSummary('none', 250, 300, 70).label, /↻/);
    });

    it('counts output frames circularly for every mode', () => {
        assert.equal(loopSummary('none', 70, 300, 250).outputFrames, 121);
        assert.equal(loopSummary('reverse', 70, 300, 250).outputFrames, 121);
        // Ping-pong returns through the interior, so 121 + 119.
        assert.equal(loopSummary('pingpong', 70, 300, 250).outputFrames, 240);
    });

    it('carries a seam-crossing pair to the exporter unchanged', () => {
        assert.deepEqual(
            exportRangeFromHandoff({ loopStart: 250, loopPoint: 70, totalFrames: 300 }),
            { start: 250, end: 70 },
        );
    });

    /**
     * THE PROMISE AND THE DELIVERY, ACROSS THE SEAM. The exporter reads the
     * pair the same circular way, so the count the panel shows is the count
     * the export produces.
     */
    it('produces the frame count the panel shows, for a seam-crossing loop', () => {
        for (const mode of ['none', 'reverse', 'pingpong'] as const) {
            const summary = loopSummary(mode, 70, 300, 250);
            const range = exportRangeFromHandoff({ loopStart: 250, loopPoint: 70, totalFrames: 300 });
            assert.ok(range !== undefined);
            const exported = buildExportFrameList(
                range.start, range.end, strideFromSkip(0),
                mode === 'none' ? 'forward' : mode, 300,
            );
            assert.equal(exported.length, summary.outputFrames, mode);
        }
    });

    it('exports the same frames the preview would play', () => {
        const range = exportRangeFromHandoff({ loopStart: 250, loopPoint: 70, totalFrames: 300 });
        assert.ok(range !== undefined);
        assert.deepEqual(
            buildExportFrameList(range.start, range.end, strideFromSkip(0), 'forward', 300),
            [...loopFrameIndices(250, 70, 300)],
        );
    });

    it('selects nothing across a seam when no clip length is supplied', () => {
        // The wrap cannot be resolved without one, and an empty selection is
        // what this returned before it could wrap at all.
        assert.deepEqual(selectExportFrames(250, 70, 1), []);
    });
});

describe('a loop too short to be worth playing', () => {
    it('is the only unusable pair that remains', () => {
        const status = describeLoop('none', 50, 51, 300);
        assert.equal(status.kind, 'unusable');
        assert.match(status.reason, /spans 2 frame\(s\); at least 3/);
    });

    it('is judged on the circular span, so it applies across the seam too', () => {
        assert.equal(describeLoop('none', 299, 0, 300).kind, 'unusable', 'two frames');
        assert.equal(describeLoop('none', 299, 1, 300).kind, 'ok', 'three frames');
    });

    it('treats a cleared loop as unset rather than complaining about it', () => {
        assert.deepEqual(describeLoop('none', 0, -1, 300), { kind: 'unset' });
    });

    it('agrees with the export range about which pairs are usable', () => {
        const pairs = [[0, 50], [100, 150], [250, 70], [50, 51], [0, 2], [299, 0], [70, 70]] as const;
        for (const [start, end] of pairs) {
            const usable = describeLoop('none', start, end, 300).kind === 'ok';
            const ranged = exportRangeFromHandoff({ loopStart: start, loopPoint: end, totalFrames: 300 })
                !== undefined;
            assert.equal(usable, ranged, `${start.toString()}..${end.toString()}`);
        }
    });
});
