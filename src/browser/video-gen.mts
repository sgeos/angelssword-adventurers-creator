/**
 * AS Adventurer — video generation.
 *
 * Stage 2: animate a sprite through the Gemini Interactions API.
 */
import {
    ASAdventurer,
    initGenCount,
    initModeSelector,
    initRange,
    initUploadZone,
    notificationSound,
    showToast,
    switchTab,
} from "./app.mts";
import { base64ToBlob } from "./app-utils.mts";

import { reasonText, responseErrorMessage } from "../core/api.mts";
import { closestFrom, findEl, queryAll, require2d, requireEl } from "./dom.mts";
import {
    COMFY_SETTINGS_KEY,
    WAN_SETTINGS_KEY,
    buildWanI2VWorkflow,
    computeLetterbox,
    extractHistoryImages,
    extractPromptId,
    parseComfySettings,
    parseWanSettings,
    viewQuery,
} from "../core/comfyui-core.mts";
import * as VideoGenCore from "../core/video-gen-core.mts";
import {
    VIDEO_PROVIDERS,
    asVideoProviderId,
    videoProviderFrom,
} from "../core/providers.mts";
import {
    MAX_POLL_ATTEMPTS,
    POLL_INTERVAL_MS,
    buildGrokVideoRequest,
    classifyPoll,
    describeError,
    extractRequestId,
    throttleBackoffMs,
} from "../core/grok-video-core.mts";

/** Where the chosen video provider is remembered between sessions. */
const VIDEO_PROVIDER_PREFERENCE_KEY = 'video_provider';

/** Wan renders slowly, so this polls less often and waits far longer. */
const WAN_POLL_INTERVAL_MS = 3_000;
const WAN_MAX_POLLS = 400;

// ============================================
// STATE
// ============================================
let generating = false;
let cancelled = false;

/**
 * Read the cancel flag through a call.
 *
 * The flag is set by the cancel button's handler, which control-flow
 * analysis cannot see from inside the generation loop. Reading it directly
 * narrows to the value at the last assignment in this function, and the
 * linter then reports the check as unnecessary. Going through a call keeps
 * the read honest and makes the cross-closure mutation visible.
 */
const isCancelled = (): boolean => cancelled;
/** A reference image, held as a data URI. */
interface ReferenceImage {
    readonly dataUrl: string;
}

/** A generated clip and the object URL currently pointing at it. */
interface GeneratedVideo {
    readonly blob: Blob;
    readonly url: string;
}

let referenceImages: ReferenceImage[] = [];
let generatedVideos: GeneratedVideo[] = [];
/** Indices into generatedVideos, in the order the user picked them. */
let selectedVideos = new Set<number>();

// ============================================
// REFERENCE IMAGE HANDLING
// ============================================

function loadReferenceFromHandoff(): void {
    const handoff = ASAdventurer.handoff;
    if (handoff.spriteBase64 !== null && handoff.spriteBase64 !== '') {
        referenceImages = [{ dataUrl: handoff.spriteBase64 }];

        // Show preview
        const preview = requireEl('vgRefImagePreview', HTMLElement);
        const img = requireEl('vgRefImage', HTMLImageElement);
        img.src = handoff.spriteBase64;
        preview.classList.remove('hidden');

        // Show "from sprite prep" indicator
        requireEl('vgRefFromSprite', HTMLElement).classList.remove('hidden');
        requireEl('vgUploadZone', HTMLElement).classList.add('hidden');
    }
}

