/**
 * What the settings panel does beyond holding values: testing connections.
 *
 * Moved out of the panel's markup handlers when the panel became a React
 * component, so the requests stay in the platform layer beside the adapter
 * they use and the component only renders the outcome. Each test returns a
 * status rather than writing one into the page.
 *
 * Behaviour is unchanged, including two details worth keeping visible. A
 * successful OpenAI or Google test saves the key, as the original did. And the
 * Google test calls Google directly with the key in the query string rather
 * than through the proxy, which is recorded as an open matter and deliberately
 * not changed here.
 */
import { browserHttp } from "./http.mts";
import { browserStore } from "./local-storage.mts";
import { isOk, readJson } from "../core/ports/http.mts";
import { comfyCall } from "../core/comfyui-run.mts";
import { PROVIDERS, VIDEO_PROVIDERS, saveCredential } from "../core/providers.mts";

export type StatusKind = "info" | "success" | "error";

export interface ConnectionStatus {
    readonly kind: StatusKind;
    readonly text: string;
    /** True while the test is still running, shown with a spinner. */
    readonly pending: boolean;
}

const status = (kind: StatusKind, text: string, pending = false): ConnectionStatus => ({ kind, text, pending });

/** What a test shows while it runs. */
export const TESTING: ConnectionStatus = status("info", "Testing connection...", true);
export const CHECKING: ConnectionStatus = status("info", "Checking…");
export const NEED_KEY: ConnectionStatus = status("error", "Enter an API key first");

/**
 * The `error.message` an API returned, if it sent one.
 *
 * The response body is untyped, so each step narrows rather than chaining
 * optional access through `any`, which type-checks but tells you nothing
 * about what actually arrived.
 */
const apiErrorMessage = (body: unknown): string | undefined => {
    if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
    const error: unknown = body.error;
    if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
    const message: unknown = error.message;
    return typeof message === "string" && message !== "" ? message : undefined;
};

const failure = (err: unknown): string => (err instanceof Error ? err.message : "unknown error");

/** Ask the chat endpoint for one word through the proxy. Saves the key on success. */
export async function testOpenAiKey(key: string): Promise<ConnectionStatus> {
    if (key === "") return NEED_KEY;
    try {
        const resp = await browserHttp("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: 'Say "connected" in one word.' }],
                max_tokens: 5,
            }),
        });
        if (isOk(resp)) {
            saveCredential(browserStore, PROVIDERS.openai, key);
            return status("success", "✅ Connection successful!");
        }
        const msg = apiErrorMessage(await readJson(resp)) ?? `HTTP ${resp.status.toString()}`;
        return status("error", `❌ ${msg}`);
    } catch (err) {
        return status("error", `❌ ${failure(err)}. Is the server running?`);
    }
}

/** List Google's models. Saves the key on success. */
export async function testGoogleKey(key: string): Promise<ConnectionStatus> {
    if (key === "") return NEED_KEY;
    try {
        const resp = await browserHttp(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (isOk(resp)) {
            saveCredential(browserStore, VIDEO_PROVIDERS.google, key);
            return status("success", "✅ Connection successful!");
        }
        const msg = apiErrorMessage(await readJson(resp)) ?? `HTTP ${resp.status.toString()}`;
        return status("error", `❌ ${msg}`);
    } catch (err) {
        return status("error", `❌ ${failure(err)}`);
    }
}

/** Ask ComfyUI for its system statistics, through the proxy's guard. */
export async function testComfy(url: string): Promise<ConnectionStatus> {
    try {
        const response = await comfyCall(browserHttp, url, "/system_stats", "GET");
        const payload = await readJson(response);
        return isOk(response)
            ? status("success", "ComfyUI is reachable")
            : status("error", apiErrorMessage(payload) ?? `Not reachable (${response.status.toString()})`);
    } catch (err) {
        return status("error", failure(err));
    }
}
