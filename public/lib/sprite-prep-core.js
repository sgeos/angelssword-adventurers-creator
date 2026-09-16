/**
 * AS Adventurer — Sprite Prep Core (pure logic)
 * Characterization extract from sprite-prep.js — no DOM, no fetch.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.ASAdventurerSpritePrepCore = api;
        root.ASSpritePrepCore = api;
    }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const KEY_COLORS = [
        { hex: '#00FF00', name: 'Green',   r: 0,   g: 255, b: 0   },
        { hex: '#FF00FF', name: 'Magenta', r: 255, g: 0,   b: 255 },
        { hex: '#0000FF', name: 'Blue',    r: 0,   g: 0,   b: 255 },
        { hex: '#FFFF00', name: 'Yellow',  r: 255, g: 255, b: 0   },
        { hex: '#00FFFF', name: 'Cyan',    r: 0,   g: 255, b: 255 }
    ];

    /**
     * Fugi Maker key pick: among KEY_COLORS, choose the one whose
     * minimum Euclidean distance to any opaque (α≥128) pixel is largest.
     * @param {Uint8ClampedArray|Uint8Array|number[]} rgba
     * @param {number} width
     * @param {number} height
     * @returns {{ hex: string, bestIdx: number, minDist: Float64Array }}
     */
    function pickKeyByEuclideanMinDist(rgba, width, height) {
        const minDist = new Float64Array(KEY_COLORS.length).fill(Infinity);

        for (let i = 0; i < width * height; i++) {
            const idx = i * 4;
            if (rgba[idx + 3] < 128) continue; // skip transparent
            const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];
            for (let c = 0; c < KEY_COLORS.length; c++) {
                const dr = r - KEY_COLORS[c].r;
                const dg = g - KEY_COLORS[c].g;
                const db = b - KEY_COLORS[c].b;
                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                if (dist < minDist[c]) minDist[c] = dist;
            }
        }

        let bestIdx = 0, bestSep = -1;
        for (let c = 0; c < KEY_COLORS.length; c++) {
            if (minDist[c] > bestSep) { bestSep = minDist[c]; bestIdx = c; }
        }

        return {
            hex: KEY_COLORS[bestIdx].hex,
            bestIdx,
            minDist
        };
    }

    /**
     * Scan bottom-up for the lowest row with any pixel α > alphaThreshold.
     * Matches renderCanvas bottom-row scan (default threshold 30).
     */
    function findBottomOpaqueRow(rgba, w, h, alphaThreshold) {
        if (alphaThreshold === undefined) alphaThreshold = 30;
        let bottomRow = h - 1;
        for (let y = h - 1; y >= 0; y--) {
            for (let x = 0; x < w; x++) {
                if (rgba[(y * w + x) * 4 + 3] > alphaThreshold) {
                    bottomRow = y;
                    y = -1;
                    break;
                }
            }
        }
        return bottomRow;
    }

    /**
     * Bottom-anchored + offset + zoom math from renderCanvas.
     * @returns {{ zoomX: number, zoomY: number, drawW: number, drawH: number, spriteX: number, spriteY: number }}
     */
    function computeSpriteDrawRect(opts) {
        const sw = opts.sw;
        const sh = opts.sh;
        const bottomRow = opts.bottomRow;
        const offset = opts.offset;
        const zoom = opts.zoom;
        const CW = opts.CW !== undefined ? opts.CW : 1280;
        const CH = opts.CH !== undefined ? opts.CH : 720;

        const spriteY = CH - bottomRow - 1 + offset;
        const spriteX = Math.round((CW - sw) / 2);

        const scale = zoom / 100;
        const drawW = Math.round(sw * scale);
        const drawH = Math.round(sh * scale);
        const zoomX = spriteX + Math.round((sw - drawW) / 2);
        const zoomY = spriteY + (sh - drawH);

        return { zoomX, zoomY, drawW, drawH, spriteX, spriteY };
    }

    function defaultColorName(hex) {
        const names = {
            '#00FF00': 'Green', '#FF00FF': 'Magenta', '#0000FF': 'Blue',
            '#FFFF00': 'Yellow', '#00FFFF': 'Cyan'
        };
        return names[(hex || '').toUpperCase()] || hex;
    }

    /**
     * Pure buildPrompt — same strings as sprite-prep.js buildPrompt.
     * @param {{ name?: string, desc?: string, action?: string, keyHex: string, raceMode?: string, colorNameFn?: function }} opts
     */
    function buildPrompt(opts) {
        const name = (opts.name && String(opts.name).trim()) || 'Character';
        const desc = (opts.desc && String(opts.desc).trim()) || '';
        const action = (opts.action && String(opts.action).trim()) || '';
        const keyHex = opts.keyHex;
        const raceMode = opts.raceMode || 'normal';
        const colorNameFn = opts.colorNameFn || defaultColorName;

        const keyName = colorNameFn(keyHex);
        const actionText = action || 'standing in a neutral idle position';

        let raceDirective = '';
        if (raceMode === 'kanolith') {
            raceDirective = '\nCRITICAL - KEMONOMIMI STYLE:\nThis character is a kemonomimi (moe anthropomorphism). They must have a FULLY HUMAN face - human nose, human mouth, human skin, human facial structure. They have animal ears on top of their head and an animal tail, but NO human ears (the sides of the head where human ears would be must be covered by hair or simply absent). NO snout, NO fur on face, NO whiskers, NO muzzle, NO animal nose. The face must be 100% anime-human in appearance. Only the ears and tail are animal-like.\n';
        } else if (raceMode === 'zoalith') {
            raceDirective = '\nCRITICAL - FULL ANTHROPOMORPHIC STYLE:\nThis character is a full anthropomorphic beastfolk (furry/kemono style). They should have pronounced animal facial features: a visible snout or muzzle, fur covering the face and body, animal nose, whiskers if applicable, digitigrade legs if applicable. The body structure is humanoid but the head and skin are distinctly animal. Think classic RPG beastfolk like Breath of Fire or Final Fantasy Bangaa/Moogle.\n';
        }

        return [
            `A single ${name}${desc ? ', ' + desc : ''}, ${actionText}.`,
            raceDirective,
            `Character shown from the waist up (upper body, chest, shoulders, head). The character is positioned in the lower portion of the canvas, centered horizontally, with plenty of solid background space above the character's head.`,
            `The entire background must be a solid, uniform ${keyName.toUpperCase()} (${keyHex}) with absolutely no gradients, shadows, or variations.`,
            `Every pixel of background must be the exact same shade of ${keyName.toLowerCase()} — a single uniform matte color.`,
            `The character should be drawn in a high-quality anime/JRPG art style with clean linework and cel-shading.`,
            `The image must be exactly 1280×720 pixels.`,
            `The character has crisp, clean edges with bold dark outlines and a well-defined silhouette against the flat colored background.`,
            `Waist-up portrait composition with flat studio lighting. The character's lower body is cut off at approximately the waist or hip level by the bottom edge of the canvas. No ground, no floor, no feet visible.`
        ].filter(Boolean).join('\n');
    }

    /**
     * @param {string} promptText
     * @param {{ charRef?: boolean, styleRef?: boolean }} refs
     */
    function buildPromptWithRefs(promptText, refs) {
        const charRef = !!(refs && refs.charRef);
        const styleRef = !!(refs && refs.styleRef);

        if (charRef && styleRef) {
            return 'Two reference images are provided. The FIRST image (character_reference.png) is the CHARACTER REFERENCE — the generated character must look exactly like this character. The SECOND image (style_reference.png) is the STYLE REFERENCE — match its art style only. ' + promptText +
                '\n\nCRITICAL: The character must look like the one in character_reference.png.';
        } else if (charRef) {
            return promptText + '\n\nThe character should look exactly like the one in the provided reference image.';
        } else if (styleRef) {
            return 'Match the exact art style shown in the provided style reference image. ' + promptText;
        }
        return promptText;
    }

    /**
     * Shape generateOne request (endpoint + body). Does not fetch.
     * @param {{ prompt: string, images?: Array }} opts
     * @returns {{ endpoint: string, body: object }}
     */
    function buildGenerateRequest(opts) {
        const prompt = opts.prompt;
        const images = opts.images || [];
        const hasImages = images.length > 0;
        const endpoint = hasImages ? '/api/edits' : '/api/generate';

        const body = {
            model: 'gpt-image-2',
            prompt: prompt,
            n: 1,
            size: '1536x1024',
            quality: 'high'
        };

        if (hasImages) body.images = images;

        return { endpoint, body };
    }

    return {
        KEY_COLORS,
        pickKeyByEuclideanMinDist,
        findBottomOpaqueRow,
        computeSpriteDrawRect,
        buildPrompt,
        buildPromptWithRefs,
        buildGenerateRequest,
        defaultColorName
    };
});