function loadReferenceFiles(files: FileList): void {
    referenceImages = [];

    requireEl('vgRefFromSprite', HTMLElement).classList.add('hidden');

    const maxFiles = Math.min(files.length, 3);
    let loaded = 0;

    for (let i = 0; i < maxFiles; i++) {
        const reader = new FileReader();
        reader.onload = (): void => {
            const result = reader.result;
            // readAsDataURL always yields a string, but FileReader.result is
            // typed for every read method at once.
            if (typeof result !== 'string') return;
            referenceImages.push({ dataUrl: result });
            loaded++;

            if (loaded === maxFiles) {
                // Show first image preview
                const preview = requireEl('vgRefImagePreview', HTMLElement);
                const img = requireEl('vgRefImage', HTMLImageElement);
                const first = referenceImages[0];
                if (first !== undefined) img.src = first.dataUrl;
                preview.classList.remove('hidden');
                showToast(`${referenceImages.length.toString()} reference image(s) loaded`, 'success');
            }
        };
        const file = files[i];
        if (file !== undefined) reader.readAsDataURL(file);
    }
}

// ============================================
// VIDEO GENERATION
// ============================================

async function generateVideo(): Promise<void> {
    if (generating) return;

    const provider = videoProviderFrom(localStorage.getItem(VIDEO_PROVIDER_PREFERENCE_KEY));

    // ComfyUI runs on the user's own machine and holds no credential, so what
    // can be missing is its address rather than a key.
    let apiKey = '';
    if (provider.id === 'comfyui') {
        if (parseComfySettings(localStorage.getItem(COMFY_SETTINGS_KEY)).url === '') {
            showToast('No ComfyUI address. Go to Settings to add one.', 'error');
            return;
        }
    } else {
        const stored = localStorage.getItem(provider.storageKey);
        if (stored === null || stored === '') {
            showToast(`No ${provider.label} API key. Go to Settings to add one.`, 'error');
            return;
        }
        apiKey = stored;
    }

    if (referenceImages.length === 0) {
        showToast('Upload a reference image first, or send one from Sprite Prep', 'warning');
        return;
    }

    // Get mode early so we can validate keyframes
    const modeSelector = requireEl('vgModeSelector', HTMLElement);
    const activeMode = modeSelector.querySelector('.mode-btn.active');
    const mode = (activeMode instanceof HTMLElement ? activeMode.dataset['mode'] : undefined) ?? 'reference';

    if (mode === 'keyframe' && provider.id === 'google' && referenceImages.length < 2) {
        showToast('Keyframe mode requires both a Start Frame and End Frame', 'warning');
        return;
    }

    // Get settings
    const duration = parseInt(findEl('vgDuration', HTMLInputElement)?.value ?? '5', 10);
    const genCountEl = requireEl('vgGenCount', HTMLElement);
    const activeBtn = genCountEl.querySelector('.gen-count-btn.active');
    const rawCount = activeBtn instanceof HTMLElement ? activeBtn.dataset['count'] : undefined;
    const parsedCount = rawCount === undefined ? NaN : parseInt(rawCount, 10);
    const genCount = Number.isFinite(parsedCount) ? parsedCount : 1;

    // Read prompt from the correct field based on mode
    const promptField = mode === 'keyframe'
        ? findEl('vgKeyframePrompt', HTMLTextAreaElement) ?? findEl('vgKeyframePrompt', HTMLInputElement)
        : findEl('vgPrompt', HTMLTextAreaElement) ?? findEl('vgPrompt', HTMLInputElement);
    const prompt = promptField?.value.trim() ?? '';

    generating = true;
    cancelled = false;

    // Show progress
    requireEl('vgProgress', HTMLElement).classList.add('active');
    requireEl('vgGenerateBtn', HTMLButtonElement).disabled = true;
    const status = requireEl('vgStatus', HTMLElement);
    status.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Generating video — this may take several minutes…</div>';

    try {
        const promises = [];
        for (let i = 0; i < genCount; i++) {
            if (isCancelled()) break;
            promises.push(
                provider.id === 'xai' ? generateOneGrokVideo(apiKey, prompt, duration, mode)
                : provider.id === 'comfyui' ? generateOneWanVideo(prompt)
                : generateOneVideo(apiKey, prompt, duration, mode));
        }

        const results = await Promise.allSettled(promises);
        generatedVideos = [];

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value !== null) {
                generatedVideos.push(result.value);
            }
        }

        if (generatedVideos.length > 0) {
            displayVideoResults();
            notificationSound.play();
            status.innerHTML = `<div class="status-msg success">✅ Generated ${generatedVideos.length.toString()} video(s)!</div>`;
        } else if (!isCancelled()) {
            // Collect actual error messages from failed attempts
            const errors = results
                .filter(r => r.status === 'rejected')
                .map((r) => reasonText(r.reason));
            const errorMsg = errors.length > 0 ? errors[0] : 'Unknown error — check the server console for details.';
            status.innerHTML = `<div class="status-msg error">❌ ${errorMsg ?? 'Unknown error'}</div>`;
            console.error('[VideoGen] All attempts failed:', errors);
        }
    } catch (err) {
        status.innerHTML = `<div class="status-msg error">❌ ${(err instanceof Error ? err.message : 'unknown error')}</div>`;
    } finally {
        generating = false;
        requireEl('vgProgress', HTMLElement).classList.remove('active');
        requireEl('vgGenerateBtn', HTMLButtonElement).disabled = false;
    }
}

