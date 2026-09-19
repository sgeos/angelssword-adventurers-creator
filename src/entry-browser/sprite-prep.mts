/**
 * AS Adventurer — sprite preparation.
 *
 * Stage 1: produce a 1280x720 sprite on a chroma-key background, either by
 * uploading one or by generating it.
 */
import {
    ASAdventurer,
    initColorSwatches,
    initGenCount,
    initModeSelector,
    initUploadZone,
    notificationSound,
    showToast,
    switchTab,
} from "../platform-browser/shell.mts";
import { base64ToBlob, blobToBase64, colorName, debounce } from "../platform-browser/app-utils.mts";
import { closestFrom, fieldValue, queryAll, require2d, requireEl } from "../platform-browser/dom.mts";
import * as Core from "../core/sprite-prep-core.mts";
import {
    COMFY_SETTINGS_KEY,
    buildWorkflowFor,
    extractHistoryImages,
    extractPromptId,
    parseComfySettings,
    viewQuery,
    type ComfySettings,
} from "../core/comfyui-core.mts";
import {
    PROVIDERS,
    asProviderId,
    buildImageRequest,
    hasCredential,
    providerFrom,
    type Provider,
} from "../core/providers.mts";

/** Where the chosen provider is remembered between sessions. */
const PROVIDER_PREFERENCE_KEY = 'sprite_provider';

/** ComfyUI offers no completion callback, so the history is polled. */
const COMFY_POLL_INTERVAL_MS = 2_000;
const COMFY_MAX_POLLS = 150;
import { channel } from "../core/pixels.mts";
import { responseErrorMessage } from "../core/api.mts";


// ============================================
// KEY COLORS (from pure core)
// ============================================
const KEY_COLORS = Core.KEY_COLORS;

