/**
 * The application.
 *
 * Renders the chrome and all five stages, then hands the four media stages to
 * their controllers. The stages stay mounted when hidden, as they always did:
 * a hidden stage keeps its canvas, its loaded clip and its controls' state,
 * and the controllers hold references to those elements.
 *
 * THE INVARIANT THAT MAKES THE HANDOVER SAFE. A stage component renders once
 * and never again. After the controllers mount, they add and remove classes on
 * elements inside it and rewrite some containers' contents. React would undo
 * or trip over both if it re-rendered those subtrees, so the stage components
 * take no props and are memoized, and the tab change that re-renders this
 * component re-renders only the panels' own class, which the controllers do
 * not touch.
 */
import { styled, View } from "@tamagui/core";
import { useEffect, type ReactNode } from "react";
import { initCharNameSync, initKeyboard } from "../../platform-browser/shell.mts";
import { mountSpritePrep } from "../../platform-browser/stages/sprite-prep.mts";
import { mountVideoGen } from "../../platform-browser/stages/video-gen.mts";
import { mountVideoPrep } from "../../platform-browser/stages/video-prep.mts";
import { mountModelExporter } from "../../platform-browser/stages/model-exporter.mts";
import type { TabId } from "../../platform-browser/navigation.mts";
import { AppContainer } from "../ui/primitives.tsx";
import { Header, TabBar, Toaster, useCurrentTab } from "./chrome.tsx";
import { SpritePrepTab } from "../tabs/SpritePrepTab.tsx";
import { VideoGenTab } from "../tabs/VideoGenTab.tsx";
import { VideoPrepTab } from "../tabs/VideoPrepTab.tsx";
import { ExporterTab } from "../tabs/ExporterTab.tsx";
import { SettingsTab } from "../tabs/SettingsTab.tsx";

const TabContent = styled(View, {
    flex: 1,
    paddingVertical: 24,
    "$platform-web": { overflowY: "auto", overflowX: "hidden" },
});

const PanelFrame = styled(View, {
    display: "none",
    variants: {
        active: {
            true: { display: "block", "$platform-web": { animation: "fadeIn 0.25s ease" } },
        },
    } as const,
});

const TabPanel = ({ id, active, children }: {
    readonly id: TabId;
    readonly active: TabId;
    readonly children: ReactNode;
}): ReactNode => (
    <PanelFrame id={id} className={id === active ? "tab-panel active" : "tab-panel"} active={id === active}>
        {children}
    </PanelFrame>
);

/**
 * Whether the shell and the stages have been started. React's strict mode runs
 * an effect twice in development, and the keyboard shortcuts and the name sync
 * attach document listeners that must not be attached twice. The stages guard
 * themselves as well; this covers the sequence as a whole.
 */
let started = false;

const start = (): void => {
    if (started) return;
    started = true;
    // The order the five script tags ran in before the port: the shell's
    // shortcuts and name sync, then the four stages in pipeline order. The
    // settings panel is a component and set itself up when it mounted. The
    // handoff was published by `client.tsx` before any of this.
    initKeyboard();
    initCharNameSync();
    mountSpritePrep();
    mountVideoGen();
    mountVideoPrep();
    mountModelExporter();
    console.log("⚔️ AS Adventurer initialized");
};

export const App = (): ReactNode => {
    const active = useCurrentTab();

    useEffect(start, []);

    return (
        <>
            <AppContainer className="app-container">
                <Header active={active} />
                <TabBar active={active} />
                <TabContent id="tabContent" className="tab-content">
                    <TabPanel id="tab-sprite-prep" active={active}><SpritePrepTab /></TabPanel>
                    <TabPanel id="tab-video-gen" active={active}><VideoGenTab /></TabPanel>
                    <TabPanel id="tab-video-prep" active={active}><VideoPrepTab /></TabPanel>
                    <TabPanel id="tab-exporter" active={active}><ExporterTab /></TabPanel>
                    <TabPanel id="tab-settings" active={active}><SettingsTab /></TabPanel>
                </TabContent>
            </AppContainer>
            <Toaster />
        </>
    );
};