/**
 * Letterbox a still onto the Wan canvas.
 *
 * Wan reframes a still that does not match its aspect ratio, and reframing a
 * full-body character means losing the head or the feet. Fitting the whole
 * image onto the canvas first, with a margin, leaves nothing at the edge for
 * it to crop. The padding takes the source's top-left pixel, which on a keyed
 * sprite is the key colour, so the padding keys out with the rest.
 */
async function letterboxForWan(dataUrl: string, width: number, height: number): Promise<string> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = (): void => { resolve(el); };
        el.onerror = (): void => { reject(new Error('Could not read the reference image')); };
        el.src = dataUrl;
    });

    const box = computeLetterbox(image.naturalWidth, image.naturalHeight, width, height);

    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const probeCtx = require2d(probe);
    probeCtx.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;

    const canvas = document.createElement('canvas');
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = require2d(canvas);
    ctx.fillStyle = `rgb(${String(r ?? 0)},${String(g ?? 0)},${String(b ?? 0)})`;
    ctx.fillRect(0, 0, box.width, box.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, box.offsetX, box.offsetY, box.drawWidth, box.drawHeight);
    return canvas.toDataURL('image/png');
}

/** One call through the local ComfyUI proxy. */
async function comfyCall(path: string, method: string, body?: unknown): Promise<Response> {
    const baseUrl = parseComfySettings(localStorage.getItem(COMFY_SETTINGS_KEY)).url;
    return fetch(VIDEO_PROVIDERS.comfyui.generateRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, path, method, body }),
    });
}

/**
 * Generate one clip on the user's own ComfyUI, through Wan.
 *
 * Same four steps as the sprite path. Upload the letterboxed frame, queue the
 * graph, poll the history, retrieve the result.
 */