// ============================================
// STATE
// ============================================
/** Read a stored integer, falling back when absent or unparsable. */
const storedInt = (key: string, fallback: number): number => {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

let spriteImage: HTMLImageElement | null = null;
let spriteFileName = '';
let selectedKeyColor = '#00FF00';
let offset = storedInt('sp-offset', 0);
let zoom = storedInt('sp-zoom', 100);

// Generative mode state
let generating = false;
let genCancelled = false;

/**
 * Read the cancel flag through a call.
 *
 * Set by the cancel button's handler, which control-flow analysis cannot
 * see from inside the generation loop. A direct read narrows to the last
 * assignment in the same function; going through a call keeps the check
 * honest and makes the cross-closure mutation visible.
 */
const isGenCancelled = (): boolean => genCancelled;
/** One generated candidate, held as a data URI. */
interface GenResult {
    readonly dataUrl: string;
}

let genResults: GenResult[] = [];
let selectedResult: GenResult | null = null;
let charRefBase64: string | null = null;
let styleRefBase64: string | null = null;
let raceMode = 'normal'; // 'normal', 'kanolith', or 'zoalith'

// ============================================
// MANUAL MODE — CANVAS SYSTEM
// ============================================

function renderCanvas(): void {
    if (spriteImage === null) return;

    const canvas = requireEl('spCanvas', HTMLCanvasElement);
    const ctx = require2d(canvas);
    const CW = 1280, CH = 720;

    // Fill with key color
    ctx.fillStyle = selectedKeyColor;
    ctx.fillRect(0, 0, CW, CH);

    const img = spriteImage;
    const sw = img.naturalWidth, sh = img.naturalHeight;

    // Find bottom-most visible row
    const tc = document.createElement('canvas');
    tc.width = sw; tc.height = sh;
    const tctx = require2d(tc, { willReadFrequently: true });
    tctx.drawImage(img, 0, 0);
    const data = tctx.getImageData(0, 0, sw, sh).data;

    const bottomRow = Core.findBottomOpaqueRow(data, sw, sh, 30);
    const { zoomX, zoomY, drawW, drawH } = Core.computeSpriteDrawRect({
        sw, sh, bottomRow, offset, zoom, CW, CH
    });
    ctx.drawImage(img, zoomX, zoomY, drawW, drawH);
}

const debouncedRender = debounce(renderCanvas, 50);

/** Auto-detect optimal key color for the loaded sprite (Fugi Maker algorithm) */
function autoDetectKeyColor(image: HTMLImageElement, swatchContainerId: string): void {


    const w = image.naturalWidth, h = image.naturalHeight;
    const tc = document.createElement('canvas');
    tc.width = w; tc.height = h;
    const tctx = require2d(tc, { willReadFrequently: true });
    tctx.drawImage(image, 0, 0);
    const data = tctx.getImageData(0, 0, w, h).data;
    const { bestIdx, minDist } = Core.pickKeyByEuclideanMinDist(data, w, h);

    // Update badges
    const container = document.getElementById(swatchContainerId);
    if (container !== null) {
        for (const swatch of queryAll(container, '.color-swatch', HTMLElement)) {
            const hex = swatch.dataset['color'] ?? '';
            const badge = swatch.querySelector('.swatch-badge');
            const idx = KEY_COLORS.findIndex((k) => k.hex === hex);
            swatch.classList.remove('selected');

            // A swatch is "avoid" when some pixel in the image sits close to
            // it, so keying on it would eat part of the artwork.
            const tooClose = idx >= 0 && (minDist[idx] ?? Infinity) < 80;

            if (badge !== null) {
                if (idx === bestIdx) {
                    badge.textContent = '⭐ Best';
                    badge.className = 'swatch-badge best';
                } else if (tooClose) {
                    badge.textContent = '⚠ Avoid';
                    badge.className = 'swatch-badge avoid';
                } else {
                    badge.textContent = colorName(hex);
                    badge.className = 'swatch-badge';
                }
            }
            if (idx === bestIdx) swatch.classList.add('selected');
        }
    }

    selectedKeyColor = KEY_COLORS[bestIdx]?.hex ?? '#00FF00';
    ASAdventurer.handoff.keyColor = selectedKeyColor;
}

/**
 * Advanced key color analysis using corner-sampling to ignore background
 * (Ported from ASArtTool sprite-generator.js _analyzeReferenceForKeyColor)
 */
function analyzeReferenceForKeyColor(dataUrl: string, swatchContainerId: string): void {
    const img = new Image();
    img.onload = (): void => {
        const canvas = document.createElement('canvas');
        const ctx = require2d(canvas);
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data, width, height } = imageData;

        // Sample 5×5 corner pixels to detect background color
        const cornerSamples: { r: number; g: number; b: number }[] = [];
        const s = 5;
        for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
                const idx = (y * width + x) * 4;
                cornerSamples.push({
                    r: channel(data, idx),
                    g: channel(data, idx + 1),
                    b: channel(data, idx + 2),
                });
            }
        }

        // Median corner colour, taken as the estimated background.
        const median = (values: number[]): number => {
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length / 2)] ?? 0;
        };
        const bgR = median(cornerSamples.map((c) => c.r));
        const bgG = median(cornerSamples.map((c) => c.g));
        const bgB = median(cornerSamples.map((c) => c.b));

        // Collect foreground pixels (skip transparent + near-background)
        const fgPixels: { r: number; g: number; b: number }[] = [];
        const step = 3;
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                const idx = (y * width + x) * 4;
                const r = channel(data, idx);
                const g = channel(data, idx + 1);
                const b = channel(data, idx + 2);
                if (channel(data, idx + 3) < 128) continue;
                const bgDist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
                if (bgDist < 40) continue;
                fgPixels.push({ r, g, b });
            }
        }

        if (fgPixels.length < 10) return;

        // Score each key color
        const scores = KEY_COLORS.map(key => {
            let minD = Infinity;
            for (const px of fgPixels) {
                const dist = Math.abs(px.r - key.r) + Math.abs(px.g - key.g) + Math.abs(px.b - key.b);
                if (dist < minD) minD = dist;
            }
            return { key, minDist: minD };
        });

        scores.sort((a, b) => b.minDist - a.minDist);

        // Update UI badges
        const container = document.getElementById(swatchContainerId);
        if (container !== null) {
            const best = scores[0];
            for (const swatch of queryAll(container, '.color-swatch', HTMLElement)) {
                const hex = swatch.dataset['color'] ?? '';
                const badge = swatch.querySelector('.swatch-badge');
                const score = scores.find((entry) => entry.key.hex === hex);
                swatch.classList.remove('selected');

                if (badge !== null) {
                    if (score !== undefined && score === best) {
                        badge.textContent = '⭐ Best';
                        badge.className = 'swatch-badge best';
                    } else if (score !== undefined && score.minDist < 80) {
                        badge.textContent = '⚠ Avoid';
                        badge.className = 'swatch-badge avoid';
                    } else {
                        badge.textContent = colorName(hex);
                        badge.className = 'swatch-badge';
                    }
                }
                if (score !== undefined && score === best) swatch.classList.add('selected');
            }
        }

        selectedKeyColor = scores[0]?.key.hex ?? selectedKeyColor;
        ASAdventurer.handoff.keyColor = selectedKeyColor;
    };
    img.src = dataUrl;
}

