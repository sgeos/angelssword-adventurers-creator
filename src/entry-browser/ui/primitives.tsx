/**
 * Layout and typography shared by every stage, written once in Tamagui.
 *
 * Each component reproduces a stylesheet rule it replaced, value for value,
 * and the rule was deleted when the component took over.
 *
 * THE EXCEPTION, AND WHY. The three grid layouts keep their class and their
 * rule in the stylesheet. Tamagui renders grid on the web, but its types admit
 * no `display: "grid"`, and the only way past them is a type assertion, which
 * the lint bans. A native layout has no grid in any case, so the class names
 * the one part of these layouts that only exists on the web, and on a native
 * target the components fall back to a column, as the stylesheet already did
 * below its first breakpoint. The same reasoning keeps gradient text in the
 * stylesheet as `.gradient-gold-text`.
 *
 * Class names are still passed where something outside React selects by them:
 * the stage controllers query `.stage` and toggle `disabled` on it, and the
 * browser specifications locate elements by the same names. A class here is a
 * hook, not a style.
 */

/**
 * Text that names its font family. Every text here derives from it.
 *
 * A size token such as `$8` resolves against the font's own scale only when
 * the font family is known. Without one it resolves against the spacing
 * scale, so a 16 pixel icon came out at 24. Declaring the family once, here,
 * removes the ambiguity everywhere.
 */
export const Text = styled(TamaguiText, { fontFamily: "$body" });
import { styled, Text as TamaguiText, View, type GetProps } from "@tamagui/core";
import type { ReactNode } from "react";

/** The page column. `.app-container` in the stylesheet. */
export const AppContainer = styled(View, {
    position: "relative",
    zIndex: 1,
    height: "100vh",
    maxWidth: 1600,
    width: "100%",
    marginHorizontal: "auto",
    paddingHorizontal: 24,
    $compact: { paddingHorizontal: 12 },
});

/**
 * A frosted card. `.glass-panel`.
 *
 * Block layout rather than a view's default column, deliberately. The design
 * relies on vertical margins collapsing: a form row's sixteen pixel margin
 * meets a divider's twenty-four, and the stylesheet's page showed twenty-four
 * between them. Margins never collapse inside a flex container, so as a column
 * every such pair grew by sixteen, measured against the previous build.
 */
export const Panel = styled(View, {
    display: "block",
    backgroundColor: "$bgCard",
    borderWidth: 1,
    borderColor: "$borderGold",
    borderRadius: "$lg",
    padding: 24,
    marginBottom: 20,
    hoverStyle: { borderColor: "$borderGoldMed" },
    $narrow: { padding: 16 },
    "$platform-web": {
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        transition: "border-color 0.2s ease",
    },
});

/** A card heading, an icon then a label. `.panel-title`. */
export const PanelTitle = styled(View, {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
});

export const PanelTitleText = styled(Text, {
    fontFamily: "$heading",
    fontSize: "$7",
    fontWeight: "600",
    color: "$textBright",
    textTransform: "uppercase",
    letterSpacing: 1,
});

/**
 * The icon takes the title's font. In the stylesheet it inherited it from the
 * title row; a Tamagui view passes no font on, so the icon fell back to the
 * body's sixteen pixels and every panel title grew by 2.6.
 */
export const PanelTitleIcon = styled(Text, {
    fontFamily: "$heading",
    fontSize: "$7",
    color: "$gold",
});

/** `.panel-subtitle`. */
export const PanelSubtitle = styled(Text, {
    display: "block",
    fontSize: "$5",
    color: "$textMuted",
    marginBottom: 16,
    lineHeight: 1.5 * 12.8,
});

const MainLayoutFrame = styled(View, { gap: 24 });
const TwoColFrame = styled(View, { gap: 16 });
const ConfigGridFrame = styled(View, { gap: 16 });

/**
 * The two-column body of a stage: content, then a 380 pixel sidebar. The
 * columns are `.main-layout` in the stylesheet; see the note above.
 */
export const MainLayout = (props: GetProps<typeof MainLayoutFrame>): ReactNode => (
    <MainLayoutFrame {...props} className="main-layout" />
);

/** Two equal columns, `.two-col`. */
export const TwoCol = (props: GetProps<typeof TwoColFrame>): ReactNode => (
    <TwoColFrame {...props} className="two-col" />
);

/** As many 200 pixel columns as fit, `.config-grid`. */
export const ConfigGrid = (props: GetProps<typeof ConfigGridFrame>): ReactNode => (
    <ConfigGridFrame {...props} className="config-grid" />
);

const FormRowFrame = styled(View, {
    display: "block",
    marginBottom: 16,
});

/**
 * A labelled control. The last row in its container has no margin below it,
 * which is a `:last-child` rule Tamagui cannot express, so the row carries the
 * class `.form-row` for the rule in `web-only.ts`.
 */
export const FormRow = (props: GetProps<typeof FormRowFrame>): ReactNode => (
    <FormRowFrame {...props} className="form-row" />
);

