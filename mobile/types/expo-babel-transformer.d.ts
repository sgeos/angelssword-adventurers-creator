/**
 * A corrected declaration for `@expo/metro-config/babel-transformer`.
 *
 * Expo's own declaration for this module exports types only, ending in
 * `export {}`, while the module itself assigns one object, with `transform`
 * and `getCacheKey`, to `module.exports`. Imported from an ECMAScript module,
 * that object is the default export. This file declares it as exactly that,
 * using Expo's own type for the object, so it invents nothing. Only the tools
 * project maps the module here, through `paths` in tsconfig.tools.json.
 *
 * Checked against @expo/metro-config 58.0.x, whose build/babel-transformer.js
 * ends with `module.exports = babelTransformer`. A later release that fixes
 * its declaration makes this file unnecessary.
 */
import type { ExpoBabelTransformer } from "../node_modules/@expo/metro-config/build/babel-transformer.js";

declare const babelTransformer: ExpoBabelTransformer;
export default babelTransformer;
