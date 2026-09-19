import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    COMFY_DEFAULTS,
    LETTERBOX_MARGIN,
    WAN_DEFAULTS,
    WAN_NEGATIVE_PROMPT,
    SPRITE_HEIGHT,
    SPRITE_WIDTH,
    buildFluxWorkflow,
    buildSdxlWorkflow,
    extractHistoryImages,
    extractPromptId,
    asWorkflowKind,
    buildWanI2VWorkflow,
    buildWorkflowFor,
    computeLetterbox,
    parseWanSettings,
    parseComfySettings,
    viewQuery,
    type ComfyWorkflow,
} from '../../src/browser/comfyui-core.mts';

const FLUX = {
    unetName: 'flux1-dev-fp8.safetensors',
    clipName: 'clip_l.safetensors',
    t5Name: 't5xxl_fp8_e4m3fn.safetensors',
    vaeName: 'ae.safetensors',
    positiveText: 'a knight',
    seed: 42,
    steps: 24,
    guidance: 3.5,
    weightDtype: 'fp8_e4m3fn',
};

const SDXL = {
    checkpoint: 'ponyDiffusion.safetensors',
    positiveText: 'a knight',
    negativeText: 'blurry',
    seed: 42,
    steps: 30,
    cfg: 7,
};

/** Every node of a class, for asserting on topology. */
const nodesOfType = (wf: ComfyWorkflow, type: string): [string, ComfyWorkflow[string]][] =>
    Object.entries(wf).filter(([, node]) => node.class_type === type);

/** Every node reference appearing in any input. */
const referencedIds = (wf: ComfyWorkflow): Set<string> => {
    const seen = new Set<string>();
    for (const node of Object.values(wf)) {
        for (const value of Object.values(node.inputs)) {
            if (Array.isArray(value) && typeof value[0] === 'string') seen.add(value[0]);
        }
    }
    return seen;
};

describe('buildFluxWorkflow', () => {
    it('produces a graph whose every reference resolves to a real node', () => {
        const { workflow } = buildFluxWorkflow(FLUX);
        for (const id of referencedIds(workflow)) {
            assert.ok(id in workflow, `node ${id} is referenced but absent`);
        }
    });

    it('names the save node it returns', () => {
        const { workflow, saveNodeId } = buildFluxWorkflow(FLUX);
        assert.equal(workflow[saveNodeId]?.class_type, 'SaveImage');
    });

    it('fixes classifier-free guidance at 1, as Flux requires', () => {
        // Flux guides through FluxGuidance. A higher cfg here burns the image,
        // which upstream spent several commits discovering.
        const { workflow } = buildFluxWorkflow(FLUX);
        const [, sampler] = nodesOfType(workflow, 'KSampler')[0] ?? [];
        assert.equal(sampler?.inputs['cfg'], 1);
    });

    it('routes guidance through a FluxGuidance node rather than the sampler', () => {
        const { workflow } = buildFluxWorkflow({ ...FLUX, guidance: 4.5 });
        const [, guide] = nodesOfType(workflow, 'FluxGuidance')[0] ?? [];
        assert.equal(guide?.inputs['guidance'], 4.5);
    });

    it('uses the SD3 latent and the euler/simple pair Flux needs', () => {
        const { workflow } = buildFluxWorkflow(FLUX);
        assert.equal(nodesOfType(workflow, 'EmptySD3LatentImage').length, 1);
        assert.equal(nodesOfType(workflow, 'EmptyLatentImage').length, 0);
        const [, sampler] = nodesOfType(workflow, 'KSampler')[0] ?? [];
        assert.equal(sampler?.inputs['sampler_name'], 'euler');
        assert.equal(sampler.inputs['scheduler'], 'simple');
    });

    it('emits sprite dimensions the rest of the pipeline expects', () => {
        const { workflow } = buildFluxWorkflow(FLUX);
        const [, latent] = nodesOfType(workflow, 'EmptySD3LatentImage')[0] ?? [];
        assert.equal(latent?.inputs['width'], SPRITE_WIDTH);
        assert.equal(latent.inputs['height'], SPRITE_HEIGHT);
    });

    it('leaves the negative prompt empty', () => {
        const { workflow } = buildFluxWorkflow(FLUX);
        const encoders = nodesOfType(workflow, 'CLIPTextEncode');
        assert.equal(encoders.length, 2);
        assert.ok(encoders.some(([, n]) => n.inputs['text'] === ''));
    });

    it('omits PuLID when no reference image is supplied', () => {
        const { workflow } = buildFluxWorkflow(FLUX);
        assert.equal(nodesOfType(workflow, 'ApplyPulidFlux').length, 0);
        assert.equal(nodesOfType(workflow, 'LoadImage').length, 0);
    });

    it('inserts PuLID between the model and the sampler when a reference exists', () => {
        const { workflow } = buildFluxWorkflow({ ...FLUX, referenceFilename: 'ref.png' });
        const applied = nodesOfType(workflow, 'ApplyPulidFlux');
        assert.equal(applied.length, 1);
        const [applyId] = applied[0] ?? [];
        const [, sampler] = nodesOfType(workflow, 'KSampler')[0] ?? [];
        assert.deepEqual(sampler?.inputs['model'], [applyId, 0]);
    });

    it('chains LoRAs model-only, each taking the previous output', () => {
        const { workflow } = buildFluxWorkflow({
            ...FLUX,
            loras: [{ name: 'a.safetensors', strength: 0.8 }, { name: 'b.safetensors', strength: 0.5 }],
        });
        const loras = nodesOfType(workflow, 'LoraLoaderModelOnly');
        assert.equal(loras.length, 2);
        const [firstId] = loras[0] ?? [];
        const [, second] = loras[1] ?? [];
        assert.deepEqual(second?.inputs['model'], [firstId, 0]);
    });

    it('applies LoRA strength as given', () => {
        const { workflow } = buildFluxWorkflow({ ...FLUX, loras: [{ name: 'a', strength: 0.35 }] });
        const [, lora] = nodesOfType(workflow, 'LoraLoaderModelOnly')[0] ?? [];
        assert.equal(lora?.inputs['strength_model'], 0.35);
    });
});

