/**
 * `application/x-www-form-urlencoded` serialisation, in plain ECMAScript.
 *
 * # Why this exists rather than `URLSearchParams`
 *
 * `URLSearchParams` is supplied by the browser and by Node, and by neither the
 * language nor this layer. The core compiles without the DOM lib and without
 * the Node types, so reaching for it is the layering violation the core
 * project exists to catch, and it was caught exactly that way.
 *
 * # Fidelity
 *
 * This is not an approximation of `URLSearchParams`. It implements the WHATWG
 * urlencoded serialiser, whose safe set is `*`, `-`, `.`, `0`-`9`, `A`-`Z`,
 * `_` and `a`-`z`, with a space written as `+` and every other byte written as
 * an uppercase percent escape of its UTF-8 encoding.
 *
 * `encodeURIComponent` does most of that, differing in exactly six characters.
 * It writes a space as `%20`, and it leaves `!`, `'`, `(`, `)` and `~`
 * unescaped where the urlencoded set does not. Those six are corrected below,
 * and a differential test asserts agreement with `URLSearchParams` rather than
 * leaving the claim to this comment.
 */

/** One character escaped by `encodeURIComponent` differently, and its escape. */
const CORRECTIONS: readonly (readonly [RegExp, string])[] = [
    [/%20/g, "+"],
    [/!/g, "%21"],
    [/'/g, "%27"],
    [/\(/g, "%28"],
    [/\)/g, "%29"],
    [/~/g, "%7E"],
];

/** One name or value, escaped for a urlencoded body or query string. */
export const formUrlEncodeComponent = (raw: string): string =>
    CORRECTIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement),
        encodeURIComponent(raw));

/**
 * Name and value pairs joined into a query string, without a leading `?`.
 *
 * Pair order is preserved, because a caller that cares about the order of its
 * own query string has no other way to express it. An empty list yields an
 * empty string rather than a bare separator.
 */
export const formUrlEncode = (pairs: readonly (readonly [string, string])[]): string =>
    pairs
        .map(([name, value]) => `${formUrlEncodeComponent(name)}=${formUrlEncodeComponent(value)}`)
        .join("&");
