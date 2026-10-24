/**
 * Settings: provider keys, the local ComfyUI instance, notification sound.
 *
 * Unlike the four media stages, this panel is React through and through. Its
 * values live in component state, it loads them from storage once when it
 * mounts, and the connection tests are functions in
 * `platform-browser/settings.mts` that return a status for it to render. No
 * stage reads these fields: every stage loads what it needs from storage when
 * it needs it, which is why the panel could change hands without the stages
 * noticing.
 *
 * Identifiers, input types, toast wording and status wording are the ones the
 * previous handlers produced, because the browser specifications assert them,
 * including the trust boundary that saving a key makes no request at all.
 */
import { styled, View } from "@tamagui/core";
import { useEffect, useState, type ReactNode } from "react";
import { browserStore } from "../../platform-browser/local-storage.mts";
import { notificationSound } from "../../platform-browser/shell.mts";
import { showToast } from "../../platform-browser/toasts.mts";
import {
    CHECKING,
    TESTING,
    testComfy,
    testGoogleKey,
    testOpenAiKey,
    type ConnectionStatus,
} from "../../platform-browser/settings.mts";
import { PROVIDERS, VIDEO_PROVIDERS, loadCredential, saveCredential, type Provider } from "../../core/providers.mts";
import {
    asWorkflowKind,
    loadComfySettings,
    loadWanSettings,
    parseComfySettings,
    parseWanSettings,
    saveComfySettings,
    saveWanSettings,
    type ComfySettings,
    type WanSettings,
    type WorkflowKind,
} from "../../core/comfyui-core.mts";
import {
    Button,
    FormRow,
    GoldDivider,
    InfoNote,
    InfoNoteIcon,
    Panel,
    PanelSubtitle,
    PanelTitle,
    PanelTitleIcon,
    PanelTitleText,
    StatusLine,
    Text,
} from "../ui/primitives.tsx";

const Column = styled(View, { maxWidth: 640 });

const KeyRow = styled(View, {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
});

const PasswordWrap = styled(View, { position: "relative", flex: 1 });

const RevealButton = styled(Text, {
    render: "button",
    lineHeight: "normal",
    position: "absolute",
    right: 8,
    top: "50%",
    padding: 4,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "$textDim",
    fontSize: "$8",
    cursor: "pointer",
    hoverStyle: { color: "$textMuted" },
    "$platform-web": { transform: "translateY(-50%)" },
});

/** The keys' fields sit under the reveal button, so they give it room. */
const KEY_FIELD_STYLE = { paddingRight: 42 } as const;

// ─── Status ─────────────────────────────────────────────────────────────

const Status = ({ id, status }: { readonly id: string; readonly status: ConnectionStatus | undefined }): ReactNode => (
    <View id={id}>
        {status === undefined ? null : (
            <StatusLine className={`status-msg ${status.kind}`} kind={status.kind}>
                {status.pending ? <span className="spinner" /> : null}
                {status.text}
            </StatusLine>
        )}
    </View>
);

// ─── A provider key ─────────────────────────────────────────────────────

interface KeyPanelProps {
    readonly provider: Pick<Provider, "storageKey">;
    /** The prefix of every identifier, such as `settingsOpenAI`. */
    readonly idPrefix: string;
    readonly icon: string;
    readonly title: string;
    readonly subtitle: string;
    readonly placeholder: string;
    readonly fieldTitle: string;
    /** The name the toasts use, such as `OpenAI`. */
    readonly toastName: string;
    /** Absent for a provider whose only test would cost the user money. */
    readonly test?: (key: string) => Promise<ConnectionStatus>;
}

