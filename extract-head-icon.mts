/**
 * Crop the head from a sprite sheet cell and render it as a square icon.
 * Usage: node extract-head-icon.mts <sheet.png> [output.png]
 */
import sharp from "sharp";

const SHEET_COLS = 6;
const SHEET_ROWS = 7;
/** Row and column of the standing-idle pose, which reads best as an icon. */
const POSE_ROW = 5;
const POSE_COL = 0;
/** Alpha above which a pixel counts as part of the sprite. */
const OPAQUE = 10;
/** The head is the top slice of the sprite: face, ahoge, and hair. */
const HEAD_FRACTION = 0.3;

interface Raw {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

/** Alpha of one pixel, or 0 where the index falls outside the buffer. */
const alphaAt = (raw: Raw, x: number, y: number): number =>
  raw.data[(y * raw.width + x) * 4 + 3] ?? 0;

/** First row containing an opaque pixel, or undefined if wholly transparent. */
const firstOpaqueRow = (raw: Raw): number | undefined => {
  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      if (alphaAt(raw, x, y) > OPAQUE) return y;
    }
  }
  return undefined;
};

/** Last row containing an opaque pixel, or undefined if wholly transparent. */
const lastOpaqueRow = (raw: Raw): number | undefined => {
  for (let y = raw.height - 1; y >= 0; y--) {
    for (let x = 0; x < raw.width; x++) {
      if (alphaAt(raw, x, y) > OPAQUE) return y;
    }
  }
  return undefined;
};

/** Horizontal extent of opaque pixels between two rows, inclusive. */
const horizontalBounds = (
  raw: Raw,
  fromY: number,
  toY: number,
): { readonly minX: number; readonly maxX: number } | undefined => {
  let minX = raw.width;
  let maxX = 0;
  let found = false;
  for (let y = fromY; y <= toY && y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      if (alphaAt(raw, x, y) > OPAQUE) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return found ? { minX, maxX } : undefined;
};

const main = async (inputPath: string, outputPath: string): Promise<void> => {
  const meta = await sharp(inputPath).metadata();
  // sharp's types declare these required, but it genuinely returns
  // unusable values for some inputs. Checking the value rather than the
  // type guards what actually happens instead of restating the .d.ts.
  if (!Number.isFinite(meta.width) || !Number.isFinite(meta.height)) {
    throw new Error(`Could not read dimensions from ${inputPath}`);
  }
  const cellW = Math.floor(meta.width / SHEET_COLS);
  const cellH = Math.floor(meta.height / SHEET_ROWS);
  console.log(
    `  Sheet: ${meta.width.toString()}x${meta.height.toString()}, cell: ${cellW.toString()}x${cellH.toString()}`,
  );

  const cell = await sharp(inputPath)
    .extract({ left: POSE_COL * cellW, top: POSE_ROW * cellH, width: cellW, height: cellH })
    .png()
    .toBuffer();

  const { data, info } = await sharp(cell).raw().toBuffer({ resolveWithObject: true });
  const raw: Raw = { data, width: info.width, height: info.height };

  const topY = firstOpaqueRow(raw);
  const botY = lastOpaqueRow(raw);
  if (topY === undefined || botY === undefined) {
    throw new Error("Selected cell is fully transparent; nothing to crop");
  }

  const spriteH = botY - topY + 1;
  const headCutoff = topY + Math.round(spriteH * HEAD_FRACTION);

  const bounds = horizontalBounds(raw, topY, headCutoff);
  if (bounds === undefined) {
    throw new Error("Head zone is fully transparent; nothing to crop");
  }

  console.log(
    `  Sprite: y=${topY.toString()}-${botY.toString()} (${spriteH.toString()}px), head cutoff: y=${headCutoff.toString()}`,
  );
  console.log(`  Head X: ${bounds.minX.toString()}-${bounds.maxX.toString()}`);

  const left = Math.max(0, bounds.minX - 1);
  const headBuf = await sharp(cell)
    .extract({
      left,
      top: Math.max(0, topY),
      width: Math.min(bounds.maxX - bounds.minX + 3, cellW - left),
      height: headCutoff - topY + 2,
    })
    .png()
    .toBuffer();

  const headMeta = await sharp(headBuf).metadata();
  if (!Number.isFinite(headMeta.width) || !Number.isFinite(headMeta.height)) {
    throw new Error("Could not read dimensions of the cropped head");
  }
  const square = Math.max(headMeta.width, headMeta.height) + 2;

  await sharp(headBuf)
    .resize(square, square, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(256, 256, { kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);

  console.log(`  ✅ ${outputPath}`);
};

const [, , inputPath, outputArg] = process.argv;
if (inputPath === undefined) {
  console.error("Usage: node extract-head-icon.mts <sheet.png> [output.png]");
  process.exit(1);
}

await main(inputPath, outputArg ?? "icon-head.png");