async function generateOneWanVideo(prompt: string): Promise<GeneratedVideo | null> {
    const reference = referenceImages[0];
    if (reference === undefined) throw new Error('ComfyUI video needs a reference image');

    const wan = parseWanSettings(localStorage.getItem(WAN_SETTINGS_KEY));
    const framed = await letterboxForWan(reference.dataUrl, wan.width, wan.height);

    const uploaded = await comfyCall('/upload/image', 'POST', {
        image: framed,
        filename: `as_adventurer_wan_${Date.now().toString()}.png`,
    });
    const uploadBody: unknown = await uploaded.json().catch(() => ({}));
    const uploadedName = typeof uploadBody === 'object' && uploadBody !== null && 'name' in uploadBody
        ? { ...uploadBody }.name
        : undefined;
    if (typeof uploadedName !== 'string' || uploadedName === '') {
        throw new Error('ComfyUI did not accept the reference image');
    }

    const built = buildWanI2VWorkflow(wan, {
        imageName: uploadedName,
        positiveText: prompt === ''
            ? 'Gentle breathing idle animation with slight body sway, seamless loop, static camera, full body in frame'
            : prompt,
        seed: Math.floor(Math.random() * 1_000_000_000),
    });

    const queued = await comfyCall('/prompt', 'POST', { prompt: built.workflow });
    const queuedBody: unknown = await queued.json().catch(() => ({}));
    if (!queued.ok) throw new Error(describeError(queuedBody, queued.status));
    const promptId = extractPromptId(queuedBody);
    if (promptId === undefined) throw new Error('ComfyUI did not return a prompt id');

    const progressText = findEl('vgProgressText', HTMLElement);
    for (let attempt = 0; attempt < WAN_MAX_POLLS; attempt++) {
        if (isCancelled()) return null;
        await wait(WAN_POLL_INTERVAL_MS);
        if (isCancelled()) return null;

        if (progressText !== undefined) {
            const seconds = Math.floor(((attempt + 1) * WAN_POLL_INTERVAL_MS) / 1000);
            progressText.textContent = `ComfyUI rendering… (${seconds.toString()}s)`;
        }

        const polled = await comfyCall(`/history/${promptId}`, 'GET');
        if (!polled.ok) continue;
        const history: unknown = await polled.json().catch(() => ({}));
        const image = extractHistoryImages(history, promptId, built.saveNodeId)[0];
        if (image === undefined) continue;

        const view = await comfyCall(`/view?${viewQuery(image)}`, 'GET');
        if (!view.ok) throw new Error('ComfyUI produced a clip that could not be retrieved');
        const blob = await view.blob();
        return { blob, url: URL.createObjectURL(blob) };
    }

    throw new Error('ComfyUI video generation timed out');
}

/** Sleep, so the poll loop yields between attempts. */
const wait = async (ms: number): Promise<void> =>
    new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Generate one clip through Grok.
 *
 * Three steps, because the service works that way. Start and receive an
 * identifier, poll until it resolves, then fetch the asset through the proxy
 * since it needs the credential attached and a media element cannot supply
 * one. classifyPoll in grok-video-core decides what each poll response means.
 */
async function generateOneGrokVideo(
    apiKey: string,
    prompt: string,
    duration: number,
    mode: string,
): Promise<GeneratedVideo | null> {
    const reference = referenceImages[0];
    if (reference === undefined) throw new Error('Grok video needs a reference image');

    const body = buildGrokVideoRequest({
        prompt: prompt === ''
            ? 'Gentle breathing idle animation with slight body sway. Perfect seamless loop. Static locked-off camera. Keep the character and solid background exactly as in the source image.'
            : prompt,
        imageDataUri: reference.dataUrl,
        durationSeconds: duration,
        mode,
    });

    const auth = `Bearer ${apiKey}`;
    const started = await fetch(VIDEO_PROVIDERS.xai.generateRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(body),
    });
    const startBody: unknown = await started.json().catch(() => ({}));
    if (!started.ok) throw new Error(describeError(startBody, started.status));

    const requestId = extractRequestId(startBody);
    if (requestId === undefined) throw new Error('Grok did not return a generation id');

    const progressFill = findEl('vgProgressFill', HTMLElement);
    const progressText = findEl('vgProgressText', HTMLElement);
    let consecutiveThrottles = 0;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (isCancelled()) return null;
        await wait(POLL_INTERVAL_MS);
        if (isCancelled()) return null;

        if (progressFill !== undefined) {
            const pct = Math.min(95, ((attempt + 1) / MAX_POLL_ATTEMPTS) * 100);
            progressFill.style.width = `${pct.toString()}%`;
        }
        if (progressText !== undefined) {
            const seconds = Math.floor(((attempt + 1) * POLL_INTERVAL_MS) / 1000);
            progressText.textContent = `Grok video generating… (${seconds.toString()}s)`;
        }

        const polled = await fetch(`/api/xai/videos/${encodeURIComponent(requestId)}`, {
            method: 'GET',
            headers: { Authorization: auth },
        });
        const polledBody: unknown = await polled.json().catch(() => ({}));
        const outcome = classifyPoll(polled.status, polledBody);

        if (outcome.kind === 'ready') return fetchGrokVideo(auth, outcome.url);
        if (outcome.kind === 'fatal' || outcome.kind === 'failed') throw new Error(outcome.reason);
        if (outcome.kind === 'throttled') {
            consecutiveThrottles++;
            if (consecutiveThrottles >= 5) throw new Error('Grok throttled the request repeatedly');
            await wait(throttleBackoffMs(consecutiveThrottles));
            continue;
        }
        consecutiveThrottles = 0;
    }

    throw new Error('Grok video generation timed out');
}

