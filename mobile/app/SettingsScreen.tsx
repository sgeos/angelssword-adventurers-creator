/**
 * Settings, native: the provider keys, the local ComfyUI and Wan settings,
 * and the notification sound.
 *
 * Values are saved through the same core functions the web panel uses, over
 * the phone's own store, where the keys are kept in the secure store. Saving
 * tells the application, which mirrors the stages' settings into the web view.
 *
 * Connection tests are not run here. They are handed to the web view, which
 * runs the web panel's own tests through the in-page proxy, so a test passes
 * through exactly the plan and guards a stage's request would. The outcome
 * comes back as a prop. xAI has no test, for the reason the web panel gives:
 * its image endpoint bills on use.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Switch, TextInput } from "react-native";
import Slider from "@react-native-community/slider";
import { styled, Text, View } from "@tamagui/core";
import { PROVIDERS, VIDEO_PROVIDERS, loadCredential, saveCredential, type Provider } from "../../src/core/providers.mts";
import { loadSoundEnabled, saveSoundEnabled } from "../../src/core/preferences.mts";
import {
    loadComfySettings,
    loadWanSettings,
    parseComfySettings,
    parseWanSettings,
    saveComfySettings,
    saveWanSettings,
    type ComfySettings,
    type WanSettings,
    type WorkflowKind,
} from "../../src/core/comfyui-core.mts";
import { nativeStore } from "./storage.ts";
import { playSound } from "./sound.ts";

export type TestKind = "openai" | "google" | "comfy";

/** The outcome of a connection test, as the web view reported it. */
export interface TestOutcome {
    readonly id: number;
    readonly status: { readonly kind: "info" | "success" | "error"; readonly text: string; readonly pending: boolean };
}

const Panel = styled(View, {
    backgroundColor: "$bgCard",
    borderWidth: 1,
    borderColor: "$borderGold",
    borderRadius: "$lg",
    padding: 16,
    marginBottom: 16,
    gap: 10,
});

const Title = styled(Text, { fontFamily: "$heading", fontSize: "$7", color: "$textBright", letterSpacing: 1, textTransform: "uppercase" });
const Subtitle = styled(Text, { fontFamily: "$body", fontSize: "$5", color: "$textMuted", lineHeight: 19 });
const Label = styled(Text, { fontFamily: "$body", fontSize: "$5", color: "$textMuted" });

const ButtonFrame = styled(View, {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: "$md",
    borderWidth: 1,
    borderColor: "$borderLight",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    variants: { accent: { true: { backgroundColor: "$teal", borderColor: "transparent" } } } as const,
});

const ButtonText = styled(Text, {
    fontFamily: "$body",
    fontSize: "$4",
    color: "$text",
    variants: { accent: { true: { color: "$bgDeep", fontWeight: "600" } } } as const,
});

const Button = ({ label, onPress, accent, testID }: {
    readonly label: string;
    readonly onPress: () => void;
    readonly accent?: boolean;
    readonly testID: string;
}): ReactNode => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
        <ButtonFrame accent={accent === true}><ButtonText accent={accent === true}>{label}</ButtonText></ButtonFrame>
    </Pressable>
);

const INPUT_STYLE = {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#0f1a30",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    color: "#e0e0e0",
    fontFamily: "Outfit",
    fontSize: 14,
} as const;

const STATUS_COLOURS = { info: "#5bb5a6", success: "#7b9f6e", error: "#c75050" } as const;

const Status = ({ outcome }: { readonly outcome: TestOutcome["status"] | undefined }): ReactNode =>
    outcome === undefined ? null : (
        <Text fontFamily="$body" fontSize="$5" color={STATUS_COLOURS[outcome.kind]} testID="settings-status">
            {outcome.pending ? "… " : ""}{outcome.text}
        </Text>
    );

