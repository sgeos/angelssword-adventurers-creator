/**
 * The design system, as Tamagui tokens.
 *
 * Every value is taken from the custom properties the stylesheet declared on
 * `:root`, so the port changes where the design is written down rather than
 * what it is. Spacing is in pixels at the sixteen pixel root size the
 * stylesheet's `rem` values assumed.
 *
 * One theme, `dark`, because the application has never had another. The
 * stylesheet keeps its own copies of these values for the parts of the page
 * that are still styled by class, and the two must agree until those parts
 * move here.
 */
import { createFont, createTamagui, createTokens, type TamaguiInternalConfig } from "@tamagui/core";

const color = {
    bgDeep: "#1a1a2e",
    bgPanel: "#16213e",
    bgPanelAlt: "#1b2a4a",
    bgInput: "#0f1a30",
    bgCard: "rgba(22, 33, 62, 0.75)",
    accentRed: "#e94560",
    accentBlue: "#0f3460",
    gold: "#dbb858",
    goldSoft: "#c4a04e",
    goldGlow: "rgba(219, 184, 88, 0.3)",
    goldDim: "rgba(219, 184, 88, 0.15)",
    teal: "#5bb5a6",
    tealGlow: "rgba(91, 181, 166, 0.35)",
    success: "#7b9f6e",
    error: "#c75050",
    info: "#5bb5a6",
    warning: "#dbb858",
    text: "#e0e0e0",
    textBright: "#fff8ee",
    textMuted: "#8899aa",
    textDim: "#556677",
    border: "rgba(255, 255, 255, 0.08)",
    borderLight: "rgba(255, 255, 255, 0.12)",
    borderGold: "rgba(219, 184, 88, 0.15)",
    borderGoldMed: "rgba(219, 184, 88, 0.25)",
    hover: "rgba(255, 255, 255, 0.04)",
    transparent: "transparent",
} as const;

const space = {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 12,
    6: 16,
    7: 20,
    8: 24,
    true: 8,
} as const;

const tokens = createTokens({
    color,
    space,
    size: space,
    radius: { 0: 0, sm: 4, md: 8, lg: 12, xl: 16, true: 8 },
    zIndex: { 0: 0, base: 1, toast: 1000, modal: 2000, true: 1 },
});

/** Font sizes in pixels, keyed by the rem value the stylesheet used. */
const fontSize = {
    1: 9.6, // 0.6rem
    2: 10.4, // 0.65rem
    3: 11.2, // 0.7rem
    4: 12, // 0.75rem
    5: 12.8, // 0.8rem
    6: 13.6, // 0.85rem
    7: 14.4, // 0.9rem
    8: 16, // 1rem
    9: 17.6, // 1.1rem
    10: 24, // 1.5rem
} as const;

/**
 * No default size, line height, weight or spacing.
 *
 * Tamagui gives every text its font's `true` value for each of these, whatever
 * the text's own size. The stylesheet set none of them per element: the body
 * set a line height ratio of 1.6, and every element inherited the ratio and
 * computed it against its own size, and inherited its size and weight from
 * whatever contained it. Measured against the previous build, the defaults
 * made a 12.8 pixel label 23 pixels tall rather than 20.5, and lifted every
 * stage by three pixels. Without a `true` entry Tamagui sets nothing, and the
 * document's inheritance applies as it did before.
 *
 * The line height map is therefore empty. Sizes that are set explicitly take
 * the inherited ratio, which is the behaviour being preserved.
 */
const makeFont = (family: string): ReturnType<typeof createFont> =>
    createFont({
        family,
        size: fontSize,
        lineHeight: {},
        weight: { 4: "400", 5: "500", 6: "600", 7: "700" },
        letterSpacing: { 0: 0, 1: 0.5, 2: 1, 3: 2 },
    });

const fonts = {
    display: makeFont("'Cinzel Decorative', 'Georgia', serif"),
    heading: makeFont("'Cinzel', 'Georgia', serif"),
    body: makeFont("'Outfit', 'Segoe UI', sans-serif"),
    mono: makeFont("'Share Tech Mono', monospace"),
};

export const config: TamaguiInternalConfig = createTamagui({
    tokens,
    fonts,
    themes: {
        dark: {
            background: color.bgDeep,
            color: color.text,
            borderColor: color.border,
        },
    },
    defaultFont: "body",
    // The stylesheet's three breakpoints, under names that say what changes.
    media: {
        stacked: { maxWidth: 1100 },
        compact: { maxWidth: 768 },
        narrow: { maxWidth: 640 },
    },
    settings: {
        // Raw values are allowed beside tokens. The port carries measurements
        // such as `380px` columns and `rem` paddings over exactly, and forcing
        // each through a token would invent a scale the design never had.
        allowedStyleValues: false,
    },
});
