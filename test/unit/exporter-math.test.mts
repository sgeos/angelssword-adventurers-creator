import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MODE_LIMITS,
    formatBytes,
    getOutputFrameCount,
    computeCropToCenter,
    sanitizeFilename
} from '../../src/core/exporter-math.mts';

describe('exporter-math', () => {
    it('MODE_LIMITS: adventurer webm Infinity; normal gif 120/1000; premium gif 600/4000', () => {
        assert.equal(MODE_LIMITS.adventurer.format, 'webm');
        assert.equal(MODE_LIMITS.adventurer.maxFrames, Infinity);
        assert.equal(MODE_LIMITS.adventurer.maxWidth, Infinity);
        assert.equal(MODE_LIMITS.adventurer.maxHeight, Infinity);

        assert.equal(MODE_LIMITS.normal.format, 'gif');
        assert.equal(MODE_LIMITS.normal.maxFrames, 120);
        assert.equal(MODE_LIMITS.normal.maxWidth, 1000);
        assert.equal(MODE_LIMITS.normal.maxHeight, 1000);

        assert.equal(MODE_LIMITS.premium.format, 'gif');
        assert.equal(MODE_LIMITS.premium.maxFrames, 600);
        assert.equal(MODE_LIMITS.premium.maxWidth, 4000);
        assert.equal(MODE_LIMITS.premium.maxHeight, 4000);
    });

    it('formatBytes boundaries match current implementation', () => {
        assert.equal(formatBytes(1023), '1023 B');
        assert.equal(formatBytes(1024), '1.0 KB');
        assert.equal(formatBytes(1024 * 1024), '1.00 MB');
    });

    it('getOutputFrameCount matches ModelExporter logic', () => {
        // skip=0 → step 1: frames 0..9 = 10
        assert.equal(getOutputFrameCount(0, 9, 0, false), 10);
        // skip=1 → step 2: 0,2,4,6,8 = 5
        assert.equal(getOutputFrameCount(0, 9, 1, false), 5);
        // pingPong with count>2: count + (count-2)
        assert.equal(getOutputFrameCount(0, 9, 0, true), 10 + 8);
        // pingPong with count<=2 does not expand
        assert.equal(getOutputFrameCount(0, 1, 0, true), 2);
        assert.equal(getOutputFrameCount(5, 5, 0, true), 1);
    });

    it('computeCropToCenter 1:1 on 16:9 dimensions', () => {
        // 1920x1080 → square crop height=1080, width=1080, centered
        const crop = computeCropToCenter(1920, 1080, '1:1');
        assert.equal(crop.cropW, 1080);
        assert.equal(crop.cropH, 1080);
        assert.equal(crop.cropX, Math.round((1920 - 1080) / 2));
        assert.equal(crop.cropY, 0);
    });

    it('sanitizeFilename lowercases and replaces non-alnum', () => {
        assert.equal(sanitizeFilename('Hero Name!'), 'hero_name_');
        assert.equal(sanitizeFilename('ABC-123'), 'abc_123');
    });
});
