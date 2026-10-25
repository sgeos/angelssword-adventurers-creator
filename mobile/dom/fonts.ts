/**
 * The page's four font families, registered in the web view.
 *
 * The desktop page loads them from public/fonts/fonts.css, whose `url()`
 * references are relative paths that Express serves. Metro bundles that
 * stylesheet's rules but not the files its `url()` references name, so in the
 * web view every face failed to load and the page fell back to system fonts.
 * Each file is imported here instead, which makes it a Metro asset that the
 * bundle carries and serves, and is registered through the CSS Font Loading
 * interface with the same descriptors fonts.css gives it.
 *
 * Expo's own font loader is not used because it registers a face with no
 * weight descriptor, which would make the two variable fonts usable at their
 * default weight only.
 */
import { Asset } from "expo-asset";
import cinzel from "../../public/fonts/cinzel/Cinzel[wght].ttf";
import cinzelDecorativeRegular from "../../public/fonts/cinzel-decorative/CinzelDecorative-Regular.ttf";
import cinzelDecorativeBold from "../../public/fonts/cinzel-decorative/CinzelDecorative-Bold.ttf";
import outfit from "../../public/fonts/outfit/Outfit[wght].ttf";
import shareTechMono from "../../public/fonts/share-tech-mono/ShareTechMono-Regular.ttf";

interface Face {
    readonly family: string;
    /** As in fonts.css: a range for a variable font, one weight otherwise. */
    readonly weight: string;
    readonly asset: number;
}

const FACES: readonly Face[] = [
    { family: "Cinzel", weight: "400 900", asset: cinzel },
    { family: "Cinzel Decorative", weight: "400", asset: cinzelDecorativeRegular },
    { family: "Cinzel Decorative", weight: "700", asset: cinzelDecorativeBold },
    { family: "Outfit", weight: "100 900", asset: outfit },
    { family: "Share Tech Mono", weight: "400", asset: shareTechMono },
];

/**
 * Registers every face and resolves when each has loaded or failed. A face
 * that fails leaves its family on the stylesheet's fallback, as a failed font
 * does on the desktop, so a failure is reported and never thrown: the stages
 * work without the fonts. Returns the families that failed, for the caller to
 * report.
 */
export const loadFonts = async (): Promise<readonly string[]> => {
    const results = await Promise.allSettled(FACES.map(async (face) => {
        const font = new FontFace(face.family, `url(${JSON.stringify(Asset.fromModule(face.asset).uri)})`, {
            weight: face.weight,
            style: "normal",
            display: "swap",
        });
        document.fonts.add(font);
        await font.load();
    }));
    return FACES.filter((_, index) => results[index]?.status === "rejected").map((face) => `${face.family} ${face.weight}`);
};
