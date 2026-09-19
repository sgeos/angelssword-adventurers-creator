/**
 * ComfyUI workflow construction and response reading.
 *
 * Reimplemented from upstream pull request 1 by @Manya3084. The node graphs
 * below are the substance of that work. Their topology, and the settings that
 * make Flux behave, were established there against a running ComfyUI over
 * many corrective commits, and that is knowledge worth preserving.
 *
 * It is pure here, and therefore tested. Upstream built these graphs inline
 * inside a generation routine, where nothing could reach them.
 *
 * ComfyUI takes a prompt as a map of node identifier to node. A node names a
 * class and its inputs, and an input referencing another node is written as
 * the pair [nodeId, outputIndex]. Nothing here talks to ComfyUI; the caller
 * posts the result through the local proxy.
 */

/** One node in a ComfyUI prompt graph. */
export interface ComfyNode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

/** A complete prompt graph, keyed by node identifier. */
export type ComfyWorkflow = Readonly<Record<string, ComfyNode>>;

/** A graph together with the node whose output the caller collects. */
export interface BuiltWorkflow {
  readonly workflow: ComfyWorkflow;
  readonly saveNodeId: string;
}

/** A LoRA to apply, with the strength it applies at. */
export interface LoraSlot {
  readonly name: string;
  readonly strength: number;
}

/** Sprite dimensions the pipeline expects downstream. */
export const SPRITE_WIDTH = 1280;
export const SPRITE_HEIGHT = 720;

/**
 * Allocates sequential node identifiers.
 *
 * ComfyUI accepts any string key. Sequential integers keep a graph readable
 * when it is dumped for debugging, which is most of what one does with it.
 */
class NodeIds {
  private next = 1;
  take(): string {
    const id = String(this.next);
    this.next += 1;
    return id;
  }
}

export interface FluxOptions {
  readonly unetName: string;
  readonly clipName: string;
  readonly t5Name: string;
  readonly vaeName: string;
  readonly positiveText: string;
  readonly seed: number;
  readonly steps: number;
  readonly guidance: number;
  readonly weightDtype: string;
  readonly loras?: readonly LoraSlot[];
  /** A reference image already uploaded to ComfyUI, enabling PuLID. */
  readonly referenceFilename?: string;
  readonly pulidFile?: string;
  readonly pulidWeight?: number;
  readonly insightFaceProvider?: string;
}

/**
 * The Flux graph.
 *
 * Three settings are not free choices and were arrived at empirically.
 * Classifier-free guidance is fixed at 1, because Flux carries its guidance
 * through a FluxGuidance node instead. The sampler and scheduler pair is
 * euler with simple. The latent is EmptySD3LatentImage rather than the
 * ordinary empty latent, which Flux requires.
 */