describe('buildSdxlWorkflow', () => {
    it('produces a graph whose every reference resolves', () => {
        const { workflow } = buildSdxlWorkflow(SDXL);
        for (const id of referencedIds(workflow)) {
            assert.ok(id in workflow, `node ${id} is referenced but absent`);
        }
    });

    it('takes model, CLIP and VAE from one checkpoint loader', () => {
        const { workflow } = buildSdxlWorkflow(SDXL);
        assert.equal(nodesOfType(workflow, 'CheckpointLoaderSimple').length, 1);
        assert.equal(nodesOfType(workflow, 'UNETLoader').length, 0);
    });

    it('carries a worded negative prompt, unlike Flux', () => {
        const { workflow } = buildSdxlWorkflow(SDXL);
        const encoders = nodesOfType(workflow, 'CLIPTextEncode');
        assert.ok(encoders.some(([, n]) => n.inputs['text'] === 'blurry'));
    });

    it('honours the supplied cfg, unlike Flux which fixes it', () => {
        const { workflow } = buildSdxlWorkflow({ ...SDXL, cfg: 9 });
        const [, sampler] = nodesOfType(workflow, 'KSampler')[0] ?? [];
        assert.equal(sampler?.inputs['cfg'], 9);
    });

    it('chains LoRAs through both model and clip', () => {
        const { workflow } = buildSdxlWorkflow({ ...SDXL, loras: [{ name: 'a', strength: 0.7 }] });
        const [, lora] = nodesOfType(workflow, 'LoraLoader')[0] ?? [];
        assert.equal(lora?.inputs['strength_model'], 0.7);
        assert.equal(lora.inputs['strength_clip'], 0.7);
    });

    it('uses IP-Adapter rather than PuLID for likeness', () => {
        const { workflow } = buildSdxlWorkflow({ ...SDXL, referenceFilename: 'ref.png' });
        assert.equal(nodesOfType(workflow, 'IPAdapterAdvanced').length, 1);
        assert.equal(nodesOfType(workflow, 'ApplyPulidFlux').length, 0);
    });
});

describe('extractPromptId', () => {
    it('reads the identifier a submission returns', () => {
        assert.equal(extractPromptId({ prompt_id: 'p-1' }), 'p-1');
    });

    it('yields undefined when absent or unusable', () => {
        for (const bad of [{}, null, 'text', { prompt_id: '' }, { prompt_id: 7 }]) {
            assert.equal(extractPromptId(bad), undefined);
        }
    });
});