const KeyPanel = (props: KeyPanelProps): ReactNode => {
    const [value, setValue] = useState(() => loadCredential(browserStore, props.provider) ?? "");
    const [revealed, setRevealed] = useState(false);
    const [status, setStatus] = useState<ConnectionStatus | undefined>(undefined);
    const { test } = props;

    const save = (): void => {
        const key = value.trim();
        saveCredential(browserStore, props.provider, key);
        if (key !== "") showToast(`${props.toastName} API key saved`, "success");
        else showToast(`${props.toastName} API key removed`, "warning");
    };

    const runTest = async (run: (key: string) => Promise<ConnectionStatus>): Promise<void> => {
        const key = value.trim();
        if (key !== "") setStatus(TESTING);
        setStatus(await run(key));
    };

    return (
        <Panel>
            <PanelTitle><PanelTitleIcon>{props.icon}</PanelTitleIcon><PanelTitleText>{props.title}</PanelTitleText></PanelTitle>
            <PanelSubtitle>{props.subtitle}</PanelSubtitle>
            <KeyRow>
                <PasswordWrap>
                    <input
                        type={revealed ? "text" : "password"}
                        id={`${props.idPrefix}Key`}
                        placeholder={props.placeholder}
                        title={props.fieldTitle}
                        value={value}
                        style={KEY_FIELD_STYLE}
                        onChange={(e) => { setValue(e.target.value); }}
                    />
                    <RevealButton
                        id={`${props.idPrefix}Toggle`}
                        render={<button title="Show/hide key" />}
                        onPress={() => { setRevealed(!revealed); }}
                    >
                        {revealed ? "🙈" : "👁️"}
                    </RevealButton>
                </PasswordWrap>
                <Button id={`${props.idPrefix}Save`} tone="secondary" small render={<button title="Save key to browser storage" />} onPress={save}>
                    Save
                </Button>
                {test === undefined ? null : (
                    <Button
                        id={`${props.idPrefix}Test`}
                        tone="accent"
                        small
                        render={<button title="Test the API connection" />}
                        onPress={() => { void runTest(test); }}
                    >
                        Test
                    </Button>
                )}
            </KeyRow>
            <Status id={`${props.idPrefix}Status`} status={status} />
        </Panel>
    );
};

// ─── ComfyUI and Wan ────────────────────────────────────────────────────

const SegGroup = styled(View, {
    display: "inline-flex",
    flexDirection: "row",
    backgroundColor: "$bgInput",
    borderWidth: 1,
    borderColor: "$border",
    borderRadius: "$md",
    overflow: "hidden",
});

const SegButton = styled(Text, {
    render: "button",
    lineHeight: "normal",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "$textMuted",
    fontFamily: "$body",
    fontSize: "$5",
    fontWeight: "500",
    cursor: "pointer",
    hoverStyle: { color: "$text", backgroundColor: "$hover" },
    variants: {
        active: {
            true: {
                color: "$bgDeep",
                backgroundColor: "$gold",
                fontWeight: "600",
                hoverStyle: { color: "$bgDeep", backgroundColor: "$gold" },
            },
        },
        divided: { true: { borderRightWidth: 1, borderRightColor: "$border" } },
    } as const,
});

const WORKFLOWS: readonly { readonly mode: WorkflowKind; readonly label: string; readonly title: string }[] = [
    { mode: "flux", label: "Flux", title: "Flux. Uses UNET, dual CLIP and VAE loaders." },
    { mode: "sdxl", label: "SDXL", title: "SDXL or Pony. Uses a single checkpoint." },
];

interface TextFieldProps {
    readonly id: string;
    readonly label: string;
    readonly placeholder: string;
    readonly title: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
}

const TextField = (props: TextFieldProps): ReactNode => (
    <FormRow>
        <label>{props.label}</label>
        <input
            type="text"
            id={props.id}
            placeholder={props.placeholder}
            title={props.title}
            value={props.value}
            onChange={(e) => { props.onChange(e.target.value); }}
        />
    </FormRow>
);

interface RangeFieldProps {
    readonly id: string;
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly step?: number;
    readonly title: string;
    readonly value: number;
    readonly onChange: (value: number) => void;
}

const RangeField = (props: RangeFieldProps): ReactNode => (
    <FormRow>
        <label>{props.label}</label>
        <input
            type="range"
            id={props.id}
            min={props.min}
            max={props.max}
            step={props.step ?? 1}
            title={props.title}
            value={props.value}
            onChange={(e) => { props.onChange(Number(e.target.value)); }}
        />
        <span id={`${props.id}Val`}>{props.value.toString()}</span>
    </FormRow>
);