/** Retrieve the finished asset through the proxy, which holds the credential. */
async function fetchGrokVideo(auth: string, url: string): Promise<GeneratedVideo> {
    const response = await fetch('/api/xai/video-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ url }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(describeError(payload, response.status));

    const encoded = typeof payload === 'object' && payload !== null && 'data' in payload
        ? { ...payload }.data
        : undefined;
    if (typeof encoded !== 'string' || encoded === '') {
        throw new Error('Grok video download returned no data');
    }

    const blob = base64ToBlob(encoded, 'video/mp4');
    return { blob, url: URL.createObjectURL(blob) };
}

/**
 * Generate one clip.
 *
 * `duration` is accepted and deliberately not forwarded: the UI collects
 * it but the request body has never carried it. The quirk is pinned by
 * video-gen-core's tests, so it is named here rather than removed.
 */
async function generateOneVideo(apiKey: string, prompt: string, _duration: number, mode: string): Promise<GeneratedVideo | null> {
    // Build the Gemini Omni Flash Interactions API request via pure core.
    // Quirk: `duration` is collected by the UI but is NOT placed in the POST body.
    // Quirk: keyframe end image is loaded in UI but NOT sent (only first/start image).
    const requestBody = VideoGenCore.buildVideoRequestBody({
        prompt,
        mode,
        referenceImages
    });

    // Send through proxy
    const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const err: unknown = await response.json().catch(() => ({}));
        throw new Error(responseErrorMessage(err) ?? `API error: ${response.status.toString()}`);
    }

    const data: unknown = await response.json();
    console.log('[VideoGen] Response:', JSON.stringify(data).substring(0, 500));

    // Direct response — extract video from Interactions response
    return extractVideoFromResponse(data);
}

function extractVideoFromResponse(data: unknown): GeneratedVideo | null {
    // Pure extract → { mimeType, base64 } | null; Blob/URL stay here.
    const payload = VideoGenCore.extractVideoPayload(data);
    if (payload === null) {
        console.warn('[VideoGen] Could not extract video from response:', JSON.stringify(data).substring(0, 1000));
        throw new Error('No video data found in API response. Check the console for details.');
    }
    const blob = base64ToBlob(payload.base64, payload.mimeType);
    return { blob, url: URL.createObjectURL(blob) };
}

// ============================================
// RESULTS DISPLAY
// ============================================

