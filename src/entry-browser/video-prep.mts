/**
 * AS Adventurer — video preparation.
 *
 * Stage 3: trim to a loop point, choose a loop mode, and optionally
 * concatenate a second clip with a crossfade, before handing off to export.
 */
import {
    ASAdventurer,
    initModeSelector,
    initRange,
    initUploadZone,
    showToast,
    switchTab,
} from "../platform-browser/shell.mts";
import { findEl, require2d, requireEl } from "../platform-browser/dom.mts";
import * as VideoPrepCore from "../core/video-prep-core.mts";

/**
 * Start playback, reporting the rejection the browser raises when an
 * autoplay policy blocks it. The pre-conversion code discarded this promise.
 */
function playOrWarn(video: HTMLVideoElement): void {
    video.play().catch((reason: unknown) => {
        showToast(`Playback blocked: ${reason instanceof Error ? reason.message : 'unknown error'}`, 'error');
    });
}

/**
 * Read a state flag through a call so control-flow analysis cannot narrow it
 * to a literal. Both flags are cleared by other handlers while the caching and
 * preview loops await, which is precisely what these re-reads check for.
 */
const stillCaching = (): boolean => state.videoLoaded;
const stillPreviewing = (): boolean => state.previewPlaying;

// ================================================================
// STATE
// ================================================================
/** Everything stage 3 tracks about the clips being prepared. */
interface VideoPrepState {
    /** Hidden <video> element, created dynamically. */
    video: HTMLVideoElement | null;
    videoLoaded: boolean;
    duration: number;
    videoWidth: number;
    videoHeight: number;
    fps: number;
    totalFrames: number;
    currentFrame: number;
    /** Offscreen canvas of frame 0, used for onion skinning. */
    frame0Image: HTMLCanvasElement | null;

    isPlaying: boolean;
    playRAF: number | null;

    onionSkin: boolean;

    loopPoint: number;
    loopMode: string;

    previewPlaying: boolean;
    previewRAF: number | null;
    cachedFrames: HTMLCanvasElement[] | null;

    /** One offscreen canvas per frame, for instant scrubbing. */
    frameCache: HTMLCanvasElement[] | null;
    frameCacheComplete: boolean;

    concatVideo: HTMLVideoElement | null;
    concatLoaded: boolean;
    concatDuration: number;
    concatWidth: number;
    concatHeight: number;
    concatFps: number;

    fromVideoGen: boolean;
}

const state: VideoPrepState = {
    // Primary video
    video: null,           // <video> element (hidden, created dynamically)
    videoLoaded: false,
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
    fps: 30,
    totalFrames: 0,
    currentFrame: 0,
    frame0Image: null,     // offscreen canvas of frame 0 for onion skin

    // Playback
    isPlaying: false,
    playRAF: null,

    // Onion skin
    onionSkin: false,

    // Loop
    loopPoint: -1,
    loopMode: 'none',      // 'none' | 'pingpong' | 'reverse'

    // Preview
    previewPlaying: false,
    previewRAF: null,
    cachedFrames: null,

    // Auto frame cache (for instant scrubbing)
    frameCache: null,         // array of offscreen canvases, one per frame
    frameCacheComplete: false, // true when all frames are cached

    // Concatenation
    concatVideo: null,     // <video> element for 2nd video
    concatLoaded: false,
    concatDuration: 0,
    concatWidth: 0,
    concatHeight: 0,
    concatFps: 30,

    // Source tracking
    fromVideoGen: false,
};

// ================================================================
// HELPERS
// ================================================================

/** Seek a video element and wait for 'seeked' event */
async function seekVideoAsync(videoEl: HTMLVideoElement, time: number, maxDuration?: number): Promise<void> {
    return new Promise((resolve) => {
        const dur = maxDuration !== undefined && maxDuration > 0
            ? maxDuration
            : (videoEl.duration > 0 ? videoEl.duration : 1);
        const targetTime = Math.min(Math.max(0, time), dur - 0.001);
        if (Math.abs(videoEl.currentTime - targetTime) < 0.001) {
            resolve();
            return;
        }
        const timeout = setTimeout(resolve, 2000);
        videoEl.addEventListener('seeked', () => {
            clearTimeout(timeout);
            resolve();
        }, { once: true });
        videoEl.currentTime = targetTime;
    });
}