const ComfyPanel = (): ReactNode => {
    const [comfy, setComfy] = useState<ComfySettings>(() => loadComfySettings(browserStore));
    const [wan, setWan] = useState<WanSettings>(() => loadWanSettings(browserStore));
    const [status, setStatus] = useState<ConnectionStatus | undefined>(undefined);

    // Read back through the parsers, as the original did, so a saved value
    // has passed the same validation as one loaded from storage.
    const normalisedComfy = (): ComfySettings => parseComfySettings(JSON.stringify(comfy));
    const normalisedWan = (): WanSettings => parseWanSettings(JSON.stringify(wan));

    const save = (): void => {
        saveComfySettings(browserStore, normalisedComfy());
        saveWanSettings(browserStore, normalisedWan());
        showToast("ComfyUI settings saved", "success");
    };

    const test = async (): Promise<void> => {
        setStatus(CHECKING);
        setStatus(await testComfy(normalisedComfy().url));
    };

    const chooseWorkflow = (mode: string): void => {
        const chosen = asWorkflowKind(mode);
        if (chosen !== undefined) setComfy({ ...comfy, workflow: chosen });
    };

    return (
        <Panel>
            <PanelTitle><PanelTitleIcon>🖥️</PanelTitleIcon><PanelTitleText>ComfyUI (local)</PanelTitleText></PanelTitle>
            <PanelSubtitle>
                Optional. Generate sprites on your own machine instead of a paid service. Only addresses on your local network are accepted.
            </PanelSubtitle>

            <TextField
                id="settingsComfyUrl"
                label="Server address"
                placeholder="http://127.0.0.1:8188"
                title="Where your ComfyUI instance is listening"
                value={comfy.url}
                onChange={(url) => { setComfy({ ...comfy, url }); }}
            />

            <FormRow>
                <label>Workflow</label>
                <SegGroup id="settingsComfyWorkflow" className="seg-toggle">
                    {WORKFLOWS.map((w, index) => (
                        <SegButton
                            key={w.mode}
                            className={w.mode === comfy.workflow ? "seg-btn active" : "seg-btn"}
                            data-mode={w.mode}
                            render={<button title={w.title} />}
                            active={w.mode === comfy.workflow}
                            divided={index < WORKFLOWS.length - 1}
                            onPress={() => { chooseWorkflow(w.mode); }}
                        >
                            {w.label}
                        </SegButton>
                    ))}
                </SegGroup>
            </FormRow>

            <TextField
                id="settingsComfyModel"
                label="Model"
                placeholder="flux1-dev-fp8.safetensors"
                title="UNET name for Flux, or checkpoint name for SDXL"
                value={comfy.model}
                onChange={(model) => { setComfy({ ...comfy, model }); }}
            />

            {/* Flux needs three encoders; SDXL takes them from its checkpoint. */}
            <View id="settingsComfyFluxFields" display={comfy.workflow === "flux" ? "flex" : "none"}>
                <TextField
                    id="settingsComfyClip"
                    label="CLIP"
                    placeholder="clip_l.safetensors"
                    title="Flux CLIP encoder"
                    value={comfy.clipName}
                    onChange={(clipName) => { setComfy({ ...comfy, clipName }); }}
                />
                <TextField
                    id="settingsComfyT5"
                    label="T5"
                    placeholder="t5xxl_fp8_e4m3fn.safetensors"
                    title="Flux T5 encoder"
                    value={comfy.t5Name}
                    onChange={(t5Name) => { setComfy({ ...comfy, t5Name }); }}
                />
                <TextField
                    id="settingsComfyVae"
                    label="VAE"
                    placeholder="ae.safetensors"
                    title="Flux VAE"
                    value={comfy.vaeName}
                    onChange={(vaeName) => { setComfy({ ...comfy, vaeName }); }}
                />
            </View>

            <RangeField
                id="settingsComfySteps"
                label="Steps"
                min={4}
                max={60}
                title="Sampling steps. More is slower and not always better."
                value={comfy.steps}
                onChange={(steps) => { setComfy({ ...comfy, steps }); }}
            />
            <RangeField
                id="settingsComfyGuidance"
                label="Guidance"
                min={1}
                max={15}
                step={0.5}
                title="Flux guidance, or CFG for SDXL"
                value={comfy.guidance}
                onChange={(guidance) => { setComfy({ ...comfy, guidance }); }}
            />

            <PanelSubtitle marginTop={16}>Video (Wan image-to-video)</PanelSubtitle>

            <TextField
                id="settingsWanUnet"
                label="Wan UNET"
                placeholder="Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors"
                title="Wan image-to-video model"
                value={wan.unet}
                onChange={(unet) => { setWan({ ...wan, unet }); }}
            />
            <TextField
                id="settingsWanVae"
                label="Wan VAE"
                placeholder="wan_2.1_vae.safetensors"
                title="Wan VAE"
                value={wan.vae}
                onChange={(vae) => { setWan({ ...wan, vae }); }}
            />
            <TextField
                id="settingsWanTextEncoder"
                label="Text encoder"
                placeholder="umt5_xxl_fp8_e4m3fn_scaled.safetensors"
                title="Wan text encoder"
                value={wan.textEncoder}
                onChange={(textEncoder) => { setWan({ ...wan, textEncoder }); }}
            />
            <TextField
                id="settingsWanClipVision"
                label="CLIP vision"
                placeholder="clip_vision_h.safetensors"
                title="Wan CLIP vision model"
                value={wan.clipVision}
                onChange={(clipVision) => { setWan({ ...wan, clipVision }); }}
            />
            <RangeField
                id="settingsWanFrames"
                label="Frames"
                min={17}
                max={201}
                step={8}
                title="More frames is a longer clip and a longer wait"
                value={wan.frames}
                onChange={(frames) => { setWan({ ...wan, frames }); }}
            />
            <FormRow>
                <label>GGUF weights</label>
                <input
                    type="checkbox"
                    id="settingsWanGguf"
                    title="Tick if your Wan model is a GGUF quantisation"
                    checked={wan.useGguf}
                    onChange={(e) => { setWan({ ...wan, useGguf: e.target.checked }); }}
                />
            </FormRow>

            <KeyRow>
                <Button id="settingsComfySave" tone="secondary" small render={<button title="Save these settings to browser storage" />} onPress={save}>
                    Save
                </Button>
                <Button id="settingsComfyTest" tone="accent" small render={<button title="Check that ComfyUI is reachable" />} onPress={() => { void test(); }}>
                    Test
                </Button>
            </KeyRow>
            <Status id="settingsComfyStatus" status={status} />
        </Panel>
    );
};

