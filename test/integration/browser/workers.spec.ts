import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * K — The two Web Workers load and respond.
 *
 * Nothing exercised these before. Both are constructed from the exporter with
 * a URL, and a wrong URL fails only at run time, in a path no other
 * specification reaches, which is exactly the shape of gap worth closing with a
 * test rather than with an assurance.
 *
 * The workers are constructed here rather than through the exporter's user
 * interface, because driving a real export needs a sprite, a clip and a
 * several second render. What is under test is that the modules load and
 * answer at the address the application uses.
 *
 * THE ADDRESS IS READ FROM THE BUNDLE THE PAGE LOADS, never written out. The
 * build gives each worker a hashed file name and rewrites the exporter's
 * `new Worker(new URL(...))` to name it. So the specification fetches the
 * page, follows the scripts it loads, and takes the URL from the `Worker`
 * construction in them. A literal path would pass against a file the
 * application did not use, and one did: this file's previous version computed
 * the address from the old build's layout, and kept passing against a stale
 * copy of that layout after the application had stopped using it.
 */

/** Scripts the page loads, and the scripts they import, as text. Bounded. */
const loadedScripts = async (request: APIRequestContext): Promise<readonly string[]> => {
    const page = await (await request.get('/')).text();
    const queue = [...page.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1] ?? '');
    const seen = new Set<string>();
    const texts: string[] = [];
    // Each pass removes one entry and visits each address once, and the
    // bundle is a handful of files, so the bound is a guard, not a limit.
    while (queue.length > 0 && seen.size < 50) {
        const next = queue.shift() ?? '';
        if (next === '' || seen.has(next)) continue;
        seen.add(next);
        const text = await (await request.get(next)).text();
        texts.push(text);
        for (const m of text.matchAll(/["'`]\.?\/(?:assets\/)?([\w-]+\.js)["'`]/g)) queue.push(`/assets/${m[1] ?? ''}`);
    }
    return texts;
};

/** The URL a `new Worker(new URL(...))` in the loaded scripts names for a worker. */
const workerUrl = async (request: APIRequestContext, name: string): Promise<string> => {
    const pattern = new RegExp(`new Worker\\(new URL\\([\`'"](/assets/${name}-[\\w-]+\\.js)[\`'"]`);
    for (const text of await loadedScripts(request)) {
        const found = pattern.exec(text)?.[1];
        if (found !== undefined) return found;
    }
    throw new Error(`no Worker construction for ${name} in the scripts the page loads`);
};

test.describe('K — Web Workers', () => {
    test('the timer worker loads at the address the bundle uses and ticks', async ({ page, request }) => {
        const address = await workerUrl(request, 'timer-worker');
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
        }, address);

        expect(ticked).toBe('tick');
    });

    test('the GIF worker loads at the address the bundle uses and returns an encoded file', async ({ page, request }) => {
        const address = await workerUrl(request, 'gif-worker');
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
        }, address);

        expect(result.header).toBe('GIF89a');
        expect(result.bytes).toBeGreaterThan(20);
    });
});
