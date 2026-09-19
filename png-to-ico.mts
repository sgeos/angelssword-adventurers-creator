/**
 * Convert a PNG to a multi-size .ico file.
 * Creates 16x16, 32x32, 48x48, and 256x256 entries.
 * Usage: node png-to-ico.mts input.png output.ico
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ICO_SIZES = [16, 32, 48, 256] as const;
const HEADER_BYTES = 6;
const DIR_ENTRY_BYTES = 16;

/** One rendered icon, kept beside its size so neither is indexed separately. */
interface Rendered {
  readonly size: number;
  readonly png: Buffer;
}

const render = async (inputPath: string, size: number): Promise<Rendered> => {
  const png = await sharp(inputPath)
    .resize(size, size, {
      // Nearest keeps small sizes crisp; lanczos is better above that.
      kernel: size <= 48 ? "nearest" : "lanczos3",
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return { size, png };
};

/** Directory entry. Width and height of 0 mean 256, per the ICO format. */
const directoryEntry = (rendered: Rendered, dataOffset: number): Buffer => {
  const entry = Buffer.alloc(DIR_ENTRY_BYTES);
  const dimension = rendered.size >= 256 ? 0 : rendered.size;
  entry.writeUInt8(dimension, 0);
  entry.writeUInt8(dimension, 1);
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(rendered.png.length, 8);
  entry.writeUInt32LE(dataOffset, 12);
  return entry;
};

const main = async (inputPath: string, outputPath: string): Promise<void> => {
  const rendered: Rendered[] = [];
  for (const size of ICO_SIZES) {
    rendered.push(await render(inputPath, size));
  }

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(rendered.length, 4);

  // Offsets are cumulative, so the entries are built in one pass rather
  // than indexed back out of two parallel arrays.
  let dataOffset = HEADER_BYTES + DIR_ENTRY_BYTES * rendered.length;
  const entries = rendered.map((item) => {
    const entry = directoryEntry(item, dataOffset);
    dataOffset += item.png.length;
    return entry;
  });

  const ico = Buffer.concat([header, ...entries, ...rendered.map((item) => item.png)]);
  fs.writeFileSync(outputPath, ico);

  const sizeList = ICO_SIZES.join(", ");
  console.log(
    `  ✅ Created ${path.basename(outputPath)} (${sizeList}px, ${ico.length.toString()} bytes)`,
  );
};

const [, , inputPath, outputPath] = process.argv;
if (inputPath === undefined || outputPath === undefined) {
  console.error("Usage: node png-to-ico.mts <input.png> <output.ico>");
  process.exit(1);
}

await main(inputPath, outputPath);