function loadSprite(file: File): void {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = (): void => {
        spriteImage = img;
        spriteFileName = file.name.replace(/\.\w+$/i, '');

        // Enable stages
        requireEl('spManualStage2', HTMLElement).classList.remove('disabled');
        requireEl('spManualStage3', HTMLElement).classList.remove('disabled');

        // Auto-detect best key color
        autoDetectKeyColor(img, 'spColorSwatches');

        // Restore persisted values
        const offsetSlider = requireEl('spOffset', HTMLInputElement);
        const zoomSlider = requireEl('spZoom', HTMLInputElement);
        offsetSlider.value = offset.toString();
        zoomSlider.value = zoom.toString();

        renderCanvas();
        showToast(`Sprite loaded: ${img.naturalWidth.toString()}×${img.naturalHeight.toString()}`, 'success');
    };
    img.onerror = (): void => {
        showToast('Failed to load image', 'error');
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

function downloadPNG(): void {
    const canvas = requireEl('spCanvas', HTMLCanvasElement);
    canvas.toBlob((blob) => {
        // toBlob yields null when encoding fails; there is nothing to save.
        if (blob === null) {
            showToast('Could not encode the sprite as PNG', 'error');
            return;
        }
        const name = ASAdventurer.characterName !== '' ? ASAdventurer.characterName
            : spriteFileName !== '' ? spriteFileName : 'sprite';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name}_1280x720.png`;
        a.click();
        URL.revokeObjectURL(a.href);
    }, 'image/png');
}

function handoffToVideoGen(): void {
    const canvas = requireEl('spCanvas', HTMLCanvasElement);
    canvas.toBlob((blob) => {
        if (blob === null) {
            showToast('Could not encode the sprite as PNG', 'error');
            return;
        }
        void (async (): Promise<void> => {
            ASAdventurer.handoff.spriteBlob = blob;
            ASAdventurer.handoff.spriteCanvas = canvas;
            ASAdventurer.handoff.spriteBase64 = await blobToBase64(blob);
            localStorage.setItem('as_char_name', ASAdventurer.characterName);
            showToast('Sprite sent to Generate Video', 'success');
            switchTab('tab-video-gen');
        })();
    }, 'image/png');
}

// ============================================
// GENERATIVE MODE — AI CREATE
// ============================================

function buildPrompt(): string {
    const name = (fieldValue('sgCharName') !== '' ? fieldValue('sgCharName') : 'Character');
    const desc = fieldValue('sgCharDesc');
    const action = fieldValue('sgCharAction');

    return Core.buildPrompt({
        name,
        desc,
        action,
        keyHex: selectedKeyColor,
        raceMode,
        colorNameFn: colorName
    });
}

function buildPromptWithRefs(promptText: string): string {
    return Core.buildPromptWithRefs(promptText, {
        charRef: charRefBase64 !== null,
        styleRef: styleRefBase64 !== null
    });
}

async function imageFileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => {
            const result = reader.result;
            // readAsDataURL always yields a string; FileReader.result is
            // typed for every read method at once.
            if (typeof result === 'string') resolve(result);
            else reject(new Error('FileReader did not return a data URI'));
        };
        reader.onerror = (): void => {
            reject(reader.error ?? new Error('FileReader failed'));
        };
        reader.readAsDataURL(file);
    });
}

async function generate(): Promise<void> {
    if (generating) return;

    const name = fieldValue('sgCharName');
    if (name === '') {
        showToast('Please enter a character name', 'warning');
        requireEl('sgCharName', HTMLInputElement).focus();
        return;
    }

    const provider = providerFrom(localStorage.getItem(PROVIDER_PREFERENCE_KEY));

    // ComfyUI holds no credential. It runs on the user's own machine, so the
    // thing that can be missing is its address rather than a key.
    let apiKey = '';
    if (provider.authKind === 'none') {
        const configured = parseComfySettings(localStorage.getItem(COMFY_SETTINGS_KEY));
        if (configured.url === '') {
            showToast(`No ${provider.label} address. Go to Settings to add one.`, 'error');
            return;
        }
    } else {
        const stored = localStorage.getItem(provider.storageKey);
        if (!hasCredential(stored) || stored === null) {
            showToast(`No ${provider.label} API key. Go to Settings to add one.`, 'error');
            return;
        }
        apiKey = stored;
    }

    // Get generation count
    const genCountContainer = requireEl('sgGenCount', HTMLElement);
    const activeCountBtn = genCountContainer.querySelector('.gen-count-btn.active');
    const rawCount = activeCountBtn instanceof HTMLElement ? activeCountBtn.dataset['count'] : undefined;
    const parsedCount = rawCount === undefined ? NaN : parseInt(rawCount, 10);
    const genCount = Number.isFinite(parsedCount) ? parsedCount : 1;

    generating = true;
    genCancelled = false;

    // Show progress
    requireEl('sgProgress', HTMLElement).classList.add('active');
    requireEl('sgGenerateBtn', HTMLButtonElement).disabled = true;

    const status = requireEl('sgStatus', HTMLElement);
    status.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Generating sprite — this may take up to a minute…</div>';

    try {
        let promptText = buildPrompt();
        promptText = buildPromptWithRefs(promptText);

        const images = [];
        if (charRefBase64 !== null) images.push({ label: 'character_reference', data: charRefBase64 });
        if (styleRefBase64 !== null) images.push({ label: 'style_reference', data: styleRefBase64 });

        // Launch parallel generations
        const promises = [];
        for (let i = 0; i < genCount; i++) {
            if (isGenCancelled()) break;
            promises.push(generateOne(apiKey, promptText, images, provider));
        }

        const results = await Promise.allSettled(promises);
        genResults = [];

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value !== null) {
                genResults.push({ dataUrl: result.value });
            }
        }

        if (genResults.length > 0) {
            displayResults();
            notificationSound.play();
            status.innerHTML = `<div class="status-msg success">✅ Generated ${genResults.length.toString()} sprite(s)!</div>`;
        } else if (!isGenCancelled()) {
            status.innerHTML = '<div class="status-msg error">❌ All generations failed. Check your API key and try again.</div>';
        }
    } catch (err) {
        status.innerHTML = `<div class="status-msg error">❌ ${(err instanceof Error ? err.message : 'unknown error')}</div>`;
    } finally {
        generating = false;
        requireEl('sgProgress', HTMLElement).classList.remove('active');
        requireEl('sgGenerateBtn', HTMLButtonElement).disabled = false;
    }
}

/** One call through the local ComfyUI proxy. */
async function comfyCall(
    settings: ComfySettings,
    path: string,
    method: string,
    body?: unknown,
): Promise<Response> {
    return fetch(PROVIDERS.comfyui.imageRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: settings.url, path, method, body }),
    });
}

/**
 * Generate one sprite on the user's own ComfyUI.
 *
 * Four steps. Upload the reference if there is one, queue the graph, poll the
 * history until the save node reports an image, then retrieve it. ComfyUI
 * offers no completion callback, so polling is the only option.
 */
async function generateOneComfy(
    prompt: string,
    images: readonly unknown[],
): Promise<string | null> {
    const settings = parseComfySettings(localStorage.getItem(COMFY_SETTINGS_KEY));

    // A reference image must reach ComfyUI before the graph can name it.
    let referenceFilename: string | undefined;
    const first = images[0];
    if (typeof first === 'string' && first !== '') {
        const uploaded = await comfyCall(settings, '/upload/image', 'POST', {
            image: first,
            filename: `as_adventurer_ref_${Date.now().toString()}.png`,
        });
        const uploadBody: unknown = await uploaded.json().catch(() => ({}));
        if (uploaded.ok) {
            const name = typeof uploadBody === 'object' && uploadBody !== null && 'name' in uploadBody
                ? { ...uploadBody }.name
                : undefined;
            if (typeof name === 'string' && name !== '') referenceFilename = name;
        }
    }

    const seed = Math.floor(Math.random() * 1_000_000_000);
    const built = buildWorkflowFor(settings, {
        positiveText: prompt,
        seed,
        ...(referenceFilename === undefined ? {} : { referenceFilename }),
    });

    const queued = await comfyCall(settings, '/prompt', 'POST', { prompt: built.workflow });
    const queuedBody: unknown = await queued.json().catch(() => ({}));
    if (!queued.ok) {
        throw new Error(responseErrorMessage(queuedBody) ?? `ComfyUI refused the job (${queued.status.toString()})`);
    }
    const promptId = extractPromptId(queuedBody);
    if (promptId === undefined) throw new Error('ComfyUI did not return a prompt id');

    for (let attempt = 0; attempt < COMFY_MAX_POLLS; attempt++) {
        if (isGenCancelled()) return null;
        await new Promise<void>((resolve) => { setTimeout(resolve, COMFY_POLL_INTERVAL_MS); });
        if (isGenCancelled()) return null;

        const polled = await comfyCall(settings, `/history/${promptId}`, 'GET');
        if (!polled.ok) continue;
        const history: unknown = await polled.json().catch(() => ({}));
        const found = extractHistoryImages(history, promptId, built.saveNodeId);
        const image = found[0];
        if (image === undefined) continue;

        const view = await comfyCall(settings, `/view?${viewQuery(image)}`, 'GET');
        if (!view.ok) throw new Error('ComfyUI produced an image that could not be retrieved');
        const bytes = await view.arrayBuffer();
        let binary = '';
        for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
        return `data:image/png;base64,${btoa(binary)}`;
    }

    throw new Error('ComfyUI generation timed out');
}

async function generateOne(
    apiKey: string,
    prompt: string,
    images: readonly unknown[],
    provider: Provider = PROVIDERS.openai,
): Promise<string | null> {
    if (provider.id === 'comfyui') return generateOneComfy(prompt, images);

    // OpenAI keeps its own request shape, which carries a reference image
    // through /api/edits. Grok has no equivalent, so a reference image is
    // ignored there and the prompt carries the description alone.
    const { endpoint, body } = provider.id === 'openai'
        ? Core.buildGenerateRequest({ prompt, images })
        : {
            endpoint: provider.imageRoute,
            body: buildImageRequest(provider, { prompt, count: 1 }),
        };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err: unknown = await response.json().catch(() => ({}));
        throw new Error(responseErrorMessage(err) ?? `API error: ${response.status.toString()}`);
    }

    const data: unknown = await response.json();
    // The proxy returns { data: [{ b64_json }] }; narrow rather than chain
    // optional access through `any`.
    const entries: unknown =
        typeof data === 'object' && data !== null && 'data' in data ? data.data : undefined;
    const first: unknown = Array.isArray(entries) ? entries[0] : undefined;
    const b64: unknown =
        typeof first === 'object' && first !== null && 'b64_json' in first
            ? first.b64_json
            : undefined;
    if (typeof b64 !== 'string' || b64 === '') throw new Error('No image in API response');

    return `data:image/png;base64,${b64}`;
}

function displayResults(): void {
    const grid = requireEl('sgResultsGrid', HTMLElement);
    const section = requireEl('sgResultsSection', HTMLElement);
    grid.innerHTML = '';
    section.classList.remove('hidden');

    genResults.forEach((result, idx) => {
        const card = document.createElement('div');
        card.className = idx === 0 ? 'result-card selected' : 'result-card';
        const n = (idx + 1).toString();
        card.innerHTML = `
            <img src="${result.dataUrl}" alt="Generated sprite ${n}">
            <div class="card-actions">
                <button class="btn btn-sm btn-secondary" data-action="download" data-idx="${idx.toString()}" title="Download this sprite">💾 Save</button>
                <button class="btn btn-sm btn-primary" data-action="select" data-idx="${idx.toString()}" title="Select this sprite for the pipeline">✓ Select</button>
            </div>
        `;
        grid.appendChild(card);
    });

    const firstResult = genResults[0];
    if (firstResult !== undefined) {
        selectedResult = firstResult;
        updateGenPreview(firstResult.dataUrl);
    }

    // Card action handlers
    grid.addEventListener('click', (e) => {
        const btn = closestFrom(e.target, '[data-action]', HTMLElement);
        if (btn === undefined) return;
        const rawIdx = btn.dataset['idx'];
        const idx = rawIdx === undefined ? NaN : parseInt(rawIdx, 10);
        const chosen = Number.isFinite(idx) ? genResults[idx] : undefined;
        if (chosen === undefined) return;

        if (btn.dataset['action'] === 'download') {
            const a = document.createElement('a');
            a.href = chosen.dataUrl;
            const who = ASAdventurer.characterName !== '' ? ASAdventurer.characterName : 'sprite';
            a.download = `${who}_gen_${(idx + 1).toString()}.png`;
            a.click();
        } else if (btn.dataset['action'] === 'select') {
            for (const c of queryAll(grid, '.result-card', HTMLElement)) {
                c.classList.remove('selected');
            }
            btn.closest('.result-card')?.classList.add('selected');
            selectedResult = chosen;
            updateGenPreview(chosen.dataUrl);
        }
    });
}

function updateGenPreview(dataUrl: string): void {
    const canvas = requireEl('sgCanvas', HTMLCanvasElement);
    const ctx = require2d(canvas);
    const img = new Image();
    img.onload = (): void => {
        ctx.clearRect(0, 0, 1280, 720);
        // Scale to fit 1280x720 while maintaining aspect
        const scale = Math.min(1280 / img.width, 720 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (1280 - w) / 2, (720 - h) / 2, w, h);
    };
    img.src = dataUrl;
}

function genHandoffToVideoGen(): void {
    const chosen = selectedResult;
    if (chosen === null) {
        showToast('Select a sprite first', 'warning');
        return;
    }

    ASAdventurer.handoff.spriteBlob = base64ToBlob(chosen.dataUrl);
    ASAdventurer.handoff.spriteBase64 = chosen.dataUrl;
    localStorage.setItem('as_char_name', ASAdventurer.characterName);
    showToast('Sprite sent to Generate Video', 'success');
    switchTab('tab-video-gen');
}

function genHandoffToManual(): void {
    const chosen = selectedResult;
    if (chosen === null) {
        showToast('Select a sprite first', 'warning');
        return;
    }

    // Load the selected AI result as an Image into the manual mode
    const img = new Image();
    img.onload = (): void => {
        spriteImage = img;
        spriteFileName = `${ASAdventurer.characterName !== '' ? ASAdventurer.characterName : 'sprite'}_gen`;

        // Enable manual mode stages
        requireEl('spManualStage2', HTMLElement).classList.remove('disabled');
        requireEl('spManualStage3', HTMLElement).classList.remove('disabled');

        // Auto-detect key color for the generated image
        autoDetectKeyColor(img, 'spColorSwatches');

        // Reset offset/zoom to defaults for fresh positioning
        offset = 0;
        zoom = 100;
        const offsetSlider = requireEl('spOffset', HTMLInputElement);
        const zoomSlider = requireEl('spZoom', HTMLInputElement);
        offsetSlider.value = '0';
        requireEl('spOffsetVal', HTMLElement).textContent = '0px';
        zoomSlider.value = '100';
        requireEl('spZoomVal', HTMLElement).textContent = '100%';

        renderCanvas();

        // Switch to Manual Upload mode
        const modeSelector = requireEl('spritePrepMode', HTMLElement);
        for (const b of queryAll(modeSelector, '.mode-btn', HTMLElement)) {
            b.classList.remove('active');
        }
        modeSelector.querySelector('[data-mode="manual"]')?.classList.add('active');
        requireEl('spriteManualMode', HTMLElement).classList.remove('hidden');
        requireEl('spriteGenerateMode', HTMLElement).classList.add('hidden');

        showToast('Sprite loaded into Manual Upload — adjust offset & zoom', 'success');
    };
    img.src = chosen.dataUrl;
}

// ============================================
// INITIALIZATION
// ============================================
function initSpritePrep(): void {
    // --- Mode Switching ---
    const modeSelector = requireEl('spritePrepMode', HTMLElement);
    const manualMode = requireEl('spriteManualMode', HTMLElement);
    const generateMode = requireEl('spriteGenerateMode', HTMLElement);

    modeSelector.addEventListener('click', (e) => {
        const btn = closestFrom(e.target, '.mode-btn', HTMLElement);
        if (btn === undefined) return;
        for (const b of queryAll(modeSelector, '.mode-btn', HTMLElement)) {
            b.classList.remove('active');
        }
        btn.classList.add('active');

        if (btn.dataset['mode'] === 'manual') {
            manualMode.classList.remove('hidden');
            generateMode.classList.add('hidden');
        } else {
            manualMode.classList.add('hidden');
            generateMode.classList.remove('hidden');
        }
    });

    // --- Manual Mode ---
    // Upload zone
    initUploadZone('spUploadZone', 'spFileInput', (files) => {
        const file = files[0];
        if (file !== undefined) loadSprite(file);
    }, () => {
        // Clear sprite
        spriteImage = null;
        spriteFileName = '';
        const canvas = requireEl('spCanvas', HTMLCanvasElement);
        const ctx = require2d(canvas);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requireEl('spDownloadBtn', HTMLButtonElement).disabled = true;
        requireEl('spHandoffBtn', HTMLButtonElement).disabled = true;
        showToast('Sprite cleared', 'info');
    });

    // Color swatches
    initColorSwatches('spColorSwatches', (color) => {
        selectedKeyColor = color;
        ASAdventurer.handoff.keyColor = color;
        renderCanvas();
    });

    // Offset slider
    const offsetSlider = requireEl('spOffset', HTMLInputElement);
    const offsetVal = requireEl('spOffsetVal', HTMLElement);
    offsetSlider.value = offset.toString();
    offsetVal.textContent = `${offset.toString()}px`;
    offsetSlider.addEventListener('input', () => {
        offset = parseInt(offsetSlider.value, 10);
        offsetVal.textContent = `${offset.toString()}px`;
        localStorage.setItem('sp-offset', offset.toString());
        debouncedRender();
    });

    // Zoom slider
    const zoomSlider = requireEl('spZoom', HTMLInputElement);
    const zoomVal = requireEl('spZoomVal', HTMLElement);
    zoomSlider.value = zoom.toString();
    zoomVal.textContent = `${zoom.toString()}%`;
    zoomSlider.addEventListener('input', () => {
        zoom = parseInt(zoomSlider.value, 10);
        zoomVal.textContent = `${zoom.toString()}%`;
        localStorage.setItem('sp-zoom', zoom.toString());
        debouncedRender();
    });

    // Download & Handoff buttons
    document.getElementById('spDownloadBtn')?.addEventListener('click', downloadPNG);
    document.getElementById('spHandoffBtn')?.addEventListener('click', handoffToVideoGen);

    // --- Generative Mode ---
    // Color swatches (generative)
    initColorSwatches('sgColorSwatches', (color) => {
        selectedKeyColor = color;
        ASAdventurer.handoff.keyColor = color;
    });

    // Generation count
    initGenCount('sgGenCount');

    // Style reference upload
    initUploadZone('sgStyleRefZone', 'sgStyleRefInput', (files) => {
        const file = files[0];
        if (file === undefined) return;
        void (async (): Promise<void> => {
            styleRefBase64 = await imageFileToBase64(file);
            const preview = requireEl('sgStyleRefPreview', HTMLElement);
            preview.innerHTML = `<img src="${styleRefBase64}" style="max-width:100%;border-radius:var(--radius);border:1px solid var(--border)">`;
            preview.classList.remove('hidden');
            showToast('Style reference loaded', 'info');
        })();
    }, () => {
        styleRefBase64 = null;
        const preview = requireEl('sgStyleRefPreview', HTMLElement);
        preview.innerHTML = '';
        preview.classList.add('hidden');
        showToast('Style reference cleared', 'info');
    });

    // Character reference upload
    initUploadZone('sgCharRefZone', 'sgCharRefInput', (files) => {
        const file = files[0];
        if (file === undefined) return;
        void (async (): Promise<void> => {
            charRefBase64 = await imageFileToBase64(file);
            const preview = requireEl('sgCharRefPreview', HTMLElement);
            preview.innerHTML = `<img src="${charRefBase64}" style="max-width:100%;border-radius:var(--radius);border:1px solid var(--border)">`;
            preview.classList.remove('hidden');
            // Auto-detect key color from character reference
            analyzeReferenceForKeyColor(charRefBase64, 'sgColorSwatches');
            showToast('Character reference loaded — key color auto-detected', 'info');
        })();
    }, () => {
        charRefBase64 = null;
        const preview = requireEl('sgCharRefPreview', HTMLElement);
        preview.innerHTML = '';
        preview.classList.add('hidden');
        showToast('Character reference cleared', 'info');
    });

    // Race mode selector
    // Provider selector. initModeSelector reports the data-mode of the button
    // clicked; anything unrecognised is ignored rather than stored.
    initModeSelector('sgProvider', (mode) => {
        const chosen = asProviderId(mode);
        if (chosen === undefined) return;
        localStorage.setItem(PROVIDER_PREFERENCE_KEY, chosen);
        showToast(`Generating with ${PROVIDERS[chosen].label}`, 'info');
    });

    // Reflect the stored preference, so the active button matches what a
    // generation would actually use.
    const storedProvider = providerFrom(localStorage.getItem(PROVIDER_PREFERENCE_KEY));
    for (const btn of queryAll(requireEl('sgProvider', HTMLElement), '.seg-btn', HTMLElement)) {
        btn.classList.toggle('active', btn.dataset['mode'] === storedProvider.id);
    }

    initModeSelector('sgRaceMode', (mode) => {
        raceMode = mode;
    });

    // Generate button
    requireEl('sgGenerateBtn', HTMLButtonElement).addEventListener('click', () => { void generate(); });

    // Cancel button
    document.getElementById('sgCancelBtn')?.addEventListener('click', () => {
        genCancelled = true;
        showToast('Generation cancelled', 'warning');
    });

    // Handoff from generative mode
    document.getElementById('sgHandoffBtn')?.addEventListener('click', genHandoffToVideoGen);
    document.getElementById('sgToManualBtn')?.addEventListener('click', genHandoffToManual);

    // Advanced Key Color button
    document.getElementById('sgAdvancedKeyBtn')?.addEventListener('click', openAdvancedKeyModal);
    document.getElementById('advKeyClose')?.addEventListener('click', closeAdvancedKeyModal);
    document.getElementById('advKeyClearBtn')?.addEventListener('click', clearAdvKeySelection);
    document.getElementById('advKeyAnalyzeBtn')?.addEventListener('click', runAdvKeyAnalysis);

    // Close modal on overlay click
    document.getElementById('advKeyModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeAdvancedKeyModal();
    });

    // Rectangle selection on canvas
    initAdvKeyRectSelection();
}

// ============================================
// ADVANCED KEY COLOR ANALYSIS
// ============================================
/** Selection rectangle in canvas coordinates. */
interface KeyRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

let advKeyRect: KeyRect | null = null;
let advKeyImg: HTMLImageElement | null = null;
let advKeyDrawing = false;
let advKeyStartX = 0, advKeyStartY = 0;

function openAdvancedKeyModal(): void {
    if (charRefBase64 === null) {
        showToast('Upload a Character Reference first', 'warning');
        return;
    }

    const modal = requireEl('advKeyModal', HTMLElement);
    const canvas = requireEl('advKeyCanvas', HTMLCanvasElement);
    const ctx = require2d(canvas);

    modal.classList.remove('hidden');
    requireEl('advKeyResults', HTMLElement).classList.add('hidden');
    clearAdvKeySelection();

    // Load the reference image onto canvas
    const img = new Image();
    img.onload = (): void => {
        advKeyImg = img;
        // Fit image into canvas keeping aspect ratio
        const maxW = 760, maxH = 500;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = charRefBase64;
}

function closeAdvancedKeyModal(): void {
    requireEl('advKeyModal', HTMLElement).classList.add('hidden');
}

function clearAdvKeySelection(): void {
    advKeyRect = null;
    const sel = requireEl('advKeySelection', HTMLElement);
    sel.style.display = 'none';
    requireEl('advKeyAnalyzeBtn', HTMLButtonElement).disabled = true;
    requireEl('advKeyResults', HTMLElement).classList.add('hidden');
}

function initAdvKeyRectSelection(): void {
    const wrap = requireEl('advKeyCanvasWrap', HTMLElement);
    const canvas = requireEl('advKeyCanvas', HTMLCanvasElement);
    const sel = requireEl('advKeySelection', HTMLElement);
    wrap.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        advKeyStartX = e.clientX - rect.left;
        advKeyStartY = e.clientY - rect.top;
        advKeyDrawing = true;
        sel.style.display = 'block';
        sel.style.left = `${advKeyStartX.toString()}px`;
        sel.style.top = `${advKeyStartY.toString()}px`;
        sel.style.width = '0px';
        sel.style.height = '0px';
    });

    wrap.addEventListener('mousemove', (e) => {
        if (!advKeyDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        const x = Math.min(advKeyStartX, curX);
        const y = Math.min(advKeyStartY, curY);
        const w = Math.abs(curX - advKeyStartX);
        const h = Math.abs(curY - advKeyStartY);

        sel.style.left = `${x.toString()}px`;
        sel.style.top = `${y.toString()}px`;
        sel.style.width = `${w.toString()}px`;
        sel.style.height = `${h.toString()}px`;
    });

    const finishDraw = (e: MouseEvent): void => {
        if (!advKeyDrawing) return;
        advKeyDrawing = false;

        const rect = canvas.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        const x = Math.max(0, Math.min(advKeyStartX, curX));
        const y = Math.max(0, Math.min(advKeyStartY, curY));
        const w = Math.min(Math.abs(curX - advKeyStartX), canvas.width - x);
        const h = Math.min(Math.abs(curY - advKeyStartY), canvas.height - y);

        if (w > 10 && h > 10) {
            advKeyRect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
            requireEl('advKeyAnalyzeBtn', HTMLButtonElement).disabled = false;
        } else {
            clearAdvKeySelection();
        }
    };

    wrap.addEventListener('mouseup', finishDraw);
    wrap.addEventListener('mouseleave', (e) => {
        if (advKeyDrawing) finishDraw(e);
    });
}

function runAdvKeyAnalysis(): void {
    if (advKeyRect === null || advKeyImg === null) return;

    const canvas = requireEl('advKeyCanvas', HTMLCanvasElement);
    const ctx = require2d(canvas);
    const { x, y, w, h } = advKeyRect;

    // Extract pixel data from the selection region
    const imageData = ctx.getImageData(x, y, w, h);
    const pixels = imageData.data;

    // Build a histogram of unique colors (quantized to 6-bit per channel for speed)
    const colorMap = new Map<number, number>();
    let totalPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = channel(pixels, i);
        const g = channel(pixels, i + 1);
        const b = channel(pixels, i + 2);
        if (channel(pixels, i + 3) < 128) continue; // skip transparent pixels

        // Quantize to reduce noise
        const qr = r >> 2, qg = g >> 2, qb = b >> 2;
        const key = (qr << 12) | (qg << 6) | qb;
        colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
        totalPixels++;
    }

    if (totalPixels < 100) {
        showToast('Selection too small or mostly transparent', 'warning');
        return;
    }

    // For each key color, calculate its minimum distance to any character pixel
    // Use CIE76 deltaE in Lab space for perceptual accuracy
    const results = KEY_COLORS.map(keyCol => {
        const keyLab = Core.rgbToLab(keyCol.r, keyCol.g, keyCol.b);

        let minDist = Infinity;
        let avgDist = 0;
        let dangerPixels = 0;
        const threshold = 30; // Pixels closer than this are "dangerous"

        for (const [quantKey, count] of colorMap) {
            const qr = ((quantKey >> 12) & 0x3F) << 2;
            const qg = ((quantKey >> 6) & 0x3F) << 2;
            const qb = (quantKey & 0x3F) << 2;
            const pixLab = Core.rgbToLab(qr, qg, qb);

            const dist = Math.sqrt(
                (keyLab.L - pixLab.L) ** 2 +
                (keyLab.a - pixLab.a) ** 2 +
                (keyLab.b - pixLab.b) ** 2
            );

            if (dist < minDist) minDist = dist;
            avgDist += dist * count;
            if (dist < threshold) dangerPixels += count;
        }

        avgDist /= totalPixels;
        const dangerPercent = (dangerPixels / totalPixels) * 100;

        // Score = weighted combination: mostly minimum distance, some average
        const score = minDist * 0.6 + avgDist * 0.4;

        return {
            ...keyCol,
            minDist: Math.round(minDist * 10) / 10,
            avgDist: Math.round(avgDist * 10) / 10,
            dangerPercent: Math.round(dangerPercent * 10) / 10,
            score: Math.round(score * 10) / 10
        };
    });

    // Sort by score descending (higher = better separation)
    results.sort((a, b) => b.score - a.score);

    // Display results
    displayAdvKeyResults(results);
}

/** A key colour scored against the sampled region. */
interface KeyScore extends Core.KeyColor {
    readonly minDist: number;
    readonly avgDist: number;
    readonly dangerPercent: number;
    readonly score: number;
}

function displayAdvKeyResults(results: readonly KeyScore[]): void {
    const container = requireEl('advKeyResultsList', HTMLElement);
    const wrapper = requireEl('advKeyResults', HTMLElement);
    wrapper.classList.remove('hidden');

    const maxScore = results[0]?.score ?? 1;

    container.innerHTML = results.map((r: KeyScore, i: number) => {
        const pct = (r.score / maxScore * 100).toFixed(0);
        const barColor = i === 0 ? 'var(--accent-gold)' :
                         i === 1 ? 'var(--accent-teal)' : 'rgba(255,255,255,0.2)';
        const dangerLabel = r.dangerPercent > 5 ? `⚠️ ${r.dangerPercent.toString()}% conflict` :
                            r.dangerPercent > 0 ? `${r.dangerPercent.toString()}% near` : '✅ Clean';

        return `
            <div class="adv-key-result ${i === 0 ? 'best' : ''}" data-color="${r.hex}">
                <div class="adv-key-swatch" style="background:${r.hex}"></div>
                <div class="adv-key-name">${r.name}</div>
                <div class="adv-key-bar-wrap">
                    <div class="adv-key-bar" style="width:${pct}%;background:${barColor}"></div>
                </div>
                <div class="adv-key-score">${r.score.toString()}</div>
                <div class="adv-key-score" style="min-width:100px;font-size:0.7rem">${dangerLabel}</div>
                ${i === 0 ? '<span class="adv-key-badge">BEST</span>' : ''}
            </div>
        `;
    }).join('');

    // Click to select
    for (const el of queryAll(container, '.adv-key-result', HTMLElement)) {
        el.addEventListener('click', () => {
            const color = el.dataset['color'];
            if (color === undefined) return;
            selectedKeyColor = color;
            ASAdventurer.handoff.keyColor = color;

            // Update the swatches UI
            for (const swatch of queryAll(document, '#sgColorSwatches .color-swatch', HTMLElement)) {
                swatch.classList.toggle('selected', swatch.dataset['color'] === color);
            }

            showToast(`Key color set to ${color}`, 'success');
            closeAdvancedKeyModal();
        });
    }
}


// Init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSpritePrep);
} else {
    initSpritePrep();
}

