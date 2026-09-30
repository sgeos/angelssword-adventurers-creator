import { expect, test, type Page } from '@playwright/test';
import { toggleSwitch } from './helpers';

/**
 * B — The settings panel, and the boundary it is trusted to hold.
 *
 * Settings live in `platform-browser/shell.mts`, which the handoff has called
 * the least examined module in the tree, so this reaches that as well as the
 * panel.
 *
 * The file previously covered two of the four credentials and nothing else.
 * What it did not cover at all is the property the documentation actually
 * promises: that a key entered here is held in the browser and sent only to
 * the service it belongs to, by way of the local proxy. That was a paragraph
 * of prose guarding the worst regression this application could have.
 *
 * Every key below is an obvious placeholder. Nothing that could be mistaken
 * for a real credential belongs in a repository.
 */

const FAKE = {
    openai: 'sk-not-a-real-key-browser-test',
    google: 'AIza-not-a-real-key-browser-test',
    xai: 'xai-not-a-real-key-browser-test',
} as const;

const openSettings = async (page: Page): Promise<void> => {
    await page.locator('.tab-btn[data-tab="tab-settings"]').click();
    await expect(page.locator('#tab-settings')).toHaveClass(/active/);
};

const stored = async (page: Page, key: string): Promise<string | null> =>
    page.evaluate((k) => localStorage.getItem(k), key);

test.describe('B — Credentials are kept', () => {
    test('every provider key the panel offers survives a reload', async ({ page }) => {
        await page.goto('/');
        await openSettings(page);

        await page.locator('#settingsOpenAIKey').fill(FAKE.openai);
        await page.locator('#settingsOpenAISave').click();
        await page.locator('#settingsGoogleKey').fill(FAKE.google);
        await page.locator('#settingsGoogleSave').click();
        await page.locator('#settingsXaiKey').fill(FAKE.xai);
        await page.locator('#settingsXaiSave').click();

        expect(await stored(page, 'openai_api_key')).toBe(FAKE.openai);
        expect(await stored(page, 'google_api_key')).toBe(FAKE.google);
        expect(await stored(page, 'xai_api_key')).toBe(FAKE.xai);

        await page.reload();
        await openSettings(page);
        await expect(page.locator('#settingsOpenAIKey')).toHaveValue(FAKE.openai);
        await expect(page.locator('#settingsGoogleKey')).toHaveValue(FAKE.google);
        await expect(page.locator('#settingsXaiKey')).toHaveValue(FAKE.xai);
    });

    /**
     * ComfyUI holds no credential. What can be missing is its address, so the
     * address is the thing that has to persist, and it is stored as one
     * structured value rather than beside the keys.
     */
    test('the ComfyUI address survives a reload', async ({ page }) => {
        await page.goto('/');
        await openSettings(page);

        await page.locator('#settingsComfyUrl').fill('http://127.0.0.1:8188');
        await page.locator('#settingsComfySave').click();

        const raw = await stored(page, 'comfyui_settings');
        expect(raw).toContain('8188');

        await page.reload();
        await openSettings(page);
        await expect(page.locator('#settingsComfyUrl')).toHaveValue('http://127.0.0.1:8188');
    });

    /**
     * A key field is a password field so a shared screen does not leak it, and
     * the reveal has to work or the field cannot be checked by its owner.
     */
    test('a key can be revealed and hidden again', async ({ page }) => {
        await page.goto('/');
        await openSettings(page);

        const field = page.locator('#settingsOpenAIKey');
        await expect(field).toHaveAttribute('type', 'password');

        await page.locator('#settingsOpenAIToggle').click();
        await expect(field).toHaveAttribute('type', 'text');

        await page.locator('#settingsOpenAIToggle').click();
        await expect(field).toHaveAttribute('type', 'password');
    });
});