export const buildFluxWorkflow = (opts: FluxOptions): BuiltWorkflow => {
  const ids = new NodeIds();
  const wf: Record<string, ComfyNode> = {};

  const unetId = ids.take();
  wf[unetId] = {
    class_type: "UNETLoader",
    inputs: { unet_name: opts.unetName, weight_dtype: opts.weightDtype },
  };

  const clipId = ids.take();
  wf[clipId] = {
    class_type: "DualCLIPLoader",
    inputs: { clip_name1: opts.clipName, clip_name2: opts.t5Name, type: "flux" },
  };

  const vaeId = ids.take();
  wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: opts.vaeName } };

  // LoRAs chain model-only on Flux, each taking the previous one's output.
  let modelRef: readonly [string, number] = [unetId, 0];
  for (const lora of opts.loras ?? []) {
    const id = ids.take();
    wf[id] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { lora_name: lora.name, strength_model: lora.strength, model: modelRef },
    };
    modelRef = [id, 0];
  }

  // PuLID carries a face from the reference image into the result. It only
  // applies when a reference has been uploaded.
  if (opts.referenceFilename !== undefined && opts.referenceFilename !== "") {
    const loadId = ids.take();
    wf[loadId] = { class_type: "LoadImage", inputs: { image: opts.referenceFilename } };
    const pulidId = ids.take();
    wf[pulidId] = {
      class_type: "PulidFluxModelLoader",
      inputs: { pulid_file: opts.pulidFile ?? "pulid_flux_v0.9.1.safetensors" },
    };
    const evaId = ids.take();
    wf[evaId] = { class_type: "PulidFluxEvaClipLoader", inputs: {} };
    const faceId = ids.take();
    wf[faceId] = {
      class_type: "PulidFluxInsightFaceLoader",
      inputs: { provider: opts.insightFaceProvider ?? "CPU" },
    };
    const applyId = ids.take();
    wf[applyId] = {
      class_type: "ApplyPulidFlux",
      inputs: {
        model: modelRef,
        pulid_flux: [pulidId, 0],
        eva_clip: [evaId, 0],
        face_analysis: [faceId, 0],
        image: [loadId, 0],
        weight: opts.pulidWeight ?? 0.9,
        start_at: 0,
        end_at: 1,
      },
    };
    modelRef = [applyId, 0];
  }

  const posId = ids.take();
  wf[posId] = {
    class_type: "CLIPTextEncode",
    inputs: { text: opts.positiveText, clip: [clipId, 0] },
  };

  // Flux takes an empty negative rather than a worded one.
  const negId = ids.take();
  wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: "", clip: [clipId, 0] } };

  const guideId = ids.take();
  wf[guideId] = {
    class_type: "FluxGuidance",
    inputs: { guidance: opts.guidance, conditioning: [posId, 0] },
  };

  const latentId = ids.take();
  wf[latentId] = {
    class_type: "EmptySD3LatentImage",
    inputs: { width: SPRITE_WIDTH, height: SPRITE_HEIGHT, batch_size: 1 },
  };

  const sampleId = ids.take();
  wf[sampleId] = {
    class_type: "KSampler",
    inputs: {
      seed: opts.seed,
      steps: opts.steps,
      // Fixed at 1. Flux guides through FluxGuidance, and a higher value here
      // produces the burnt output upstream spent commits chasing.
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
      model: modelRef,
      positive: [guideId, 0],
      negative: [negId, 0],
      latent_image: [latentId, 0],
    },
  };

  const decodeId = ids.take();
  wf[decodeId] = {
    class_type: "VAEDecode",
    inputs: { samples: [sampleId, 0], vae: [vaeId, 0] },
  };

  const saveId = ids.take();
  wf[saveId] = {
    class_type: "SaveImage",
    inputs: { filename_prefix: "as_adventurer", images: [decodeId, 0] },
  };

  return { workflow: wf, saveNodeId: saveId };
};

export interface SdxlOptions {
  readonly checkpoint: string;
  readonly positiveText: string;
  readonly negativeText: string;
  readonly seed: number;
  readonly steps: number;
  readonly cfg: number;
  readonly loras?: readonly LoraSlot[];
  readonly referenceFilename?: string;
  readonly ipAdapterFile?: string;
  readonly clipVisionFile?: string;
  readonly ipWeight?: number;
}

/**
 * The SDXL graph, used for Pony and similar checkpoints.
 *
 * Differs from Flux in three ways that matter. The checkpoint loader supplies
 * model, CLIP and VAE together, so LoRAs chain both model and CLIP. A worded
 * negative prompt is used. Character likeness comes from IP-Adapter rather
 * than PuLID.
 */
