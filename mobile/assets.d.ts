/**
 * What Metro gives an import of an asset file: a numeric identifier, which
 * React Native's image, font and audio loaders accept as a source. That is
 * Metro's documented behaviour for every extension in its asset list, and
 * these are the asset types the application imports.
 *
 * Declared here because no installed package declares them, and a declaration
 * file is the one place the lint allows an ambient module declaration. The
 * stylesheets are side-effect imports in the DOM component, which Metro
 * bundles into the web view, and export nothing.
 */
declare module "*.mp3" {
    const asset: number;
    export default asset;
}

declare module "*.ttf" {
    const asset: number;
    export default asset;
}

declare module "*.webp" {
    const asset: number;
    export default asset;
}

declare module "*.png" {
    const asset: number;
    export default asset;
}

declare module "*.css";
