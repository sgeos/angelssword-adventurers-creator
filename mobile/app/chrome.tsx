/**
 * The native chrome: the header, the tab bar and the toasts.
 *
 * The same design as the web page's, from the same Tamagui tokens, drawn with
 * native views. The pipeline breadcrumb is left out, as the web page leaves
 * it out on a narrow screen, and the tab labels stay, because a phone in
 * portrait has room for them in a scrolling bar.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Pressable, ScrollView, type ScrollViewInstance } from "react-native";
import { styled, Text, View } from "@tamagui/core";
import type { TabId } from "../../src/core/tabs.mts";
import logo from "../../public/assets/Angelsword-Logo-white_25pct.webp";

const HeaderBar = styled(View, {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "$border",
    backgroundColor: "$bgDeep",
});

const BrandName = styled(Text, { fontFamily: "$display", fontSize: "$9", color: "$gold", letterSpacing: 0.5 });
const BrandTagline = styled(Text, { fontFamily: "$body", fontSize: "$2", color: "$textDim", letterSpacing: 2, textTransform: "uppercase" });

export const Header = (): ReactNode => (
    <HeaderBar>
        <Image source={logo} style={{ width: 36, height: 36 }} resizeMode="contain" accessibilityLabel="Angel's Sword Studios" />
        <View>
            <BrandName>AS Adventurer Creator</BrandName>
            <BrandTagline>Design · Generate · Prepare · Export</BrandTagline>
        </View>
    </HeaderBar>
);

const TABS: readonly { readonly tab: TabId; readonly icon: string; readonly label: string }[] = [
    { tab: "tab-sprite-prep", icon: "🎨", label: "Sprite Prep" },
    { tab: "tab-video-gen", icon: "🎬", label: "Generate Video" },
    { tab: "tab-video-prep", icon: "🔄", label: "Video Prep" },
    { tab: "tab-exporter", icon: "📦", label: "Model Exporter" },
    { tab: "tab-settings", icon: "⚙️", label: "Settings" },
];

const TabLabel = styled(Text, {
    fontFamily: "$heading",
    fontSize: "$5",
    letterSpacing: 0.5,
    color: "$textMuted",
    variants: { active: { true: { color: "$gold" } } } as const,
});

/** Space left of the active tab when the bar scrolls to it, so its neighbour shows. */
const SCROLL_MARGIN = 24;

export const TabBar = ({ active, onChange }: { readonly active: TabId; readonly onChange: (tab: TabId) => void }): ReactNode => {
    // Each tab's left edge, measured as it lays out. The bar is wider than a
    // phone, and a stage can move the user to a tab that is off screen, as
    // Video Prep does when it hands a clip to the exporter. The bar then
    // scrolls so that the tab the user is on can be seen.
    const scroller = useRef<ScrollViewInstance>(null);
    const offsets = useRef(new Map<TabId, number>());
    useEffect(() => {
        const x = offsets.current.get(active);
        if (x !== undefined) scroller.current?.scrollTo({ x: Math.max(0, x - SCROLL_MARGIN), animated: true });
    }, [active]);
    return (
        <View borderBottomWidth={1} borderBottomColor="$border" backgroundColor="$bgDeep">
            <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false}>
                {TABS.map((tab) => {
                    const isActive = tab.tab === active;
                    return (
                        <Pressable
                            key={tab.tab}
                            onLayout={(event) => { offsets.current.set(tab.tab, event.nativeEvent.layout.x); }}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isActive }}
                            accessibilityLabel={tab.label}
                            testID={tab.tab}
                            onPress={() => { onChange(tab.tab); }}
                        >
                            <View flexDirection="row" alignItems="center" gap={6} paddingHorizontal={14} paddingVertical={12}>
                                <Text fontSize={16}>{tab.icon}</Text>
                                <TabLabel active={isActive}>{tab.label}</TabLabel>
                            </View>
                            {isActive ? <View height={2} marginHorizontal={12} backgroundColor="$gold" borderRadius={2} /> : null}
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
};

// ─── Toasts ─────────────────────────────────────────────────────────────

type Kind = "info" | "success" | "warning" | "error";

export interface ToastItem {
    readonly id: number;
    readonly message: string;
    readonly kind: Kind;
}

const KINDS: readonly Kind[] = ["info", "success", "warning", "error"];

/** The same timing as the web page's toasts: three and a half seconds. */
const VISIBLE_MS = 3500;

/** A warning or an error is read rather than glanced at, and stays twice as long. */
const SERIOUS_VISIBLE_MS = 7000;

export const useToasts = (): { readonly items: readonly ToastItem[]; readonly show: (message: string, kind: string) => Promise<void> } => {
    const [items, setItems] = useState<readonly ToastItem[]>([]);
    const next = useRef(1);
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
    useEffect(() => (): void => { for (const timer of timers.current) clearTimeout(timer); }, []);
    const show = useCallback(async (message: string, kind: string): Promise<void> => {
        const id = next.current;
        next.current += 1;
        setItems((current) => [...current, { id, message, kind: KINDS.find((k) => k === kind) ?? "info" }]);
        const visible = kind === "warning" || kind === "error" ? SERIOUS_VISIBLE_MS : VISIBLE_MS;
        const timer = setTimeout(() => {
            timers.current.delete(timer);
            setItems((current) => current.filter((t) => t.id !== id));
        }, visible);
        timers.current.add(timer);
        return Promise.resolve();
    }, []);
    return { items, show };
};

const ToastBody = styled(Text, {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: "$md",
    borderWidth: 1,
    fontFamily: "$body",
    fontSize: "$6",
    overflow: "hidden",
    variants: {
        kind: {
            success: { backgroundColor: "rgba(123, 159, 110, 0.95)", borderColor: "rgba(123, 159, 110, 0.5)", color: "#fff" },
            error: { backgroundColor: "rgba(199, 80, 80, 0.95)", borderColor: "rgba(199, 80, 80, 0.5)", color: "#fff" },
            warning: { backgroundColor: "rgba(219, 184, 88, 0.95)", borderColor: "rgba(219, 184, 88, 0.5)", color: "$bgDeep" },
            info: { backgroundColor: "rgba(91, 181, 166, 0.95)", borderColor: "rgba(91, 181, 166, 0.5)", color: "$bgDeep" },
        },
    } as const,
});

export const Toasts = ({ items }: { readonly items: readonly ToastItem[] }): ReactNode => (
    <View position="absolute" top={110} left={16} right={16} gap={8} pointerEvents="box-none">
        {items.map((toast) => (
            <ToastBody key={toast.id} kind={toast.kind} testID="toast" accessibilityLiveRegion="polite">
                {toast.message}
            </ToastBody>
        ))}
    </View>
);