export const buildSdxlWorkflow = (opts: SdxlOptions): BuiltWorkflow => {
  const ids = new NodeIds();
  const wf: Record<string, ComfyNode> = {};

  const ckptId = ids.take();
  wf[ckptId] = {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: opts.checkpoint },
  };

  let modelRef: readonly [string, number] = [ckptId, 0];
  let clipRef: readonly [string, number] = [ckptId, 1];
  const vaeRef: readonly [string, number] = [ckptId, 2];

  for (const lora of opts.loras ?? []) {
    const id = ids.take();
    wf[id] = {
      class_type: "LoraLoader",
      inputs: {
        lora_name: lora.name,
        strength_model: lora.strength,
        strength_clip: lora.strength,
        model: modelRef,
        clip: clipRef,
      },
    };
    modelRef = [id, 0];
    clipRef = [id, 1];
  }

  if (opts.referenceFilename !== undefined && opts.referenceFilename !== "") {
    const loadId = ids.take();
    wf[loadId] = { class_type: "LoadImage", inputs: { image: opts.referenceFilename } };
    const ipModelId = ids.take();
    wf[ipModelId] = {
      class_type: "IPAdapterModelLoader",
      inputs: { ipadapter_file: opts.ipAdapterFile ?? "ip-adapter-plus_sdxl_vit-h.safetensors" },
    };
    const clipVisId = ids.take();
    wf[clipVisId] = {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: opts.clipVisionFile ?? "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors" },
    };
    const applyId = ids.take();
    wf[applyId] = {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: modelRef,
        ipadapter: [ipModelId, 0],
        image: [loadId, 0],
        clip_vision: [clipVisId, 0],
        weight: opts.ipWeight ?? 0.8,
        weight_type: "linear",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
      },
    };
    modelRef = [applyId, 0];
  }

  const posId = ids.take();
  wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: opts.positiveText, clip: clipRef } };
  const negId = ids.take();
  wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: opts.negativeText, clip: clipRef } };

  const latentId = ids.take();
  wf[latentId] = {
    class_type: "EmptyLatentImage",
    inputs: { width: SPRITE_WIDTH, height: SPRITE_HEIGHT, batch_size: 1 },
  };

  const sampleId = ids.take();
  wf[sampleId] = {
    class_type: "KSampler",
    inputs: {
      seed: opts.seed,
      steps: opts.steps,
      cfg: opts.cfg,
      sampler_name: "dpmpp_2m",
      scheduler: "karras",
      denoise: 1,
      model: modelRef,
      positive: [posId, 0],
      negative: [negId, 0],
      latent_image: [latentId, 0],
    },
  };

  const decodeId = ids.take();
  wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [sampleId, 0], vae: vaeRef } };
  const saveId = ids.take();
  wf[saveId] = {
    class_type: "SaveImage",
    inputs: { filename_prefix: "as_adventurer", images: [decodeId, 0] },
  };

  return { workflow: wf, saveNodeId: saveId };
};

/** An image ComfyUI has produced, as its history reports it. */
export interface ComfyImageRef {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : undefined;

/** The prompt identifier a queue submission returns. */
export const extractPromptId = (body: unknown): string | undefined => {
  const top = record(body);
  const value = top?.["prompt_id"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * Images a history entry reports for a given save node.
 *
 * The response nests prompt id, then outputs, then node id, then images. An
 * absent path yields an empty list rather than throwing, because a history
 * poll runs before the work finishes and that is not an error.
 */
export const extractHistoryImages = (
  body: unknown,
  promptId: string,
  saveNodeId: string,
): readonly ComfyImageRef[] => {
  const entry = record(record(body)?.[promptId]);
  const outputs = record(entry?.["outputs"]);
  const node = record(outputs?.[saveNodeId]);
  const images = node?.["images"];
  if (!Array.isArray(images)) return [];

  const result: ComfyImageRef[] = [];
  for (const raw of images) {
    const img = record(raw);
    if (img === undefined) continue;
    const filename = img["filename"];
    if (typeof filename !== "string" || filename === "") continue;
    const subfolder = img["subfolder"];
    const type = img["type"];
    result.push({
      filename,
      subfolder: typeof subfolder === "string" ? subfolder : "",
      type: typeof type === "string" ? type : "output",
    });
  }
  return result;
};

/** Query string for retrieving one image through the view endpoint. */
export const viewQuery = (image: ComfyImageRef): string =>
  new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
  }).toString();

/* ────────────────────────────────────────────────────────────────────────
 * Settings.
 *
 * Kept here rather than in the settings pane so that defaults, validation
 * and the storage round trip are testable. Upstream held these in the
 * injected panel and read them back out of the DOM at generation time.
 * ──────────────────────────────────────────────────────────────────────── */

export type WorkflowKind = "flux" | "sdxl";

export interface ComfySettings {
  readonly url: string;
  readonly workflow: WorkflowKind;
  readonly model: string;
  readonly clipName: string;
  readonly t5Name: string;
  readonly vaeName: string;
  readonly steps: number;
  readonly guidance: number;
}

/** Where the settings live. One key, one object. */
export const COMFY_SETTINGS_KEY = "comfyui_settings";

/**
 * Defaults chosen to work on a typical installation.
 *
 * The Flux model names are the on-disk names upstream converged on after
 * several commits correcting them, having first used names that did not
 * match what ComfyUI actually ships.
 */
export const COMFY_DEFAULTS: ComfySettings = {
  url: "http://127.0.0.1:8188",
  workflow: "flux",
  model: "flux1-dev-fp8.safetensors",
  clipName: "clip_l.safetensors",
  t5Name: "t5xxl_fp8_e4m3fn.safetensors",
  vaeName: "ae.safetensors",
  steps: 24,
  guidance: 3.5,
};

/** Narrow an untrusted string to a workflow kind. */
export const asWorkflowKind = (value: string): WorkflowKind | undefined =>
  value === "flux" || value === "sdxl" ? value : undefined;

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;

const asNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

/**
 * Read settings from a stored string, filling anything absent or unusable
 * from the defaults. localStorage is writable by anything on the origin, so
 * nothing read back is trusted.
 */
export const parseComfySettings = (raw: string | null): ComfySettings => {
  if (raw === null || raw === "") return COMFY_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return COMFY_DEFAULTS;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return COMFY_DEFAULTS;
  }
  const source: Record<string, unknown> = { ...parsed };
  const workflow = typeof source["workflow"] === "string"
    ? asWorkflowKind(source["workflow"])
    : undefined;