/** Create hidden <video> element */
function createVideoElement(): HTMLVideoElement {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.playsInline = true;
    v.preload = 'auto';
    v.muted = true;
    v.style.display = 'none';
    document.body.appendChild(v);
    return v;
}

/** Update the sidebar video info display */
function updateVideoInfo(): void {
    const el = requireEl('vpVideoInfo', HTMLElement);

    if (!state.videoLoaded) {
        el.innerHTML = '<div>No video loaded</div>';
        return;
    }

    let html = `
        <div><strong>Resolution:</strong> ${state.videoWidth.toString()} × ${state.videoHeight.toString()}</div>
        <div><strong>Duration:</strong> ${state.duration.toFixed(2)}s</div>
        <div><strong>FPS:</strong> ${state.fps.toString()}</div>
        <div><strong>Frames:</strong> ${state.totalFrames.toString()}</div>
    `;

    if (state.loopPoint >= 2) {
        const modeLabels: Readonly<Record<string, string>> = {
            none: 'No Loop (forward only)',
            pingpong: 'Ping-Pong (0→N→0)',
            reverse: 'Reverse (N→0)',
        };
        const outputFrames = getOutputFrameCount();
        html += `
            <hr style="border-color:rgba(255,255,255,0.1);margin:0.4rem 0">
            <div><strong>Loop Point:</strong> Frame ${state.loopPoint.toString()}</div>
            <div><strong>Mode:</strong> ${modeLabels[state.loopMode] ?? state.loopMode}</div>
            <div><strong>Output Frames:</strong> ${outputFrames.toString()}</div>
        `;
    }

    if (state.concatLoaded) {
        const crossfade = requireEl('vpCrossfade', HTMLInputElement);
        const cfDur = requireEl('vpCrossfadeDuration', HTMLInputElement);
        html += `
            <hr style="border-color:rgba(255,255,255,0.1);margin:0.4rem 0">
            <div><strong>2nd Video:</strong> ${state.concatWidth.toString()}×${state.concatHeight.toString()}</div>
            <div><strong>2nd Duration:</strong> ${state.concatDuration.toFixed(2)}s</div>
            <div><strong>2nd FPS:</strong> ${state.concatFps.toString()}</div>
            <div><strong>Crossfade:</strong> ${crossfade.checked ? `${cfDur.value}ms` : 'Off'}</div>
        `;
    }

    el.innerHTML = html;
}

/** Get output frame count based on loop mode and loop point */
function getOutputFrameCount(): number {
    return VideoPrepCore.getOutputFrameCount({
        loopPoint: state.loopPoint,
        loopMode: state.loopMode,
        totalFrames: state.totalFrames,
    });
}

// ================================================================
// CORE: LOAD VIDEO
// ================================================================

