/**
 * The page chrome: the header with its pipeline breadcrumb, the tab bar, and
 * the toasts. All three render from stores in the platform layer, which the
 * stage controllers also write to, so a controller moving the user to another
 * stage or reporting a result needs no reference to React.
 *
 * `className` and `data-tab` are kept on the tab buttons and steps. Nothing
 * here styles by them; the browser specifications locate the controls with
 * them, and the keyboard shortcuts find the active panel by its class.
 */
import { styled, View } from "@tamagui/core";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { currentTab, subscribeTab, switchTab, type TabId } from "../../platform-browser/navigation.mts";
import { currentToasts, subscribeToasts, type Toast } from "../../platform-browser/toasts.mts";
import { Text } from "../ui/primitives.tsx";

/** The stage showing now, re-rendering when it changes. */
export const useCurrentTab = (): TabId => useSyncExternalStore(subscribeTab, currentTab, currentTab);

// ─── Header ─────────────────────────────────────────────────────────────

const HeaderBar = styled(View, {
    render: "header",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 64,
    flexShrink: 0,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "$border",
    $narrow: { flexDirection: "column", height: "auto", paddingVertical: 12, gap: 8 },
});

const Brand = styled(View, { flexDirection: "row", alignItems: "center", gap: 12 });

const BrandName = styled(Text, {
    display: "block",
    fontFamily: "$display",
    fontSize: "$9",
    fontWeight: "700",
    letterSpacing: 0.5,
});

const BrandTagline = styled(Text, {
    display: "block",
    fontFamily: "$body",
    fontSize: "$3",
    color: "$textDim",
    letterSpacing: 2,
    textTransform: "uppercase",
});

const Steps = styled(View, {
    render: "nav",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    $compact: { display: "none" },
});

const Step = styled(Text, {
    display: "flex",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: "$sm",
    cursor: "pointer",
    fontFamily: "$mono",
    fontSize: "$3",
    color: "$textDim",
    hoverStyle: { color: "$textMuted", backgroundColor: "$hover" },
    "$platform-web": { transition: "all 0.2s ease" },
    variants: {
        active: {
            true: {
                color: "$gold",
                backgroundColor: "$goldDim",
                hoverStyle: { color: "$gold", backgroundColor: "$goldDim" },
            },
        },
    } as const,
});

const StepBadge = styled(Text, { fontFamily: "$mono", fontSize: "$2", opacity: 0.7 });
const StepArrow = styled(Text, { fontFamily: "$mono", fontSize: "$1", color: "$textDim", opacity: 0.5 });

const STEPS: readonly { readonly tab: TabId; readonly badge: string; readonly label: string }[] = [
    { tab: "tab-sprite-prep", badge: "①", label: "Sprite Prep" },
    { tab: "tab-video-gen", badge: "②", label: "Generate Video" },
    { tab: "tab-video-prep", badge: "③", label: "Video Prep" },
    { tab: "tab-exporter", badge: "④", label: "Export" },
];

export const Header = ({ active }: { readonly active: TabId }): ReactNode => (
    <HeaderBar className="app-header">
        <Brand>
            <img
                src="assets/Angelsword-Logo-white_25pct.webp"
                alt="Angel's Sword Studios"
                className="brand-logo"
                style={{ height: 36, width: "auto", filter: "drop-shadow(0 0 8px rgba(219, 184, 88, 0.3))" }}
            />
            <View>
                <BrandName className="brand-name gradient-gold-text">AS Adventurer Creator</BrandName>
                <BrandTagline>Design · Generate · Prepare · Export</BrandTagline>
            </View>
        </Brand>
        <Steps id="pipelineSteps" className="pipeline-steps">
            {STEPS.map((step, index) => (
                <View key={step.tab} flexDirection="row" alignItems="center" gap={6}>
                    {index > 0 ? <StepArrow>→</StepArrow> : null}
                    <Step
                        className={step.tab === active ? "step active" : "step"}
                        data-tab={step.tab}
                        active={step.tab === active}
                        onPress={() => { switchTab(step.tab); }}
                    >
                        <StepBadge>{step.badge}</StepBadge> {step.label}
                    </Step>
                </View>
            ))}
        </Steps>
    </HeaderBar>
);

// ─── Tab bar ────────────────────────────────────────────────────────────

const Bar = styled(View, {
    render: "nav",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "$border",
    flexShrink: 0,
    overflowX: "auto",
    $narrow: { gap: 0 },
});

/**
 * A tab. Text rendered as a `<button>` rather than a view, so that it carries
 * the colour and its hover, and the label and icon inherit it, which is how
 * the stylesheet's `.tab-btn` worked. A view cannot hold a colour, and
 * Tamagui's group hover, the other way to reach the label, makes the button a
 * size container that no longer takes its width from its content: tried, and
 * every tab collapsed onto the first.
 */
