/**
 * GIF codec: GifEncoder, ColorQuantizer, GifDecoder
 * Extracted from model-exporter.js — characterization seam (no algorithm changes).
 */

class GifEncoder {
    constructor(width, height, loop = 0) {
        this.width = width;
        this.height = height;
        this.loop = loop; // 0 = infinite
        this.bufSize = 1024 * 256; // start with 256KB
        this.buf = new Uint8Array(this.bufSize);
        this.bufPos = 0;
        this.started = false;
        this.frameCount = 0;
    }

    /* ─── Low-level writers ─── */
    _grow(needed) {
        while (this.bufPos + needed > this.bufSize) {
            this.bufSize *= 2;
        }
        const newBuf = new Uint8Array(this.bufSize);
        newBuf.set(this.buf);
        this.buf = newBuf;
    }
    writeByte(v) {
        if (this.bufPos >= this.bufSize) this._grow(1024);
        this.buf[this.bufPos++] = v & 0xFF;
    }
    writeShort(v) { this.writeByte(v & 0xFF); this.writeByte((v >> 8) & 0xFF); }
    writeString(s) { for (let i = 0; i < s.length; i++) this.writeByte(s.charCodeAt(i)); }
    writeBytes(arr) { for (let i = 0; i < arr.length; i++) this.writeByte(arr[i]); }

    /* ─── GIF Structure ─── */
    writeHeader() {
        this.writeString('GIF89a');
    }

    writeLogicalScreenDescriptor() {
        this.writeShort(this.width);
        this.writeShort(this.height);
        // Packed: no GCT (0), color res 7 (111), no sort (0), GCT size 0 (000)
        this.writeByte(0x70); // 0111_0000
        this.writeByte(0);    // bg color index
        this.writeByte(0);    // pixel aspect ratio
    }

    writeNetscapeExtension() {
        this.writeByte(0x21); // Extension introducer
        this.writeByte(0xFF); // Application extension
        this.writeByte(0x0B); // Block size
        this.writeString('NETSCAPE2.0');
        this.writeByte(0x03); // Sub-block size
        this.writeByte(0x01); // Sub-block ID
        this.writeShort(this.loop);
        this.writeByte(0x00); // Block terminator
    }

    writeGraphicControlExtension(delayCentiseconds, transparentIndex, disposal = 2) {
        this.writeByte(0x21); // Extension introducer
        this.writeByte(0xF9); // GCE label
        this.writeByte(0x04); // Block size
        // Packed: reserved(000), disposal(DDD), no user input(0), transparent flag(1)
        const packed = ((disposal & 0x07) << 2) | 0x01;
        this.writeByte(packed);
        this.writeShort(delayCentiseconds);
        this.writeByte(transparentIndex);
        this.writeByte(0x00); // Block terminator
    }

    writeImageDescriptor(lctSizeField, left = 0, top = 0, w = this.width, h = this.height) {
        this.writeByte(0x2C); // Image separator
        this.writeShort(left);
        this.writeShort(top);
        this.writeShort(w);
        this.writeShort(h);
        // Packed: LCT flag(1), no interlace(0), no sort(0), reserved(00), LCT size
        this.writeByte(0x80 | (lctSizeField & 0x07));
    }

    writeColorTable(palette, tableSize) {
        for (let i = 0; i < tableSize; i++) {
            if (i < palette.length) {
                this.writeByte(palette[i][0]); // R
                this.writeByte(palette[i][1]); // G
                this.writeByte(palette[i][2]); // B
            } else {
                this.writeByte(0); this.writeByte(0); this.writeByte(0);
            }
        }
    }