function displayVideoResults(): void {
    const grid = requireEl('vgResultsGrid', HTMLElement);
    const section = requireEl('vgResultsSection', HTMLElement);

    // Revoke any old blob URLs from previous video elements
    grid.querySelectorAll('video').forEach(v => {
        if (v.src.startsWith('blob:')) {
            v.pause();
            v.removeAttribute('src');
            v.load(); // Release the video resource
        }
    });

    grid.innerHTML = '';
    section.classList.remove('hidden');
    selectedVideos = new Set([0]); // Auto-select first

    generatedVideos.forEach((video, idx) => {
        const card = document.createElement('div');
        card.className = 'result-card' + (idx === 0 ? ' selected' : '');
        card.dataset['idx'] = idx.toString();

        // Create video element properly (not via innerHTML) to ensure it loads
        const videoWrap = document.createElement('div');
        videoWrap.className = 'video-preview';
        const videoEl = document.createElement('video');
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.src = video.url;
        videoEl.load();
        videoWrap.appendChild(videoEl);

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        actions.innerHTML = `
            <button class="btn btn-sm btn-secondary" data-action="play" data-idx="${idx.toString()}" title="Play/pause this video">▶️ Play</button>
            <button class="btn btn-sm btn-secondary" data-action="download" data-idx="${idx.toString()}" title="Download this video">💾 Save</button>
            <button class="btn btn-sm ${selectedVideos.has(idx) ? 'btn-primary' : 'btn-secondary'}" data-action="select" data-idx="${idx.toString()}" title="Select this video for the pipeline">
                ${selectedVideos.has(idx) ? '✓ Selected' : '○ Select'}
            </button>
        `;

        card.appendChild(videoWrap);
        card.appendChild(actions);
        grid.appendChild(card);
    });
}

// Persistent event delegation for video results (only bound once)
function bindVideoResultEvents(): void {
    const grid = requireEl('vgResultsGrid', HTMLElement);

    grid.addEventListener('click', (e) => {
        const btn = closestFrom(e.target, '[data-action]', HTMLElement);
        if (btn === undefined) return;
        const rawIdx = btn.dataset['idx'];
        const idx = rawIdx === undefined ? NaN : parseInt(rawIdx, 10);
        if (!Number.isFinite(idx)) return;

        if (btn.dataset['action'] === 'play') {
            const video = grid.querySelectorAll('video')[idx];
            if (video !== undefined) {
                if (video.paused) { void video.play(); btn.textContent = '⏸ Pause'; }
                else { video.pause(); btn.textContent = '▶️ Play'; }
            }
        } else if (btn.dataset['action'] === 'download') {
            const chosen = generatedVideos[idx];
            if (chosen !== undefined) {
                const a = document.createElement('a');
                a.href = chosen.url;
                const name = ASAdventurer.characterName !== '' ? ASAdventurer.characterName : 'video';
                a.download = `${name}_gen_${(idx + 1).toString()}.mp4`;
                a.click();
            }
        } else if (btn.dataset['action'] === 'select') {
            if (selectedVideos.has(idx)) {
                selectedVideos.delete(idx);
                btn.className = 'btn btn-sm btn-secondary';
                btn.innerHTML = '○ Select';
                btn.closest('.result-card')?.classList.remove('selected');
            } else {
                selectedVideos.add(idx);
                btn.className = 'btn btn-sm btn-primary';
                btn.innerHTML = '✓ Selected';
                btn.closest('.result-card')?.classList.add('selected');
            }
        }
    });
}

// ============================================
// HANDOFF
// ============================================

function handoffToVideoPrep(): void {
    if (selectedVideos.size === 0) {
        showToast('Select at least one video first', 'warning');
        return;
    }

    // Quirk: multi-select UI, but handoff uses only the first selected index
    const video = VideoGenCore.pickHandoffVideo(generatedVideos, Array.from(selectedVideos));

    if (video !== undefined) {
        ASAdventurer.handoff.videoBlob = video.blob;
        ASAdventurer.handoff.videoUrl = video.url;
        showToast('Video sent to Video Preparation', 'success');
        switchTab('tab-video-prep');
    }
}

// ============================================
// INITIALIZATION
// ============================================