interface KeyPanelProps {
    readonly provider: Pick<Provider, "storageKey">;
    readonly id: string;
    readonly title: string;
    readonly subtitle: string;
    readonly placeholder: string;
    readonly toastName: string;
    readonly testKind: TestKind | undefined;
    readonly onSaved: () => void;
    readonly onTest: (kind: TestKind, value: string) => void;
    readonly status: TestOutcome["status"] | undefined;
    readonly toast: (message: string, kind: string) => Promise<void>;
}

const KeyPanel = (props: KeyPanelProps): ReactNode => {
    const [value, setValue] = useState(() => loadCredential(nativeStore, props.provider) ?? "");
    const [revealed, setRevealed] = useState(false);
    const { testKind } = props;
    return (
        <Panel>
            <Title>{props.title}</Title>
            <Subtitle>{props.subtitle}</Subtitle>
            <View flexDirection="row" gap={8} alignItems="center">
                <TextInput
                    style={INPUT_STYLE}
                    value={value}
                    onChangeText={setValue}
                    placeholder={props.placeholder}
                    placeholderTextColor="#556677"
                    secureTextEntry={!revealed}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={`${props.toastName} API key`}
                    testID={`${props.id}Key`}
                />
                <Button label={revealed ? "🙈" : "👁️"} onPress={() => { setRevealed(!revealed); }} testID={`${props.id}Toggle`} />
            </View>
            <View flexDirection="row" gap={8}>
                <Button
                    label="Save"
                    testID={`${props.id}Save`}
                    onPress={() => {
                        const key = value.trim();
                        saveCredential(nativeStore, props.provider, key);
                        props.onSaved();
                        void props.toast(key === "" ? `${props.toastName} API key removed` : `${props.toastName} API key saved`, key === "" ? "warning" : "success");
                    }}
                />
                {testKind === undefined ? null : (
                    <Button label="Test" accent testID={`${props.id}Test`} onPress={() => { props.onTest(testKind, value.trim()); }} />
                )}
            </View>
            <Status outcome={props.status} />
        </Panel>
    );
};

const Field = ({ label, value, onChange, placeholder, testID }: {
    readonly label: string;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder: string;
    readonly testID: string;
}): ReactNode => (
    <View gap={4}>
        <Label>{label}</Label>
        <TextInput
            style={INPUT_STYLE}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor="#556677"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={label}
            testID={testID}
        />
    </View>
);

const Range = ({ label, value, min, max, step, onChange, testID }: {
    readonly label: string;
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly onChange: (value: number) => void;
    readonly testID: string;
}): ReactNode => (
    <View gap={2}>
        <Label>{label}: {value.toString()}</Label>
        <Slider
            minimumValue={min}
            maximumValue={max}
            step={step}
            value={value}
            onValueChange={onChange}
            minimumTrackTintColor="#dbb858"
            maximumTrackTintColor="rgba(255, 255, 255, 0.12)"
            thumbTintColor="#dbb858"
            accessibilityLabel={label}
            testID={testID}
        />
    </View>
);

const WORKFLOWS: readonly WorkflowKind[] = ["flux", "sdxl"];