async function loadVideo(file: File): Promise<void> {
    // Clean up previous
    stopPreview();
    pauseVideo();
    state.frameCache = null;
    state.frameCacheComplete = false;

    // Create or reuse video element
    if (state.video !== null) {
        URL.revokeObjectURL(state.video.src);
        state.video.remove();
    }
    const video = createVideoElement();
    video.src = URL.createObjectURL(file);

    // Wait for metadata
    await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = (): void => { reject(new Error('Failed to load video')); };
    });

    state.video = video;
    state.duration = video.duration;
    state.videoWidth = video.videoWidth;
    state.videoHeight = video.videoHeight;

    // ── FPS Detection ──
    let fps = 30;
    if (typeof video.getVideoPlaybackQuality === 'function') {
        video.playbackRate = 4;
        playOrWarn(video);
        await new Promise(r => setTimeout(r, 500));
        const q = video.getVideoPlaybackQuality();
        if (q.totalVideoFrames > 0) {
            fps = Math.round(q.totalVideoFrames / (video.currentTime > 0 ? video.currentTime : 0.5));
        }
        video.pause();
        video.playbackRate = 1;
        video.currentTime = 0;
    }
    // Validate
    if (fps < 10 || fps > 120) fps = 30;
    state.fps = fps;
    state.totalFrames = Math.round(state.duration * fps);

    // ── Setup canvas ──
    const canvas = requireEl('vpCanvas', HTMLCanvasElement);
    canvas.width = state.videoWidth;
    canvas.height = state.videoHeight;

    // ── Setup persistent seeked listener ──
    video.addEventListener('seeked', () => {
        if (state.isPlaying) return; // don't interfere with native playback
        const cvs = requireEl('vpCanvas', HTMLCanvasElement);
        const ctx = require2d(cvs);
        ctx.drawImage(video, 0, 0, cvs.width, cvs.height);
        // Onion skin: overlay frame 0 at 50% opacity
        if (state.onionSkin && state.frame0Image !== null && state.currentFrame > 0) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(state.frame0Image, 0, 0, cvs.width, cvs.height);
            ctx.globalAlpha = 1.0;
        }
    });

    // ── Setup scrubber ──
    const scrubber = requireEl('vpScrubber', HTMLInputElement);
    scrubber.max = (state.totalFrames - 1).toString();
    scrubber.value = '0';

    // ── Enable Stage 2 ──
    requireEl('vpStage2', HTMLElement).classList.remove('disabled');
    state.videoLoaded = true;

    // ── Show first frame ──
    await seekVideoAsync(video, 0);
    // Explicitly draw frame 0 to canvas (seekToFrame may no-op if
    // video is already at 0 and no cache exists yet)
    {
        const cvs = requireEl('vpCanvas', HTMLCanvasElement);
        const ctx = require2d(cvs);
        ctx.drawImage(video, 0, 0, cvs.width, cvs.height);
    }
    seekToFrame(0);

    // ── Capture frame 0 for onion skin ──
    await new Promise(r => requestAnimationFrame(r));
    {
        const srcCanvas = requireEl('vpCanvas', HTMLCanvasElement);
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = state.videoWidth;
        captureCanvas.height = state.videoHeight;
        require2d(captureCanvas).drawImage(srcCanvas, 0, 0, state.videoWidth, state.videoHeight);
        state.frame0Image = captureCanvas;
    }

    // ── Default loop point to full video ──
    state.currentFrame = state.totalFrames - 1;
    setLoopPoint();
    state.currentFrame = 0;
    seekToFrame(0);

    // ── Enable Stage 3 ──
    requireEl('vpStage3', HTMLElement).classList.remove('disabled');

    updateVideoInfo();
    showToast(`Video loaded: ${state.totalFrames.toString()} frames @ ${fps.toString()}fps`, 'success');

    // ── Auto-cache frames for instant scrubbing ──
    void autoCacheFrames();
}