function initVideoGen(): void {
    // Mode selector (Reference / Keyframe)
    // Provider selector. Anything unrecognised is ignored rather than stored.
    initModeSelector('vgProvider', (mode) => {
        const chosen = asVideoProviderId(mode);
        if (chosen === undefined) return;
        localStorage.setItem(VIDEO_PROVIDER_PREFERENCE_KEY, chosen);
        showToast(`Generating with ${VIDEO_PROVIDERS[chosen].label}`, 'info');
    });

    // Reflect the stored preference, so the active button matches what a
    // generation would actually use.
    const storedVideoProvider = videoProviderFrom(localStorage.getItem(VIDEO_PROVIDER_PREFERENCE_KEY));
    for (const btn of queryAll(requireEl('vgProvider', HTMLElement), '.seg-btn', HTMLElement)) {
        btn.classList.toggle('active', btn.dataset['mode'] === storedVideoProvider.id);
    }

    initModeSelector('vgModeSelector', (mode) => {
        requireEl('vgReferenceMode', HTMLElement).classList.toggle('hidden', mode !== 'reference');
        requireEl('vgKeyframeMode', HTMLElement).classList.toggle('hidden', mode !== 'keyframe');
    });

    // Upload zone
    initUploadZone('vgUploadZone', 'vgFileInput', (files) => {
        loadReferenceFiles(files);
    });

    // Keyframe uploads
    initUploadZone('vgStartFrameZone', 'vgStartFrameInput', (files) => {
        const file = files[0];
        if (file !== undefined) {
            const reader = new FileReader();
            reader.onload = (): void => {
                const result = reader.result;
                if (typeof result !== 'string') return;
                // The start frame is always index 0; the placeholder push in
                // the original existed only to make the assignment below safe.
                referenceImages[0] = { dataUrl: result };

                // Show preview
                const preview = requireEl('vgStartFramePreview', HTMLImageElement);
                preview.src = result;
                preview.classList.remove('hidden');
                requireEl('vgStartFrameIcon', HTMLElement).textContent = '✅';
                requireEl('vgStartFrameText', HTMLElement).textContent = 'Start Frame Loaded';
                showToast('Start frame loaded', 'success');
            };
            reader.readAsDataURL(file);
        }
    });

    initUploadZone('vgEndFrameZone', 'vgEndFrameInput', (files) => {
        const file = files[0];
        if (file !== undefined) {
            const reader = new FileReader();
            reader.onload = (): void => {
                const result = reader.result;
                if (typeof result !== 'string') return;
                // The end frame is always index 1; the start frame must be
                // present first, which the UI enforces.
                if (referenceImages.length === 0) return;
                referenceImages[1] = { dataUrl: result };

                // Show preview
                const preview = requireEl('vgEndFramePreview', HTMLImageElement);
                preview.src = result;
                preview.classList.remove('hidden');
                requireEl('vgEndFrameIcon', HTMLElement).textContent = '✅';
                requireEl('vgEndFrameText', HTMLElement).textContent = 'End Frame Loaded';
                showToast('End frame loaded', 'success');
            };
            reader.readAsDataURL(file);
        }
    });

    // Duration slider
    initRange('vgDuration', 'vgDurationVal', 's');

    // Generation count
    initGenCount('vgGenCount');

    // Generate button
    requireEl('vgGenerateBtn', HTMLButtonElement).addEventListener('click', () => { void generateVideo(); });

    // Cancel button
    document.getElementById('vgCancelBtn')?.addEventListener('click', () => {
        cancelled = true;
        showToast('Generation cancelled', 'warning');
    });

    // Handoff button
    document.getElementById('vgHandoffBtn')?.addEventListener('click', handoffToVideoPrep);

    // Bind video result events once (persistent delegation)
    bindVideoResultEvents();

    // Check for handoff from Sprite Prep when tab becomes active
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            const target = m.target;
            if (target instanceof Element && target.classList.contains('active') && target.id === 'tab-video-gen') {
                loadReferenceFromHandoff();
            }
        }
    });

    const panel = requireEl('tab-video-gen', HTMLElement);
    {
        observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
}

// Init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoGen);
} else {
    initVideoGen();
}

