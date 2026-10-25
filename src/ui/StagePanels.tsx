/**
 * The pipeline's stages, shown one at a time, and the moment their
 * controllers take over.
 *
 * Shared by both entry points. The web application renders it inside its own
 * chrome with the settings panel in the fifth slot. The mobile application
 * renders it inside a web view, as an Expo DOM component, with native chrome
 * around it and the settings panel native; there the fifth slot is empty.
 *
 * The stages stay mounted when hidden, as they always did: a hidden stage keeps
 * its canvas, its loaded clip and its controls' state, and the controllers hold
 * references to those elements.
 *
 * THE INVARIANT THAT MAKES THE HANDOVER SAFE. A stage component renders once
 * and never again. After the controllers mount, they add and remove classes on
 * elements inside it and rewrite some containers' contents. React would undo or
 * trip over both if it re-rendered those subtrees, so the stage components take
 * no props and are memoized, and a change of tab re-renders only the panels'
 * own class, which the controllers do not touch.
 */
import { styled, View } from "@tamagui/core";
import { useEffect, type ReactNode } from "react";
import { initCharNameSync, initKeyboard } from "../platform-browser/shell.mts";
import { mountSpritePrep } from "../platform-browser/stages/sprite-prep.mts";
import { mountVideoGen } from "../platform-browser/stages/video-gen.mts";
import { mountVideoPrep } from "../platform-browser/stages/video-prep.mts";
import { mountModelExporter } from "../platform-browser/stages/model-exporter.mts";
import type { TabId } from "../platform-browser/navigation.mts";
import { SpritePrepTab } from "./stages/SpritePrepTab.tsx";
import { VideoGenTab } from "./stages/VideoGenTab.tsx";
import { VideoPrepTab } from "./stages/VideoPrepTab.tsx";
import { ExporterTab } from "./stages/ExporterTab.tsx";

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
    // shortcuts and name sync, then the four stages in pipeline order.
    initKeyboard();
    initCharNameSync();
    mountSpritePrep();
    mountVideoGen();
    mountVideoPrep();
    mountModelExporter();
    console.log("⚔️ AS Adventurer initialized");
};

export const StagePanels = ({ active, settings }: {
    readonly active: TabId;
    /** What the settings tab shows. Absent where settings are drawn elsewhere. */
    readonly settings?: ReactNode;
}): ReactNode => {
    useEffect(start, []);
    return (
        <>
            <TabPanel id="tab-sprite-prep" active={active}><SpritePrepTab /></TabPanel>
            <TabPanel id="tab-video-gen" active={active}><VideoGenTab /></TabPanel>
            <TabPanel id="tab-video-prep" active={active}><VideoPrepTab /></TabPanel>
            <TabPanel id="tab-exporter" active={active}><ExporterTab /></TabPanel>
            <TabPanel id="tab-settings" active={active}>{settings}</TabPanel>
        </>
    );
};