    writeLZWData(indexedPixels, minCodeSize) {
        this.writeByte(minCodeSize);

        const clearCode = 1 << minCodeSize;
        const eoiCode = clearCode + 1;
        const maxCodeValue = 4096;

        let codeSize = minCodeSize + 1;
        let nextCode = eoiCode + 1;
        // Open-addressing hash table for LZW — much faster than Map
        const HASH_SIZE = 8192;
        const hashKeys = new Int32Array(HASH_SIZE).fill(-1);
        const hashVals = new Int32Array(HASH_SIZE);

        const subBlockData = [];
        let curByte = 0;
        let curBit = 0;

        const emitCode = (code) => {
            curByte |= (code << curBit);
            curBit += codeSize;
            while (curBit >= 8) {
                subBlockData.push(curByte & 0xFF);
                curByte >>>= 8;
                curBit -= 8;
            }
        };

        const resetTable = () => {
            hashKeys.fill(-1);
            codeSize = minCodeSize + 1;
            nextCode = eoiCode + 1;
        };

        // Emit clear code to start
        emitCode(clearCode);
        resetTable();

        if (indexedPixels.length === 0) {
            emitCode(eoiCode);
        } else {
            let w = indexedPixels[0];

            for (let i = 1; i < indexedPixels.length; i++) {
                const k = indexedPixels[i];
                const key = w * (clearCode + 2) + k;
                // Open-addressing lookup
                let slot = (key * 2654435761 >>> 0) & (HASH_SIZE - 1);
                let found = false;
                while (hashKeys[slot] !== -1) {
                    if (hashKeys[slot] === key) {
                        w = hashVals[slot];
                        found = true;
                        break;
                    }
                    slot = (slot + 1) & (HASH_SIZE - 1);
                }
                if (!found) {
                    emitCode(w);

                    if (nextCode < maxCodeValue) {
                        hashKeys[slot] = key;
                        hashVals[slot] = nextCode;
                        if (nextCode >= (1 << codeSize) && codeSize < 12) {
                            codeSize++;
                        }
                        nextCode++;
                    } else {
                        emitCode(clearCode);
                        resetTable();
                    }

                    w = k;
                }
            }

            emitCode(w);
            emitCode(eoiCode);
        }

        // Flush remaining bits
        if (curBit > 0) {
            subBlockData.push(curByte & 0xFF);
        }

        // Write sub-blocks (max 255 bytes each)
        this._grow(subBlockData.length + Math.ceil(subBlockData.length / 255) + 2);
        let pos = 0;
        while (pos < subBlockData.length) {
            const chunkSize = Math.min(255, subBlockData.length - pos);
            this.buf[this.bufPos++] = chunkSize;
            for (let j = 0; j < chunkSize; j++) {
                this.buf[this.bufPos++] = subBlockData[pos++];
            }
        }
        this.buf[this.bufPos++] = 0x00; // Block terminator
    }

    /* ─── High-level API ─── */
    begin() {
        this.bufSize = 1024 * 256;
        this.buf = new Uint8Array(this.bufSize);
        this.bufPos = 0;
        this.writeHeader();
        this.writeLogicalScreenDescriptor();
        this.writeNetscapeExtension();
        this.started = true;
    }

    addFrame(palette, indexedPixels, transparentIndex, delayCentiseconds) {
        if (!this.started) this.begin();

        // Calculate LCT parameters
        const minCodeSize = Math.max(2, Math.ceil(Math.log2(palette.length)));
        const tableSize = 1 << minCodeSize;
        const lctSizeField = minCodeSize - 1;

        // Pad palette to table size
        const paddedPalette = [...palette];
        while (paddedPalette.length < tableSize) {
            paddedPalette.push([0, 0, 0]);
        }

        this.writeGraphicControlExtension(delayCentiseconds, transparentIndex);
        this.writeImageDescriptor(lctSizeField);
        this.writeColorTable(paddedPalette, tableSize);
        this.writeLZWData(indexedPixels, minCodeSize);
    }