// ─── Notifications ──────────────────────────────────────────────────────

const SoundPanel = (): ReactNode => {
    const [enabled, setEnabled] = useState(notificationSound.enabled);

    // Asked once, when the panel first exists, as before.
    useEffect(() => {
        if ("Notification" in window && Notification.permission === "default") {
            void Notification.requestPermission();
        }
    }, []);

    return (
        <Panel>
            <PanelTitle><PanelTitleIcon>🔊</PanelTitleIcon><PanelTitleText>Notifications</PanelTitleText></PanelTitle>
            <View flexDirection="row" alignItems="center" gap={8}>
                <label className="toggle-switch" title="Play a sound when AI generation completes">
                    <input
                        type="checkbox"
                        id="settingsSoundEnabled"
                        checked={enabled}
                        onChange={(e) => {
                            notificationSound.setEnabled(e.target.checked);
                            setEnabled(e.target.checked);
                        }}
                    />
                    <span className="slider" />
                </label>
                <label htmlFor="settingsSoundEnabled" style={{ marginBottom: 0 }}>Play sound on generation complete</label>
                <Button
                    id="settingsSoundTest"
                    tone="secondary"
                    small
                    marginLeft="auto"
                    render={<button title="Preview the notification sound" />}
                    onPress={() => { notificationSound.play(); }}
                >
                    🔊 Test
                </Button>
            </View>
        </Panel>
    );
};

// ─── About ──────────────────────────────────────────────────────────────

const AboutIcon = styled(Text, { display: "block", fontSize: 40, marginBottom: 8 });

