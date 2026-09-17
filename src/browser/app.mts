/**
 * AS Adventurer — main app controller.
 *
 * Tab switching, settings, toasts, notification sounds, keyboard
 * shortcuts, and the shared handoff state passed between stages.
 */
import type { HandoffPayload } from "./video-prep-core.mts";
import { closestFrom, findEl, queryAll, requireEl } from "./dom.mts";

/**
 * The `error.message` an API returned, if it sent one.
 *
 * The response body is untyped, so each step narrows rather than chaining
 * optional access through `any` — which type-checks but tells you nothing
 * about what actually arrived.
 */
const apiErrorMessage = (body: unknown): string | undefined => {
    if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
    const error: unknown = body.error;
    if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
    const message: unknown = error.message;
    return typeof message === "string" && message !== "" ? message : undefined;
};

// ============================================
// GLOBAL STATE
// ============================================
/**
 * Data passed from one pipeline stage to the next.
 *
 * Typed explicitly rather than inferred: every field starts null, so
 * inference would type them as null and reject the assignments the stages
 * actually make.
 */
export interface Handoff {
    /** Canvas from Sprite Prep. */
    spriteCanvas: HTMLCanvasElement | null;
    /** Sprite as a Blob. */
    spriteBlob: Blob | null;
    /** Sprite as a data URI. */
    spriteBase64: string | null;
    /** Clip from Generate Video. */
    videoBlob: Blob | null;
    /** Object URL for the clip above. */
    videoUrl: string | null;
    /** Payload from Video Prep; its shape is owned by that stage. */
    videoPrepData: HandoffPayload | null;
    /** Key colour, which flows the length of the pipeline. */
    keyColor: string;
}

export interface AppState {
    characterName: string;
    readonly handoff: Handoff;
}

export const ASAdventurer: AppState = {
    characterName: '',
    handoff: {
        spriteCanvas: null,
        spriteBlob: null,
        spriteBase64: null,
        videoBlob: null,
        videoUrl: null,
        videoPrepData: null,
        keyColor: '#00FF00',
    },
};

// ============================================
// NOTIFICATION SOUND SYSTEM
// ============================================
class NotificationSound {
    private audioContext: AudioContext | null = null;
    private readonly buffers: Record<string, AudioBuffer> = {};
    enabled: boolean = localStorage.getItem('as_sound_enabled') !== 'false';
    private readonly clips: readonly string[] = ['quest_complete_2.mp3', 'quest_complete_10.mp3'];

    constructor() {
        this._initOnGesture();
    }

    private _initOnGesture(): void {
        const handler = (): void => {
            if (this.audioContext === null) {
                // BEHAVIOUR CHANGE, stated rather than hidden: the original
                // fell back to window.webkitAudioContext. That value is
                // untyped, so constructing it requires an unchecked
                // assertion, which this codebase bans. Safari has supported
                // the unprefixed name since 14.1 (2021), so the fallback is
                // dropped instead of asserted around.
                if (typeof window.AudioContext !== 'function') {
                    throw new Error('Web Audio is unavailable in this browser');
                }
                this.audioContext = new window.AudioContext();
                void this._preload();
            } else if (this.audioContext.state === 'suspended') {
                void this.audioContext.resume();
            }
            document.removeEventListener('click', handler);
            document.removeEventListener('keydown', handler);
        };
        document.addEventListener('click', handler);
        document.addEventListener('keydown', handler);
    }

    private async _preload(): Promise<void> {
        const ctx = this.audioContext;
        if (ctx === null) return;
        for (const clip of this.clips) {
            try {
                const resp = await fetch(`assets/sounds/${clip}`);
                const buf = await resp.arrayBuffer();
                this.buffers[clip] = await ctx.decodeAudioData(buf);
            } catch (e) {
                console.warn(`[Sound] Failed to preload ${clip}:`, e instanceof Error ? e.message : e);
            }
        }
        console.log(`[Sound] Preloaded ${Object.keys(this.buffers).length.toString()} clips`);
    }

    play(): void {
        const ctx = this.audioContext;
        if (!this.enabled || ctx === null) return;

        // Pick random clip
        const clip = this.clips[Math.floor(Math.random() * this.clips.length)];
        const buffer = clip === undefined ? undefined : this.buffers[clip];
        if (buffer === undefined) return;

        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = 0.7;
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);

        // System notification if tab is hidden
        if (document.hidden && Notification.permission === 'granted') {
            new Notification('⚔️ Quest Complete!', {
                body: 'Your generation has finished!',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚔️</text></svg>'
            });
        }
    }

    setEnabled(val: boolean): void {
        this.enabled = val;
        localStorage.setItem('as_sound_enabled', String(val));
    }
}

export const notificationSound = new NotificationSound();