describe('extractHistoryImages', () => {
    const history = {
        'p-1': { outputs: { '9': { images: [
            { filename: 'a.png', subfolder: '', type: 'output' },
            { filename: 'b.png', subfolder: 'sub', type: 'temp' },
        ] } } },
    };

    it('reads the images a save node produced', () => {
        const images = extractHistoryImages(history, 'p-1', '9');
        assert.equal(images.length, 2);
        assert.equal(images[0]?.filename, 'a.png');
        assert.equal(images[1]?.subfolder, 'sub');
    });

    it('yields nothing for a prompt or node not present, rather than throwing', () => {
        // A poll before the work finishes lands here, and it is not an error.
        assert.deepEqual(extractHistoryImages(history, 'missing', '9'), []);
        assert.deepEqual(extractHistoryImages(history, 'p-1', '99'), []);
        assert.deepEqual(extractHistoryImages({}, 'p-1', '9'), []);
        assert.deepEqual(extractHistoryImages(null, 'p-1', '9'), []);
    });

    it('defaults an absent subfolder and type rather than dropping the image', () => {
        const partial = { 'p-1': { outputs: { '9': { images: [{ filename: 'a.png' }] } } } };
        const [image] = extractHistoryImages(partial, 'p-1', '9');
        assert.equal(image?.subfolder, '');
        assert.equal(image.type, 'output');
    });

    it('skips entries with no usable filename', () => {
        const junk = { 'p-1': { outputs: { '9': { images: [{}, { filename: '' }, 'text'] } } } };
        assert.deepEqual(extractHistoryImages(junk, 'p-1', '9'), []);
    });
});

describe('viewQuery', () => {
    it('encodes the three fields the view endpoint expects', () => {
        const q = new URLSearchParams(viewQuery({ filename: 'a b.png', subfolder: 's', type: 'output' }));
        assert.equal(q.get('filename'), 'a b.png');
        assert.equal(q.get('subfolder'), 's');
        assert.equal(q.get('type'), 'output');
    });
});

describe('asWorkflowKind', () => {
    it('accepts the two workflows and rejects everything else', () => {
        assert.equal(asWorkflowKind('flux'), 'flux');
        assert.equal(asWorkflowKind('sdxl'), 'sdxl');
        for (const bad of ['', 'Flux', 'pony', 'SDXL', 'wan']) {
            assert.equal(asWorkflowKind(bad), undefined, bad);
        }
    });
});

describe('parseComfySettings', () => {
    it('returns the defaults for absent or unusable storage', () => {
        // localStorage is writable by anything on the origin.
        for (const bad of [null, '', '{', 'null', '[]', '"text"', '42']) {
            assert.deepEqual(parseComfySettings(bad), COMFY_DEFAULTS, JSON.stringify(bad));
        }
    });

    it('reads a complete stored object', () => {
        const stored = parseComfySettings(JSON.stringify({
            url: 'http://192.168.1.5:8188', workflow: 'sdxl', model: 'pony.safetensors',
            clipName: 'c', t5Name: 't', vaeName: 'v', steps: 30, guidance: 7,
        }));
        assert.equal(stored.url, 'http://192.168.1.5:8188');
        assert.equal(stored.workflow, 'sdxl');
        assert.equal(stored.steps, 30);
        assert.equal(stored.guidance, 7);
    });

    it('fills each absent field from the defaults independently', () => {
        const stored = parseComfySettings(JSON.stringify({ steps: 12 }));
        assert.equal(stored.steps, 12);
        assert.equal(stored.model, COMFY_DEFAULTS.model);
        assert.equal(stored.url, COMFY_DEFAULTS.url);
    });

    it('rejects an unrecognised workflow rather than storing it', () => {
        assert.equal(parseComfySettings('{"workflow":"wan"}').workflow, COMFY_DEFAULTS.workflow);
    });

    it('clamps the numeric fields into usable ranges', () => {
        assert.equal(parseComfySettings('{"steps":0}').steps, 1);
        assert.equal(parseComfySettings('{"steps":9999}').steps, 150);
        assert.equal(parseComfySettings('{"guidance":-5}').guidance, 0);
        assert.equal(parseComfySettings('{"steps":"abc"}').steps, COMFY_DEFAULTS.steps);
    });

    it('trims a stored address and ignores a blank one', () => {
        assert.equal(parseComfySettings('{"url":"  http://10.0.0.1:8188  "}').url, 'http://10.0.0.1:8188');
        assert.equal(parseComfySettings('{"url":"   "}').url, COMFY_DEFAULTS.url);
    });
});

