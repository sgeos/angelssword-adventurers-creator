/**
 * Image-generation providers.
 *
 * The application supported one provider, OpenAI, with its endpoint and key
 * handling written inline at each call site. Adding a second required a name
 * for the thing that varies, which is what this module supplies.
 *
 * Reimplemented from upstream pull request 1 by @Manya3084, which introduced
 * Grok support. The endpoint shapes and request payloads there were
 * established empirically against the live services and are the part worth
 * preserving. The structure is new, because that pull request predates the
 * TypeScript conversion by roughly fifteen thousand lines.
 */

/** Providers the sprite stage can generate through. */
import type { KeyValueStore } from "./ports/storage.mts";

export type ProviderId = "openai" | "xai" | "comfyui";

/** How a provider authenticates, which decides what the settings pane asks for. */
/**
 * How a provider authenticates.
 *
 * ComfyUI is `none`: it is the user's own machine, reached over the local
 * network, and holds no credential. The settings it needs are an address and
 * a model rather than a key.
 */
export type AuthKind = "bearer-key" | "none";

export interface Provider {
  readonly id: ProviderId;
  /** Shown in the provider selector. */
  readonly label: string;
  /** Proxy route on the local server, never the upstream address. */
  readonly imageRoute: string;
  /** Storage key holding the user's credential. */
  readonly storageKey: string;
  readonly authKind: AuthKind;
  /** Default model, overridable per request. */
  readonly defaultModel: string;
  /** Whether the provider accepts a reference image for sprite generation. */
  readonly supportsReferenceImages: boolean;
}

export const PROVIDERS: Readonly<Record<ProviderId, Provider>> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    imageRoute: "/api/generate",
    storageKey: "openai_api_key",
    authKind: "bearer-key",
    defaultModel: "gpt-image-1",
    supportsReferenceImages: true,
  },
  comfyui: {
    id: "comfyui",
    label: "ComfyUI",
    imageRoute: "/api/comfyui/proxy",
    // Not a credential. The address of the user's own instance.
    storageKey: "comfyui_url",
    authKind: "none",
    defaultModel: "flux1-dev-fp8.safetensors",
    supportsReferenceImages: true,
  },
  xai: {
    id: "xai",
    label: "Grok",
    imageRoute: "/api/xai/images/generations",
    storageKey: "xai_api_key",
    authKind: "bearer-key",
    // grok-2-image is the generally available image model. Pull request 1
    // cycled through grok-imagine variants with a fallback, having found
    // that availability varied by account.
    defaultModel: "grok-2-image",
    supportsReferenceImages: false,
  },
};

/** Every provider, in the order the selector shows them. */
export const PROVIDER_ORDER: readonly ProviderId[] = ["openai", "xai", "comfyui"];

/**
 * Narrow an untrusted string to a provider identifier.
 *
 * Returns the narrowed value rather than a boolean, because the lint
 * configuration bans type predicates. The value arrives from a data attribute
 * or from the store, so neither source constrains it.
 */
export const asProviderId = (value: string): ProviderId | undefined =>
  value === "openai" || value === "xai" || value === "comfyui" ? value : undefined;

/** The provider a stored preference names, falling back to OpenAI. */
export const providerFrom = (stored: string | undefined): Provider => {
  const id = stored === undefined ? undefined : asProviderId(stored);
  return PROVIDERS[id ?? "openai"];
};

/**
 * Storage key holding the sprite provider preference.
 *
 * It lived in the sprite stage until the storage capability existed. A key
 * under which the core writes is the core's own business; which store it is
 * written to is not.
 */
export const PROVIDER_PREFERENCE_KEY = "sprite_provider";

/** The sprite provider the user last chose, or the default. */
export const loadProvider = (store: KeyValueStore): Provider =>
  providerFrom(store.read(PROVIDER_PREFERENCE_KEY));

/** Remember the sprite provider the user chose. */
export const saveProvider = (store: KeyValueStore, id: ProviderId): void => {
  store.write(PROVIDER_PREFERENCE_KEY, id);
};

/** Request body for an image generation, in the shape each provider expects. */
export interface ImageRequest {
  readonly prompt: string;
  readonly n: number;
  readonly model: string;
  readonly size?: string;
}

/**
 * Build the generation request body for a provider.
 *
 * The providers differ in one respect that matters. OpenAI accepts a `size`,
 * and xAI rejects the request when one is present. Pull request 1 discovered
 * that the hard way, across two commits that removed the parameter.
 */
export const buildImageRequest = (
  provider: Provider,
  opts: { readonly prompt: string; readonly count: number; readonly size?: string; readonly model?: string },
): ImageRequest => {
  const base = {
    prompt: opts.prompt,
    n: Math.max(1, Math.trunc(opts.count)),
    model: opts.model ?? provider.defaultModel,
  };
  if (provider.id === "xai" || opts.size === undefined) return base;
  return { ...base, size: opts.size };
};