/** Load from handoff blob (Generate Video tab) */
async function loadFromHandoff(): Promise<void> {
    const handoff = ASAdventurer.handoff;
    if (handoff.videoBlob === null && handoff.videoUrl === null) return;

    const handoffBlob = handoff.videoBlob;
    if (handoffBlob !== null) {
        const file = new File([handoffBlob], 'generated.mp4',
            { type: handoffBlob.type === '' ? 'video/mp4' : handoffBlob.type });
        state.fromVideoGen = true;
        requireEl('vpFromVideoGen', HTMLElement).classList.remove('hidden');
        await loadVideo(file);
    } else if (handoff.videoUrl !== null) {
        // Fetch from URL → Blob → File
        try {
            const resp = await fetch(handoff.videoUrl);
            const blob = await resp.blob();
            const f = new File([blob], 'generated.mp4', { type: blob.type === '' ? 'video/mp4' : blob.type });
            state.fromVideoGen = true;
            requireEl('vpFromVideoGen', HTMLElement).classList.remove('hidden');
            await loadVideo(f);
        } catch (err) {
            showToast('Failed to load video from Generate tab: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
        }
    }
}

// ================================================================
// CORE: AUTO-CACHE FRAMES (for instant scrubbing)
// ================================================================

async function autoCacheFrames(): Promise<void> {
    if (!state.videoLoaded || state.totalFrames < 2) return;

    const video = state.video;
    if (video === null) return;
    const cw = state.videoWidth, ch = state.videoHeight;
    const total = state.totalFrames;
    state.frameCache = new Array(total).fill(null);
    state.frameCacheComplete = false;

    const infoEl = requireEl('vpFrameInfo', HTMLElement);
    const origText = infoEl.textContent;

    // Cache frame by frame via seeking
    for (let i = 0; i < total; i++) {
        if (!stillCaching()) break; // Video changed, abort

        const time = Math.min(i / state.fps, state.duration - 0.001);
        video.currentTime = time;
        await new Promise(r => { video.addEventListener('seeked', r, { once: true }); });

        const fc = document.createElement('canvas');
        fc.width = cw; fc.height = ch;
        require2d(fc).drawImage(video, 0, 0, cw, ch);
        state.frameCache[i] = fc;

        // Progress update every 5 frames
        if (i % 5 === 0 || i === total - 1) {
            infoEl.textContent = `Caching: ${(i + 1).toString()} / ${total.toString()}`;
        }
    }

    state.frameCacheComplete = true;
    infoEl.textContent = origText;
    // Restore current frame display
    seekToFrame(state.currentFrame);
    showToast(`${total.toString()} frames cached — scrubbing is now instant`, 'success');
}

// ================================================================
// CORE: SEEK & FRAME NAVIGATION
// ================================================================

function seekToFrame(frameIdx: number): void {
    if (!state.videoLoaded) return;
    const time = Math.min(frameIdx / state.fps, state.duration - 0.001);

    // Update scrubber and info
    const info = requireEl('vpFrameInfo', HTMLElement);
    info.textContent = `Frame ${frameIdx.toString()} / ${(state.totalFrames - 1).toString()} (${time.toFixed(2)}s)`;
    requireEl('vpScrubber', HTMLInputElement).value = frameIdx.toString();

    // Use cached frame if available (instant, no video seek needed)
    if (state.frameCache?.[frameIdx] !== undefined) {
        const cvs = requireEl('vpCanvas', HTMLCanvasElement);
        const ctx = require2d(cvs);
        ctx.drawImage(state.frameCache[frameIdx], 0, 0, cvs.width, cvs.height);
        // Onion skin overlay
        if (state.onionSkin && state.frame0Image !== null && frameIdx > 0) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(state.frame0Image, 0, 0, cvs.width, cvs.height);
            ctx.globalAlpha = 1.0;
        }
        return;
    }

    // Fallback: seek video (slower, used before cache is ready)
    if (state.video !== null) state.video.currentTime = time;
}

function prevFrame(): void {
    pauseVideo();
    stopPreview();
    if (state.currentFrame > 0) {
        state.currentFrame--;
        seekToFrame(state.currentFrame);
    }
}

function nextFrame(): void {
    pauseVideo();
    stopPreview();
    if (state.currentFrame < state.totalFrames - 1) {
        state.currentFrame++;
        seekToFrame(state.currentFrame);
    }
}

// ================================================================
// CORE: PLAY / PAUSE
// ================================================================

function playVideo(): void {
    if (!state.videoLoaded) return;
    const video = state.video;
    if (video === null) return;
    state.isPlaying = true;
    requireEl('vpPlayBtn', HTMLElement).textContent = '⏸';
    requireEl('vpPlayBtn', HTMLElement).title = 'Pause video';

    playOrWarn(video);

    const renderFrame = (): void => {
        if (!state.isPlaying) return;

        const canvas = requireEl('vpCanvas', HTMLCanvasElement);
        const ctx = require2d(canvas);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Update timeline and frame counter
        const frame = Math.round(video.currentTime * state.fps);
        state.currentFrame = Math.min(frame, state.totalFrames - 1);
        requireEl('vpScrubber', HTMLInputElement).value = String(state.currentFrame);
        requireEl('vpFrameInfo', HTMLElement).textContent =
            `Frame ${state.currentFrame.toString()} / ${(state.totalFrames - 1).toString()} (${video.currentTime.toFixed(2)}s)`;

        // Stop at end
        if (video.ended || video.paused) {
            pauseVideo();
            return;
        }

        state.playRAF = requestAnimationFrame(renderFrame);
    };
    state.playRAF = requestAnimationFrame(renderFrame);
}