test.describe('B — Credentials do not leave on being saved', () => {
    /**
     * THE TRUST BOUNDARY. Saving a key is a local act: it writes to storage
     * and nothing else. If a save ever began reporting somewhere, this is the
     * test that should notice.
     *
     * The assertion is about observed requests, not about intent, because that
     * is what is checkable. Every request the page makes is recorded, and the
     * page's own assets are excluded by origin so that a real outbound call is
     * not lost among them.
     */
    test('saving every key reaches neither a proxy route nor another origin', async ({ page }) => {
        const offSite: string[] = [];
        const proxied: string[] = [];
        let recording = false;
        page.on('request', (request) => {
            if (!recording) return;
            const url = request.url();
            if (url.startsWith('data:') || url.startsWith('blob:')) return;
            if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
                offSite.push(url);
                return;
            }
            // The proxy is the only way out of this application, so a save
            // touching one of its routes is the failure worth catching.
            if (new URL(url).pathname.startsWith('/api/')) proxied.push(url);
        });

        await page.goto('/');
        await openSettings(page);

        // Recording starts only once the page is up, loading it fetching its
        // own assets and, as it happens, webfonts from a third party; counting
        // those would say nothing about what a save does. The font requests are
        // a finding in their own right and are asserted separately below.
        //
        // A save is also not request-free on the page's own origin: the success
        // toast plays a notification sound, which fetches an audio file from
        // `assets/`. That is why this asserts where requests go rather than
        // that none happen, an assertion of the latter kind having failed here
        // on the sound rather than on anything that matters.
        recording = true;

        await page.locator('#settingsOpenAIKey').fill(FAKE.openai);
        await page.locator('#settingsOpenAISave').click();
        await page.locator('#settingsGoogleKey').fill(FAKE.google);
        await page.locator('#settingsGoogleSave').click();
        await page.locator('#settingsXaiKey').fill(FAKE.xai);
        await page.locator('#settingsXaiSave').click();

        // NOT VACUOUS. If the saves had not happened, the request assertion
        // below would pass while establishing nothing at all.
        expect(await stored(page, 'openai_api_key')).toBe(FAKE.openai);
        expect(await stored(page, 'google_api_key')).toBe(FAKE.google);
        expect(await stored(page, 'xai_api_key')).toBe(FAKE.xai);

        expect(offSite).toEqual([]);
        expect(proxied).toEqual([]);
    });

    /**
     * PROOF THAT THE CHECK ABOVE IS NOT VACUOUS.
     *
     * That test passes by observing no request of two kinds. A classifier that
     * silently matched nothing would pass it just as well. The off-site half is
     * already demonstrated by the webfont assertions, which do observe external
     * requests; this demonstrates the proxy half, by making a proxy call on
     * purpose and requiring that the same rule notices it.
     */
    test('the rule used above does notice a proxy call', async ({ page }) => {
        const proxied: string[] = [];
        page.on('request', (request) => {
            const url = request.url();
            if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) return;
            if (new URL(url).pathname.startsWith('/api/')) proxied.push(url);
        });

        await page.goto('/');
        await page.evaluate(async () => {
            // The route answers 401 without a key, which is irrelevant here:
            // what matters is that the request was seen.
            try {
                await fetch('/api/generate', { method: 'POST' });
            } catch {
                // A refusal is still a request.
            }
        });

        expect(proxied.length).toBeGreaterThan(0);
        expect(proxied.some((u) => u.includes('/api/generate'))).toBe(true);
    });

    /**
     * The other half of the same property: a key is never placed in a location
     * a server or an intermediary would see. A query string is the failure
     * that has happened most often in real systems, logs and histories keeping
     * it long after the request.
     */
    test('no key reaches a request path or query string', async ({ page }) => {
        const urls: string[] = [];
        page.on('request', (request) => { urls.push(request.url()); });

        await page.goto('/');
        await openSettings(page);
        await page.locator('#settingsOpenAIKey').fill(FAKE.openai);
        await page.locator('#settingsOpenAISave').click();
        expect(await stored(page, 'openai_api_key')).toBe(FAKE.openai);

        for (const url of urls) {
            expect(url).not.toContain(FAKE.openai);
            expect(url).not.toContain('sk-');
        }
    });
});

test.describe('B — Non-credential preferences', () => {
    test('the notification sound choice persists', async ({ page }) => {
        await page.goto('/');
        await openSettings(page);

        // The switch hides its checkbox, so the visible span is what flips it.
        const chosen = await toggleSwitch(page, 'settingsSoundEnabled');

        await page.reload();
        await openSettings(page);
        expect(await page.locator('#settingsSoundEnabled').isChecked()).toBe(chosen);
    });
});

/**
 * B — What the page fetches from elsewhere, which nothing had checked.
 *
 * Found by the save test above, which recorded requests from page load before
 * it was narrowed to the save. The page requests a stylesheet and font files
 * from Google on every load.
 *
 * That contradicts the README, which says the later steps work fully offline
 * and that the internet is needed only for generation. The application does
 * keep working, the fonts falling back, so the claim holds as a statement
 * about function and fails as a statement about traffic. Every load also tells
 * a third party the user's address, on a tool whose whole proxy arrangement
 * exists so that keys and prompts reach only the service they are for.
 *
 * Characterised, not fixed: self-hosting the faces is a change to what the
 * repository, the container and the binary all carry. Recorded in
 * docs/decisions/OPEN.md. These assertions are written to fail when it is
 * fixed, which is the point of pinning it.
 */
test.describe('B — Third party requests on load', () => {
    test('requests webfonts from a third party, despite the offline claim', async ({ page }) => {
        const offSite: string[] = [];
        page.on('request', (request) => {
            const url = request.url();
            if (url.startsWith('data:') || url.startsWith('blob:')) return;
            if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return;
            offSite.push(url);
        });

        await page.goto('/');
        await expect(page.locator('#tab-sprite-prep')).toHaveClass(/active/);

        expect(offSite.length).toBeGreaterThan(0);
        expect(offSite.some((u) => u.includes('fonts.googleapis.com'))).toBe(true);
    });

    /**
     * The other half of what matters: nothing the user typed is in any of it.
     * A third party learning that this tool is in use is a different order of
     * problem from a third party learning a key.
     */
    test('sends nothing the user entered to the third party', async ({ page }) => {
        const offSite: string[] = [];
        page.on('request', (request) => {
            const url = request.url();
            if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
                offSite.push(url);
            }
        });

        await page.goto('/');
        await openSettings(page);
        await page.locator('#settingsOpenAIKey').fill(FAKE.openai);
        await page.locator('#settingsOpenAISave').click();
        expect(await stored(page, 'openai_api_key')).toBe(FAKE.openai);
        await page.reload();

        for (const url of offSite) {
            expect(url).not.toContain(FAKE.openai);
            expect(url).not.toContain('sk-');
        }
    });
});
