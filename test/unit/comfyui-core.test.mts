import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SPRITE_HEIGHT,
    SPRITE_WIDTH,
    buildFluxWorkflow,
    buildSdxlWorkflow,
    extractHistoryImages,
    extractPromptId,
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
