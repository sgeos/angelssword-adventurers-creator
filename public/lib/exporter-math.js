/**
 * Exporter math helpers
 * Extracted from model-exporter.js — characterization seam (no behavior changes).
 */

const MODE_LIMITS = {
    adventurer: { format: 'webm', maxFrames: Infinity, maxWidth: Infinity, maxHeight: Infinity },
    normal:     { format: 'gif',  maxFrames: 120,      maxWidth: 1000,     maxHeight: 1000 },
    premium:    { format: 'gif',  maxFrames: 600,      maxWidth: 4000,     maxHeight: 4000 }
};

/**
 * Pure frame-count logic matching ModelExporter.getOutputFrameCount.
 * @param {number} start - start frame (inclusive)
 * @param {number} end - end frame (inclusive)
 * @param {number} skip - UI frame-skip value (0 = every frame); step = skip + 1
 * @param {boolean} pingPong - whether ping-pong mode is enabled
 */
function getOutputFrameCount(start, end, skip, pingPong) {
    const step = Math.max(1, (skip || 0) + 1);

    let count = 0;
    for (let f = start; f <= end; f += step) count++;

    if (pingPong && count > 2) {
        count = count + (count - 2);
    }

    return count;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Compute centered crop box for a given ratio inside video dimensions.
 * Matches ModelExporter.resetCropToCenter geometry (without mutating instance).
 * @returns {{ cropX: number, cropY: number, cropW: number, cropH: number }}
 */
function computeCropToCenter(videoWidth, videoHeight, ratio) {
    let rw, rh;
    if (ratio === '1:1') { rw = 1; rh = 1; }
    else if (ratio === '4:3') { rw = 4; rh = 3; }
    else if (ratio === '3:4') { rw = 3; rh = 4; }
    else if (ratio === '16:9') { rw = 16; rh = 9; }
    else if (ratio === '9:16') { rw = 9; rh = 16; }
    else { rw = 1; rh = 1; }

    const videoAspect = videoWidth / videoHeight;
    const cropAspect = rw / rh;

    let cropW, cropH;
    if (cropAspect >= videoAspect) {
        cropW = videoWidth;
        cropH = Math.round(videoWidth / cropAspect);
    } else {
        cropH = videoHeight;
        cropW = Math.round(videoHeight * cropAspect);
    }

    const cropX = Math.round((videoWidth - cropW) / 2);
    const cropY = Math.round((videoHeight - cropH) / 2);
    return { cropX, cropY, cropW, cropH };
}

/** Sanitize character name for filename presets (existing ModelExporter logic). */
function sanitizeFilename(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '_');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MODE_LIMITS,
        getOutputFrameCount,
        formatBytes,
        computeCropToCenter,
        sanitizeFilename
    };
} else {
    window.MODE_LIMITS = MODE_LIMITS;
    window.getOutputFrameCountPure = getOutputFrameCount;
    window.formatBytes = formatBytes;
    window.computeCropToCenter = computeCropToCenter;
    window.sanitizeFilename = sanitizeFilename;
}