function pauseVideo(): void {
    if (!state.videoLoaded) return;
    state.isPlaying = false;
    if (state.video !== null && !state.video.paused) state.video.pause();
    if (state.playRAF !== null) {
        cancelAnimationFrame(state.playRAF);
        state.playRAF = null;
    }
    const btn = requireEl('vpPlayBtn', HTMLButtonElement);
    btn.textContent = '▶️';
    btn.title = 'Play video';
}

// ================================================================
// CORE: LOOP POINT
// ================================================================

function setLoopPoint(): void {
    if (!state.videoLoaded || state.currentFrame < 2) {
        showToast('Move to at least frame 2 to set a loop point', 'error');
        return;
    }
    state.loopPoint = state.currentFrame;

    let totalOutput, loopLabel;
    switch (state.loopMode) {
        case 'reverse':
            totalOutput = state.loopPoint + 1;
            loopLabel = `Reverse: ${state.loopPoint.toString()} → 0`;
            break;
        case 'pingpong':
            totalOutput = state.loopPoint * 2;
            loopLabel = `Ping-Pong: 0 → ${state.loopPoint.toString()} → 0`;
            break;
        case 'none':
        default:
            totalOutput = state.loopPoint + 1;
            loopLabel = `Forward: 0 → ${state.loopPoint.toString()}`;
            break;
    }

    const loopInfo = requireEl('vpLoopInfo', HTMLElement);
    loopInfo.textContent = `${loopLabel} · ${totalOutput.toString()} output frames`;

    requireEl('vpPreviewLoopBtn', HTMLButtonElement).disabled = false;
    requireEl('vpClearLoopBtn', HTMLButtonElement).disabled = false;

    updateVideoInfo();
    showToast(`Loop set at frame ${state.loopPoint.toString()}! Preview it, then send to Model Exporter.`, 'success');
}

function clearLoop(): void {
    stopPreview();
    state.loopPoint = -1;

    const loopInfo = requireEl('vpLoopInfo', HTMLElement);
    loopInfo.textContent = '';

    requireEl('vpPreviewLoopBtn', HTMLButtonElement).disabled = true;
    requireEl('vpClearLoopBtn', HTMLButtonElement).disabled = true;

    updateVideoInfo();
    showToast('Loop point cleared', 'info');
}

// ================================================================
// CORE: PREVIEW LOOP
// ================================================================