/** Whether a credential looks usable, without asserting it is valid. */
/**
 * The credential a stored value holds, or undefined when it holds none.
 *
 * This replaced a `hasCredential` predicate returning a boolean. The
 * predicate did not narrow, so its one caller had to re-check for absence
 * immediately afterwards, which is the shape the repository's narrowing
 * convention exists to prevent.
 *
 * The value is returned as stored rather than trimmed. Trimming here would
 * change what is sent upstream, and no caller trimmed before.
 *
 * One behaviour changed when this replaced two different checks. The sprite
 * stage rejected a blank credential and the video stage rejected only an
 * empty one, so a credential of spaces alone was refused in one place and
 * sent in the other. Both now refuse it.
 */
export const credentialFrom = (value: string | undefined): string | undefined =>
  value !== undefined && value.trim().length > 0 ? value : undefined;

/** The credential stored for a provider, or undefined when there is none. */
export const loadCredential = (
  store: KeyValueStore,
  provider: Pick<Provider, "storageKey">,
): string | undefined => credentialFrom(store.read(provider.storageKey));

/**
 * Store a credential, or remove it when the value is blank.
 *
 * Writing a blank string would leave a key present and useless, which reads
 * back as a configured provider with an unusable credential. Removing is what
 * the settings panel already did by hand at three sites.
 */
export const saveCredential = (
  store: KeyValueStore,
  provider: Pick<Provider, "storageKey">,
  value: string,
): void => {
  if (credentialFrom(value) === undefined) store.remove(provider.storageKey);
  else store.write(provider.storageKey, value);
};

/* ────────────────────────────────────────────────────────────────────────
 * Video providers.
 *
 * A different set from the image providers, so a separate table rather than
 * a shared one with unusable combinations. Google generates in a single
 * request. Grok returns an identifier and is polled, then the finished asset
 * is fetched through the proxy because it needs the credential attached.
 * ──────────────────────────────────────────────────────────────────────── */

export type VideoProviderId = "google" | "xai" | "comfyui";

export interface VideoProvider {
  readonly id: VideoProviderId;
  readonly label: string;
  /** Proxy route that starts a generation. */
  readonly generateRoute: string;
  /** Storage key holding the credential. */
  readonly storageKey: string;
  /**
   * Whether the provider answers immediately or must be polled. Google
   * returns the clip in its response; Grok returns an identifier.
   */
  readonly pollingRequired: boolean;
  /** Whether a reference image is mandatory rather than optional. */
  readonly requiresReferenceImage: boolean;
}

export const VIDEO_PROVIDERS: Readonly<Record<VideoProviderId, VideoProvider>> = {
  google: {
    id: "google",
    label: "Gemini",
    generateRoute: "/api/video/generate",
    storageKey: "google_api_key",
    pollingRequired: false,
    requiresReferenceImage: true,
  },
  xai: {
    id: "xai",
    label: "Grok",
    generateRoute: "/api/xai/videos/generations",
    storageKey: "xai_api_key",
    pollingRequired: true,
    requiresReferenceImage: true,
  },
  comfyui: {
    id: "comfyui",
    label: "ComfyUI",
    generateRoute: "/api/comfyui/proxy",
    // An address, not a credential. See the image provider of the same name.
    storageKey: "comfyui_url",
    pollingRequired: true,
    requiresReferenceImage: true,
  },
};

export const VIDEO_PROVIDER_ORDER: readonly VideoProviderId[] = ["google", "xai", "comfyui"];

/** Narrow an untrusted string to a video provider identifier. */
export const asVideoProviderId = (value: string): VideoProviderId | undefined =>
  value === "google" || value === "xai" || value === "comfyui" ? value : undefined;

/** The video provider a stored preference names, falling back to Gemini. */
export const videoProviderFrom = (stored: string | undefined): VideoProvider => {
  const id = stored === undefined ? undefined : asVideoProviderId(stored);
  return VIDEO_PROVIDERS[id ?? "google"];
};

/** Storage key holding the video provider preference. */
export const VIDEO_PROVIDER_PREFERENCE_KEY = "video_provider";

/** The video provider the user last chose, or the default. */
export const loadVideoProvider = (store: KeyValueStore): VideoProvider =>
  videoProviderFrom(store.read(VIDEO_PROVIDER_PREFERENCE_KEY));

/** Remember the video provider the user chose. */
export const saveVideoProvider = (store: KeyValueStore, id: VideoProviderId): void => {
  store.write(VIDEO_PROVIDER_PREFERENCE_KEY, id);
};