  return {
    url: asString(source["url"], COMFY_DEFAULTS.url),
    workflow: workflow ?? COMFY_DEFAULTS.workflow,
    model: asString(source["model"], COMFY_DEFAULTS.model),
    clipName: asString(source["clipName"], COMFY_DEFAULTS.clipName),
    t5Name: asString(source["t5Name"], COMFY_DEFAULTS.t5Name),
    vaeName: asString(source["vaeName"], COMFY_DEFAULTS.vaeName),
    steps: Math.trunc(asNumber(source["steps"], COMFY_DEFAULTS.steps, 1, 150)),
    guidance: asNumber(source["guidance"], COMFY_DEFAULTS.guidance, 0, 30),
  };
};

/**
 * Build the graph these settings describe, for a prompt and optional
 * reference image. The caller has already uploaded the reference, if any.
 */
export const buildWorkflowFor = (
  settings: ComfySettings,
  opts: {
    readonly positiveText: string;
    readonly negativeText?: string;
    readonly seed: number;
    readonly referenceFilename?: string;
    readonly loras?: readonly LoraSlot[];
  },
): BuiltWorkflow => {
  if (settings.workflow === "flux") {
    const flux: FluxOptions = {
      unetName: settings.model,
      clipName: settings.clipName,
      t5Name: settings.t5Name,
      vaeName: settings.vaeName,
      positiveText: opts.positiveText,
      seed: opts.seed,
      steps: settings.steps,
      guidance: settings.guidance,
      weightDtype: settings.model.includes("fp8") ? "fp8_e4m3fn" : "default",
      ...(opts.loras === undefined ? {} : { loras: opts.loras }),
      ...(opts.referenceFilename === undefined ? {} : { referenceFilename: opts.referenceFilename }),
    };
    return buildFluxWorkflow(flux);
  }
  const sdxl: SdxlOptions = {
    checkpoint: settings.model,
    positiveText: opts.positiveText,
    negativeText: opts.negativeText ?? "",
    seed: opts.seed,
    steps: settings.steps,
    cfg: settings.guidance,
    ...(opts.loras === undefined ? {} : { loras: opts.loras }),
    ...(opts.referenceFilename === undefined ? {} : { referenceFilename: opts.referenceFilename }),
  };
  return buildSdxlWorkflow(sdxl);
};

