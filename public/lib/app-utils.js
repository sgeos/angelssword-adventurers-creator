/**
 * Shared app utilities
 * Extracted from app.js — characterization seam (no behavior changes).
 */

function debounce(fn, ms) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

function base64ToBlob(base64, mimeType = 'image/png') {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const bytes = atob(raw);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function colorName(hex) {
    const names = {
        '#00FF00': 'Green', '#FF00FF': 'Magenta', '#0000FF': 'Blue',
        '#FFFF00': 'Yellow', '#00FFFF': 'Cyan'
    };
    return names[hex.toUpperCase()] || hex;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { debounce, base64ToBlob, blobToBase64, hexToRgb, colorName };
} else {
    window.debounce = debounce;
    window.base64ToBlob = base64ToBlob;
    window.blobToBase64 = blobToBase64;
    window.hexToRgb = hexToRgb;
    window.colorName = colorName;
}