/**
 * Show one pipeline stage and hide the others.
 *
 * Hoisted out of initTabs, which it was nested in. It closes over nothing,
 * so module scope is where it belonged; nesting it only made it
 * unreachable from other modules without a global.
 */
export function switchTab(tabId: string): void {
    for (const btn of queryAll(document, '.tab-btn', HTMLElement)) {
        btn.classList.toggle('active', btn.dataset['tab'] === tabId);
    }
    for (const panel of queryAll(document, '.tab-panel', HTMLElement)) {
        panel.classList.toggle('active', panel.id === tabId);
    }
    for (const step of queryAll(document, '.pipeline-steps .step', HTMLElement)) {
        step.classList.toggle('active', step.dataset['tab'] === tabId);
    }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
export function showToast(message: string, type = 'info'): void {
    const container = findEl('toastContainer', HTMLElement);
    if (container === undefined) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('exit');
        setTimeout(() => { toast.remove(); }, 400);
    }, 3500);
}



// ============================================
// UTILITY FUNCTIONS
// ============================================
// Shared utils (debounce, base64ToBlob, blobToBase64, hexToRgb, colorName)
// live in public/lib/app-utils.js and are attached to window before this script.

// ============================================
// TAB SWITCHING
// ============================================
function initTabs(): void {
    const tabBar = findEl('tabBar', HTMLElement);
    const pipelineSteps = findEl('pipelineSteps', HTMLElement);

    // Tab bar clicks
    tabBar?.addEventListener('click', (e) => {
        const tab = closestFrom(e.target, '.tab-btn', HTMLElement)?.dataset['tab'];
        if (tab !== undefined) switchTab(tab);
    });

    // Pipeline step clicks
    pipelineSteps?.addEventListener('click', (e) => {
        const tab = closestFrom(e.target, '.step', HTMLElement)?.dataset['tab'];
        if (tab !== undefined) switchTab(tab);
    });

    
}

