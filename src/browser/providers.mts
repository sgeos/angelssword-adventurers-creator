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
export type ProviderId = "openai" | "xai";

/** How a provider authenticates, which decides what the settings pane asks for. */
export type AuthKind = "bearer-key";

export interface Provider {
  readonly id: ProviderId;
  /** Shown in the provider selector. */
  readonly label: string;
  /** Proxy route on the local server, never the upstream address. */
  readonly imageRoute: string;
  /** localStorage key holding the user's credential. */
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
export const PROVIDER_ORDER: readonly ProviderId[] = ["openai", "xai"];

/**
 * Narrow an untrusted string to a provider identifier.
 *
 * Returns the narrowed value rather than a boolean, because the lint
 * configuration bans type predicates. The value arrives from a data attribute
 * or from localStorage, so neither source constrains it.
 */
export const asProviderId = (value: string): ProviderId | undefined =>
  value === "openai" || value === "xai" ? value : undefined;

/** The provider a stored preference names, falling back to OpenAI. */
export const providerFrom = (stored: string | null): Provider => {
  const id = stored === null ? undefined : asProviderId(stored);
  return PROVIDERS[id ?? "openai"];
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
export const hasCredential = (value: string | null): boolean =>
  value !== null && value.trim().length > 0;
