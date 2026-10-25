/**
 * The application.
 *
 * The chrome around the stages, and the settings panel in the fifth slot. The
 * stages themselves, their start-up and the invariant that keeps their
 * controllers safe are in `ui/StagePanels.tsx`, which the mobile application
 * renders too.
 */
import { styled, View } from "@tamagui/core";
import type { ReactNode } from "react";
import { AppContainer } from "../../ui/primitives.tsx";
import { StagePanels } from "../../ui/StagePanels.tsx";
import { Header, TabBar, Toaster, useCurrentTab } from "./chrome.tsx";
import { SettingsTab } from "../tabs/SettingsTab.tsx";

const TabContent = styled(View, {
    flex: 1,
    paddingVertical: 24,
    "$platform-web": { overflowY: "auto", overflowX: "hidden" },
});

export const App = (): ReactNode => {
    const active = useCurrentTab();
    return (
        <>
            <AppContainer className="app-container">
                <Header active={active} />
                <TabBar active={active} />
                <TabContent id="tabContent" className="tab-content">
                    <StagePanels active={active} settings={<SettingsTab />} />
                </TabContent>
            </AppContainer>
            <Toaster />
        </>
    );
};
