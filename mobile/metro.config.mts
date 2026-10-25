/**
 * Metro, for the mobile application and the shared sources it imports.
 *
 * The application lives in `mobile/` with its own dependencies, and imports
 * the core, the shared interface and the browser platform from `../src`, and
 * fonts and sounds from `../public`. Two things make that work.
 *
 * Metro watches those directories, which lie outside the project root.
 *
 * And a package imported from a shared file resolves from this project's
 * `node_modules`, never from the repository root's. The root has its own
 * React and Tamagui for the web build; resolving by the importing file's
 * location would load a second React into the same application, which React
 * reports at run time as an invalid hook call. Expo's automatic monorepo
 * support solves this for workspaces; this repository keeps the mobile package
 * out of the web build's install on purpose, so it is solved here instead.
 */
import path from "node:path";
import expoMetroConfig from "expo/metro-config";
import { mergeConfig } from "@expo/metro/metro-config";
import type { CustomResolver } from "@expo/metro/metro-resolver";

const projectRoot = import.meta.dirname;
const repoRoot = path.resolve(projectRoot, "..");
const sharedRoots = [path.join(repoRoot, "src"), path.join(repoRoot, "public")];

/**
 * Directories of the repository Metro must never index: the web build's
 * dependencies, which would offer a second React, its build output, and the
 * directories that hold scratch files and secrets.
 */
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blocked = ["node_modules", "dist", "tmp", "secret", ".git", "test-results", "playwright-report"]
    .map((name) => new RegExp(`^${escape(path.join(repoRoot, name))}(/.*)?$`));

const config: ReturnType<typeof expoMetroConfig.getDefaultConfig> = expoMetroConfig.getDefaultConfig(projectRoot);

/** A bare specifier names a package; a relative or absolute one names a file. */
const isPackage = (name: string): boolean => !name.startsWith(".") && !path.isAbsolute(name);

const fromShared = (origin: string): boolean => sharedRoots.some((root) => origin.startsWith(root + path.sep));

const resolveRequest = config.resolver.resolveRequest;

const resolveShared: CustomResolver = (context, moduleName, platform) => {
    const origin = isPackage(moduleName) && fromShared(context.originModulePath)
        ? { ...context, originModulePath: path.join(projectRoot, "index.ts") }
        : context;
    // Expo's default leaves this unset (null, not undefined), in which case
    // Metro's own resolver is the one on the context.
    return typeof resolveRequest === "function"
        ? resolveRequest(origin, moduleName, platform)
        : origin.resolveRequest(origin, moduleName, platform);
};

// Merged, not spread. Expo's declaration types the transformer section with a
// Metro type that Metro does not export, so that section is an unresolved
// type, and spreading it would carry the unresolved type into this file.
// Metro's merge combines each section with the defaults, as a spread would.
const merged: typeof config = mergeConfig(config, {
    // The repository root, not the two shared directories alone. Metro's file
    // map represents a watched path outside the project root relative to it,
    // and watching two siblings of the root failed inside the map with "Failed
    // to collapse". Watching their common parent is the arrangement Expo
    // itself uses for a monorepo, and the block list keeps the rest out.
    watchFolders: [...config.watchFolders, repoRoot],
    transformer: {
        // Strips TypeScript from the shared `.mts` sources; see the file.
        babelTransformerPath: path.join(projectRoot, "babel-transformer.mts"),
    },
    resolver: {
        blockList: [...[config.resolver.blockList].flat(), ...blocked],
        // The shared sources are `.mts`, and import each other by that name.
        sourceExts: [...config.resolver.sourceExts, "mts"],
        resolveRequest: resolveShared,
    },
});

export default merged;