async function previewLoop(): Promise<void> {
    if (state.loopPoint < 2) return;
    state.previewPlaying = true;
    pauseVideo();
    requireEl('vpPreviewLoopBtn', HTMLElement).textContent = '⏸ Stop Preview';

    const video = state.video;
    if (video === null) return;
    const canvas = requireEl('vpCanvas', HTMLCanvasElement);
    const ctx = require2d(canvas);
    const loopPoint = state.loopPoint;
    const loopTime = loopPoint / state.fps;
    const cw = canvas.width, ch = canvas.height;
    const minGap = 0.8 / state.fps;

    // ── Phase 1: Cache frames at 3× speed ──
    requireEl('vpFrameInfo', HTMLElement).textContent = 'Caching frames...';
    state.cachedFrames = [];
    let lastCaptureTime = -1;

    video.currentTime = 0;
    await new Promise(r => { video.addEventListener('seeked', r, { once: true }); });
    video.playbackRate = 3;
    playOrWarn(video);

    // The cache is rebuilt for this preview run; bind it locally so the
    // capture callback does not have to re-narrow it on every frame.
    const cachedFrames: HTMLCanvasElement[] = [];
    state.cachedFrames = cachedFrames;

    await new Promise<void>((resolve) => {
        const captureFrame = (): void => {
            if (!stillPreviewing()) {
                video.pause(); video.playbackRate = 1; resolve(); return;
            }
            if (video.currentTime >= loopTime || video.ended || video.paused) {
                video.pause(); video.playbackRate = 1; resolve(); return;
            }

            // Only capture if enough video time has passed
            if (video.currentTime - lastCaptureTime >= minGap) {
                lastCaptureTime = video.currentTime;
                const fc = document.createElement('canvas');
                fc.width = cw; fc.height = ch;
                require2d(fc).drawImage(video, 0, 0, cw, ch);
                cachedFrames.push(fc);
                // Show live preview during caching
                ctx.drawImage(video, 0, 0, cw, ch);
                requireEl('vpFrameInfo', HTMLElement).textContent =
                    `Caching frame ${cachedFrames.length.toString()}...`;
            }
            requestAnimationFrame(captureFrame);
        };
        requestAnimationFrame(captureFrame);
    });

    video.playbackRate = 1;
    const frames = state.cachedFrames;

    if (!stillPreviewing() || frames.length < 3) {
        stopPreview();
        return;
    }

    // ── Phase 2: Build playback sequence based on mode ──
    const sequence = VideoPrepCore.buildLoopSequence(frames.length, state.loopMode);

    let idx = 0;
    const frameDelay = (loopTime * 1000) / frames.length;
    let lastFrameTime = performance.now();

    const playSequence = (now: number): void => {
        if (!state.previewPlaying) return;

        const elapsed = now - lastFrameTime;
        if (elapsed >= frameDelay) {
            lastFrameTime = now - (elapsed % frameDelay);

            // buildLoopSequence only emits in-range indices, but the compiler
            // cannot know that; skip defensively rather than drawing undefined.
            const frameIndex = sequence[idx];
            const frame = frameIndex === undefined ? undefined : frames[frameIndex];
            if (frameIndex === undefined || frame === undefined) {
                idx = (idx + 1) % sequence.length;
                requestAnimationFrame(playSequence);
                return;
            }
            ctx.drawImage(frame, 0, 0);

            // Map index back to video frame for UI
            const videoFrame = Math.round((frameIndex / (frames.length - 1)) * loopPoint);
            const dirLabel = state.loopMode === 'reverse' ? '←' :
                (state.loopMode === 'pingpong' && idx >= frames.length) ? '←' : '→';
            requireEl('vpFrameInfo', HTMLElement).textContent =
                `Preview ${dirLabel} frame ${videoFrame.toString()} / ${loopPoint.toString()}`;
            requireEl('vpScrubber', HTMLInputElement).value = String(videoFrame);

            idx = (idx + 1) % sequence.length;
        }

        state.previewRAF = requestAnimationFrame(playSequence);
    };
    state.previewRAF = requestAnimationFrame(playSequence);
}

function stopPreview(): void {
    state.previewPlaying = false;
    if (state.previewRAF !== null) {
        cancelAnimationFrame(state.previewRAF);
        state.previewRAF = null;
    }
    // Clean up cached canvases
    state.cachedFrames = null;
    if (state.video !== null && !state.video.paused) state.video.pause();
    requireEl('vpPreviewLoopBtn', HTMLButtonElement).textContent = '▶ Preview Loop';
}

// ================================================================
// NEW: VIDEO CONCATENATION
// ================================================================

async function loadConcatVideo(file: File): Promise<void> {
    // Remove previous
    removeConcatVideo(true);

    const video = createVideoElement();
    video.src = URL.createObjectURL(file);

    await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = (): void => { reject(new Error('Failed to load second video')); };
    });

    state.concatVideo = video;
    state.concatLoaded = true;
    state.concatDuration = video.duration;
    state.concatWidth = video.videoWidth;
    state.concatHeight = video.videoHeight;

    // Detect FPS for 2nd video
    let fps = 30;
    if (typeof video.getVideoPlaybackQuality === 'function') {
        video.playbackRate = 4;
        playOrWarn(video);
        await new Promise(r => setTimeout(r, 500));
        const q = video.getVideoPlaybackQuality();
        if (q.totalVideoFrames > 0) {
            fps = Math.round(q.totalVideoFrames / (video.currentTime > 0 ? video.currentTime : 0.5));
        }
        video.pause();
        video.playbackRate = 1;
        video.currentTime = 0;
    }
    if (fps < 10 || fps > 120) fps = 30;
    state.concatFps = fps;

    // Update UI
    requireEl('vpConcatText', HTMLElement).textContent =
        `2nd video: ${state.concatWidth.toString()}×${state.concatHeight.toString()}, ${state.concatDuration.toFixed(2)}s @ ${fps.toString()}fps`;
    requireEl('vpConcatInfo', HTMLElement).classList.remove('hidden');

    updateVideoInfo();
    showToast(`2nd video loaded: ${state.concatDuration.toFixed(2)}s @ ${fps.toString()}fps`, 'success');
}

