/**
 * AS Adventurer — the shared browser shell.
 *
 * The handoff state passed between stages, notification sounds, keyboard
 * shortcuts, and the element helpers the stage controllers share. Tabs and
 * toasts are stores in `navigation.mts` and `toasts.mts`, re-exported below.
 */
import type { HandoffPayload } from "../core/video-prep-core.mts";
import { DEFAULT_FRAMING, type Framing } from "../core/sprite-prep-core.mts";
import { closestFrom, findEl, queryAll } from "./dom.mts";
import { browserStore } from "./local-storage.mts";
import { fetchArrayBuffer } from "./binary.mts";
import {
    loadCharacterName,
    loadSoundEnabled,
    saveSoundEnabled,
} from "../core/preferences.mts";

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
    /**
     * How much of the character the sprite shows.
     *
     * Carried because the video stage was asserting full-body framing
     * whatever the sprite contained: the Wan negative prompt guarded cropped
     * feet and the ComfyUI prompt asked for a full body in frame. A bust
     * sprite has no feet to preserve, so those terms told the model to avoid
     * the framing it had been handed.
     */
    framing: Framing;
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
        framing: DEFAULT_FRAMING,
    },
};

// ============================================
// NOTIFICATION SOUND SYSTEM
// ============================================
class NotificationSound {
    private audioContext: AudioContext | null = null;
    private readonly buffers: Record<string, AudioBuffer> = {};
    enabled: boolean = loadSoundEnabled(browserStore);
    private readonly clips: readonly string[] = ['quest_complete_2.mp3', 'quest_complete_10.mp3'];

    constructor() {
        this._initOnGesture();
    }

    private _initOnGesture(): void {
        const handler = (): void => {
            // A host that plays the sound itself needs no audio here, and the
            // clips are not at this page's address to preload.
            if (this.hostPlayer !== undefined) {
                document.removeEventListener('click', handler);
                document.removeEventListener('keydown', handler);
                return;
            }
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
                const buf = await fetchArrayBuffer(`assets/sounds/${clip}`);
                this.buffers[clip] = await ctx.decodeAudioData(buf);
            } catch (e) {
                console.warn(`[Sound] Failed to preload ${clip}:`, e instanceof Error ? e.message : e);
            }
        }
        console.log(`[Sound] Preloaded ${Object.keys(this.buffers).length.toString()} clips`);
    }

    /**
     * A player supplied by a host that cannot play the clips here. The mobile
     * application's web view has no copy of the sound files at the page's
     * address, so it plays them natively instead.
     */
    private hostPlayer: (() => void) | undefined = undefined;

    setPlayer(player: () => void): void {
        this.hostPlayer = player;
    }

    play(): void {
        if (!this.enabled) return;
        if (this.hostPlayer !== undefined) {
            this.hostPlayer();
            return;
        }
        const ctx = this.audioContext;
        if (ctx === null) return;

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
        saveSoundEnabled(browserStore, val);
    }
}

export const notificationSound: NotificationSound = new NotificationSound();

// ============================================
// TABS AND TOASTS
// ============================================
// Both moved to stores the interface renders from, `navigation.mts` and
// `toasts.mts`. They are re-exported here so the stage controllers keep the
// imports they had. Tab clicks and the settings panel moved into the
// interface itself, as React components.
export { switchTab } from "./navigation.mts";
export { showToast } from "./toasts.mts";

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
export function initKeyboard(): void {
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
export function initCharNameSync(): void {
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
    const saved = loadCharacterName(browserStore);
    if (saved !== '') {
        ASAdventurer.characterName = saved;
        for (const id of inputs) {
            const el = findEl(id, HTMLInputElement);
            if (el !== undefined) el.value = saved;
        }
    }
}