const ComfyPanel = ({ onSaved, onTest, status, toast }: {
    readonly onSaved: () => void;
    readonly onTest: (kind: TestKind, value: string) => void;
    readonly status: TestOutcome["status"] | undefined;
    readonly toast: (message: string, kind: string) => Promise<void>;
}): ReactNode => {
    const [comfy, setComfy] = useState<ComfySettings>(() => loadComfySettings(nativeStore));
    const [wan, setWan] = useState<WanSettings>(() => loadWanSettings(nativeStore));
    // Read back through the parsers, as the web panel does, so a saved value
    // has passed the same validation as one loaded from storage.
    const normalisedComfy = (): ComfySettings => parseComfySettings(JSON.stringify(comfy));
    return (
        <Panel>
            <Title>ComfyUI (local)</Title>
            <Subtitle>Optional. Generate on a machine on your own network. Only addresses on your local network are accepted.</Subtitle>
            <Field label="Server address" value={comfy.url} placeholder="http://192.168.1.10:8188" testID="settingsComfyUrl" onChange={(url) => { setComfy({ ...comfy, url }); }} />
            <View flexDirection="row" gap={8}>
                {WORKFLOWS.map((w) => (
                    <Button key={w} label={w === "flux" ? "Flux" : "SDXL"} accent={comfy.workflow === w} testID={`settingsComfyWorkflow-${w}`} onPress={() => { setComfy({ ...comfy, workflow: w }); }} />
                ))}
            </View>
            <Field label="Model" value={comfy.model} placeholder="flux1-dev-fp8.safetensors" testID="settingsComfyModel" onChange={(model) => { setComfy({ ...comfy, model }); }} />
            {comfy.workflow === "flux" ? (
                <>
                    <Field label="CLIP" value={comfy.clipName} placeholder="clip_l.safetensors" testID="settingsComfyClip" onChange={(clipName) => { setComfy({ ...comfy, clipName }); }} />
                    <Field label="T5" value={comfy.t5Name} placeholder="t5xxl_fp8_e4m3fn.safetensors" testID="settingsComfyT5" onChange={(t5Name) => { setComfy({ ...comfy, t5Name }); }} />
                    <Field label="VAE" value={comfy.vaeName} placeholder="ae.safetensors" testID="settingsComfyVae" onChange={(vaeName) => { setComfy({ ...comfy, vaeName }); }} />
                </>
            ) : null}
            <Range label="Steps" value={comfy.steps} min={4} max={60} step={1} testID="settingsComfySteps" onChange={(steps) => { setComfy({ ...comfy, steps }); }} />
            <Range label="Guidance" value={comfy.guidance} min={1} max={15} step={0.5} testID="settingsComfyGuidance" onChange={(guidance) => { setComfy({ ...comfy, guidance }); }} />
            <Subtitle>Video (Wan image-to-video)</Subtitle>
            <Field label="Wan UNET" value={wan.unet} placeholder="Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors" testID="settingsWanUnet" onChange={(unet) => { setWan({ ...wan, unet }); }} />
            <Field label="Wan VAE" value={wan.vae} placeholder="wan_2.1_vae.safetensors" testID="settingsWanVae" onChange={(vae) => { setWan({ ...wan, vae }); }} />
            <Field label="Text encoder" value={wan.textEncoder} placeholder="umt5_xxl_fp8_e4m3fn_scaled.safetensors" testID="settingsWanTextEncoder" onChange={(textEncoder) => { setWan({ ...wan, textEncoder }); }} />
            <Field label="CLIP vision" value={wan.clipVision} placeholder="clip_vision_h.safetensors" testID="settingsWanClipVision" onChange={(clipVision) => { setWan({ ...wan, clipVision }); }} />
            <Range label="Frames" value={wan.frames} min={17} max={201} step={8} testID="settingsWanFrames" onChange={(frames) => { setWan({ ...wan, frames }); }} />
            <View flexDirection="row" alignItems="center" gap={8}>
                <Switch value={wan.useGguf} onValueChange={(useGguf) => { setWan({ ...wan, useGguf }); }} accessibilityLabel="GGUF weights" testID="settingsWanGguf" />
                <Label>GGUF weights</Label>
            </View>
            <View flexDirection="row" gap={8}>
                <Button
                    label="Save"
                    testID="settingsComfySave"
                    onPress={() => {
                        saveComfySettings(nativeStore, normalisedComfy());
                        saveWanSettings(nativeStore, parseWanSettings(JSON.stringify(wan)));
                        onSaved();
                        void toast("ComfyUI settings saved", "success");
                    }}
                />
                <Button label="Test" accent testID="settingsComfyTest" onPress={() => { onTest("comfy", normalisedComfy().url); }} />
            </View>
            <Status outcome={status} />
        </Panel>
    );
};

