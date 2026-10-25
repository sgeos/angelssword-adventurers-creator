/**
 * Expo's Babel transformer, for `.mts` files too.
 *
 * Expo's preset strips TypeScript from files ending `.ts` or `.tsx` and
 * leaves every other file untouched. The shared sources in `../src` are
 * `.mts`, because that is the extension under which Node runs TypeScript as an
 * ECMAScript module without a build step. So each `.mts` file is handed to
 * Expo's transformer under a `.ts` name, which selects the same TypeScript
 * stripping, and everything else passes through unchanged.
 *
 * A Babel configuration file with an override for `.mts` would do the same,
 * but would have to be JavaScript, and this repository keeps one JavaScript
 * file, the lint configuration, deliberately.
 */
import expo from "@expo/metro-config/babel-transformer";

type Transform = typeof expo.transform;

export const transform: Transform = (args) =>
    expo.transform(args.filename.endsWith(".mts") ? { ...args, filename: `${args.filename.slice(0, -4)}.ts` } : args);

/** Part of Metro's cache key, so that a change to this wrapper invalidates the cache. */
export const getCacheKey: NonNullable<typeof expo.getCacheKey> = (options) =>
    `mts-as-ts-1:${expo.getCacheKey === undefined ? "" : expo.getCacheKey(options)}`;