/** A numbered step within a stage. `.stage`. */
export const StageSection = styled(View, {
    render: "section",
    display: "block",
    marginBottom: 24,
});

const StageHeaderRow = styled(View, {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
});

const StageNumber = styled(Text, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    flexShrink: 0,
    backgroundColor: "$goldDim",
    color: "$gold",
    fontFamily: "$heading",
    fontSize: "$4",
    fontWeight: "700",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "$borderGold",
});

const StageTitle = styled(Text, {
    fontFamily: "$heading",
    fontSize: "$6",
    fontWeight: "600",
    color: "$textBright",
    textTransform: "uppercase",
    letterSpacing: 0.5,
});

/** The numbered heading of a stage. `.stage-header`. */
export const StageHeader = ({ number, title }: { readonly number: number; readonly title: string }): ReactNode => (
    <StageHeaderRow>
        <StageNumber className="stage-number">{number.toString()}</StageNumber>
        <StageTitle className="stage-title">{title}</StageTitle>
    </StageHeaderRow>
);

/** `.gold-divider`. */
export const GoldDivider = styled(View, {
    render: "hr",
    height: 1,
    marginVertical: 24,
    borderWidth: 0,
    "$platform-web": {
        background: "linear-gradient(90deg, transparent, #c4a04e 20%, #dbb858 50%, #c4a04e 80%, transparent)",
        boxShadow: "0 0 8px rgba(219, 184, 88, 0.3)",
    },
});

/** A teal-tinted notice above a stage. `.info-banner`. */
export const InfoBanner = styled(View, {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(91, 181, 166, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(91, 181, 166, 0.15)",
    borderRadius: "$md",
    marginBottom: 20,
});

export const InfoBannerText = styled(Text, {
    fontSize: "$5",
    color: "$textMuted",
    lineHeight: 1.5 * 12.8,
});

export const InfoBannerIcon = styled(Text, {
    fontSize: "$8",
    // The banner's line height, which the icon inherited from it.
    lineHeight: 1.5 * 16,
    flexShrink: 0,
    color: "$teal",
});

/** A boxed explanatory note. `.settings-info`. */
export const InfoNote = styled(Text, {
    display: "block",
    backgroundColor: "$bgPanel",
    borderWidth: 1,
    borderColor: "$border",
    borderRadius: "$md",
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: "$5",
    color: "$textMuted",
    lineHeight: 1.6 * 12.8,
    marginTop: 12,
});

export const InfoNoteIcon = styled(Text, {
    color: "$teal",
    marginRight: 6,
});

/** Muted inline text. `.text-dim`. */
export const Dim = styled(Text, { color: "$textDim" });

/** Gold inline text. `.text-gold`. */
export const Gold = styled(Text, { color: "$gold" });

/**
 * A button, from the stylesheet's `.btn` family, for interface written in
 * Tamagui. The stage interiors keep the class-styled buttons, because their
 * controllers also generate buttons as markup at run time, and those can only
 * be styled by class.
 *
 * Built on Text rendered as a `<button>`, since a button carries text styling
 * and a View cannot. `tone` and `small` are the stylesheet's modifier classes.
 */
export const Button = styled(Text, {
    render: "button",
    // A browser gives a button `line-height: normal` rather than inheriting
    // the page's ratio, and the stylesheet's buttons relied on that.
    lineHeight: "normal",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: "$borderLight",
    borderRadius: "$md",
    backgroundColor: "transparent",
    color: "$text",
    fontFamily: "$body",
    fontSize: "$6",
    fontWeight: "500",
    cursor: "pointer",
    hoverStyle: { y: -1, boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)" },
    pressStyle: { y: 0, scale: 0.98 },
    "$platform-web": {
        whiteSpace: "nowrap",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
    variants: {
        tone: {
            secondary: {
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                borderColor: "$borderLight",
                hoverStyle: { backgroundColor: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.2)" },
            },
            accent: {
                color: "$bgDeep",
                borderColor: "transparent",
                fontWeight: "600",
                "$platform-web": { backgroundImage: "linear-gradient(135deg, #5bb5a6, #4a9e90)" },
            },
        },
        small: { true: { paddingVertical: 6, paddingHorizontal: 12, fontSize: "$4" } },
    } as const,
});

/** An outcome line, from `.status-msg`. The class stays for the specifications. */
export const StatusLine = styled(Text, {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: "$md",
    borderWidth: 1,
    fontSize: "$5",
    marginTop: 12,
    variants: {
        kind: {
            info: { backgroundColor: "rgba(91, 181, 166, 0.1)", borderColor: "rgba(91, 181, 166, 0.2)", color: "$teal" },
            error: { backgroundColor: "rgba(199, 80, 80, 0.1)", borderColor: "rgba(199, 80, 80, 0.2)", color: "$error" },
            success: { backgroundColor: "rgba(123, 159, 110, 0.1)", borderColor: "rgba(123, 159, 110, 0.2)", color: "$success" },
        },
    } as const,
});