export const SettingsScreen = ({ onSaved, onTest, outcome, toast }: {
    readonly onSaved: () => void;
    readonly onTest: (kind: TestKind, value: string) => void;
    readonly outcome: TestOutcome | null;
    readonly toast: (message: string, kind: string) => Promise<void>;
}): ReactNode => {
    // Which panel asked for the latest test, so its outcome shows there.
    const [asking, setAsking] = useState<TestKind | undefined>(undefined);
    const [sound, setSound] = useState(() => loadSoundEnabled(nativeStore));
    const [shown, setShown] = useState<TestOutcome["status"] | undefined>(undefined);
    useEffect(() => { setShown(outcome?.status); }, [outcome]);
    const test = (kind: TestKind, value: string): void => {
        setAsking(kind);
        setShown(value === "" && kind !== "comfy" ? { kind: "error", text: "Enter an API key first", pending: false } : { kind: "info", text: "Testing connection...", pending: true });
        onTest(kind, value);
    };
    const statusFor = (kind: TestKind): TestOutcome["status"] | undefined => (asking === kind ? shown : undefined);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} testID="settings-screen">
            <KeyPanel
                provider={PROVIDERS.openai}
                id="settingsOpenAI"
                title="OpenAI API Key"
                subtitle="Required for AI sprite generation (GPT Image 2). Stored in this phone's secure storage and sent only to OpenAI."
                placeholder="sk-..."
                toastName="OpenAI"
                testKind="openai"
                onSaved={onSaved}
                onTest={test}
                status={statusFor("openai")}
                toast={toast}
            />
            <KeyPanel
                provider={PROVIDERS.xai}
                id="settingsXai"
                title="xAI (Grok) API Key"
                subtitle="Optional. Lets Sprite Prep and video generation use Grok. Stored in this phone's secure storage and sent only to xAI."
                placeholder="xai-..."
                toastName="xAI"
                testKind={undefined}
                onSaved={onSaved}
                onTest={test}
                status={undefined}
                toast={toast}
            />
            <ComfyPanel onSaved={onSaved} onTest={test} status={statusFor("comfy")} toast={toast} />
            <KeyPanel
                provider={VIDEO_PROVIDERS.google}
                id="settingsGoogle"
                title="Google Gemini API Key"
                subtitle="Required for AI video generation (Gemini). Stored in this phone's secure storage and sent only to Google."
                placeholder="AIza..."
                toastName="Google"
                testKind="google"
                onSaved={onSaved}
                onTest={test}
                status={statusFor("google")}
                toast={toast}
            />
            <Panel>
                <Title>Notifications</Title>
                <View flexDirection="row" alignItems="center" gap={8}>
                    <Switch
                        value={sound}
                        onValueChange={(enabled) => { saveSoundEnabled(nativeStore, enabled); setSound(enabled); }}
                        accessibilityLabel="Play sound on generation complete"
                        testID="settingsSoundEnabled"
                    />
                    <Label flex={1}>Play sound on generation complete</Label>
                    <Button label="🔊 Test" testID="settingsSoundTest" onPress={() => { void playSound(); }} />
                </View>
            </Panel>
            <Panel alignItems="center">
                <Text fontSize={40}>⚔️</Text>
                <Text fontFamily="$display" fontSize="$9" color="$gold">Angel's Sword Studios</Text>
                <Text fontFamily="$mono" fontSize="$4" color="$textDim">AS Adventurer Creator — VTuber Creation Pipeline</Text>
                <View flexDirection="row" flexWrap="wrap" justifyContent="center" gap={12}>
                    {["https://www.angelssword.com", "https://rpg.angelssword.com", "https://clio.angelssword.com"].map((url) => (
                        <Pressable key={url} onPress={() => { void Linking.openURL(url); }} accessibilityRole="link">
                            <Text fontFamily="$body" fontSize="$5" color="$gold">{url.replace("https://", "")}</Text>
                        </Pressable>
                    ))}
                </View>
            </Panel>
        </ScrollView>
    );
};