    /**
     * Add an optimized delta frame. Compares rgba to the previous frame,
     * only encodes changed pixels within the minimum bounding box.
     */
    addOptimizedFrame(rgba, palette, transparentIndex, delayCentiseconds) {
        if (!this.started) this.begin();
        const w = this.width, h = this.height;
        const numPixels = w * h;

        // Persistent color cache across frames (RGB key → palette index)
        if (!this._colorCache) this._colorCache = new Map();
        const cache = this._colorCache;

        // Map all pixels to palette indices with caching
        const indexed = new Uint8Array(numPixels);
        for (let i = 0; i < numPixels; i++) {
            const a = rgba[i * 4 + 3];
            if (a < 128) {
                indexed[i] = transparentIndex;
            } else {
                const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
                const key = (r << 16) | (g << 8) | b;
                let idx = cache.get(key);
                if (idx === undefined) {
                    idx = ColorQuantizer.nearestPaletteIndex(palette, r, g, b, transparentIndex);
                    cache.set(key, idx);
                }
                indexed[i] = idx;
            }
        }

        const minCodeSize = Math.max(2, Math.ceil(Math.log2(palette.length)));
        const tableSize = 1 << minCodeSize;
        const lctSizeField = minCodeSize - 1;
        const paddedPalette = [...palette];
        while (paddedPalette.length < tableSize) paddedPalette.push([0, 0, 0]);

        // Find bounding box of all OPAQUE pixels to avoid encoding empty borders
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (indexed[y * w + x] !== transparentIndex) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        // Disposal=2 (restore to background) — prevents ghosting
        this.writeGraphicControlExtension(delayCentiseconds, transparentIndex, 2);

        if (maxX < 0) {
            // Fully transparent frame — write tiny 1x1
            const tinyPixels = new Uint8Array([transparentIndex]);
            this.writeImageDescriptor(lctSizeField, 0, 0, 1, 1);
            this.writeColorTable(paddedPalette, tableSize);
            this.writeLZWData(tinyPixels, minCodeSize);
        } else {
            // Extract bounding box sub-image
            const bw = maxX - minX + 1;
            const bh = maxY - minY + 1;
            const subPixels = new Uint8Array(bw * bh);
            for (let y = 0; y < bh; y++) {
                for (let x = 0; x < bw; x++) {
                    subPixels[y * bw + x] = indexed[(minY + y) * w + (minX + x)];
                }
            }

            this.writeImageDescriptor(lctSizeField, minX, minY, bw, bh);
            this.writeColorTable(paddedPalette, tableSize);
            this.writeLZWData(subPixels, minCodeSize);
        }

        this.frameCount++;
    }

    finish() {
        this.writeByte(0x3B); // GIF trailer
        return this.buf.slice(0, this.bufPos);
    }
}

class ColorQuantizer {

    static quantize(rgba, maxColors) {
        const numPixels = rgba.length / 4;
        // Reserve one slot for transparent color
        const paletteSlots = Math.max(2, maxColors - 1);

        // Separate transparent vs opaque pixels
        const opaqueColors = [];
        const transparentMask = new Uint8Array(numPixels);

        for (let i = 0; i < numPixels; i++) {
            const a = rgba[i * 4 + 3];
            if (a < 128) {
                transparentMask[i] = 1;
            } else {
                opaqueColors.push(i);
            }
        }

        // Build palette from opaque pixels using median cut
        let palette;
        if (opaqueColors.length === 0) {
            palette = [[0, 0, 0]];
        } else {
            palette = ColorQuantizer.medianCut(rgba, opaqueColors, paletteSlots);
        }

        // Transparent color gets the last index
        const transparentIndex = palette.length;
        palette.push([0, 0, 0]); // transparent entry (color doesn't matter)

        // Map each pixel to nearest palette entry
        const indexedPixels = new Uint8Array(numPixels);
        for (let i = 0; i < numPixels; i++) {
            if (transparentMask[i]) {
                indexedPixels[i] = transparentIndex;
            } else {
                const r = rgba[i * 4];
                const g = rgba[i * 4 + 1];
                const b = rgba[i * 4 + 2];
                indexedPixels[i] = ColorQuantizer.nearestPaletteIndex(palette, r, g, b, transparentIndex);
            }
        }

        return { palette, indexedPixels, transparentIndex };
    }

    static medianCut(rgba, pixelIndices, targetColors) {
        // Build list of RGB values
        const colors = pixelIndices.map(i => [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);

        if (colors.length === 0) return [[0, 0, 0]];
        if (targetColors <= 1) {
            return [ColorQuantizer.averageColors(colors)];
        }

        let boxes = [colors];

        while (boxes.length < targetColors) {
            // Find the box with the greatest color range
            let bestIdx = -1;
            let bestRange = -1;

            for (let i = 0; i < boxes.length; i++) {
                if (boxes[i].length <= 1) continue;
                const range = ColorQuantizer.maxRange(boxes[i]);
                if (range > bestRange) {
                    bestRange = range;
                    bestIdx = i;
                }
            }

            if (bestIdx === -1) break;

            const box = boxes[bestIdx];
            const channel = ColorQuantizer.longestChannel(box);

            // Sort by the longest channel
            box.sort((a, b) => a[channel] - b[channel]);

            const mid = Math.floor(box.length / 2);
            const box1 = box.slice(0, mid);
            const box2 = box.slice(mid);

            boxes.splice(bestIdx, 1, box1, box2);
        }

        return boxes.map(box => ColorQuantizer.averageColors(box));
    }

    static maxRange(colors) {
        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
        for (const c of colors) {
            if (c[0] < rMin) rMin = c[0]; if (c[0] > rMax) rMax = c[0];
            if (c[1] < gMin) gMin = c[1]; if (c[1] > gMax) gMax = c[1];
            if (c[2] < bMin) bMin = c[2]; if (c[2] > bMax) bMax = c[2];
        }
        return Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
    }

    static longestChannel(colors) {
        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
        for (const c of colors) {
            if (c[0] < rMin) rMin = c[0]; if (c[0] > rMax) rMax = c[0];
            if (c[1] < gMin) gMin = c[1]; if (c[1] > gMax) gMax = c[1];
            if (c[2] < bMin) bMin = c[2]; if (c[2] > bMax) bMax = c[2];
        }
        const rRange = rMax - rMin, gRange = gMax - gMin, bRange = bMax - bMin;
        if (rRange >= gRange && rRange >= bRange) return 0;
        if (gRange >= bRange) return 1;
        return 2;
    }

    static averageColors(colors) {
        if (colors.length === 0) return [0, 0, 0];
        let rSum = 0, gSum = 0, bSum = 0;
        for (const c of colors) {
            rSum += c[0]; gSum += c[1]; bSum += c[2];
        }
        const n = colors.length;
        return [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)];
    }