// ============================================
// SETTINGS
// ============================================
function initSettings(): void {
    // --- OpenAI Key ---
    const openaiInput = requireEl('settingsOpenAIKey', HTMLInputElement);
    const openaiToggle = requireEl('settingsOpenAIToggle', HTMLElement);
    const openaiSave = requireEl('settingsOpenAISave', HTMLElement);
    const openaiTest = requireEl('settingsOpenAITest', HTMLElement);
    const openaiStatus = requireEl('settingsOpenAIStatus', HTMLElement);

    // Load saved key
    const savedOpenAI = localStorage.getItem('openai_api_key');
    if (savedOpenAI !== null && savedOpenAI !== '') openaiInput.value = savedOpenAI;

    // Show/hide toggle
    openaiToggle.addEventListener('click', () => {
        const isPassword = openaiInput.type === 'password';
        openaiInput.type = isPassword ? 'text' : 'password';
        openaiToggle.textContent = isPassword ? '🙈' : '👁️';
    });

    // Save
    openaiSave.addEventListener('click', () => {
        const key = openaiInput.value.trim();
        if (key !== '') {
            localStorage.setItem('openai_api_key', key);
            showToast('OpenAI API key saved', 'success');
        } else {
            localStorage.removeItem('openai_api_key');
            showToast('OpenAI API key removed', 'warning');
        }
    });

    // Test connection
    openaiTest.addEventListener('click', () => { void testOpenAiKey(); });
    async function testOpenAiKey(): Promise<void> {
        const key = openaiInput.value.trim();
        if (key === '') {
            openaiStatus.innerHTML = '<div class="status-msg error">Enter an API key first</div>';
            return;
        }

        openaiStatus.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Testing connection...</div>';

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: 'Say "connected" in one word.' }],
                    max_tokens: 5
                })
            });

            if (resp.ok) {
                openaiStatus.innerHTML = '<div class="status-msg success">✅ Connection successful!</div>';
                // Auto-save on successful test
                localStorage.setItem('openai_api_key', key);
            } else {
                const data: unknown = await resp.json().catch(() => ({}));
                const msg = apiErrorMessage(data) ?? `HTTP ${resp.status.toString()}`;
                openaiStatus.innerHTML = `<div class="status-msg error">❌ ${msg}</div>`;
            }
        } catch (err) {
            openaiStatus.innerHTML = `<div class="status-msg error">❌ ${err instanceof Error ? err.message : 'unknown error'}. Is the server running?</div>`;
        }
    }

    // --- Google Key ---
    const googleInput = requireEl('settingsGoogleKey', HTMLInputElement);
    const googleToggle = requireEl('settingsGoogleToggle', HTMLElement);
    const googleSave = requireEl('settingsGoogleSave', HTMLElement);
    const googleTest = requireEl('settingsGoogleTest', HTMLElement);
    const googleStatus = requireEl('settingsGoogleStatus', HTMLElement);

    // Load saved key
    const savedGoogle = localStorage.getItem('google_api_key');
    if (savedGoogle !== null && savedGoogle !== '') googleInput.value = savedGoogle;

    // Show/hide toggle
    googleToggle.addEventListener('click', () => {
        const isPassword = googleInput.type === 'password';
        googleInput.type = isPassword ? 'text' : 'password';
        googleToggle.textContent = isPassword ? '🙈' : '👁️';
    });

    // Save
    googleSave.addEventListener('click', () => {
        const key = googleInput.value.trim();
        if (key !== '') {
            localStorage.setItem('google_api_key', key);
            showToast('Google API key saved', 'success');
        } else {
            localStorage.removeItem('google_api_key');
            showToast('Google API key removed', 'warning');
        }
    });

    // Test connection
    googleTest.addEventListener('click', () => { void testGoogleKey(); });
    async function testGoogleKey(): Promise<void> {
        const key = googleInput.value.trim();
        if (key === '') {
            googleStatus.innerHTML = '<div class="status-msg error">Enter an API key first</div>';
            return;
        }

        googleStatus.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Testing connection...</div>';

        try {
            // Simple test: list models
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (resp.ok) {
                googleStatus.innerHTML = '<div class="status-msg success">✅ Connection successful!</div>';
                localStorage.setItem('google_api_key', key);
            } else {
                const data: unknown = await resp.json().catch(() => ({}));
                const msg = apiErrorMessage(data) ?? `HTTP ${resp.status.toString()}`;
                googleStatus.innerHTML = `<div class="status-msg error">❌ ${msg}</div>`;
            }
        } catch (err) {
            googleStatus.innerHTML = `<div class="status-msg error">❌ ${err instanceof Error ? err.message : 'unknown error'}</div>`;
        }
    }

    // --- Notification Sounds ---
    const soundToggle = requireEl('settingsSoundEnabled', HTMLInputElement);
    const soundTest = requireEl('settingsSoundTest', HTMLElement);

    soundToggle.checked = notificationSound.enabled;
    soundToggle.addEventListener('change', () => {
        notificationSound.setEnabled(soundToggle.checked);
    });

    soundTest.addEventListener('click', () => {
        notificationSound.play();
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission();
    }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
function initKeyboard(): void {
    document.addEventListener('keydown', (e) => {
        // Don't capture when typing in inputs
        const target = e.target;
        if (target instanceof Element && target.matches('input, textarea, select')) return;

        if (e.key === 'Escape') {
            // Cancel any active operation
            for (const btn of queryAll(document, '[id$="CancelBtn"]', HTMLElement)) {
                // offsetParent is null for a hidden element, which is how
                // the original distinguished visible cancel buttons.
                if (btn.offsetParent !== null) btn.click();
            }
        }

        // Arrow keys — delegate to active tab's frame navigation
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const activePanel = document.querySelector('.tab-panel.active');
            if (activePanel === null) return;

            // Video Prep frame navigation
            if (activePanel.id === 'tab-video-prep') {
                e.preventDefault();
                const btn = e.key === 'ArrowLeft' ? 
                    document.getElementById('vpPrevFrame') : 
                    document.getElementById('vpNextFrame');
                if (btn !== null) btn.click();
            }

            // Model Exporter frame navigation
            if (activePanel.id === 'tab-exporter') {
                e.preventDefault();
                const btn = e.key === 'ArrowLeft' ? 
                    document.getElementById('exPrevFrame') : 
                    document.getElementById('exNextFrame');
                if (btn !== null) btn.click();
            }
        }
    });
}

// ============================================
// GENERIC UI HELPERS
// ============================================

/** Initialize color swatch selection for a container */
export function initColorSwatches(
    containerId: string,
    onChange?: (color: string) => void,
): (() => string) | undefined {
    const container = document.getElementById(containerId);
    if (container === null) return undefined;

    container.addEventListener('click', (e) => {
        const swatch = closestFrom(e.target, '.color-swatch', HTMLElement);
        if (swatch === undefined) return;

        for (const s of queryAll(container, '.color-swatch', HTMLElement)) {
            s.classList.remove('selected');
        }
        swatch.classList.add('selected');

        const color = swatch.dataset['color'];
        if (onChange !== undefined && color !== undefined) onChange(color);
    });

    // Return getter
    return () => {
        const selected = container.querySelector('.color-swatch.selected');
        const color = selected instanceof HTMLElement ? selected.dataset['color'] : undefined;
        return color ?? '#00FF00';
    };
}