function removeConcatVideo(silent = false): void {
    if (state.concatVideo !== null) {
        URL.revokeObjectURL(state.concatVideo.src);
        state.concatVideo.remove();
        state.concatVideo = null;
    }
    state.concatLoaded = false;
    state.concatDuration = 0;
    state.concatWidth = 0;
    state.concatHeight = 0;

    requireEl('vpConcatInfo', HTMLElement).classList.add('hidden');
    requireEl('vpCrossfade', HTMLInputElement).checked = false;

    updateVideoInfo();
    if (!silent) showToast('2nd video removed', 'info');
}

// ================================================================
// HANDOFF: SEND TO MODEL EXPORTER
// ================================================================

function sendToExporter(): void {
    if (!state.videoLoaded) {
        showToast('Load a video first', 'error');
        return;
    }

    stopPreview();
    pauseVideo();

    // The original tolerated these controls being absent; findEl keeps that.
    const crossfadeEnabled =
        state.concatLoaded && (findEl('vpCrossfade', HTMLInputElement)?.checked ?? false);
    const crossfadeDuration = crossfadeEnabled
        ? parseInt(findEl('vpCrossfadeDuration', HTMLInputElement)?.value ?? '300', 10)
        : 0;

    // Pack handoff data via pure core (matches prior sendToExporter shape)
    ASAdventurer.handoff.videoPrepData = VideoPrepCore.buildVideoPrepHandoffPayload(state, {
        concatEnabled: state.concatLoaded,
        crossfade: crossfadeEnabled,
        crossfadeDuration: crossfadeDuration,
    });

    showToast('Video data sent to Model Exporter!', 'success');
    switchTab('tab-exporter');
}

// ================================================================
// CLEAR / RESET
// ================================================================

// Exported because no control in index.html binds it; the reset routine itself
// is complete, so the gap is a missing button rather than dead code.
export function clearAll(): void {
    stopPreview();
    pauseVideo();
    removeConcatVideo(true);

    state.videoLoaded = false;
    state.loopPoint = -1;
    state.currentFrame = 0;
    state.onionSkin = false;
    state.fromVideoGen = false;

    if (state.video !== null) {
        URL.revokeObjectURL(state.video.src);
        state.video.remove();
        state.video = null;
    }
    state.frame0Image = null;

    // Reset UI
    requireEl('vpFileInput', HTMLInputElement).value = '';
    requireEl('vpFromVideoGen', HTMLElement).classList.add('hidden');
    requireEl('vpStage2', HTMLElement).classList.add('disabled');
    requireEl('vpStage3', HTMLElement).classList.add('disabled');
    requireEl('vpLoopInfo', HTMLElement).textContent = '';
    requireEl('vpPreviewLoopBtn', HTMLButtonElement).disabled = true;
    requireEl('vpClearLoopBtn', HTMLButtonElement).disabled = true;
    requireEl('vpHandoffBtn', HTMLButtonElement).disabled = true;
    requireEl('vpFrameInfo', HTMLElement).textContent = '0 / 0';
    requireEl('vpScrubber', HTMLInputElement).value = String(0);
    requireEl('vpScrubber', HTMLInputElement).max = '100';
    requireEl('vpOnionSkin', HTMLInputElement).checked = false;

    // Clear canvas
    const canvas = requireEl('vpCanvas', HTMLCanvasElement);
    const ctx = require2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateVideoInfo();
    showToast('Video cleared', 'info');
}

// ================================================================
// INIT — BIND ALL EVENTS
// ================================================================

