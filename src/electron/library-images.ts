import { nativeImage } from "electron";
import { readFile, stat } from "node:fs/promises";
import { ART_RECOMMENDATIONS, type CropSpec } from "../shared/studio-model";
import { validateCrop } from "../shared/studio-validation";
import { LibraryStore } from "./library-store";
export function imageDimensions(b: Buffer) {
  if (b.length < 24) throw new Error("Image is incomplete.");
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 255 && b[1] === 216) {
    let p = 2;
    while (p + 9 < b.length) {
      if (b[p++] !== 255) continue;
      let marker = b[p++];
      while (marker === 255) marker = b[p++];
      if (marker === 217 || marker === 218) break;
      if (marker >= 208 && marker <= 215) continue;
      const length = b.readUInt16BE(p);
      if (length < 2 || p + length > b.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return { width: b.readUInt16BE(p + 5), height: b.readUInt16BE(p + 3) };
      p += length;
    }
  }
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    const type = b.toString("ascii", 12, 16);
    if (type === "VP8X" && b.length >= 30)
      return {
        width: 1 + b.readUIntLE(24, 3),
        height: 1 + b.readUIntLE(27, 3),
      };
    if (type === "VP8 " && b.length >= 30)
      return {
        width: b.readUInt16LE(26) & 16383,
        height: b.readUInt16LE(28) & 16383,
      };
    if (type === "VP8L" && b.length >= 25) {
      const n = b.readUInt32LE(21);
      return { width: (n & 16383) + 1, height: ((n >>> 14) & 16383) + 1 };
    }
  }
  throw new Error("Choose a valid PNG, JPEG or WebP image.");
}
export async function importImage(store: LibraryStore, filename: string) {
  const info = await stat(filename);
  if (!info.isFile() || info.size > 25 * 1024 * 1024)
    throw new Error("Choose an image smaller than 25 MiB.");
  const bytes = await readFile(filename),
    size = imageDimensions(bytes);
  if (!size.width || !size.height || size.width * size.height > 32e6)
    throw new Error("Choose an image below 32 megapixels.");
  let image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error("This image could not be decoded.");
  const dimensions = image.getSize();
  if (Math.max(dimensions.width, dimensions.height) > 3072)
    image = image.resize(
      dimensions.width >= dimensions.height
        ? { width: 3072 }
        : { height: 3072 },
    );
  const id = await store.writeAsset(image.toPNG());
  return { id, ...image.getSize() };
}
export async function cropImage(
  store: LibraryStore,
  source: string,
  crop: CropSpec,
  purpose?: "cover" | "banner" | "button",
) {
  validateCrop(crop);
  let image = nativeImage.createFromBuffer(await store.readAsset(source));
  if (image.isEmpty()) throw new Error("The source image is unavailable.");
  if (crop.rotation) {
    const { width: w, height: h } = image.getSize(),
      pixels = image.toBitmap();
    const nw = crop.rotation === 180 ? w : h,
      nh = crop.rotation === 180 ? h : w,
      rotated = Buffer.alloc(pixels.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx =
            crop.rotation === 90
              ? h - 1 - y
              : crop.rotation === 180
                ? w - 1 - x
                : y,
          dy =
            crop.rotation === 90
              ? x
              : crop.rotation === 180
                ? h - 1 - y
                : w - 1 - x;
        pixels.copy(
          rotated,
          (dy * nw + dx) * 4,
          (y * w + x) * 4,
          (y * w + x) * 4 + 4,
        );
      }
    image = nativeImage.createFromBitmap(rotated, { width: nw, height: nh });
  }
  const { width, height } = image.getSize();
  const x = Math.floor(crop.x * width),
    y = Math.floor(crop.y * height),
    w = Math.max(1, Math.min(width - x, Math.round(crop.w * width))),
    h = Math.max(1, Math.min(height - y, Math.round(crop.h * height)));
  let result = image.crop({ x, y, width: w, height: h });
  if (purpose) {
    const target = ART_RECOMMENDATIONS[purpose];
    if (!target) throw new Error("Unknown image destination.");
    result = result.resize({ width: target.width, height: target.height });
  }
  const id = await store.writeAsset(result.toPNG());
  return { id, ...result.getSize() };
}