/* ────────────────────────────────────────────────────────────────────────
 * Wan image-to-video.
 *
 * A second ComfyUI path, producing a clip from a still. Reimplemented from
 * upstream pull request 1, where the graph and the framing were settled over
 * several commits against a running instance.
 * ──────────────────────────────────────────────────────────────────────── */

export interface WanSettings {
  readonly unet: string;
  readonly vae: string;
  readonly textEncoder: string;
  readonly clipVision: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly steps: number;
  readonly cfg: number;
  /** GGUF quantised weights load through a different node. */
  readonly useGguf: boolean;
}

export const WAN_SETTINGS_KEY = "comfyui_wan_settings";

/** On-disk names from a standard Wan 2.1 install at 480p. */
export const WAN_DEFAULTS: WanSettings = {
  unet: "Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors",
  vae: "wan_2.1_vae.safetensors",
  textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  clipVision: "clip_vision_h.safetensors",
  width: 832,
  height: 480,
  frames: 97,
  steps: 20,
  cfg: 5,
  useGguf: false,
};

/**
 * The negative prompt.
 *
 * Longer than it looks necessary, and each clause earns its place. The
 * framing terms exist because Wan will otherwise reframe a full-body still
 * into a bust shot, cropping the head or feet that the pipeline needs. The
 * camera terms hold the shot still, since the output is a looping idle
 * animation rather than a scene.
 */
export const WAN_NEGATIVE_PROMPT: string =
  "blurry, low quality, distorted face, extra limbs, text, watermark, "
  + "camera move, zoom, pan, cropped head, cropped feet, head cut off, "
  + "feet cut off, close-up, upper body only, out of frame";

export const parseWanSettings = (raw: string | null): WanSettings => {
  if (raw === null || raw === "") return WAN_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return WAN_DEFAULTS;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return WAN_DEFAULTS;
  const s: Record<string, unknown> = { ...parsed };
  return {
    unet: asString(s["unet"], WAN_DEFAULTS.unet),
    vae: asString(s["vae"], WAN_DEFAULTS.vae),
    textEncoder: asString(s["textEncoder"], WAN_DEFAULTS.textEncoder),
    clipVision: asString(s["clipVision"], WAN_DEFAULTS.clipVision),
    width: Math.trunc(asNumber(s["width"], WAN_DEFAULTS.width, 64, 2048)),
    height: Math.trunc(asNumber(s["height"], WAN_DEFAULTS.height, 64, 2048)),
    frames: Math.trunc(asNumber(s["frames"], WAN_DEFAULTS.frames, 1, 600)),
    steps: Math.trunc(asNumber(s["steps"], WAN_DEFAULTS.steps, 1, 150)),
    cfg: asNumber(s["cfg"], WAN_DEFAULTS.cfg, 0, 30),
    useGguf: s["useGguf"] === true,
  };
};

/**
 * The Wan graph.
 *
 * Two details are not obvious and were arrived at empirically.
 *
 * WanImageToVideo yields three outputs, being a conditioned positive, a
 * conditioned negative, and the starting latent. The sampler takes all three
 * from it rather than from the text encoders directly, which is what
 * distinguishes an image-to-video graph from a text-to-video one.
 *
 * CLIPVisionEncode is given `crop: 'none'`. The frame handed in has already
 * been letterboxed, and letting the encoder centre-crop it again reintroduces
 * exactly the head and feet loss the letterboxing prevents.
 */