function init(): void {
    // ── Upload Zone ──
    initUploadZone('vpUploadZone', 'vpFileInput', (files) => {
        const f = files[0];
        if (f?.type.startsWith('video/') === true) {
            void loadVideo(f);
        } else {
            showToast('Please select a video file (MP4, WebM, MOV)', 'error');
        }
    });

    // ── Scrubber ──
    const scrubber = requireEl('vpScrubber', HTMLInputElement);
    scrubber.addEventListener('input', () => {
        pauseVideo();
        state.currentFrame = parseInt(scrubber.value, 10);
        seekToFrame(state.currentFrame);
    });

    // ── Frame Navigation ──
    requireEl('vpPrevFrame', HTMLElement).addEventListener('click', prevFrame);
    requireEl('vpNextFrame', HTMLElement).addEventListener('click', nextFrame);

    // ── Play / Pause ──
    requireEl('vpPlayBtn', HTMLElement).addEventListener('click', () => {
        if (state.isPlaying) pauseVideo();
        else playVideo();
    });

    // ── Onion Skin ──
    const onionSkin = requireEl('vpOnionSkin', HTMLInputElement);
    onionSkin.addEventListener('change', () => {
        state.onionSkin = onionSkin.checked;
        if (state.videoLoaded) seekToFrame(state.currentFrame);
    });

    // ── Loop Point ──
    requireEl('vpSetLoopBtn', HTMLElement).addEventListener('click', setLoopPoint);
    requireEl('vpClearLoopBtn', HTMLElement).addEventListener('click', clearLoop);
    requireEl('vpPreviewLoopBtn', HTMLElement).addEventListener('click', () => {
        if (state.previewPlaying) stopPreview();
        else void previewLoop();
    });

    // Disable loop buttons initially
    requireEl('vpPreviewLoopBtn', HTMLButtonElement).disabled = true;
    requireEl('vpClearLoopBtn', HTMLButtonElement).disabled = true;

    // ── Loop Mode (seg-toggle) ──
    initModeSelector('vpLoopMode', (mode) => {
        state.loopMode = mode;
        // Re-calculate loop info if we have a point set
        if (state.loopPoint >= 2) {
            // Temporarily set currentFrame to loopPoint to recalculate
            const saved = state.currentFrame;
            state.currentFrame = state.loopPoint;
            setLoopPoint();
            state.currentFrame = saved;
        }
        updateVideoInfo();
    });

    // ── Concatenation ──
    const concatInput = requireEl('vpConcatFileInput', HTMLInputElement);
    requireEl('vpAddVideoBtn', HTMLElement).addEventListener('click', () => {
        concatInput.click();
    });

    concatInput.addEventListener('change', () => {
        const f = concatInput.files?.[0];
        if (f?.type.startsWith('video/') === true) {
            void loadConcatVideo(f);
        } else if (f !== undefined) {
            showToast('Please select a video file', 'error');
        }
        concatInput.value = ''; // reset so same file can be re-selected
    });

    requireEl('vpRemoveConcat', HTMLElement).addEventListener('click', () => {
        removeConcatVideo(false);
    });

    // ── Crossfade controls ──
    requireEl('vpCrossfade', HTMLElement).addEventListener('change', () => {
        updateVideoInfo();
    });

    initRange('vpCrossfadeDuration', 'vpCrossfadeDurationVal', 'ms');

    requireEl('vpCrossfadeDuration', HTMLElement).addEventListener('input', () => {
        updateVideoInfo();
    });

    // ── Handoff Button ──
    requireEl('vpHandoffBtn', HTMLElement).addEventListener('click', sendToExporter);

    // ── Check for incoming handoff ──
    // If another tab set videoBlob/videoUrl before we loaded, pick it up
    const handoff = ASAdventurer.handoff;
    if (handoff.videoBlob !== null || handoff.videoUrl !== null) {
        void loadFromHandoff();
    }

    // Also listen for future handoffs (e.g., if Generate Video sets data after this init)
    // We use a setter on the handoff object to detect changes
    let stored: Blob | null = handoff.videoBlob;
    const descriptor: PropertyDescriptor & {
        get: () => Blob | null;
        set: (value: Blob | null) => void;
    } = {
        get: (): Blob | null => stored,
        set: (value: Blob | null): void => {
            stored = value;
            if (value !== null) {
                // Auto-switch to Video Prep and load
                switchTab('tab-video-prep');
                void loadFromHandoff();
            }
        },
        configurable: true,
    };
    Object.defineProperty(handoff, 'videoBlob', descriptor);

    console.log('🎬 Video Prep module initialized');
}

// ── Bootstrap ──
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
