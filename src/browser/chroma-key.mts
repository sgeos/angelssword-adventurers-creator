/**
 * ChromaKey — multi-pass chroma key processor.
 */
import { channel, type RgbaBuffer } from "./pixels.mts";

/** A background colour to match against. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export class ChromaKey {
  keyR = 0;
  keyG = 255;
  keyB = 0;
  /** 0-1, OBS default 400/1000. */
  similarity = 0.4;
  /** 0-1, OBS default 80/1000. */
  smoothness = 0.08;
  /** 0-1, OBS default 100/1000. */
  spillSuppression = 0.1;
  /** 0-2. */
  postSaturation = 1;
  /** 0.5-1.5. */
  postBrightness = 1;
  /** 0-200 pixels; 0 disables. */
  edgeFadeWidth = 0;
  /** Smooth jagged edges. */
  antiAlias = false;
  /** Neutralise key-coloured VFX such as smoke. */
  smokeCleanup = false;

  /**
   * Scratch buffer for applyAntiAlias, kept across frames so the filter
   * does not allocate per frame.
   */
  private _aaBuffer: Uint8Array | undefined;

  /** Key colour in the UV plane, recomputed when the key colour changes. */
  private _keyU = 0;
  private _keyV = 0;

    constructor() {
        this._updateKeyUV();
    }

    setKeyColor(r: number, g: number, b: number): void {
        this.keyR = r;
        this.keyG = g;
        this.keyB = b;
        this._updateKeyUV();
    }

    setKeyColorHex(hex: string): void {
        hex = hex.replace('#', '');
        this.keyR = parseInt(hex.slice(0, 2), 16);
        this.keyG = parseInt(hex.slice(2, 4), 16);
        this.keyB = parseInt(hex.slice(4, 6), 16);
        this._updateKeyUV();
    }

    /**
     * Pre-compute the key color in YUV space (U and V components).
     * Uses the BT.601 YUV matrix (same as OBS).
     */
    private _updateKeyUV(): void {
        const r = this.keyR / 255, g = this.keyG / 255, b = this.keyB / 255;
        this._keyU = -0.148736 * r - 0.331264 * g + 0.5 * b;
        this._keyV =  0.5 * r - 0.418688 * g - 0.081312 * b;
    }

    /**
     * OBS CORE: Chroma Distance
     * Ported from OBS chroma_key_filter.effect GetChromaDist()
     * Converts RGB to YUV, returns Euclidean distance in UV plane to key color.
     */
    private _getChromaDist(r: number, g: number, b: number): number {
        const rf = r / 255, gf = g / 255, bf = b / 255;
        const u = -0.148736 * rf - 0.331264 * gf + 0.5 * bf;
        const v =  0.5 * rf - 0.418688 * gf - 0.081312 * bf;
        const du = u - this._keyU;
        const dv = v - this._keyV;
        return Math.sqrt(du * du + dv * dv);
    }

    /**
     * OBS CORE: Box-Filtered Chroma Distance
     * Ported from OBS GetBoxFilteredChromaDist()
     * Samples 4 cardinal neighbors + center pixel, weighted average.
     * This smooths the chroma distance across a neighborhood, preventing
     * single-pixel noise and producing smoother edges (less jaggies).
     *
     * IMPORTANT: After our flood fill step, alpha=0 pixels still contain
     * key-color RGB data. We must skip them — otherwise their low chroma
     * distance contaminates the average and makes foreground edge pixels
     * incorrectly transparent.
     *
     * Weighting: valid neighbors x 2 + center x 1, normalized.
     */
    private _getBoxFilteredDist(x: number, y: number, data: RgbaBuffer, w: number, h: number): number {
        const idx = (y * w + x) * 4;
        const centerDist = this._getChromaDist(channel(data, idx), channel(data, idx + 1), channel(data, idx + 2));

        let distSum = centerDist; // Center weighted 1x
        let totalWeight = 1;

        // 4 cardinal neighbors — only include if opaque (not flood-filled)
        const offsets: number[] = [
            x > 0 ? idx - 4 : -1,
            x < w - 1 ? idx + 4 : -1,
            y > 0 ? idx - w * 4 : -1,
            y < h - 1 ? idx + w * 4 : -1
        ];

        for (const ni of offsets) {
            if (ni >= 0 && channel(data, ni + 3) > 0) {
                distSum += this._getChromaDist(channel(data, ni), channel(data, ni + 1), channel(data, ni + 2)) * 2;
                totalWeight += 2;
            }
        }

        return distSum / totalWeight;
    }

    /**
     * Check if a pixel matches the background color within tolerance.
     */
    isBackgroundPixel(data: RgbaBuffer, idx: number, bgColor: Rgb, tolerance: number): boolean {
        const dr = Math.abs(channel(data, idx) - bgColor.r);
        const dg = Math.abs(channel(data, idx + 1) - bgColor.g);
        const db = Math.abs(channel(data, idx + 2) - bgColor.b);
        return (dr + dg + db) / 3 <= tolerance;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN PROCESS — Clean 4-step pipeline
    // ═══════════════════════════════════════════════════════════════

    process(imageData: ImageData): void {
        const bgColor = { r: this.keyR, g: this.keyG, b: this.keyB };
        const tolerance = this.similarity * 110;

        // Step 1: Edge flood fill — remove background connected to borders
        this.edgeFloodFill(imageData, bgColor, tolerance);

        // Step 2: OBS chroma key — box-filtered alpha mask + spill suppression
        this._obsChromaKey(imageData);

        // Step 3: Periphery outline blackout — anime-specific edge cleanup
        this._peripheryBlackout(imageData, bgColor);

        // Step 4: Smoke cleanup — optional toggle for VFX elements
        if (this.smokeCleanup) {
            this._smokeCleanup(imageData, bgColor);
        }

        // Post-processing: saturation + brightness
        if (this.postSaturation !== 1 || this.postBrightness !== 1) {
            this._postProcess(imageData);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STEP 1: Edge Flood Fill
    //  BFS from image borders — removes background connected to edges.
    //  OBS doesn't need this (it processes every pixel in real-time),
    //  but we need it because we export to transparent PNG where
    //  interior pockets of key color (e.g. between legs) must be
    //  handled separately from outer background.
    // ═══════════════════════════════════════════════════════════════

    edgeFloodFill(imageData: ImageData, bgColor: Rgb, tolerance: number): ImageData {
        const { data, width, height } = imageData;
        const totalPixels = width * height;
        const visited = new Uint8Array(totalPixels);
        const queue: number[] = [];

        // Seed from all edge pixels matching background
        for (let x = 0; x < width; x++) {
            const topIdx = x;
            const botIdx = (height - 1) * width + x;
            if (this.isBackgroundPixel(data, topIdx * 4, bgColor, tolerance)) {
                queue.push(topIdx); visited[topIdx] = 1;
            }
            if (this.isBackgroundPixel(data, botIdx * 4, bgColor, tolerance)) {
                queue.push(botIdx); visited[botIdx] = 1;
            }
        }
        for (let y = 1; y < height - 1; y++) {
            const leftIdx = y * width;
            const rightIdx = y * width + (width - 1);
            if (this.isBackgroundPixel(data, leftIdx * 4, bgColor, tolerance)) {
                queue.push(leftIdx); visited[leftIdx] = 1;
            }
            if (this.isBackgroundPixel(data, rightIdx * 4, bgColor, tolerance)) {
                queue.push(rightIdx); visited[rightIdx] = 1;
            }
        }

        // BFS flood fill
        let head = 0;
        while (head < queue.length) {
            const pixelIdx = (queue[head++] ?? 0);
            const x = pixelIdx % width;
            const y = Math.floor(pixelIdx / width);
            const neighbors: number[] = [];
            if (x > 0) neighbors.push(pixelIdx - 1);
            if (x < width - 1) neighbors.push(pixelIdx + 1);
            if (y > 0) neighbors.push(pixelIdx - width);
            if (y < height - 1) neighbors.push(pixelIdx + width);
            for (const nIdx of neighbors) {
                if ((visited[nIdx] ?? 0) === 0) {
                    if (this.isBackgroundPixel(data, nIdx * 4, bgColor, tolerance)) {
                        visited[nIdx] = 1;
                        queue.push(nIdx);
                    } else {
                        visited[nIdx] = 2;
                    }
                }
            }
        }

        // Apply transparency to background pixels
        for (let i = 0; i < totalPixels; i++) {
            if ((visited[i] ?? 0) === 1) {
                data[i * 4 + 3] = 0;
            }
        }
        return imageData;
    }

    // ═══════════════════════════════════════════════════════════════
    //  STEP 2: OBS Chroma Key
    //  Direct port of OBS Studio's ProcessChromaKey shader.
    //
    //  For each opaque pixel:
    //  1. Compute box-filtered chroma distance (smooth edges)
    //  2. Alpha mask: fullMask = pow(clamp((dist-sim)/smooth, 0, 1), 1.5)
    //  3. Spill: spillVal = pow(clamp((dist-sim)/spill, 0, 1), 1.5)
    //     rgb = lerp(luminance, rgb, spillVal)
    //
    //  Replaces old Steps 2-3.6 with a single clean pass.
    // ═══════════════════════════════════════════════════════════════

    private _obsChromaKey(imageData: ImageData): void {
        const { data, width, height } = imageData;
        const total = width * height;
        const sim = this.similarity;
        const smooth = Math.max(0.002, this.smoothness);
        const spill = Math.max(0.002, this.spillSuppression);

        // Build distance-from-transparent map (BFS, max depth 4).
        // Smoothness alpha is ONLY applied to pixels near edges (depth 1-4).
        // Interior pixels use binary keying — this prevents video compression
        // noise from making the entire character semi-transparent.
        const EDGE_DEPTH = 4;
        const edgeDist = new Uint8Array(total);
        edgeDist.fill(255);
        const queue: number[] = [];
        for (let i = 0; i < total; i++) {
            if (channel(data, i * 4 + 3) === 0) { edgeDist[i] = 0; queue.push(i); }
        }
        let head = 0;
        while (head < queue.length) {
            const pi = (queue[head++] ?? 0);
            const dd = (edgeDist[pi] ?? Infinity);
            if (dd >= EDGE_DEPTH) continue;
            const px = pi % width, py = (pi - px) / width;
            if (px > 0     && (edgeDist[pi - 1] ?? Infinity) > dd + 1) { edgeDist[pi - 1] = dd + 1; queue.push(pi - 1); }
            if (px < width - 1 && (edgeDist[pi + 1] ?? Infinity) > dd + 1) { edgeDist[pi + 1] = dd + 1; queue.push(pi + 1); }
            if (py > 0     && (edgeDist[pi - width] ?? Infinity) > dd + 1) { edgeDist[pi - width] = dd + 1; queue.push(pi - width); }
            if (py < height - 1 && (edgeDist[pi + width] ?? Infinity) > dd + 1) { edgeDist[pi + width] = dd + 1; queue.push(pi + width); }
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;

                // Skip already-transparent pixels (from flood fill)
                if (channel(data, idx + 3) === 0) continue;

                const r = channel(data, idx), g = channel(data, idx + 1), b = channel(data, idx + 2);
                const pixIdx = y * width + x;
                const depth = (edgeDist[pixIdx] ?? Infinity);

                // Box-filtered chroma distance (smooth edges like OBS)
                const chromaDist = this._getBoxFilteredDist(x, y, data, width, height);

                // OBS formula: baseMask = chromaDist - similarity
                const baseMask = chromaDist - sim;

                // Alpha masking — edge-aware
                if (depth <= EDGE_DEPTH) {
                    // EDGE PIXEL: Apply full OBS smoothness formula
                    // fullMask = pow(saturate(baseMask / smoothness), 1.5)
                    const fullMask = Math.pow(Math.max(0, Math.min(1, baseMask / smooth)), 1.5);
                    data[idx + 3] = Math.round(channel(data, idx + 3) * fullMask);
                } else {
                    // INTERIOR PIXEL: Binary keying only
                    // If chroma distance <= similarity, it's key color — remove it
                    if (baseMask <= 0) {
                        data[idx + 3] = 0;
                    }
                    // Otherwise keep fully opaque — no smoothness fade
                }

                // Spill suppression applies everywhere (color only, no alpha change)
                // spillVal = pow(saturate(baseMask / spill), 1.5)
                const spillVal = Math.pow(Math.max(0, Math.min(1, baseMask / spill)), 1.5);

                if (spillVal < 0.999) {
                    // BT.709 luminance
                    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
                    data[idx]     = Math.max(0, Math.min(255, Math.round(lum + (r - lum) * spillVal)));
                    data[idx + 1] = Math.max(0, Math.min(255, Math.round(lum + (g - lum) * spillVal)));
                    data[idx + 2] = Math.max(0, Math.min(255, Math.round(lum + (b - lum) * spillVal)));
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STEP 3: Periphery Outline Blackout (anime-specific)
    //  Darkens key-contaminated pixels within 2px of transparent edges.
    //  In anime art, edges are always dark outlines — any remaining
    //  key color contamination at boundaries should become outline.
    // ═══════════════════════════════════════════════════════════════

    private _peripheryBlackout(imageData: ImageData, bgColor: Rgb): void {
        const d = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        const total = w * h;
        const keyMax = Math.max(bgColor.r, bgColor.g, bgColor.b);
        const isKeyR = bgColor.r > keyMax * 0.7;
        const isKeyG = bgColor.g > keyMax * 0.7;
        const isKeyB = bgColor.b > keyMax * 0.7;

        // Build distance-from-transparent map (BFS, max depth 2)
        const edgeDist = new Uint8Array(total);
        edgeDist.fill(255);
        const queue: number[] = [];
        for (let i = 0; i < total; i++) {
            if (channel(d, i * 4 + 3) === 0) { edgeDist[i] = 0; queue.push(i); }
        }
        let head = 0;
        while (head < queue.length) {
            const pi = (queue[head++] ?? 0);
            const dist = (edgeDist[pi] ?? Infinity);
            if (dist >= 2) continue;
            const px = pi % w, py = (pi - px) / w;
            if (px > 0     && (edgeDist[pi - 1] ?? Infinity) > dist + 1) { edgeDist[pi - 1] = dist + 1; queue.push(pi - 1); }
            if (px < w - 1 && (edgeDist[pi + 1] ?? Infinity) > dist + 1) { edgeDist[pi + 1] = dist + 1; queue.push(pi + 1); }
            if (py > 0     && (edgeDist[pi - w] ?? Infinity) > dist + 1) { edgeDist[pi - w] = dist + 1; queue.push(pi - w); }
            if (py < h - 1 && (edgeDist[pi + w] ?? Infinity) > dist + 1) { edgeDist[pi + w] = dist + 1; queue.push(pi + w); }
        }

        for (let i = 0; i < total; i++) {
            const dist = (edgeDist[i] ?? Infinity);
            if (dist === 0 || dist > 2) continue;
            const idx = i * 4;
            if (channel(d, idx + 3) < 200) continue; // Skip semi-transparent (wings, hair)

            const r = channel(d, idx), g = channel(d, idx + 1), b = channel(d, idx + 2);

            // Check for key color contamination in channel pattern
            let contamination = 0;
            if (isKeyR && isKeyB && !isKeyG) {
                // Magenta: R and/or B elevated vs G
                const exR = Math.max(0, r - g);
                const exB = Math.max(0, b - g);
                contamination = Math.max(exR, exB);
            } else if (isKeyR && isKeyG && !isKeyB) {
                const exR = Math.max(0, r - b);
                const exG = Math.max(0, g - b);
                contamination = Math.max(exR, exG);
            } else if (isKeyG && !isKeyR && !isKeyB) {
                contamination = Math.max(0, g - Math.max(r, b));
            } else if (isKeyB && !isKeyR && !isKeyG) {
                contamination = Math.max(0, b - Math.max(r, g));
            } else if (isKeyR && !isKeyG && !isKeyB) {
                contamination = Math.max(0, r - Math.max(g, b));
            }

            const threshold = dist === 1 ? 8 : 20;
            if (contamination <= threshold) continue;

            const distFade = dist === 1 ? 1.0 : 0.6;
            const strength = Math.min(1, (contamination - threshold) / 60) * distFade;
            const lum = r * 0.299 + g * 0.587 + b * 0.114;
            const darkTarget = Math.min(lum * 0.25, 35);
            d[idx]     = Math.round(r * (1 - strength) + darkTarget * strength);
            d[idx + 1] = Math.round(g * (1 - strength) + darkTarget * strength);
            d[idx + 2] = Math.round(b * (1 - strength) + darkTarget * strength);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  STEP 4: Smoke Cleanup (optional toggle)
    //  Converts remaining key-colored elements (smoke, VFX) into
    //  semi-transparent dark gray. Uses YCbCr chroma distance.
    //  Protected body zone prevents interior damage.
    // ═══════════════════════════════════════════════════════════════

    private _smokeCleanup(imageData: ImageData, bgColor: Rgb): void {
        const d = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        const total = w * h;
        const keyCb = 128 + (-0.168736 * bgColor.r - 0.331264 * bgColor.g + 0.5 * bgColor.b);
        const keyCr = 128 + (0.5 * bgColor.r - 0.418688 * bgColor.g - 0.081312 * bgColor.b);
        const SMOKE_THRESHOLD = 40;
        const SMOKE_SOFTEDGE = 60;
        const BODY_DEPTH = 6;

        // BFS: distance from nearest transparent pixel
        const distFromTP = new Uint8Array(total);
        distFromTP.fill(255);
        const bfsQ: number[] = [];
        for (let i = 0; i < total; i++) {
            if (channel(d, i * 4 + 3) === 0) { distFromTP[i] = 0; bfsQ.push(i); }
        }
        let bfsHead = 0;
        while (bfsHead < bfsQ.length) {
            const pi = bfsQ[bfsHead++] ?? 0;
            const dd = (distFromTP[pi] ?? Infinity);
            if (dd >= BODY_DEPTH) continue;
            const px = pi % w, py = (pi - px) / w;
            if (px > 0     && (distFromTP[pi - 1] ?? Infinity) > dd + 1) { distFromTP[pi - 1] = dd + 1; bfsQ.push(pi - 1); }
            if (px < w - 1 && (distFromTP[pi + 1] ?? Infinity) > dd + 1) { distFromTP[pi + 1] = dd + 1; bfsQ.push(pi + 1); }
            if (py > 0     && (distFromTP[pi - w] ?? Infinity) > dd + 1) { distFromTP[pi - w] = dd + 1; bfsQ.push(pi - w); }
            if (py < h - 1 && (distFromTP[pi + w] ?? Infinity) > dd + 1) { distFromTP[pi + w] = dd + 1; bfsQ.push(pi + w); }
        }

        for (let j = 0; j < d.length; j += 4) {
            if (channel(d, j + 3) < 1) continue;
            const pxIdx = j >> 2;
            const depth = (distFromTP[pxIdx] ?? Infinity);
            if (depth > BODY_DEPTH) continue;

            const r = channel(d, j), g = channel(d, j + 1), b = channel(d, j + 2);
            const cb = 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b);
            const cr = 128 + (0.5 * r - 0.418688 * g - 0.081312 * b);
            const dcb = cb - keyCb, dcr = cr - keyCr;
            const chromaDist = Math.sqrt(dcb * dcb + dcr * dcr);

            if (chromaDist >= SMOKE_THRESHOLD + SMOKE_SOFTEDGE) continue;

            let contamination;
            if (chromaDist < SMOKE_THRESHOLD) {
                contamination = 1.0;
            } else {
                contamination = 1.0 - (chromaDist - SMOKE_THRESHOLD) / SMOKE_SOFTEDGE;
            }
            contamination = Math.pow(contamination, 0.7);
            contamination *= Math.max(0, 1 - depth / BODY_DEPTH);
            if (contamination < 0.01) continue;

            const lum = r * 0.299 + g * 0.587 + b * 0.114;
            const origAlpha = channel(d, j + 3);

            if (origAlpha < 200) {
                // Semi-transparent pixel (wings, hair, VFX details):
                // Desaturate key color instead of removing alpha.
                const darkVal = Math.min(lum * 0.5, 80);
                d[j]     = Math.round(r * (1 - contamination * 0.7) + darkVal * (contamination * 0.7));
                d[j + 1] = Math.round(g * (1 - contamination * 0.7) + darkVal * (contamination * 0.7));
                d[j + 2] = Math.round(b * (1 - contamination * 0.7) + darkVal * (contamination * 0.7));
                d[j + 3] = Math.round(origAlpha * (1 - contamination * 0.3));
            } else {
                // Fully opaque key-colored pixel (actual smoke):
                const darkVal = Math.min(lum * 0.2, 30);
                d[j]     = Math.round(r * (1 - contamination) + darkVal * contamination);
                d[j + 1] = Math.round(g * (1 - contamination) + darkVal * contamination);
                d[j + 2] = Math.round(b * (1 - contamination) + darkVal * contamination);
                d[j + 3] = Math.round(origAlpha * (1 - contamination * 0.85));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  POST-PROCESSING: Saturation + Brightness
    // ═══════════════════════════════════════════════════════════════

    private _postProcess(imageData: ImageData): void {
        const d = imageData.data;
        const sat = this.postSaturation;
        const bright = this.postBrightness;
        for (let j = 0; j < d.length; j += 4) {
            if (channel(d, j + 3) === 0) continue;
            let r = channel(d, j), g = channel(d, j + 1), b = channel(d, j + 2);

            if (bright !== 1) {
                r = Math.round(r * bright);
                g = Math.round(g * bright);
                b = Math.round(b * bright);
            }

            if (sat !== 1) {
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                r = Math.round(lum + (r - lum) * sat);
                g = Math.round(lum + (g - lum) * sat);
                b = Math.round(lum + (b - lum) * sat);
            }

            d[j]     = Math.max(0, Math.min(255, r));
            d[j + 1] = Math.max(0, Math.min(255, g));
            d[j + 2] = Math.max(0, Math.min(255, b));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE FADE — Fade alpha near left/right/top borders
    // ═══════════════════════════════════════════════════════════════

    applyEdgeFade(imageData: ImageData, fadeWidth: number): void {
        if (fadeWidth <= 0) return;
        const { data, width, height } = imageData;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                if (channel(data, idx + 3) === 0) continue;

                // Calculate minimum distance to left, right, or top edge
                let edgeFactor = 1;
                const leftDist = x;
                const rightDist = width - 1 - x;
                const topDist = y;
                // No bottom fade — screen naturally cuts off there

                const minDist = Math.min(leftDist, rightDist, topDist);

                if (minDist < fadeWidth) {
                    // Smooth fade using squared curve for natural falloff
                    const t = minDist / fadeWidth;
                    edgeFactor = t * t; // Quadratic ease-in
                }

                if (edgeFactor < 1) {
                    data[idx + 3] = Math.round(channel(data, idx + 3) * edgeFactor);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  ANTI-ALIASING — Smooth jagged alpha edges via 3x3 kernel
    //  O(n) single pass, ~1-3ms per 1080p frame.
    // ═══════════════════════════════════════════════════════════════

    applyAntiAlias(imageData: ImageData): void {
        const { data, width, height } = imageData;
        const total = width * height;

        // Reuse cached buffer to avoid per-frame allocation (GC pressure)
        if (this._aaBuffer === undefined || this._aaBuffer.length < total) {
            this._aaBuffer = new Uint8Array(total);
        }
        const origAlpha = this._aaBuffer;

        // Copy alpha channel
        for (let i = 0; i < total; i++) {
            origAlpha[i] = channel(data, i * 4 + 3);
        }

        // Pre-compute row offsets
        const W = width;

        for (let y = 1; y < height - 1; y++) {
            const rowStart = y * W;
            for (let x = 1; x < W - 1; x++) {
                const i = rowStart + x;
                const alpha = channel(origAlpha, i);

                // Skip transparent and semi-transparent pixels
                if (alpha < 128) continue;

                // Fast cardinal-only edge check (avoid full kernel for interior)
                const aUp    = channel(origAlpha, i - W);
                const aDown  = channel(origAlpha, i + W);
                const aLeft  = channel(origAlpha, i - 1);
                const aRight = channel(origAlpha, i + 1);

                if (aUp >= 128 && aDown >= 128 && aLeft >= 128 && aRight >= 128) {
                    // Also check diagonals
                    if (channel(origAlpha, i - W - 1) >= 128 && channel(origAlpha, i - W + 1) >= 128 &&
                        channel(origAlpha, i + W - 1) >= 128 && channel(origAlpha, i + W + 1) >= 128) {
                        continue; // Fully interior pixel, skip
                    }
                }

                // Unrolled 3x3 weighted kernel
                // Cardinal neighbors (weight 2), diagonals (weight 1), center (weight 2)
                // Total max weight = 4 cardinals*2 + 4 diagonals*1 + 1 center*2 = 14
                let opaqueW = 0;
                if (alpha >= 128)                      opaqueW += 2; // center
                if (aUp >= 128)                        opaqueW += 2; // up
                if (aDown >= 128)                      opaqueW += 2; // down
                if (aLeft >= 128)                      opaqueW += 2; // left
                if (aRight >= 128)                     opaqueW += 2; // right
                if (channel(origAlpha, i - W - 1) >= 128)       opaqueW += 1; // top-left
                if (channel(origAlpha, i - W + 1) >= 128)       opaqueW += 1; // top-right
                if (channel(origAlpha, i + W - 1) >= 128)       opaqueW += 1; // bottom-left
                if (channel(origAlpha, i + W + 1) >= 128)       opaqueW += 1; // bottom-right

                const smoothAlpha = Math.round((opaqueW / 14) * 255);

                // Only reduce alpha, never increase it
                if (smoothAlpha < alpha) {
                    data[i * 4 + 3] = smoothAlpha;
                }
            }
        }
    }
}