const TabButton = styled(Text, {
    render: "button",
    display: "flex",
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
    borderTopLeftRadius: "$md",
    borderTopRightRadius: "$md",
    color: "$textMuted",
    fontFamily: "$heading",
    fontSize: "$5",
    fontWeight: "500",
    letterSpacing: 0.5,
    hoverStyle: { color: "$text", backgroundColor: "$hover" },
    "$platform-web": { transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" },
    $compact: { paddingVertical: 8, paddingHorizontal: 12, fontSize: "$3" },
    $narrow: { paddingHorizontal: 10, gap: 4, fontSize: "$2" },
    variants: {
        active: { true: { color: "$gold", hoverStyle: { color: "$gold", backgroundColor: "$hover" } } },
    } as const,
});

const TabText = styled(Text, {
    fontFamily: "$heading",
    fontSize: "$5",
    fontWeight: "500",
    letterSpacing: 0.5,
    color: "inherit",
    whiteSpace: "nowrap",
    $compact: { fontSize: "$3" },
    $narrow: { fontSize: "$2", display: "none" },
});

// The button's font, which the icon inherited in the stylesheet.
const TabIcon = styled(Text, { fontFamily: "$heading", fontSize: "$8", color: "inherit" });

const Underline = styled(View, {
    position: "absolute",
    bottom: -1,
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: "$gold",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    "$platform-web": { boxShadow: "0 0 8px rgba(219, 184, 88, 0.3)" },
});

const TABS: readonly { readonly tab: TabId; readonly icon: string; readonly label: string; readonly title: string }[] = [
    { tab: "tab-sprite-prep", icon: "🎨", label: "Sprite Prep", title: "Create or prepare a sprite image with chroma key background" },
    { tab: "tab-video-gen", icon: "🎬", label: "Generate Video", title: "Generate animated videos from your sprite using AI" },
    { tab: "tab-video-prep", icon: "🔄", label: "Video Prep", title: "Build loops and choose a loop mode" },
    { tab: "tab-exporter", icon: "📦", label: "Model Exporter", title: "Export as transparent WebM or GIF with chroma key removal" },
    { tab: "tab-settings", icon: "⚙️", label: "Settings", title: "API keys, server settings, and about" },
];

export const TabBar = ({ active }: { readonly active: TabId }): ReactNode => (
    <Bar id="tabBar" className="tab-bar">
        {TABS.map((tab) => {
            const isActive = tab.tab === active;
            return (
                <TabButton
                    key={tab.tab}
                    className={isActive ? "tab-btn active" : "tab-btn"}
                    data-tab={tab.tab}
                    active={isActive}
                    render={<button title={tab.title} />}
                    onPress={() => { switchTab(tab.tab); }}
                >
                    <TabIcon className="tab-icon">{tab.icon}</TabIcon>
                    <TabText className="tab-label">{tab.label}</TabText>
                    {isActive ? <Underline /> : null}
                </TabButton>
            );
        })}
    </Bar>
);

// ─── Toasts ─────────────────────────────────────────────────────────────

const ToastStack = styled(View, {
    position: "fixed",
    top: 20,
    right: 20,
    zIndex: "$toast",
    gap: 8,
    pointerEvents: "none",
});

const ToastBody = styled(Text, {
    display: "block",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: "$md",
    borderWidth: 1,
    fontSize: "$5",
    fontWeight: "500",
    maxWidth: 360,
    pointerEvents: "auto",
    "$platform-web": {
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(12px)",
        transform: "translateX(120%)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    variants: {
        kind: {
            success: { backgroundColor: "rgba(123, 159, 110, 0.9)", borderColor: "rgba(123, 159, 110, 0.5)", color: "#fff" },
            error: { backgroundColor: "rgba(199, 80, 80, 0.9)", borderColor: "rgba(199, 80, 80, 0.5)", color: "#fff" },
            warning: { backgroundColor: "rgba(219, 184, 88, 0.9)", borderColor: "rgba(219, 184, 88, 0.5)", color: "$bgDeep" },
            info: { backgroundColor: "rgba(91, 181, 166, 0.9)", borderColor: "rgba(91, 181, 166, 0.5)", color: "$bgDeep" },
        },
        shown: { true: { "$platform-web": { transform: "translateX(0)" } } },
    } as const,
});

/**
 * One toast. It is rendered off screen and moved on in the next frame, so the
 * browser has a starting position to animate from, which is what the original
 * did with a class added after a `requestAnimationFrame`.
 */
const ToastItem = ({ toast }: { readonly toast: Toast }): ReactNode => {
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => { setEntered(true); });
        return (): void => { cancelAnimationFrame(frame); };
    }, []);
    const shown = entered && !toast.leaving;
    const state = toast.leaving ? " exit" : shown ? " show" : "";
    return (
        <ToastBody className={`toast ${toast.kind}${state}`} kind={toast.kind} shown={shown}>
            {toast.message}
        </ToastBody>
    );
};

export const Toaster = (): ReactNode => {
    const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts);
    return (
        <ToastStack id="toastContainer" className="toast-container">
            {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
        </ToastStack>
    );
};