    static nearestPaletteIndex(palette, r, g, b, excludeIndex) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < palette.length; i++) {
            if (i === excludeIndex) continue;
            const dr = r - palette[i][0];
            const dg = g - palette[i][1];
            const db = b - palette[i][2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
                if (dist === 0) return i; // exact match — skip rest
            }
        }
        return bestIdx;
    }
}

class GifDecoder {
    /**
     * Decode a GIF file into structured frame data.
     * @param {ArrayBuffer} arrayBuffer
     * @returns {{ width, height, frames: Array<{rgba, delay, left, top, width, height, disposalMethod}> }}
     */
    static decode(arrayBuffer) {
        const d = new Uint8Array(arrayBuffer);
        let p = 0;
        const u8 = () => d[p++];
        const u16 = () => { const v = d[p] | (d[p + 1] << 8); p += 2; return v; };

        // Header
        const sig = String.fromCharCode(d[0], d[1], d[2], d[3], d[4], d[5]);
        if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('Not a valid GIF file');
        p = 6;

        // Logical Screen Descriptor
        const width = u16();
        const height = u16();
        const packed = u8();
        const gctFlag = (packed >> 7) & 1;
        const gctSizePow = (packed & 7) + 1;
        const gctCount = 1 << gctSizePow;
        const bgIndex = u8();
        p++; // pixel aspect ratio

        // Global Color Table
        let gct = null;
        if (gctFlag) {
            gct = [];
            for (let i = 0; i < gctCount; i++) gct.push([u8(), u8(), u8()]);
        }

        const frames = [];
        let transIdx = -1, disposal = 0, delay = 100;

        while (p < d.length) {
            const block = u8();

            if (block === 0x21) { // Extension
                const label = u8();
                if (label === 0xF9) { // Graphic Control Extension
                    p++; // block size (always 4)
                    const gp = u8();
                    disposal = (gp >> 2) & 7;
                    const transFlag = gp & 1;
                    delay = u16() * 10; // centiseconds → ms
                    if (delay === 0) delay = 100;
                    transIdx = transFlag ? u8() : (p++, -1);
                    p++; // block terminator
                } else {
                    // Skip sub-blocks
                    while (true) { const sz = u8(); if (sz === 0) break; p += sz; }
                }
            } else if (block === 0x2C) { // Image Descriptor
                const left = u16(), top = u16(), imgW = u16(), imgH = u16();
                const imgPacked = u8();
                const lctFlag = (imgPacked >> 7) & 1;
                const interlaced = (imgPacked >> 6) & 1;
                const lctCount = lctFlag ? (1 << ((imgPacked & 7) + 1)) : 0;

                let ct = gct;
                if (lctFlag) {
                    ct = [];
                    for (let i = 0; i < lctCount; i++) ct.push([u8(), u8(), u8()]);
                }

                // LZW Decompress
                const minCodeSize = u8();
                const compressed = [];
                while (true) { const sz = u8(); if (sz === 0) break; for (let i = 0; i < sz; i++) compressed.push(d[p++]); }

                const indices = GifDecoder.lzwDecode(minCodeSize, compressed, imgW * imgH);

                // Build RGBA
                let rgba = new Uint8ClampedArray(imgW * imgH * 4);
                for (let i = 0; i < imgW * imgH; i++) {
                    const idx = i < indices.length ? indices[i] : 0;
                    if (idx === transIdx) {
                        // transparent
                    } else if (ct && idx < ct.length) {
                        rgba[i * 4] = ct[idx][0]; rgba[i * 4 + 1] = ct[idx][1]; rgba[i * 4 + 2] = ct[idx][2]; rgba[i * 4 + 3] = 255;
                    }
                }

                // Deinterlace
                if (interlaced) {
                    const de = new Uint8ClampedArray(imgW * imgH * 4);
                    const passes = [{ s: 0, d: 8 }, { s: 4, d: 8 }, { s: 2, d: 4 }, { s: 1, d: 2 }];
                    let row = 0;
                    for (const ps of passes) {
                        for (let y = ps.s; y < imgH; y += ps.d) {
                            de.set(rgba.subarray(row * imgW * 4, (row + 1) * imgW * 4), y * imgW * 4);
                            row++;
                        }
                    }
                    rgba = de;
                }

                frames.push({ left, top, width: imgW, height: imgH, rgba, delay, disposalMethod: disposal, transparentIndex: transIdx });
                transIdx = -1; disposal = 0;
            } else if (block === 0x3B) { break; } // Trailer
            else { break; } // Unknown
        }

        return { width, height, frames };
    }