/** Initialize mode selector buttons */
export function initModeSelector(
    containerId: string,
    onChange?: (mode: string) => void,
): void {
    const container = document.getElementById(containerId);
    if (container === null) return;

    const SELECTOR = '.mode-btn, .seg-btn, .export-mode-btn';
    container.addEventListener('click', (e) => {
        const btn = closestFrom(e.target, SELECTOR, HTMLElement);
        if (btn === undefined) return;

        for (const b of queryAll(container, SELECTOR, HTMLElement)) b.classList.remove('active');
        btn.classList.add('active');

        const mode = btn.dataset['mode'] ?? btn.dataset['ratio'];
        if (onChange !== undefined && mode !== undefined) onChange(mode);
    });
}

/** Initialize generation count selector */
export function initGenCount(containerId: string): (() => number) | undefined {
    const container = document.getElementById(containerId);
    if (container === null) return undefined;

    container.addEventListener('click', (e) => {
        const btn = closestFrom(e.target, '.gen-count-btn', HTMLElement);
        if (btn === undefined) return;
        for (const b of queryAll(container, '.gen-count-btn', HTMLElement)) {
            b.classList.remove('active');
        }
        btn.classList.add('active');
    });

    return () => {
        const active = container.querySelector('.gen-count-btn.active');
        const count = active instanceof HTMLElement ? active.dataset['count'] : undefined;
        const parsed = count === undefined ? NaN : parseInt(count, 10);
        return Number.isFinite(parsed) ? parsed : 1;
    };
}

/** Initialize a range slider with live value display */
export function initRange(
    sliderId: string,
    displayId: string,
    suffix = '',
    transform?: (raw: string) => string | number,
): HTMLInputElement | undefined {
    const slider = findEl(sliderId, HTMLInputElement);
    const display = findEl(displayId, HTMLElement);
    if (slider === undefined || display === undefined) return undefined;

    const update = (): void => {
        const val = transform === undefined ? slider.value : transform(slider.value);
        display.textContent = `${String(val)}${suffix}`;
    };

    slider.addEventListener('input', update);
    update(); // initial
    return slider;
}

/** Setup drag-and-drop on an upload zone */
export function initUploadZone(
    zoneId: string,
    inputId: string,
    onFile?: (files: FileList) => void,
    onClear?: () => void,
): void {
    const zone = findEl(zoneId, HTMLElement);
    const input = findEl(inputId, HTMLInputElement);
    if (zone === undefined || input === undefined) return;

    // Inject clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'upload-clear-btn';
    clearBtn.title = 'Clear';
    clearBtn.innerHTML = '✕';
    clearBtn.type = 'button';
    zone.appendChild(clearBtn);

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        input.value = '';
        zone.classList.remove('has-content');
        if (onClear !== undefined) onClear();
    });

    // Drag events
    for (const evt of ['dragenter', 'dragover']) {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
    }

    for (const evt of ['dragleave', 'drop']) {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
        });
    }

    zone.addEventListener('drop', (e) => {
        const files = e instanceof DragEvent ? e.dataTransfer?.files : undefined;
        if (files !== undefined && files.length > 0) {
            zone.classList.add('has-content');
            if (onFile !== undefined) onFile(files);
        }
    });

    input.addEventListener('change', () => {
        const files = input.files;
        if (files !== null && files.length > 0) {
            zone.classList.add('has-content');
            if (onFile !== undefined) onFile(files);
        }
    });
}

/** Mark an upload zone as having content (shows clear button) */
export function markZoneLoaded(zoneId: string): void {
    document.getElementById(zoneId)?.classList.add('has-content');
}

/** Mark an upload zone as empty (hides clear button) */
export function markZoneEmpty(zoneId: string): void {
    document.getElementById(zoneId)?.classList.remove('has-content');
}









// ============================================
// CHARACTER NAME SYNC
// ============================================
function initCharNameSync(): void {
    // Sync character name across tabs
    const inputs = ['spCharName', 'sgCharName'];
    for (const id of inputs) {
        const el = findEl(id, HTMLInputElement);
        if (el === undefined) continue;
        el.addEventListener('input', () => {
            ASAdventurer.characterName = el.value;
            // Keep the other name fields in step.
            for (const otherId of inputs) {
                if (otherId === id) continue;
                const other = findEl(otherId, HTMLInputElement);
                if (other !== undefined) other.value = el.value;
            }
        });
    }

    // Load saved name
    const saved = localStorage.getItem('as_char_name');
    if (saved !== null && saved !== '') {
        ASAdventurer.characterName = saved;
        for (const id of inputs) {
            const el = findEl(id, HTMLInputElement);
            if (el !== undefined) el.value = saved;
        }
    }
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSettings();
    initKeyboard();
    initCharNameSync();
    console.log('⚔️ AS Adventurer initialized');
});
