/**
 * The mobile application.
 *
 * Native chrome around the stages: a header, a tab bar, toasts and the
 * settings screen are native Tamagui, and the four media stages run in one web
 * view as an Expo DOM component. The web view stays mounted when the settings
 * screen shows, so a stage keeps its loaded clip and its state, as it does on
 * the desktop.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { TamaguiProvider, View } from "@tamagui/core";
import { config } from "../../src/ui/config.ts";
import { asTabId, type TabId } from "../../src/core/tabs.mts";
import Stages, { type TestRequest } from "../dom/Stages.tsx";
import { storedSettings, writeSetting } from "./storage.ts";
import { sendUpstream } from "./upstream.ts";
import { pickFile, readPicked, releasePicked, saveFile } from "./files.ts";
import { playSound } from "./sound.ts";
import { Header, TabBar, Toasts, useToasts } from "./chrome.tsx";
import { SettingsScreen, type TestOutcome } from "./SettingsScreen.tsx";
import cinzel from "../../public/fonts/cinzel/Cinzel[wght].ttf";
import cinzelDecorative from "../../public/fonts/cinzel-decorative/CinzelDecorative-Bold.ttf";
import outfit from "../../public/fonts/outfit/Outfit[wght].ttf";
import shareTechMono from "../../public/fonts/share-tech-mono/ShareTechMono-Regular.ttf";

export default function App(): ReactNode {
    // Registered under the names the shared config gives native platforms.
    const [fontsReady] = useFonts({
        Cinzel: cinzel,
        "Cinzel Decorative": cinzelDecorative,
        Outfit: outfit,
        "Share Tech Mono": shareTechMono,
    });
    const [tab, setTab] = useState<TabId>("tab-sprite-prep");
    const [stored, setStored] = useState(storedSettings);
    const [test, setTest] = useState<TestRequest | null>(null);
    const [outcome, setOutcome] = useState<TestOutcome | null>(null);
    const toasts = useToasts();

    // The web view reports each start. Android kills a web view's renderer
    // under memory pressure, Expo reloads it, and everything the stages held
    // is gone, a loaded clip and an export in progress included. A long, high
    // resolution clip can cause that on a phone, since the stages hold the
    // clip and decode it in memory. Without this the user saw the stages
    // simply reset.
    const starts = useRef(0);
    const showToast = toasts.show;
    const started = useCallback(async (): Promise<void> => {
        starts.current += 1;
        if (starts.current > 1) {
            await showToast("The phone ran low on memory and the stages restarted. A loaded clip or an export in progress was lost. A shorter or smaller clip uses less memory.", "warning");
        }
    }, [showToast]);

    const changeTab = useCallback(async (next: string): Promise<void> => {
        const id = asTabId(next);
        if (id !== undefined) setTab(id);
        return Promise.resolve();
    }, []);

    if (!fontsReady) return null;

    return (
        <TamaguiProvider config={config} defaultTheme="dark">
            <SafeAreaProvider>
                <SafeAreaView style={{ flex: 1, backgroundColor: "#1a1a2e" }} edges={["top", "left", "right"]}>
                    <StatusBar style="light" />
                    <Header />
                    <TabBar active={tab} onChange={setTab} />
                    <View flex={1}>
                        <View flex={1} display={tab === "tab-settings" ? "none" : "flex"}>
                            <Stages
                                activeTab={tab}
                                stored={stored}
                                test={test}
                                sendUpstream={sendUpstream}
                                saveFile={saveFile}
                                pickFile={pickFile}
                                readPicked={readPicked}
                                releasePicked={releasePicked}
                                playSound={playSound}
                                showToast={toasts.show}
                                changeTab={changeTab}
                                writeSetting={writeSetting}
                                started={started}
                                reportTest={async (id, status) => {
                                    setOutcome({ id, status });
                                    return Promise.resolve();
                                }}
                                dom={{ style: { flex: 1, backgroundColor: "#1a1a2e" }, webviewDebuggingEnabled: true }}
                            />
                        </View>
                        {tab === "tab-settings" ? (
                            <SettingsScreen
                                onSaved={() => { setStored(storedSettings()); }}
                                onTest={(kind, value) => { setTest({ id: (test?.id ?? 0) + 1, kind, value }); }}
                                outcome={outcome}
                                toast={toasts.show}
                            />
                        ) : null}
                    </View>
                    <Toasts items={toasts.items} />
                </SafeAreaView>
            </SafeAreaProvider>
        </TamaguiProvider>
    );
}
