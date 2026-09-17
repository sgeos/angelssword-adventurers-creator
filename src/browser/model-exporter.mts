/**
 * AS Adventurer — model exporter.
 *
 * Stage 4: chroma-key removal and the GIF/WebM export pipeline. Ported from
 * Fugi Maker EX for the AS Adventurer VTuber pipeline.
 */
import {
    ASAdventurer,
    initColorSwatches,
    initModeSelector,
    initUploadZone,
    notificationSound,
    showToast,
} from "./app.mts";
import { debounce, hexToRgb, type Rgb } from "./app-utils.mts";
import type { HandoffPayload } from "./video-prep-core.mts";
import { ChromaKey } from "./chroma-key.mts";
import { closestFrom, queryAll, require2d, requireEl } from "./dom.mts";
import { channel } from "./pixels.mts";
import {
    MODE_LIMITS,
    asCropRatio,
    asExportMode,
    computeCropToCenter,
    formatBytes,
    getOutputFrameCount,
    sanitizeFilename,
    type CropRatio,
    type ExportMode,
} from "./exporter-math.mts";
import { ColorQuantizer } from "./gif-codec.mts";

/** Backdrop the preview canvas draws behind the keyed frame. */
export type PreviewMode = 'checker' | 'black' | 'white' | 'original';

/**
 * Narrow a data-attribute string to a PreviewMode. Returns the value rather
 * than a boolean; the lint configuration bans type predicates, which assert
 * rather than check.
 */
const asPreviewMode = (value: string): PreviewMode | undefined =>
    value === 'checker' || value === 'black' || value === 'white' || value === 'original'
        ? value
        : undefined;

/** Container the last export was written into. */
export type ExportFormat = 'gif' | 'webm';
import type { EncodeRequest, EncodeResponse, WorkerFrame } from "./gif-worker-core.mts";
import type { TimerCommand } from "./timer-worker.mts";

/**
 * Read an integer from a numeric input, falling back when the field is blank
 * or holds something unparseable. The pre-conversion code wrote
 * `parseInt(el.value) || fallback`, which also swallowed a legitimate zero;
 * this keeps zero and only falls back on NaN.
 */
