import { expect, test } from '@playwright/test';

/**
 * K — The two Web Workers load and respond.
 *
 * Nothing exercised these before. Both are constructed from the exporter with
 * a URL resolved against `import.meta.url`, so separating the layers moved the
 * importer and the worker into different directories and changed both URLs. A
 * wrong URL there fails only at run time, in a path no other specification
 * reaches, which is exactly the shape of gap worth closing with a test rather
 * than with an assurance.
 *
 * The workers are constructed here rather than through the exporter's user
 * interface, because driving a real export needs a sprite, a clip and a
 * several second render. What is under test is that the modules load and
 * answer, which is what the URL change could break.
 *
 * The URL is computed the way the exporter computes it, relative to the
 * exporter's own emitted location, rather than written out as the path it
 * happens to resolve to. A literal path would pass even if the relative form
 * in the exporter were wrong, which would leave exactly the gap this file
 * exists to close.
 */

/** The base the exporter's `import.meta.url` supplies at run time. */
const EXPORTER_URL = '/js/entry-browser/model-exporter.mjs';

/** Resolved as `new URL('../platform-worker/<name>.mjs', import.meta.url)` does. */
const workerUrl = (name: string): string =>
    new URL(`../platform-worker/${name}.mjs`, new URL(EXPORTER_URL, 'http://localhost')).pathname;

test.describe('K — Web Workers', () => {
    test('the timer worker loads at its emitted path and ticks', async ({ page }) => {
        await page.goto('/');

        const ticked = await page.evaluate(async (url: string) => {
            const worker = new Worker(url, { type: 'module' });
            try {
                return await new Promise<string>((resolve, reject) => {
                    const timeout = setTimeout(() => { reject(new Error('no tick within 3s')); }, 3000);
                    worker.addEventListener('message', (event: MessageEvent<string>) => {
                        clearTimeout(timeout);
                        resolve(event.data);
                    });
                    worker.addEventListener('error', () => {
                        clearTimeout(timeout);
                        reject(new Error('worker failed to load'));
                    });
                    worker.postMessage({ cmd: 'start', ms: 20 });
                });
            } finally {
                worker.terminate();
            }
        }, workerUrl('timer-worker'));

        expect(ticked).toBe('tick');
    });

    test('the GIF worker loads at its emitted path and returns an encoded file', async ({ page }) => {
        await page.goto('/');

        const result = await page.evaluate(async (url: string) => {
            const worker = new Worker(url, { type: 'module' });
            try {
                return await new Promise<{ readonly bytes: number; readonly header: string }>((resolve, reject) => {
                    const timeout = setTimeout(() => { reject(new Error('no response within 5s')); }, 5000);
                    worker.addEventListener('message', (event: MessageEvent<{ type: string; data?: ArrayBuffer }>) => {
                        // Progress messages arrive first and are not the subject.
                        if (event.data.type !== 'done') return;
                        clearTimeout(timeout);
                        const data = event.data.data ?? new ArrayBuffer(0);
                        const bytes = new Uint8Array(data);
                        resolve({
                            bytes: bytes.length,
                            header: String.fromCharCode(...bytes.slice(0, 6)),
                        });
                    });
                    worker.addEventListener('error', () => {
                        clearTimeout(timeout);
                        reject(new Error('worker failed to load'));
                    });

                    // One 2x2 frame, two colours, no transparency.
                    worker.postMessage({
                        frames: [{
                            indexed: new Uint8Array([0, 1, 1, 0]),
                            minX: 0,
                            minY: 0,
                            maxX: 1,
                            maxY: 1,
                        }],
                        palette: [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }],
                        transparentIndex: -1,
                        delay: 10,
                        width: 2,
                        height: 2,
                        totalFrames: 1,
                    });
                });
            } finally {
                worker.terminate();
            }
        }, workerUrl('gif-worker'));

        expect(result.header).toBe('GIF89a');
        expect(result.bytes).toBeGreaterThan(20);
    });
});