const AboutTitle = styled(Text, {
    display: "block",
    fontFamily: "$display",
    fontSize: 19.2,
    marginBottom: 4,
});

const AboutTagline = styled(Text, {
    display: "block",
    fontFamily: "$mono",
    fontSize: "$4",
    color: "$textDim",
    letterSpacing: 1,
    marginBottom: 24,
});

const AboutMotto = styled(Text, { display: "block", fontSize: "$5", color: "$textDim", fontStyle: "italic" });

const ProductLink = styled(Text, {
    color: "$gold",
    fontSize: "$5",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "$borderGold",
    borderRadius: "$md",
    hoverStyle: { backgroundColor: "$goldDim", borderColor: "$gold" },
    textDecorationLine: "none",
    "$platform-web": { transition: "all 0.2s ease" },
});

const LINKS: readonly { readonly href: string; readonly label: string; readonly title: string }[] = [
    { href: "https://www.angelssword.com", label: "angelssword.com", title: "Main website" },
    { href: "https://rpg.angelssword.com", label: "rpg.angelssword.com", title: "Table Top RPG" },
    { href: "https://clio.angelssword.com", label: "clio.angelssword.com", title: "Lore Website" },
];

const About = (): ReactNode => (
    <Panel>
        <View alignItems="center" paddingVertical={32}>
            <AboutIcon>⚔️</AboutIcon>
            <AboutTitle className="gradient-gold-text">Angel's Sword Studios</AboutTitle>
            <AboutTagline marginBottom={0}>AS Adventurer Creator — VTuber Creation Pipeline</AboutTagline>
            <AboutTagline>Design → Generate → Prepare → Export</AboutTagline>
            <GoldDivider width="100%" />
            <AboutMotto>Crafted with ✦ for adventurers everywhere</AboutMotto>
            <View flexDirection="row" flexWrap="wrap" justifyContent="center" gap={12} marginTop={24}>
                {LINKS.map((link) => (
                    <ProductLink
                        key={link.href}
                        render={<a href={link.href} target="_blank" rel="noreferrer" title={link.title} />}
                    >
                        {link.label}
                    </ProductLink>
                ))}
            </View>
        </View>
    </Panel>
);

// ─── The tab ────────────────────────────────────────────────────────────

const SettingsTabView = (): ReactNode => (
    <Column className="settings-section">
        <KeyPanel
            provider={PROVIDERS.openai}
            idPrefix="settingsOpenAI"
            icon="🤖"
            title="OpenAI API Key"
            subtitle="Required for AI sprite generation (GPT Image 2). Your key is stored locally and never sent to any third party."
            placeholder="sk-..."
            fieldTitle="Your OpenAI API key"
            toastName="OpenAI"
            test={testOpenAiKey}
        />
        {/*
          No Test button. xAI's image endpoint bills on use, so a test would
          cost the user money to learn what their first generation tells them.
        */}
        <KeyPanel
            provider={PROVIDERS.xai}
            idPrefix="settingsXai"
            icon="⚡"
            title="xAI (Grok) API Key"
            subtitle="Optional. Lets Sprite Prep generate through Grok instead of OpenAI. Your key is stored locally and never sent to any third party."
            placeholder="xai-..."
            fieldTitle="Your xAI API key"
            toastName="xAI"
        />
        <ComfyPanel />
        <KeyPanel
            provider={VIDEO_PROVIDERS.google}
            idPrefix="settingsGoogle"
            icon="🎬"
            title="Google Gemini API Key"
            subtitle="Required for AI video generation (Gemini Omni Flash). Your key is stored locally and never sent to any third party."
            placeholder="AIza..."
            fieldTitle="Your Google Gemini API key"
            toastName="Google"
            test={testGoogleKey}
        />
        <SoundPanel />
        <About />
        <InfoNote>
            <InfoNoteIcon>🔒</InfoNoteIcon>
            <strong>Privacy:</strong> Your API keys are stored in your browser's localStorage only. They are never sent to any server except the official OpenAI and Google API endpoints, via the local proxy server running on your machine.
        </InfoNote>
    </Column>
);

export const SettingsTab = SettingsTabView;