const intFromField = (id: string, fallback: number): number => {
    const parsed = parseInt(requireEl(id, HTMLInputElement).value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

/** A positive number, or the fallback when it is zero, negative, or NaN. */
const positiveOr = (value: number, fallback: number): number =>
    Number.isFinite(value) && value > 0 ? value : fallback;

/** localStorage key holding the slider positions between sessions. */
const SLIDER_STORAGE_KEY = 'ex_slider_values';

/**
 * Slider positions as they are stored. Every field may be absent: what is read
 * back is whatever a previous version of this code wrote, or whatever else has
 * been left under that key. Declared as `T | undefined` rather than optional
 * because the parser always sets every key, and exactOptionalPropertyTypes
 * draws a real distinction between the two.
 */
interface PersistedSliders {
    readonly similarity: number | undefined;
    readonly smoothness: number | undefined;
    readonly spillSuppress: number | undefined;
    readonly scale: number | undefined;
    readonly vOffset: number | undefined;
    readonly saturation: number | undefined;
    readonly brightness: number | undefined;
    readonly edgeFade: number | undefined;
    readonly antiAlias: boolean | undefined;
    readonly smokeCleanup: boolean | undefined;
}

/**
 * Coerce a stored field to a finite number.
 *
 * Accepts strings because earlier builds wrote input.value directly, which is
 * a string; those entries are still in users' browsers. The old reader divided
 * those strings by 100 and relied on JavaScript coercing them, so the values
 * were never numbers at all. This normalises on read and writes numbers.
 */
const storedNumber = (raw: unknown): number | undefined => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
    if (typeof raw !== 'string' || raw.trim() === '') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const storedBoolean = (raw: unknown): boolean | undefined =>
    typeof raw === 'boolean' ? raw : undefined;

/**
 * Parse the stored slider positions, or undefined when the entry is absent,
 * malformed, or not an object. localStorage is writable by anything running on
 * the origin, so nothing read back is trusted; every field is checked.
 */
const parsePersistedSliders = (raw: string): PersistedSliders | undefined => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const source: Record<string, unknown> = { ...parsed };
    return {
        similarity: storedNumber(source['similarity']),
        smoothness: storedNumber(source['smoothness']),
        spillSuppress: storedNumber(source['spillSuppress']),
        scale: storedNumber(source['scale']),
        vOffset: storedNumber(source['vOffset']),
        saturation: storedNumber(source['saturation']),
        brightness: storedNumber(source['brightness']),
        edgeFade: storedNumber(source['edgeFade']),
        antiAlias: storedBoolean(source['antiAlias']),
        smokeCleanup: storedBoolean(source['smokeCleanup']),
    };
};

export class ModelExporter {
    /* ─── Mode and preview ─── */
    mode: ExportMode = 'adventurer';
    readonly chromaKey = new ChromaKey();
    previewMode: PreviewMode = 'checker';
    eyedropperActive = false;

    /* ─── Video state ─── */
    /**
     * Frame source only; never attached to the document and never played.
     * Built once here rather than in init(), because every method assumes it
     * exists and nothing replaces it.
     */
    readonly video: HTMLVideoElement = document.createElement('video');
    videoLoaded = false;
    videoWidth = 0;
    videoHeight = 0;
    fps = 30;
    /** Frame rate measured from the decoder, when the browser reports one. */
    detectedFps: number | undefined = undefined;
    duration = 0;
    totalFrames = 0;
    currentFrame = 0;
    isPlaying = false;
    playTimer: ReturnType<typeof setInterval> | null = null;

    /* ─── Canvases ─── */
    // willReadFrequently: every frame is read back for chroma keying.
    readonly previewCanvas: HTMLCanvasElement = requireEl('exCanvas', HTMLCanvasElement);
    readonly previewCtx: CanvasRenderingContext2D =
        require2d(this.previewCanvas, { willReadFrequently: true });
    readonly workCanvas: HTMLCanvasElement = document.createElement('canvas');
    readonly workCtx: CanvasRenderingContext2D =
        require2d(this.workCanvas, { willReadFrequently: true });

    /* ─── Scale and offset ─── */
    videoScale = 1;
    videoOffset = 0;

    /* ─── Crop ─── */
    cropEnabled = false;
    cropRatio: CropRatio = '1:1';
    cropX = 0;
    cropY = 0;
    cropW = 0;
    cropH = 0;
    cropSize = 0;

    /* ─── Export state ─── */
    isExporting = false;
    private _exportCancelled = false;

    /**
     * Whether the cancel button has been pressed since the export began.
     *
     * A method rather than a direct read: the export loops set the flag false,
     * then await, and the click handler flips it from outside. Reading the
     * field inline lets control-flow analysis narrow it to `false` for the
     * rest of the function, which is exactly the check being made.
     */
    private cancelled(): boolean {
        return this._exportCancelled;
    }

    lastExportBlob: Blob | null = null;
    lastExportFormat: ExportFormat | null = null;

    /* ─── Ping-pong and reverse, set from the Video Prep handoff ─── */
    pingPongMode = false;
    reverseMode = false;

    /** Reference still for auto-detect, when the user supplies one. */
    private _refImageData: ImageData | null = null;
    private _keyPreviewTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.init();
    }

    init(): void {
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.preload = 'metadata'; // Don't buffer entire video (reduces GPU video decode load)
        this.video.pause(); // Ensure no playback — we only use it as a frame source

        this.bindUpload();
        this.bindModeToggle();
        this.bindColorSwatches();
        this.bindSliders();
        this.bindPreviewModes();
        this.bindPlayback();
        this.bindCropOverlay();
        this.bindExportSettings();
        this.bindFilenamePresets();
        this.bindExportButton();
        this.bindEyedropper();
        this.bindAutoDetect();
        this.bindHandoff();

        this.loadPersistedSliders();
        this.updateModeLimitsDisplay();
    }

    // ─── UPLOAD ───
    bindUpload(): void {
        initUploadZone('exUploadZone', 'exFileInput', (files) => {
            const file = files[0];
            if (file?.type.startsWith('video/') !== true) {
                showToast('Please upload a video file', 'error');
                return;
            }
            this.loadVideo(file);
        });
    }

    loadVideo(fileOrBlob: Blob): void {
        const url = URL.createObjectURL(fileOrBlob);
        this.video.src = url;

        this.video.addEventListener('loadedmetadata', () => {
            this.videoWidth = this.video.videoWidth;
            this.videoHeight = this.video.videoHeight;
            this.duration = this.video.duration;
            this.fps = 30; // default assumption
            this.totalFrames = Math.floor(this.duration * this.fps);
            this.currentFrame = 0;

            // Set canvas size
            this.previewCanvas.width = this.videoWidth;
            this.previewCanvas.height = this.videoHeight;
            this.workCanvas.width = this.videoWidth;
            this.workCanvas.height = this.videoHeight;

            // Enable stages
            requireEl('exStage2', HTMLElement).classList.remove('disabled');
            requireEl('exStage3', HTMLElement).classList.remove('disabled');

            // Set scrubber
            const scrubber = requireEl('exScrubber', HTMLInputElement);
            scrubber.max = String(this.totalFrames - 1);
            scrubber.value = String(0);

            // Set export range defaults
            requireEl('exStartFrame', HTMLInputElement).value = String(0);
            requireEl('exEndFrame', HTMLInputElement).value = String(this.totalFrames - 1);
            requireEl('exWidth', HTMLInputElement).value = String(this.videoWidth);
            requireEl('exHeight', HTMLInputElement).value = String(this.videoHeight);

            this.videoLoaded = true;
            this.updateFrameInfo();
            this.updateVideoInfo();
            this.updateSizeEstimate();

            // Seek to frame 0 so the browser decodes a visible frame for the canvas
            this.video.currentTime = 0;
            this.video.addEventListener('seeked', () => {
                this.updatePreview();
                // Auto-detect chroma key color on load
                requireEl('exAutoDetect', HTMLButtonElement).click();
                showToast(`Video loaded: ${this.videoWidth.toString()}×${this.videoHeight.toString()}, ${this.totalFrames.toString()} frames`, 'success');
            }, { once: true });
        }, { once: true });

        this.video.load();
    }

    loadVideoFromUrl(url: string): void {
        this.video.src = url;

        this.video.addEventListener('loadedmetadata', () => {
            this.videoWidth = this.video.videoWidth;
            this.videoHeight = this.video.videoHeight;
            this.duration = this.video.duration;
            this.fps = positiveOr(this.detectedFps ?? 0, 30);
            this.totalFrames = Math.floor(this.duration * this.fps);
            this.currentFrame = 0;

            this.previewCanvas.width = this.videoWidth;
            this.previewCanvas.height = this.videoHeight;
            this.workCanvas.width = this.videoWidth;
            this.workCanvas.height = this.videoHeight;

            requireEl('exStage2', HTMLElement).classList.remove('disabled');
            requireEl('exStage3', HTMLElement).classList.remove('disabled');

            const scrubber = requireEl('exScrubber', HTMLInputElement);
            scrubber.max = String(this.totalFrames - 1);
            scrubber.value = String(0);

            requireEl('exStartFrame', HTMLInputElement).value = String(0);
            requireEl('exEndFrame', HTMLInputElement).value = String(this.totalFrames - 1);
            requireEl('exWidth', HTMLInputElement).value = String(this.videoWidth);
            requireEl('exHeight', HTMLInputElement).value = String(this.videoHeight);

            this.videoLoaded = true;
            this.updateFrameInfo();
            this.updateVideoInfo();
            this.updateSizeEstimate();

            // Seek to frame 0 so the browser decodes a visible frame for the canvas
            this.video.currentTime = 0;
            this.video.addEventListener('seeked', () => {
                this.updatePreview();
                // Auto-detect chroma key color on load
                requireEl('exAutoDetect', HTMLButtonElement).click();
                showToast(`Video loaded: ${this.videoWidth.toString()}×${this.videoHeight.toString()}, ${this.totalFrames.toString()} frames`, 'success');
            }, { once: true });
        }, { once: true });

        this.video.load();
    }

    // ─── HANDOFF FROM VIDEO PREP ───
    bindHandoff(): void {
        const fromVP = requireEl('exFromVideoPrep', HTMLElement);
        const handoff = ASAdventurer.handoff;

        // Check for handoff data periodically or on tab switch
        const checkHandoff = async (): Promise<void> => {
            const data = handoff.videoPrepData;
            if (data !== null) {
                // Video Prep sends videoSrc, an object URL, never a blob.
                // A `data.blob` branch used to sit ahead of this; no producer
                // has ever set that field, nor the `keyColor` the block below
                // it read, so both were unreachable and are gone. See the
                // videoPrepData shape in video-prep-core.mts.
                const videoSource = data.videoSrc;
                if (videoSource !== undefined && videoSource !== '') {
                    try {
                        const resp = await fetch(videoSource);
                        const blob = await resp.blob();
                        this.loadVideo(blob);
                    } catch (e) {
                        // Fallback: load video directly from URL
                        console.warn('[ModelExporter] Could not fetch video blob, loading from URL:',
                            e instanceof Error ? e.message : 'unknown error');
                        this.loadVideoFromUrl(videoSource);
                    }
                    fromVP.classList.remove('hidden');

                    if (data.loopMode === 'pingpong') {
                        this.pingPongMode = true;
                        this.reverseMode = false;
                    } else if (data.loopMode === 'reverse') {
                        this.pingPongMode = false;
                        this.reverseMode = true;
                    } else {
                        this.pingPongMode = false;
                        this.reverseMode = false;
                    }

                    // Store FPS from Video Prep if available
                    if (data.fps !== undefined && data.fps > 0) {
                        this.detectedFps = data.fps;
                    }

                    // Consume handoff data
                    handoff.videoPrepData = null;
                    showToast('Video received from Video Prep!', 'success');
                }
            }
        };

        // Listen for tab switches to the exporter tab (manual clicks)
        document.addEventListener('click', (e) => {
            const btn = closestFrom(e.target, '[data-tab="tab-exporter"]', HTMLElement);
            if (btn !== undefined) setTimeout(() => { void checkHandoff(); }, 100);
        });

        // Auto-detect when videoPrepData is set (covers programmatic switchTab)
        let stored: HandoffPayload | null = handoff.videoPrepData;
        const descriptor: PropertyDescriptor & {
            get: () => HandoffPayload | null;
            set: (value: HandoffPayload | null) => void;
        } = {
            get: (): HandoffPayload | null => stored,
            set: (value: HandoffPayload | null): void => {
                stored = value;
                if (value !== null) setTimeout(() => { void checkHandoff(); }, 200);
            },
            configurable: true,
            enumerable: true,
        };
        Object.defineProperty(handoff, 'videoPrepData', descriptor);

        // Also check on init in case data was set before this module loaded
        setTimeout(() => { void checkHandoff(); }, 500);
    }

    private _selectSwatch(hex: string): void {
        const container = requireEl('exColorSwatches', HTMLElement);
        for (const swatch of queryAll(container, '.color-swatch', HTMLElement)) {
            swatch.classList.toggle('selected', swatch.dataset['color'] === hex.toUpperCase());
        }
    }

    // ─── EXPORT MODE TOGGLE ───
    bindModeToggle(): void {
        initModeSelector('exportModeToggle', (mode) => {
            const parsed = asExportMode(mode);
            if (parsed === undefined) return;
            this.mode = parsed;
            this.updateModeLimitsDisplay();
            this.updateSizeEstimate();
        });
    }

    updateModeLimitsDisplay(): void {
        const el = requireEl('exModeLimits', HTMLElement);
        const limits = MODE_LIMITS[this.mode];
        const names = { adventurer: 'Adventurer', normal: 'F. Normal', premium: 'F. Premium' };

        const maxFrames = limits.maxFrames === Infinity ? 'Unlimited' : limits.maxFrames;
        const maxRes = limits.maxWidth === Infinity ? 'Unlimited' : `${limits.maxWidth.toString()}×${limits.maxHeight.toString()}`;

        el.innerHTML = `
            <div><strong class="text-gold">${names[this.mode]}</strong></div>
            <div>Format: ${limits.format.toUpperCase()}</div>
            <div>Max Frames: ${maxFrames.toString()}</div>
            <div>Max Resolution: ${maxRes}</div>
        `;

        // Update format display
        const estFormat = requireEl('exEstFormat', HTMLElement);
        estFormat.textContent = `Format: ${limits.format.toUpperCase()}`;
    }

    // ─── COLOR SWATCHES ───
    bindColorSwatches(): void {
        initColorSwatches('exColorSwatches', (color) => {
            const rgb = hexToRgb(color);
            this.chromaKey.setKeyColor(rgb.r, rgb.g, rgb.b);
            this.updatePreview();
        });
    }

    // ─── EYEDROPPER ───
    bindEyedropper(): void {
        const eyedropperBtn = requireEl('exEyedropper', HTMLButtonElement);

        eyedropperBtn.addEventListener('click', () => {
            this.eyedropperActive = !this.eyedropperActive;
            requireEl('exCanvasContainer', HTMLElement).classList.toggle('eyedropper-mode', this.eyedropperActive);
            eyedropperBtn.classList.toggle('active', this.eyedropperActive);
        });

        this.previewCanvas.addEventListener('click', (e) => {
            if (!this.eyedropperActive || !this.videoLoaded) return;

            const rect = this.previewCanvas.getBoundingClientRect();
            const scaleX = this.previewCanvas.width / rect.width;
            const scaleY = this.previewCanvas.height / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);

            // Sample from original video frame (not the keyed preview)
            this.workCtx.drawImage(this.video, 0, 0, this.videoWidth, this.videoHeight);
            const pixel = this.workCtx.getImageData(x, y, 1, 1).data;

            const [r, g, b] = [channel(pixel, 0), channel(pixel, 1), channel(pixel, 2)];
            const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
            this.chromaKey.setKeyColor(r, g, b);
            this._selectSwatch(hex);

            // Deactivate eyedropper
            this.eyedropperActive = false;
            requireEl('exCanvasContainer', HTMLElement).classList.remove('eyedropper-mode');
            eyedropperBtn.classList.remove('active');

            this.updatePreview();
            showToast(`Key color set to ${hex.toUpperCase()}`, 'success');
        });
    }

    // ─── AUTO DETECT ───
    bindAutoDetect(): void {
        const btn = requireEl('exAutoDetect', HTMLButtonElement);
        btn.addEventListener('click', () => {
            if (!this.videoLoaded) return;

            // Sample corners + edges of the frame to detect the most common color
            this.workCtx.drawImage(this.video, 0, 0, this.videoWidth, this.videoHeight);
            const w = this.videoWidth, h = this.videoHeight;

            const samplePoints = [];
            // Top and bottom edges
            for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 50))) {
                samplePoints.push([x, 0], [x, h - 1]);
            }
            // Left and right edges
            for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 50))) {
                samplePoints.push([0, y], [w - 1, y]);
            }

            // Count colors
            const colorCounts = new Map<string, number>();
            for (const point of samplePoints) {
                const x = channel(point, 0);
                const y = channel(point, 1);
                const pixel = this.workCtx.getImageData(x, y, 1, 1).data;
                // Quantize to reduce noise
                const qr = Math.min(255, Math.round(channel(pixel, 0) / 16) * 16);
                const qg = Math.min(255, Math.round(channel(pixel, 1) / 16) * 16);
                const qb = Math.min(255, Math.round(channel(pixel, 2) / 16) * 16);
                const key = `${qr.toString()},${qg.toString()},${qb.toString()}`;
                colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
            }

            // Find most common
            let bestKey: string | null = null;
            let bestCount = 0;
            for (const [key, count] of colorCounts) {
                if (count > bestCount) { bestCount = count; bestKey = key; }
            }

            if (bestKey !== null) {
                const parts = bestKey.split(',').map(Number);
                const r = channel(parts, 0);
                const g = channel(parts, 1);
                const b = channel(parts, 2);
                this.chromaKey.setKeyColor(r, g, b);
                const hex = '#' + [r, g, b].map(c => Math.min(255, c).toString(16).padStart(2, '0')).join('');
                this._selectSwatch(hex);
                this.updatePreview();
                showToast(`Auto-detected key color: ${hex.toUpperCase()}`, 'success');
            }
        });
    }

    // ─── SLIDERS ───
    bindSliders(): void {
        const debounced = debounce(() => { this.updatePreview(); }, 150);

        // Similarity
        const simSlider = requireEl('exSimilarity', HTMLInputElement);
        simSlider.addEventListener('input', () => {
            requireEl('exSimilarityVal', HTMLElement).textContent = simSlider.value + '%';
            this.chromaKey.similarity = parseInt(simSlider.value) / 100;
            this.persistSliders();
            debounced();
        });

        // Smoothness
        const smoothSlider = requireEl('exSmoothness', HTMLInputElement);
        smoothSlider.addEventListener('input', () => {
            requireEl('exSmoothnessVal', HTMLElement).textContent = smoothSlider.value + '%';
            this.chromaKey.smoothness = parseInt(smoothSlider.value) / 100;
            this.persistSliders();
            debounced();
        });

        // Spill Suppression
        const spillSlider = requireEl('exSpillSuppress', HTMLInputElement);
        spillSlider.addEventListener('input', () => {
            requireEl('exSpillSuppressVal', HTMLElement).textContent = spillSlider.value + '%';
            this.chromaKey.spillSuppression = parseInt(spillSlider.value) / 100;
            this.persistSliders();
            debounced();
        });

        // Scale
        const scaleSlider = requireEl('exScale', HTMLInputElement);
        scaleSlider.addEventListener('input', () => {
            requireEl('exScaleVal', HTMLElement).textContent = scaleSlider.value + '%';
            this.videoScale = parseInt(scaleSlider.value) / 100;
            this.persistSliders();
            debounced();
        });

        // Vertical Offset
        const vOffsetSlider = requireEl('exVOffset', HTMLInputElement);
        vOffsetSlider.addEventListener('input', () => {
            requireEl('exVOffsetVal', HTMLElement).textContent = vOffsetSlider.value + 'px';
            this.videoOffset = parseInt(vOffsetSlider.value);
            this.persistSliders();
            debounced();
        });

        // Saturation
        const satSlider = requireEl('exSaturation', HTMLInputElement);
        satSlider.addEventListener('input', () => {
            requireEl('exSaturationVal', HTMLElement).textContent = satSlider.value + '%';
            this.chromaKey.postSaturation = parseInt(satSlider.value) / 100;
            this.persistSliders();
            debounced();
        });

        // Brightness
        const brightSlider = requireEl('exBrightness', HTMLInputElement);
        brightSlider.addEventListener('input', () => {
            requireEl('exBrightnessVal', HTMLElement).textContent = brightSlider.value + '%';
            this.chromaKey.postBrightness = parseInt(brightSlider.value) / 100;
            this.persistSliders();
            debounced();
        });

        // Reference Image for saturation matching
        const refFileInput = requireEl('exRefImage', HTMLInputElement);
        const refBtn = requireEl('exRefImageBtn', HTMLButtonElement);
        const refMatchBtn = requireEl('exRefMatchBtn', HTMLButtonElement);
        const refThumb = requireEl('exRefThumb', HTMLImageElement);
        const refClearBtn = requireEl('exRefClearBtn', HTMLButtonElement);
        this._refImageData = null; // stored reference ImageData

        refBtn.addEventListener('click', () => { refFileInput.click(); });
        refFileInput.addEventListener('change', () => {
            const file = refFileInput.files?.[0];
            if (file === undefined) return;
            const img = new Image();
            img.onload = (): void => {
                // Draw to offscreen canvas to get pixel data
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                const ctx = require2d(c);
                ctx.drawImage(img, 0, 0);
                this._refImageData = ctx.getImageData(0, 0, img.width, img.height);

                // Show thumbnail + buttons
                refThumb.src = c.toDataURL();
                refThumb.style.display = '';
                refMatchBtn.style.display = '';
                refClearBtn.style.display = '';
                URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(file);
        });

        refClearBtn.addEventListener('click', () => {
            this._refImageData = null;
            refThumb.style.display = 'none';
            refMatchBtn.style.display = 'none';
            refClearBtn.style.display = 'none';
            refFileInput.value = '';
        });

        refMatchBtn.addEventListener('click', () => {
            if (this._refImageData === null || !this.videoLoaded) return;
            const bgColor = { r: this.chromaKey.keyR, g: this.chromaKey.keyG, b: this.chromaKey.keyB };
            const refAvgSat = this._computeAvgSaturation(this._refImageData, bgColor);

            // Get current processed output saturation
            const w = this.videoWidth, h = this.videoHeight;
            this.workCtx.clearRect(0, 0, w, h);
            const scale = positiveOr(this.videoScale, 1);
            const vOffset = Number.isFinite(this.videoOffset) ? this.videoOffset : 0;
            const sw = Math.round(w * scale), sh = Math.round(h * scale);
            const dx = Math.round((w - sw) / 2), dy = Math.round((h - sh) / 2) + vOffset;
            this.workCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, dx, dy, sw, sh);
            const outData = this.workCtx.getImageData(0, 0, w, h);
            // Process without post-saturation to get base output
            const savedSat = this.chromaKey.postSaturation;
            this.chromaKey.postSaturation = 1;
            this.chromaKey.process(outData);
            this.chromaKey.postSaturation = savedSat;
            const outAvgSat = this._computeAvgSaturation(outData, bgColor, true);

            if (outAvgSat > 0.001) {
                const ratio = refAvgSat / outAvgSat;
                const newSatPercent = Math.round(Math.max(0, Math.min(200, ratio * 100)));
                requireEl('exSaturation', HTMLInputElement).value = String(newSatPercent);
                requireEl('exSaturationVal', HTMLElement).textContent = `${newSatPercent.toString()}%`;
                this.chromaKey.postSaturation = newSatPercent / 100;
                this.persistSliders();
                this.updatePreview();
                console.log(`[RefMatch] ref=${refAvgSat.toFixed(3)} out=${outAvgSat.toFixed(3)} ratio=${ratio.toFixed(2)} → sat=${newSatPercent.toString()}%`);
            }
        });

        // Edge Fade
        const fadeSlider = requireEl('exEdgeFade', HTMLInputElement);
        fadeSlider.addEventListener('input', () => {
            requireEl('exEdgeFadeVal', HTMLElement).textContent = fadeSlider.value + 'px';
            this.chromaKey.edgeFadeWidth = parseInt(fadeSlider.value);
            this.persistSliders();
            debounced();
        });

        // Anti-Aliasing toggle
        const aaToggle = requireEl('exAntiAlias', HTMLInputElement);
        aaToggle.addEventListener('change', () => {
            this.chromaKey.antiAlias = aaToggle.checked;
            this.persistSliders();
            debounced();
        });

        // Smoke Cleanup toggle
        const smokeToggle = requireEl('exSmokeCleanup', HTMLInputElement);
        smokeToggle.addEventListener('change', () => {
            this.chromaKey.smokeCleanup = smokeToggle.checked;
            this.persistSliders();
            debounced();
        });
    }

    persistSliders(): void {
        const numeric = (id: string): number => storedNumber(requireEl(id, HTMLInputElement).value) ?? 0;
        const data: PersistedSliders = {
            similarity: numeric('exSimilarity'),
            smoothness: numeric('exSmoothness'),
            spillSuppress: numeric('exSpillSuppress'),
            scale: numeric('exScale'),
            vOffset: numeric('exVOffset'),
            saturation: numeric('exSaturation'),
            brightness: numeric('exBrightness'),
            edgeFade: numeric('exEdgeFade'),
            antiAlias: requireEl('exAntiAlias', HTMLInputElement).checked,
            smokeCleanup: requireEl('exSmokeCleanup', HTMLInputElement).checked,
        };
        localStorage.setItem(SLIDER_STORAGE_KEY, JSON.stringify(data));
    }

    loadPersistedSliders(): void {
        try {
            const raw = localStorage.getItem(SLIDER_STORAGE_KEY);
            if (raw === null || raw === '') return;
            const data = parsePersistedSliders(raw);
            if (data === undefined) return;

            const setSlider = (
                id: string,
                valId: string,
                suffix: string,
                value: number | undefined,
                apply: (v: number) => void,
            ): void => {
                if (value === undefined) return;
                requireEl(id, HTMLInputElement).value = String(value);
                requireEl(valId, HTMLElement).textContent = String(value) + suffix;
                apply(value);
            };

            setSlider('exSimilarity', 'exSimilarityVal', '%', data.similarity, v => this.chromaKey.similarity = v / 100);
            setSlider('exSmoothness', 'exSmoothnessVal', '%', data.smoothness, v => this.chromaKey.smoothness = v / 100);
            setSlider('exSpillSuppress', 'exSpillSuppressVal', '%', data.spillSuppress, v => this.chromaKey.spillSuppression = v / 100);
            setSlider('exScale', 'exScaleVal', '%', data.scale, v => this.videoScale = v / 100);
            setSlider('exVOffset', 'exVOffsetVal', 'px', data.vOffset, v => this.videoOffset = v);
            setSlider('exSaturation', 'exSaturationVal', '%', data.saturation, v => this.chromaKey.postSaturation = v / 100);
            setSlider('exBrightness', 'exBrightnessVal', '%', data.brightness, v => this.chromaKey.postBrightness = v / 100);
            setSlider('exEdgeFade', 'exEdgeFadeVal', 'px', data.edgeFade, v => this.chromaKey.edgeFadeWidth = v);

            // Restore anti-alias toggle
            if (data.antiAlias !== undefined) {
                requireEl('exAntiAlias', HTMLInputElement).checked = data.antiAlias;
                this.chromaKey.antiAlias = data.antiAlias;
            }

            // Restore smoke cleanup toggle
            if (data.smokeCleanup !== undefined) {
                requireEl('exSmokeCleanup', HTMLInputElement).checked = data.smokeCleanup;
                this.chromaKey.smokeCleanup = data.smokeCleanup;
            }
        } catch {
            // ignore
        }
    }

    // ─── PREVIEW MODES ───
    bindPreviewModes(): void {
        const container = requireEl('exPreviewModes', HTMLElement);
        container.addEventListener('click', (e) => {
            const btn = closestFrom(e.target, '.preview-mode-btn', HTMLElement);
            if (btn === undefined) return;

            for (const b of queryAll(container, '.preview-mode-btn', HTMLElement)) {
                b.classList.remove('active');
            }
            btn.classList.add('active');
            const nextMode = asPreviewMode(btn.dataset['mode'] ?? '');
            if (nextMode === undefined) return;
            this.previewMode = nextMode;

            const area = requireEl('exCanvasContainer', HTMLElement);
            area.classList.remove('preview-checker');
            area.style.backgroundColor = '';

            if (this.previewMode === 'checker') {
                area.classList.add('preview-checker');
            } else if (this.previewMode === 'black') {
                area.style.backgroundColor = '#000';
            } else if (this.previewMode === 'white') {
                area.style.backgroundColor = '#fff';
            } else {
                area.style.backgroundColor = '#1a1a1a';
            }

            this.updatePreview();
        });
    }

    // ─── PLAYBACK ───
    bindPlayback(): void {
        const playBtn = requireEl('exPlayBtn', HTMLButtonElement);
        const scrubber = requireEl('exScrubber', HTMLInputElement);
        const prevBtn = requireEl('exPrevFrame', HTMLButtonElement);
        const nextBtn = requireEl('exNextFrame', HTMLButtonElement);

        playBtn.addEventListener('click', () => {
            if (this.isPlaying) {
                this.stopPlayback();
            } else {
                this.startPlayback();
            }
        });

        scrubber.addEventListener('input', () => {
            if (this.isPlaying) this.stopPlayback();
            this.currentFrame = parseInt(scrubber.value);
            this.seekToFrame(this.currentFrame);
        });

        prevBtn.addEventListener('click', () => {
            if (this.isPlaying) this.stopPlayback();
            this.currentFrame = Math.max(0, this.currentFrame - 1);
            requireEl('exScrubber', HTMLInputElement).value = String(this.currentFrame);
            this.seekToFrame(this.currentFrame);
        });

        nextBtn.addEventListener('click', () => {
            if (this.isPlaying) this.stopPlayback();
            this.currentFrame = Math.min(this.totalFrames - 1, this.currentFrame + 1);
            requireEl('exScrubber', HTMLInputElement).value = String(this.currentFrame);
            this.seekToFrame(this.currentFrame);
        });
    }

    startPlayback(): void {
        if (!this.videoLoaded) return;
        this.isPlaying = true;
        requireEl('exPlayBtn', HTMLButtonElement).textContent = '⏸';

        const frameInterval = 1000 / this.fps;
        this.playTimer = setInterval(() => {
            this.currentFrame++;
            if (this.currentFrame >= this.totalFrames) {
                this.currentFrame = 0;
            }
            this.seekToFrame(this.currentFrame);
            requireEl('exScrubber', HTMLInputElement).value = String(this.currentFrame);
        }, frameInterval);
    }

    stopPlayback(): void {
        this.isPlaying = false;
        requireEl('exPlayBtn', HTMLButtonElement).textContent = '▶️';
        if (this.playTimer !== null) {
            clearInterval(this.playTimer);
            this.playTimer = null;
        }
    }

    seekToFrame(frameNum: number): void {
        const time = frameNum / this.fps;
        const targetTime = Math.min(time, this.duration - 0.001);
        this.updateFrameInfo();

        if (Math.abs(this.video.currentTime - targetTime) < 0.001) {
            this.previewCtx.drawImage(this.video, 0, 0, this.videoWidth, this.videoHeight);
            this._debouncedKeyPreview();
            return;
        }

        this.video.currentTime = targetTime;
        this.video.addEventListener('seeked', () => {
            this.previewCtx.drawImage(this.video, 0, 0, this.videoWidth, this.videoHeight);
            this._debouncedKeyPreview();
        }, { once: true });
    }

    // Debounced keyed preview — only runs ChromaKey 200ms after last seek
    private _debouncedKeyPreview(): void {
        if (this._keyPreviewTimer !== null) clearTimeout(this._keyPreviewTimer);
        this._keyPreviewTimer = setTimeout(() => {
            this.updatePreview();
        }, 200);
    }

    updateFrameInfo(): void {
        requireEl('exFrameInfo', HTMLElement).textContent = `${this.currentFrame.toString()} / ${Math.max(0, this.totalFrames - 1).toString()}`;
    }

    // Compute average HSL saturation of an ImageData, excluding key-colored pixels
    // bgColor: { r, g, b } — the key color to exclude from analysis
    // skipTransparent: if true, skip alpha=0 pixels (for processed output)
    private _computeAvgSaturation(imageData: ImageData, bgColor: Rgb, skipTransparent = false): number {
        const d = imageData.data;
        const keyCb = 128 + (-0.168736 * bgColor.r - 0.331264 * bgColor.g + 0.5 * bgColor.b);
        const keyCr = 128 + (0.5 * bgColor.r - 0.418688 * bgColor.g - 0.081312 * bgColor.b);
        const keyExcludeRange = 40; // Exclude pixels within this chroma distance of key

        let totalSat = 0, count = 0;
        for (let j = 0; j < d.length; j += 4) {
            const alpha = channel(d, j + 3);
            if (skipTransparent && alpha < 10) continue;
            if (!skipTransparent && alpha < 200) continue; // For ref: only solid pixels

            const dr = channel(d, j), dg = channel(d, j + 1), db = channel(d, j + 2);
            const r = dr / 255, g = dg / 255, b = db / 255;
            const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
            const lum = (maxC + minC) / 2;

            // Skip near-black and near-white (saturation is meaningless)
            if (lum < 0.05 || lum > 0.95) continue;

            // Skip key-colored pixels
            const cb = 128 + (-0.168736 * dr - 0.331264 * dg + 0.5 * db);
            const cr = 128 + (0.5 * dr - 0.418688 * dg - 0.081312 * db);
            const chromaDist = Math.sqrt((cb - keyCb) ** 2 + (cr - keyCr) ** 2);
            if (chromaDist < keyExcludeRange) continue;

            // HSL saturation
            const sat = maxC === minC ? 0 : (maxC - minC) / (1 - Math.abs(2 * lum - 1));
            totalSat += Math.min(1, sat); // clamp
            count++;
        }
        return count > 0 ? totalSat / count : 0;
    }

    // ─── PREVIEW RENDERING ───
    updatePreview(): void {
        if (!this.videoLoaded) return;

        const w = this.videoWidth;
        const h = this.videoHeight;
        const scale = positiveOr(this.videoScale, 1);
        const vOffset = Number.isFinite(this.videoOffset) ? this.videoOffset : 0;

        if (this.previewMode === 'original') {
            this.previewCtx.clearRect(0, 0, w, h);
            const sw = Math.round(w * scale);
            const sh = Math.round(h * scale);
            const dx = Math.round((w - sw) / 2);
            const dy = Math.round((h - sh) / 2) + vOffset;
            this.previewCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, dx, dy, sw, sh);
            return;
        }

        // Draw video scaled + centered to work canvas
        this.workCtx.clearRect(0, 0, w, h);
        const sw = Math.round(w * scale);
        const sh = Math.round(h * scale);
        const dx = Math.round((w - sw) / 2);
        const dy = Math.round((h - sh) / 2) + vOffset;
        this.workCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, dx, dy, sw, sh);
        const imageData = this.workCtx.getImageData(0, 0, w, h);

        // Apply chroma key
        this.chromaKey.process(imageData);

        // Apply anti-aliasing if enabled
        if (this.chromaKey.antiAlias) {
            this.chromaKey.applyAntiAlias(imageData);
        }

        // Apply edge fade if enabled
        this.chromaKey.applyEdgeFade(imageData, this.chromaKey.edgeFadeWidth);

        // Clear preview and render
        this.previewCtx.clearRect(0, 0, w, h);
        this.previewCtx.putImageData(imageData, 0, 0);
    }

    // ─── CROP OVERLAY ───
    bindCropOverlay(): void {
        const overlay = requireEl('exCropOverlay', HTMLElement);
        const region = requireEl('exCropRegion', HTMLElement);

        initModeSelector('exCropRatio', (ratio) => {
            if (ratio === 'off') {
                this.cropEnabled = false;
                overlay.classList.add('hidden');
                if (this.videoLoaded) {
                    requireEl('exWidth', HTMLInputElement).value = String(this.videoWidth);
                    requireEl('exHeight', HTMLInputElement).value = String(this.videoHeight);
                }
            } else {
                this.cropEnabled = true;
                const parsedRatio = asCropRatio(ratio);
                if (parsedRatio === undefined) return;
                this.cropRatio = parsedRatio;
                if (this.videoLoaded) {
                    this.resetCropToCenter();
                    this.syncExportDimsToCrop();
                    this.updateCropOverlay();
                    overlay.classList.remove('hidden');
                }
            }
            this.updateSizeEstimate();
        });

        // Draggable crop region
        let dragging = false;
        let dragStartX = 0, dragStartY = 0;
        let startCropX = 0, startCropY = 0;

        region.addEventListener('mousedown', (e) => {
            if (!this.cropEnabled) return;
            dragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            startCropX = this.cropX;
            startCropY = this.cropY;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const canvas = this.previewCanvas;
            const canvasRect = canvas.getBoundingClientRect();
            const scaleX = this.videoWidth / canvasRect.width;
            const scaleY = this.videoHeight / canvasRect.height;

            const dx = (e.clientX - dragStartX) * scaleX;
            const dy = (e.clientY - dragStartY) * scaleY;

            this.cropX = Math.round(Math.max(0, Math.min(this.videoWidth - this.cropW, startCropX + dx)));
            this.cropY = Math.round(Math.max(0, Math.min(this.videoHeight - this.cropH, startCropY + dy)));

            this.updateCropOverlay();
        });

        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                this.syncExportDimsToCrop();
            }
        });
    }

    resetCropToCenter(): void {
        if (!this.videoLoaded) return;
        const crop = computeCropToCenter(this.videoWidth, this.videoHeight, this.cropRatio);
        this.cropX = crop.cropX;
        this.cropY = crop.cropY;
        this.cropW = crop.cropW;
        this.cropH = crop.cropH;
    }

    syncExportDimsToCrop(): void {
        if (!this.cropEnabled || !this.videoLoaded) return;
        // Set export dimensions to match the crop region
        requireEl('exWidth', HTMLInputElement).value = String(this.cropW);
        requireEl('exHeight', HTMLInputElement).value = String(this.cropH);
        this.updateSizeEstimate();
    }

    updateCropOverlay(): void {
        if (!this.cropEnabled || !this.videoLoaded) return;

        const overlay = requireEl('exCropOverlay', HTMLElement);
        const region = requireEl('exCropRegion', HTMLElement);

        // Convert video coords to percentage-based positioning (works regardless of canvas CSS size)
        const pctLeft = (this.cropX / this.videoWidth) * 100;
        const pctTop = (this.cropY / this.videoHeight) * 100;
        const pctWidth = (this.cropW / this.videoWidth) * 100;
        const pctHeight = (this.cropH / this.videoHeight) * 100;

        region.style.left = `${pctLeft.toString()}%`;
        region.style.top = `${pctTop.toString()}%`;
        region.style.width = `${pctWidth.toString()}%`;
        region.style.height = `${pctHeight.toString()}%`;

        overlay.classList.remove('hidden');
    }

    // ─── EXPORT SETTINGS ───
    bindExportSettings(): void {
        // Aspect lock
        const aspectLock = requireEl('exAspectLock', HTMLInputElement);
        const widthInput = requireEl('exWidth', HTMLInputElement);
        const heightInput = requireEl('exHeight', HTMLInputElement);

        widthInput.addEventListener('change', () => {
            if (aspectLock.checked && this.videoLoaded) {
                const ratio = this.videoHeight / this.videoWidth;
                heightInput.value = String(Math.round(parseInt(widthInput.value) * ratio));
            }
            this.updateSizeEstimate();
        });

        heightInput.addEventListener('change', () => {
            if (aspectLock.checked && this.videoLoaded) {
                const ratio = this.videoWidth / this.videoHeight;
                widthInput.value = String(Math.round(parseInt(heightInput.value) * ratio));
            }
            this.updateSizeEstimate();
        });

        // Frame range changes
        ['exStartFrame', 'exEndFrame', 'exFrameSkip', 'exFPS'].forEach(id => {
            requireEl(id, HTMLInputElement)
                .addEventListener('change', () => { this.updateSizeEstimate(); });
        });
    }

    // ─── FILENAME PRESETS ───
    bindFilenamePresets(): void {
        const container = requireEl('exFilenamePresets', HTMLElement);
        const filenameInput = requireEl('exFilename', HTMLInputElement);

        container.addEventListener('click', (e) => {
            const btn = closestFrom(e.target, '.filename-preset-btn', HTMLElement);
            if (btn === undefined) return;

            const preset = btn.dataset['preset'];
            const charName = ASAdventurer.characterName === '' ? 'character' : ASAdventurer.characterName;
            const sanitize = sanitizeFilename;
            const safeName = sanitize(charName);

            if (preset === 'custom') {
                filenameInput.focus();
                filenameInput.select();
            } else {
                filenameInput.value = `${safeName}_${String(preset)}`;
            }

            // Highlight active preset
            container.querySelectorAll('.filename-preset-btn').forEach(b => { b.classList.remove('active'); });
            btn.classList.add('active');
        });
    }

    // ─── EXPORT BUTTON ───
    bindExportButton(): void {
        const exportBtn = requireEl('exExportBtn', HTMLButtonElement);
        const cancelBtn = requireEl('exCancelBtn', HTMLButtonElement);

        exportBtn.addEventListener('click', () => {
            void this.startExport();
        });

        cancelBtn.addEventListener('click', () => {
            this._exportCancelled = true;
        });
    }

    // ─── SIZE ESTIMATE ───
    updateSizeEstimate(): void {
        const estFrames = requireEl('exEstFrames', HTMLElement);
        const estSize = requireEl('exEstSize', HTMLElement);

        if (!this.videoLoaded) {
            estFrames.textContent = 'Frames: --';
            estSize.textContent = 'Est. Size: --';
            return;
        }

        const count = this.getOutputFrameCount();
        estFrames.textContent = `Frames: ${count.toString()}`;

        const limits = MODE_LIMITS[this.mode];
        const w = intFromField('exWidth', this.videoWidth);
        const h = intFromField('exHeight', this.videoHeight);

        if (limits.format === 'gif') {
            // Rough GIF estimate: ~0.3 bytes per pixel per frame (with LZW + transparency)
            const est = count * w * h * 0.3;
            estSize.textContent = `Est. Size: ~${formatBytes(est)}`;
        } else {
            // WebM: ~0.1 bytes per pixel per frame
            const est = count * w * h * 0.1;
            estSize.textContent = `Est. Size: ~${formatBytes(est)}`;
        }
    }

    updateVideoInfo(): void {
        const el = requireEl('exInfo', HTMLElement);
        if (!this.videoLoaded) {
            el.innerHTML = '<div>No video loaded</div>';
            return;
        }

        el.innerHTML = `
            <div><strong>Resolution:</strong> ${this.videoWidth.toString()}×${this.videoHeight.toString()}</div>
            <div><strong>Duration:</strong> ${this.duration.toFixed(2)}s</div>
            <div><strong>Frames:</strong> ${this.totalFrames.toString()}</div>
            <div><strong>FPS:</strong> ${this.fps.toString()}</div>
        `;
    }

    getOutputFrameCount(): number {
        const start = intFromField('exStartFrame', 0);
        const end = intFromField('exEndFrame', 0);
        const skip = intFromField('exFrameSkip', 0);
        return getOutputFrameCount(start, end, skip, this.pingPongMode);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXPORT — Main entry point
    // ═══════════════════════════════════════════════════════════════

    async startExport(): Promise<void> {
        if (this.isExporting || !this.videoLoaded) return;

        const limits = MODE_LIMITS[this.mode];

        if (limits.format === 'webm') {
            return this.startExportWebM();
        } else {
            return this.startExportGIF();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  WEBM EXPORT
    // ═══════════════════════════════════════════════════════════════

    async startExportWebM(): Promise<void> {
        const limits = MODE_LIMITS[this.mode];
        const outputFrames = this.getOutputFrameCount();

        if (outputFrames <= 0) {
            showToast('No frames to export. Check start/end range.', 'error');
            return;
        }

        const width = Math.min(intFromField('exWidth', this.videoWidth), limits.maxWidth);
        const height = Math.min(intFromField('exHeight', this.videoHeight), limits.maxHeight);
        const exportFps = intFromField('exFPS', this.fps);
        const startFrame = intFromField('exStartFrame', 0);
        const endFrame = intFromField('exEndFrame', 0);
        const skip = Math.max(1, (intFromField('exFrameSkip', 0)) + 1);
        const videoScale = positiveOr(this.videoScale, 1);
        const videoOffset = Number.isFinite(this.videoOffset) ? this.videoOffset : 0;

        // Build frame list
        const frameList = [];
        for (let f = startFrame; f <= endFrame; f += skip) frameList.push(f);
        if (this.pingPongMode && frameList.length > 2) {
            for (let i = frameList.length - 2; i >= 1; i--) frameList.push(frameList[i]);
        } else if (this.reverseMode && frameList.length > 1) {
            frameList.reverse();
        }
        const totalFrames = frameList.length;

        this.isExporting = true;
        this._exportCancelled = false;
        requireEl('exExportBtn', HTMLButtonElement).disabled = true;

        const progressContainer = requireEl('exProgress', HTMLElement);
        const progressFill = requireEl('exProgressFill', HTMLElement);
        const progressText = requireEl('exProgressText', HTMLElement);
        const cancelBtn = requireEl('exCancelBtn', HTMLButtonElement);
        progressContainer.classList.add('active');
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting WebM export...';
        cancelBtn.style.display = 'inline-flex';

        this.stopPlayback();

        try {
            // Create canvas for frame processing
            const recCanvas = document.createElement('canvas');
            recCanvas.width = width;
            recCanvas.height = height;
            const recCtx = require2d(recCanvas, { willReadFrequently: true });

            // ── Phase 1: Extract all frames with chroma key ──
            progressText.textContent = 'Extracting frames...';
            const frameImages: ImageData[] = [];

            const drawScaled = (): void => {
                recCtx.clearRect(0, 0, width, height);
                const sw = Math.round(width * videoScale);
                const sh = Math.round(height * videoScale);
                const dx = Math.round((width - sw) / 2);
                const dy = Math.round((height - sh) / 2) + videoOffset;
                if (this.cropEnabled) {
                    recCtx.drawImage(this.video, this.cropX, this.cropY, this.cropW, this.cropH, dx, dy, sw, sh);
                } else {
                    recCtx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, dx, dy, sw, sh);
                }
            };

            for (let fi = 0; fi < totalFrames; fi++) {
                if (this.cancelled()) break;

                const f = frameList[fi];
                if (f === undefined) continue;
                await this.seekToAsync(f / this.fps);

                drawScaled();
                const imageData = recCtx.getImageData(0, 0, width, height);
                this.chromaKey.process(imageData);
                if (this.chromaKey.antiAlias) this.chromaKey.applyAntiAlias(imageData);
                this.chromaKey.applyEdgeFade(imageData, this.chromaKey.edgeFadeWidth);
                frameImages.push(imageData);

                const pct = ((fi + 1) / totalFrames) * 50;
                progressFill.style.width = `${pct.toString()}%`;
                progressText.textContent = `Extracting frame ${(fi + 1).toString()} / ${totalFrames.toString()}...`;
            }

            if (this.cancelled()) throw new Error('cancelled');

            // ── Phase 2: Record frames at correct frame rate ──
            // Uses a Web Worker timer to avoid browser throttling when tab is unfocused
            progressText.textContent = 'Encoding WebM...';

            const isFirefox = navigator.userAgent.includes('Firefox');

            // Firefox doesn't support track.requestFrame(), so we use
            // captureStream(fps) which auto-captures on canvas changes.
            // Chrome uses captureStream(0) + requestFrame() for precision.
            const stream = recCanvas.captureStream(isFirefox ? exportFps : 0);
            const [track] = stream.getVideoTracks();
            if (track === undefined) throw new Error('Canvas capture produced no video track');

            let mimeType = 'video/webm; codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm; codecs=vp8';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 8_000_000
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = (e): void => { if (e.data.size > 0) chunks.push(e.data); };
            const recorderDone = new Promise<void>(resolve => { recorder.onstop = (): void => { resolve(); }; });

            // Draw first processed frame before starting recorder
            const firstFrame = frameImages[0];
            if (firstFrame !== undefined) {
                recCtx.putImageData(firstFrame, 0, 0);
            }
            recorder.start();
            const frameDelay = 1000 / exportFps;

            // Worker-based timer (immune to background tab throttling)
            const timerWorker = new Worker(new URL('./timer-worker.mjs', import.meta.url), {
                type: 'module',
            });
            let frameIdx = 0;

            await new Promise<void>((resolve) => {
                timerWorker.onmessage = (): void => {
                    if (this.cancelled() || frameIdx >= frameImages.length) {
                        timerWorker.postMessage({ cmd: 'stop' } satisfies TimerCommand);
                        resolve();
                        return;
                    }

                    // Clear and redraw to trigger Firefox's auto-capture
                    recCtx.clearRect(0, 0, recCanvas.width, recCanvas.height);
                    const nextFrame = frameImages[frameIdx];
                    if (nextFrame === undefined) {
                        timerWorker.postMessage({ cmd: 'stop' } satisfies TimerCommand);
                        resolve();
                        return;
                    }
                    recCtx.putImageData(nextFrame, 0, 0);

                    // Chrome: manually push frame. Firefox: auto-captured by stream.
                    if (track instanceof CanvasCaptureMediaStreamTrack) track.requestFrame();

                    const pct = 50 + ((frameIdx + 1) / frameImages.length) * 50;
                    progressFill.style.width = `${pct.toString()}%`;
                    progressText.textContent = `Encoding frame ${(frameIdx + 1).toString()} / ${frameImages.length.toString()}...`;
                    frameIdx++;
                };
                timerWorker.postMessage({ cmd: 'start', ms: frameDelay } satisfies TimerCommand);
            });

            recorder.stop();
            await recorderDone;

            if (this.cancelled()) {
                progressText.textContent = 'Export cancelled.';
                showToast('Export cancelled', 'info');
            } else {
                const webmBlob = new Blob(chunks, { type: 'video/webm' });
                this.lastExportBlob = webmBlob;
                this.lastExportFormat = 'webm';

                const sizeStr = formatBytes(webmBlob.size);
                progressText.textContent = `Done! ${sizeStr} · ${outputFrames.toString()} frames · ${width.toString()}×${height.toString()}`;
                showToast(`WebM exported successfully! (${sizeStr})`, 'success');

                // Auto-download
                this.downloadBlob(webmBlob, 'webm');

                // Play notification sound
                notificationSound.play();
            }

        } catch (err) {
            if ((err instanceof Error ? err.message : 'unknown error') === 'cancelled') {
                progressText.textContent = 'Export cancelled.';
                showToast('Export cancelled', 'info');
            } else {
                console.error('WebM export error:', err);
                showToast('Export failed: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
                progressText.textContent = 'Export failed.';
            }
        }

        cancelBtn.style.display = 'none';
        this.isExporting = false;
        this._exportCancelled = false;
        requireEl('exExportBtn', HTMLButtonElement).disabled = false;
    }

    // ═══════════════════════════════════════════════════════════════
    //  GIF EXPORT (with Web Worker encoding)
    // ═══════════════════════════════════════════════════════════════

    async startExportGIF(): Promise<void> {
        const limits = MODE_LIMITS[this.mode];
        const outputFrames = this.getOutputFrameCount();

        if (outputFrames > limits.maxFrames) {
            showToast(`Frame count (${outputFrames.toString()}) exceeds ${this.mode} limit (${limits.maxFrames.toString()})`, 'error');
            return;
        }
        if (outputFrames <= 0) {
            showToast('No frames to export. Check start/end range.', 'error');
            return;
        }

        const width = Math.min(intFromField('exWidth', this.videoWidth), limits.maxWidth);
        const height = Math.min(intFromField('exHeight', this.videoHeight), limits.maxHeight);
        const maxColors = 128;
        const exportFps = intFromField('exFPS', this.fps);
        const delayCentiseconds = Math.max(2, Math.round(100 / exportFps));
        const startFrame = intFromField('exStartFrame', 0);
        const endFrame = intFromField('exEndFrame', 0);
        const skip = Math.max(1, (intFromField('exFrameSkip', 0)) + 1);
        const videoScale = positiveOr(this.videoScale, 1);
        const videoOffset = Number.isFinite(this.videoOffset) ? this.videoOffset : 0;

        // Build frame list
        const frameList = [];
        for (let f = startFrame; f <= endFrame; f += skip) frameList.push(f);
        if (this.pingPongMode && frameList.length > 2) {
            for (let i = frameList.length - 2; i >= 1; i--) frameList.push(frameList[i]);
        } else if (this.reverseMode && frameList.length > 1) {
            frameList.reverse();
        }
        const totalFrames = frameList.length;

        this.isExporting = true;
        this._exportCancelled = false;
        requireEl('exExportBtn', HTMLButtonElement).disabled = true;

        const progressContainer = requireEl('exProgress', HTMLElement);
        const progressFill = requireEl('exProgressFill', HTMLElement);
        const progressText = requireEl('exProgressText', HTMLElement);
        const cancelBtn = requireEl('exCancelBtn', HTMLButtonElement);
        progressContainer.classList.add('active');
        progressFill.style.width = '0%';
        progressText.textContent = 'Starting GIF export...';
        cancelBtn.style.display = 'inline-flex';

        this.stopPlayback();

        try {
            // Create output canvas at export dimensions
            const outCanvas = document.createElement('canvas');
            outCanvas.width = width;
            outCanvas.height = height;
            const outCtx = require2d(outCanvas, { willReadFrequently: true });

            const drawVideoScaled = (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
                ctx.clearRect(0, 0, w, h);
                const sw = Math.round(w * videoScale);
                const sh = Math.round(h * videoScale);
                const dx = Math.round((w - sw) / 2);
                const dy = Math.round((h - sh) / 2) + videoOffset;
                if (this.cropEnabled) {
                    ctx.drawImage(this.video, this.cropX, this.cropY, this.cropW, this.cropH, dx, dy, sw, sh);
                } else {
                    ctx.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, dx, dy, sw, sh);
                }
            };

            // ── Phase 1: Build global palette from sampled frames ──
            progressText.textContent = 'Building palette...';
            const sampleCount = Math.min(6, totalFrames);
            const sampleStep = Math.max(1, Math.floor(totalFrames / sampleCount));
            const sampledPixels = [];
            let paletteSourceData = null;

            for (let si = 0; si < totalFrames; si += sampleStep) {
                const f = frameList[si];
                if (f === undefined) continue;
                await this.seekToAsync(f / this.fps);
                drawVideoScaled(outCtx, width, height);
                const sd = outCtx.getImageData(0, 0, width, height);
                this.chromaKey.process(sd);
                for (let pi = 0; pi < sd.data.length; pi += 4) {
                    if (channel(sd.data, pi + 3) >= 128) sampledPixels.push(pi / 4);
                }
                if (si === 0) { paletteSourceData = sd.data; }
            }

            const paletteSlots = Math.max(2, maxColors - 1);
            const allSampledColors = sampledPixels.length > 0 ? sampledPixels : [0];
            const globalPalette = ColorQuantizer.medianCut(
                paletteSourceData ?? new Uint8Array(4), allSampledColors, paletteSlots);
            const transparentIndex = globalPalette.length;
            globalPalette.push([0, 0, 0]);

            // ── Phase 2: Extract & process all UNIQUE frames ──
            progressText.textContent = 'Extracting frames...';

            const uniqueFrames = [];
            for (let f = startFrame; f <= endFrame; f += skip) uniqueFrames.push(f);

            const frameCache = new Map<number, WorkerFrame>();
            // Nearest-palette-index cache, keyed by packed RGB, shared across frames.
            const cache = new Map<number, number>();

            for (let ui = 0; ui < uniqueFrames.length; ui++) {
                if (this.cancelled()) break;

                const f = uniqueFrames[ui];
                if (f === undefined) continue;
                await this.seekToAsync(f / this.fps);

                drawVideoScaled(outCtx, width, height);
                const imageData = outCtx.getImageData(0, 0, width, height);
                this.chromaKey.process(imageData);
                if (this.chromaKey.antiAlias) this.chromaKey.applyAntiAlias(imageData);
                this.chromaKey.applyEdgeFade(imageData, this.chromaKey.edgeFadeWidth);

                const rgba = imageData.data;
                const numPx = width * height;
                const indexed = new Uint8Array(numPx);
                let minX = width, minY = height, maxX = -1, maxY = -1;

                for (let i = 0; i < numPx; i++) {
                    const a = channel(rgba, i * 4 + 3);
                    if (a < 128) {
                        indexed[i] = transparentIndex;
                    } else {
                        const r = channel(rgba, i * 4);
                        const g = channel(rgba, i * 4 + 1);
                        const b = channel(rgba, i * 4 + 2);
                        const key = (r << 16) | (g << 8) | b;
                        let idx = cache.get(key);
                        if (idx === undefined) {
                            idx = ColorQuantizer.nearestPaletteIndex(globalPalette, r, g, b, transparentIndex);
                            cache.set(key, idx);
                        }
                        indexed[i] = idx;
                        const x = i % width, y = (i - x) / width;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }

                frameCache.set(f, { indexed, minX, minY, maxX, maxY });

                const pct = ((ui + 1) / uniqueFrames.length) * 50;
                progressFill.style.width = `${pct.toString()}%`;
                progressText.textContent = `Extracting frame ${(ui + 1).toString()} / ${uniqueFrames.length.toString()}...`;

                if ((ui + 1) % 8 === 0) await new Promise(r => setTimeout(r, 0));
            }

            if (this.cancelled()) {
                progressText.textContent = 'Export cancelled.';
                showToast('Export cancelled', 'info');
                cancelBtn.style.display = 'none';
                this.isExporting = false;
                requireEl('exExportBtn', HTMLButtonElement).disabled = false;
                return;
            }

            // ── Phase 3: Encode GIF in Web Worker ──
            progressText.textContent = 'Encoding GIF...';

            const workerFrames: WorkerFrame[] = [];
            for (let fi = 0; fi < totalFrames; fi++) {
                const f = frameList[fi];
                const frame = f === undefined ? undefined : frameCache.get(f);
                if (frame === undefined) continue;
                workerFrames.push({
                    indexed: frame.indexed,
                    minX: frame.minX, minY: frame.minY,
                    maxX: frame.maxX, maxY: frame.maxY,
                });
            }

            const gifData = await new Promise<Uint8Array>((resolve, reject) => {
                // The encoder is a real module (gif-worker.mts), compiled by
                // tsconfig.worker.json. It used to be a template literal built
                // into a blob URL, which put it outside the type checker.
                const worker = new Worker(new URL('./gif-worker.mjs', import.meta.url), {
                    type: 'module',
                });

                worker.addEventListener('message', (event: MessageEvent<EncodeResponse>) => {
                    const message = event.data;
                    if (message.type === 'progress') {
                        const pct = 50 + (message.frame / message.total) * 50;
                        progressFill.style.width = `${pct.toString()}%`;
                        progressText.textContent =
                            `Encoding frame ${message.frame.toString()} / ${message.total.toString()}...`;
                    } else {
                        worker.terminate();
                        resolve(new Uint8Array(message.data));
                    }
                });

                worker.addEventListener('error', (err: ErrorEvent) => {
                    worker.terminate();
                    reject(new Error(`Worker encoding failed: ${(err instanceof Error ? err.message : 'unknown error')}`));
                });

                // Copy for transfer; the cached frames stay usable afterwards.
                const serFrames: WorkerFrame[] = workerFrames.map((f) => ({
                    indexed: new Uint8Array(f.indexed),
                    minX: f.minX, minY: f.minY,
                    maxX: f.maxX, maxY: f.maxY,
                }));

                const request: EncodeRequest = {
                    frames: serFrames,
                    palette: globalPalette,
                    transparentIndex,
                    delay: delayCentiseconds,
                    width, height,
                    totalFrames,
                };
                worker.postMessage(request);
            });

            this.lastExportBlob = new Blob([gifData.slice()], { type: 'image/gif' });
            this.lastExportFormat = 'gif';

            const sizeStr = formatBytes(gifData.length);
            progressText.textContent = `Done! ${sizeStr} · ${outputFrames.toString()} frames · ${width.toString()}×${height.toString()}`;
            showToast(`GIF exported successfully! (${sizeStr})`, 'success');

            // Auto-download
            this.downloadBlob(this.lastExportBlob, 'gif');

            // Play notification sound
            notificationSound.play();

        } catch (err) {
            if ((err instanceof Error ? err.message : 'unknown error') === 'cancelled') {
                progressText.textContent = 'Export cancelled.';
                showToast('Export cancelled', 'info');
            } else {
                console.error('GIF export error:', err);
                showToast('Export failed: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
                progressText.textContent = 'Export failed.';
            }
        }

        cancelBtn.style.display = 'none';
        this.isExporting = false;
        this._exportCancelled = false;
        requireEl('exExportBtn', HTMLButtonElement).disabled = false;
    }

    // ─── DOWNLOAD ───
    downloadBlob(blob: Blob, ext: string): void {
        const filenameInput = requireEl('exFilename', HTMLInputElement);
        const trimmed = filenameInput.value.trim();
        let name = trimmed === '' ? 'output' : trimmed;
        // Remove any existing extension
        name = name.replace(/\.(webm|gif|mp4)$/i, '');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => { URL.revokeObjectURL(url); }, 5000);
    }

    // ─── SEEK HELPER ───
    async seekToAsync(time: number): Promise<void> {
        return new Promise((resolve) => {
            const targetTime = Math.min(Math.max(0, time), this.duration - 0.001);

            if (Math.abs(this.video.currentTime - targetTime) < 0.001) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                resolve();
            }, 2000);

            this.video.addEventListener('seeked', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });

            this.video.currentTime = targetTime;
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
//  INITIALIZE
// ═══════════════════════════════════════════════════════════════════

let instance: ModelExporter | undefined;

/** The live exporter, once the document is ready. */
export const modelExporter = (): ModelExporter | undefined => instance;

document.addEventListener('DOMContentLoaded', () => {
    instance = new ModelExporter();
    console.log('📦 Model Exporter initialized');
});