    static lzwDecode(minCodeSize, compressed, pixelCount) {
        const clearCode = 1 << minCodeSize;
        const eoiCode = clearCode + 1;
        let codeSize = minCodeSize + 1;
        let nextCode = eoiCode + 1;

        // Code table: each entry is an array of pixel indices
        let table = [];
        const resetTable = () => {
            table = [];
            for (let i = 0; i < clearCode; i++) table.push([i]);
            table.push([]); // clear
            table.push([]); // eoi
            codeSize = minCodeSize + 1;
            nextCode = eoiCode + 1;
        };
        resetTable();

        // Bit reader
        let bytePos = 0, bitPos = 0;
        const readCode = () => {
            let code = 0;
            for (let i = 0; i < codeSize; i++) {
                if (bytePos >= compressed.length) return -1;
                if (compressed[bytePos] & (1 << bitPos)) code |= (1 << i);
                bitPos++;
                if (bitPos >= 8) { bitPos = 0; bytePos++; }
            }
            return code;
        };

        const output = [];
        let prev = -1;

        while (output.length < pixelCount) {
            const code = readCode();
            if (code === -1 || code === eoiCode) break;
            if (code === clearCode) { resetTable(); prev = -1; continue; }

            let entry;
            if (code < table.length) {
                entry = table[code];
            } else if (code === nextCode && prev >= 0) {
                entry = [...table[prev], table[prev][0]];
            } else break;

            for (let i = 0; i < entry.length; i++) output.push(entry[i]);

            if (prev >= 0 && nextCode < 4096) {
                table.push([...table[prev], entry[0]]);
                nextCode++;
                if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
            }
            prev = code;
        }
        return output.length > pixelCount ? output.slice(0, pixelCount) : output;
    }

    /**
     * Composite decoded frames into full RGBA canvases, respecting disposal methods.
     */
    static compositeFrames(gif) {
        const { width, height, frames } = gif;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');

        const result = [];
        let prevImageData = null;

        for (const frame of frames) {
            // Disposal: 2 = restore to bg (clear), 3 = restore to previous
            if (frame.disposalMethod === 2) {
                ctx.clearRect(0, 0, width, height);
            } else if (frame.disposalMethod === 3 && prevImageData) {
                ctx.putImageData(prevImageData, 0, 0);
            }

            // Save state before drawing if disposal 3
            if (frame.disposalMethod === 3) {
                prevImageData = ctx.getImageData(0, 0, width, height);
            }

            // Draw frame patch
            const patch = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height);
            ctx.putImageData(patch, frame.left, frame.top);

            // Capture composited frame
            const full = ctx.getImageData(0, 0, width, height);
            result.push({ rgba: new Uint8ClampedArray(full.data), delay: frame.delay });
        }
        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GifEncoder, ColorQuantizer, GifDecoder };
} else {
  window.GifEncoder = GifEncoder;
  window.ColorQuantizer = ColorQuantizer;
  window.GifDecoder = GifDecoder;
}