export const buildWanI2VWorkflow = (
  settings: WanSettings,
  opts: { readonly imageName: string; readonly positiveText: string; readonly seed: number },
): BuiltWorkflow => {
  const ids = new NodeIds();
  const wf: Record<string, ComfyNode> = {};

  const loadId = ids.take();
  wf[loadId] = { class_type: "LoadImage", inputs: { image: opts.imageName } };

  const visLoadId = ids.take();
  wf[visLoadId] = { class_type: "CLIPVisionLoader", inputs: { clip_name: settings.clipVision } };

  const visEncId = ids.take();
  wf[visEncId] = {
    class_type: "CLIPVisionEncode",
    inputs: { clip_vision: [visLoadId, 0], image: [loadId, 0], crop: "none" },
  };

  const clipId = ids.take();
  wf[clipId] = {
    class_type: "CLIPLoader",
    inputs: { clip_name: settings.textEncoder, type: "wan", device: "default" },
  };

  const posId = ids.take();
  wf[posId] = { class_type: "CLIPTextEncode", inputs: { text: opts.positiveText, clip: [clipId, 0] } };
  const negId = ids.take();
  wf[negId] = { class_type: "CLIPTextEncode", inputs: { text: WAN_NEGATIVE_PROMPT, clip: [clipId, 0] } };

  const unetId = ids.take();
  wf[unetId] = settings.useGguf
    ? { class_type: "UnetLoaderGGUF", inputs: { unet_name: settings.unet } }
    : { class_type: "UNETLoader", inputs: { unet_name: settings.unet, weight_dtype: "default" } };

  const vaeId = ids.take();
  wf[vaeId] = { class_type: "VAELoader", inputs: { vae_name: settings.vae } };

  const wanId = ids.take();
  wf[wanId] = {
    class_type: "WanImageToVideo",
    inputs: {
      positive: [posId, 0],
      negative: [negId, 0],
      vae: [vaeId, 0],
      clip_vision_output: [visEncId, 0],
      start_image: [loadId, 0],
      width: settings.width,
      height: settings.height,
      length: settings.frames,
      batch_size: 1,
    },
  };

  const sampleId = ids.take();
  wf[sampleId] = {
    class_type: "KSampler",
    inputs: {
      seed: opts.seed,
      steps: settings.steps,
      cfg: settings.cfg,
      sampler_name: "uni_pc",
      scheduler: "simple",
      denoise: 1,
      model: [unetId, 0],
      // All three come from the Wan node, not from the encoders.
      positive: [wanId, 0],
      negative: [wanId, 1],
      latent_image: [wanId, 2],
    },
  };

  const decodeId = ids.take();
  wf[decodeId] = { class_type: "VAEDecode", inputs: { samples: [sampleId, 0], vae: [vaeId, 0] } };

  // SaveAnimatedWEBP rather than the newer CreateVideo and SaveVideo pair,
  // because it appears in the history under the same `images` key the sprite
  // path already reads, so one collection routine serves both.
  const saveId = ids.take();
  wf[saveId] = {
    class_type: "SaveAnimatedWEBP",
    inputs: {
      images: [decodeId, 0],
      filename_prefix: "as_adventurer_wan",
      fps: 16,
      lossless: false,
      quality: 90,
      method: "default",
    },
  };

  return { workflow: wf, saveNodeId: saveId };
};

/** Where a letterboxed image sits on its canvas. */
export interface LetterboxPlacement {
  readonly width: number;
  readonly height: number;
  readonly drawWidth: number;
  readonly drawHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Default shrink applied so the subject does not sit against an edge. */
export const LETTERBOX_MARGIN = 0.08;

/**
 * Where to place a source image on the Wan canvas.
 *
 * A contain fit rather than a cover fit, because the pipeline needs the whole
 * character. Feeding a square or 720p full-body still straight into a
 * landscape canvas is what crops heads and feet, and Wan will not put back
 * what the input never had.
 *
 * The margin shrinks the result slightly. A subject touching the frame edge
 * invites Wan to reframe, so the eight percent buys a border that discourages
 * it. Geometry only; the caller draws.
 */
export const computeLetterbox = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  margin: number = LETTERBOX_MARGIN,
): LetterboxPlacement => {
  const m = Number.isFinite(margin) && margin >= 0 && margin < 0.4 ? margin : LETTERBOX_MARGIN;
  const tw = Math.max(64, Math.trunc(targetWidth));
  const th = Math.max(64, Math.trunc(targetHeight));
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);

  const scale = Math.min(tw / sw, th / sh) * (1 - m);
  const drawWidth = Math.max(1, Math.round(sw * scale));
  const drawHeight = Math.max(1, Math.round(sh * scale));

  return {
    width: tw,
    height: th,
    drawWidth,
    drawHeight,
    offsetX: Math.floor((tw - drawWidth) / 2),
    offsetY: Math.floor((th - drawHeight) / 2),
  };
};