describe('buildWorkflowFor', () => {
    it('builds a Flux graph when the settings say Flux', () => {
        const { workflow } = buildWorkflowFor(COMFY_DEFAULTS, { positiveText: 'knight', seed: 1 });
        assert.ok(Object.values(workflow).some((n) => n.class_type === 'UNETLoader'));
        assert.ok(!Object.values(workflow).some((n) => n.class_type === 'CheckpointLoaderSimple'));
    });

    it('builds an SDXL graph when the settings say SDXL', () => {
        const settings = { ...COMFY_DEFAULTS, workflow: 'sdxl' as const, model: 'pony.safetensors' };
        const { workflow } = buildWorkflowFor(settings, { positiveText: 'knight', seed: 1 });
        assert.ok(Object.values(workflow).some((n) => n.class_type === 'CheckpointLoaderSimple'));
        assert.ok(!Object.values(workflow).some((n) => n.class_type === 'UNETLoader'));
    });

    it('derives the fp8 weight type from the model name', () => {
        const { workflow } = buildWorkflowFor(COMFY_DEFAULTS, { positiveText: 'x', seed: 1 });
        const unet = Object.values(workflow).find((n) => n.class_type === 'UNETLoader');
        assert.equal(unet?.inputs['weight_dtype'], 'fp8_e4m3fn');

        const plain = buildWorkflowFor({ ...COMFY_DEFAULTS, model: 'flux1-dev.safetensors' },
            { positiveText: 'x', seed: 1 });
        const plainUnet = Object.values(plain.workflow).find((n) => n.class_type === 'UNETLoader');
        assert.equal(plainUnet?.inputs['weight_dtype'], 'default');
    });

    it('passes a reference image through to the likeness node of either workflow', () => {
        const flux = buildWorkflowFor(COMFY_DEFAULTS, { positiveText: 'x', seed: 1, referenceFilename: 'r.png' });
        assert.ok(Object.values(flux.workflow).some((n) => n.class_type === 'ApplyPulidFlux'));

        const sdxl = buildWorkflowFor({ ...COMFY_DEFAULTS, workflow: 'sdxl' },
            { positiveText: 'x', seed: 1, referenceFilename: 'r.png' });
        assert.ok(Object.values(sdxl.workflow).some((n) => n.class_type === 'IPAdapterAdvanced'));
    });

    it('carries the settings steps and guidance into the graph', () => {
        const settings = { ...COMFY_DEFAULTS, steps: 33, guidance: 6 };
        const { workflow } = buildWorkflowFor(settings, { positiveText: 'x', seed: 1 });
        const sampler = Object.values(workflow).find((n) => n.class_type === 'KSampler');
        assert.equal(sampler?.inputs['steps'], 33);
        const guide = Object.values(workflow).find((n) => n.class_type === 'FluxGuidance');
        assert.equal(guide?.inputs['guidance'], 6);
    });
});

describe('buildWanI2VWorkflow', () => {
    const opts = { imageName: 'frame.png', positiveText: 'gentle idle sway', seed: 7 };

    it('produces a graph whose every reference resolves', () => {
        const { workflow } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        for (const id of referencedIds(workflow)) {
            assert.ok(id in workflow, `node ${id} is referenced but absent`);
        }
    });

    it('feeds the sampler all three WanImageToVideo outputs', () => {
        // This is what makes it image-to-video rather than text-to-video.
        // The conditioning comes from the Wan node, not from the encoders.
        const { workflow } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        const [wanId] = nodesOfType(workflow, 'WanImageToVideo')[0] ?? [];
        const [, sampler] = nodesOfType(workflow, 'KSampler')[0] ?? [];
        assert.deepEqual(sampler?.inputs['positive'], [wanId, 0]);
        assert.deepEqual(sampler.inputs['negative'], [wanId, 1]);
        assert.deepEqual(sampler.inputs['latent_image'], [wanId, 2]);
    });

    it('disables the vision encoder crop, which would undo the letterboxing', () => {
        const { workflow } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        const [, encode] = nodesOfType(workflow, 'CLIPVisionEncode')[0] ?? [];
        assert.equal(encode?.inputs['crop'], 'none');
    });

    it('uses the uni_pc sampler Wan expects', () => {
        const { workflow } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        const [, sampler] = nodesOfType(workflow, 'KSampler')[0] ?? [];
        assert.equal(sampler?.inputs['sampler_name'], 'uni_pc');
    });

    it('loads the text encoder as a Wan CLIP', () => {
        const { workflow } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        const [, clip] = nodesOfType(workflow, 'CLIPLoader')[0] ?? [];
        assert.equal(clip?.inputs['type'], 'wan');
    });

    it('carries the anti-crop negative, which keeps head and feet in frame', () => {
        const { workflow } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        const encoders = nodesOfType(workflow, 'CLIPTextEncode');
        assert.ok(encoders.some(([, n]) => n.inputs['text'] === WAN_NEGATIVE_PROMPT));
        assert.match(WAN_NEGATIVE_PROMPT, /cropped head/);
        assert.match(WAN_NEGATIVE_PROMPT, /camera move/);
    });

    it('switches the loader node for GGUF weights', () => {
        const plain = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        assert.equal(nodesOfType(plain.workflow, 'UNETLoader').length, 1);
        assert.equal(nodesOfType(plain.workflow, 'UnetLoaderGGUF').length, 0);

        const gguf = buildWanI2VWorkflow({ ...WAN_DEFAULTS, useGguf: true }, opts);
        assert.equal(nodesOfType(gguf.workflow, 'UnetLoaderGGUF').length, 1);
        assert.equal(nodesOfType(gguf.workflow, 'UNETLoader').length, 0);
    });

    it('carries the configured dimensions and frame count', () => {
        const settings = { ...WAN_DEFAULTS, width: 640, height: 384, frames: 49 };
        const { workflow } = buildWanI2VWorkflow(settings, opts);
        const [, wan] = nodesOfType(workflow, 'WanImageToVideo')[0] ?? [];
        assert.equal(wan?.inputs['width'], 640);
        assert.equal(wan.inputs['height'], 384);
        assert.equal(wan.inputs['length'], 49);
    });

    it('saves in a form the existing history reader already collects', () => {
        const { workflow, saveNodeId } = buildWanI2VWorkflow(WAN_DEFAULTS, opts);
        assert.equal(workflow[saveNodeId]?.class_type, 'SaveAnimatedWEBP');
    });
});

describe('parseWanSettings', () => {
    it('returns the defaults for absent or unusable storage', () => {
        for (const bad of [null, '', '{', '[]', '"x"']) {
            assert.deepEqual(parseWanSettings(bad), WAN_DEFAULTS, JSON.stringify(bad));
        }
    });

    it('clamps dimensions, frames and steps into usable ranges', () => {
        assert.equal(parseWanSettings('{"width":10}').width, 64);
        assert.equal(parseWanSettings('{"frames":0}').frames, 1);
        assert.equal(parseWanSettings('{"frames":99999}').frames, 600);
        assert.equal(parseWanSettings('{"steps":500}').steps, 150);
    });

    it('treats useGguf as a strict boolean', () => {
        assert.equal(parseWanSettings('{"useGguf":true}').useGguf, true);
        assert.equal(parseWanSettings('{"useGguf":"true"}').useGguf, false);
        assert.equal(parseWanSettings('{"useGguf":1}').useGguf, false);
    });
});

describe('computeLetterbox', () => {
    it('contains a square source in a landscape canvas without cropping', () => {
        const box = computeLetterbox(1024, 1024, 832, 480);
        assert.ok(box.drawWidth <= box.width, 'must not exceed the canvas horizontally');
        assert.ok(box.drawHeight <= box.height, 'must not exceed the canvas vertically');
        // Height is the binding dimension here, so the margin applies to it.
        assert.ok(box.drawHeight < 480);
    });

    it('preserves the source aspect ratio', () => {
        const box = computeLetterbox(1280, 720, 832, 480);
        const sourceRatio = 1280 / 720;
        const drawnRatio = box.drawWidth / box.drawHeight;
        assert.ok(Math.abs(sourceRatio - drawnRatio) < 0.01,
            `ratio drifted: ${sourceRatio.toString()} against ${drawnRatio.toString()}`);
    });

    it('centres the drawn image', () => {
        const box = computeLetterbox(1024, 1024, 832, 480);
        assert.equal(box.offsetX, Math.floor((832 - box.drawWidth) / 2));
        assert.equal(box.offsetY, Math.floor((480 - box.drawHeight) / 2));
    });

    it('leaves a margin so the subject does not touch the frame edge', () => {
        // A subject against the edge invites Wan to reframe, cropping it.
        const box = computeLetterbox(480, 480, 480, 480);
        assert.ok(box.drawHeight < 480, 'the margin must shrink a perfectly fitting source');
        assert.ok(box.offsetY > 0, 'and leave a border above it');
    });

    it('honours a supplied margin and rejects an absurd one', () => {
        const none = computeLetterbox(1000, 1000, 500, 500, 0);
        assert.equal(none.drawHeight, 500, 'a zero margin fills the canvas');
        const absurd = computeLetterbox(1000, 1000, 500, 500, 0.9);
        const standard = computeLetterbox(1000, 1000, 500, 500, LETTERBOX_MARGIN);
        assert.equal(absurd.drawHeight, standard.drawHeight, 'an out-of-range margin falls back');
    });

    it('never produces a zero or negative dimension', () => {
        for (const [sw, sh] of [[1, 1], [10000, 1], [1, 10000], [0, 0]] as const) {
            const box = computeLetterbox(sw, sh, 832, 480);
            assert.ok(box.drawWidth >= 1 && box.drawHeight >= 1, `${sw.toString()}x${sh.toString()}`);
        }
    });
});
