import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
const size = 256;
function bezier(a, b, c, d, n = 40) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1),
      s = 1 - t;
    return [
      s * s * s * a[0] +
        3 * s * s * t * b[0] +
        3 * s * t * t * c[0] +
        t * t * t * d[0],
      s * s * s * a[1] +
        3 * s * s * t * b[1] +
        3 * s * t * t * c[1] +
        t * t * t * d[1],
    ];
  });
}
const drop = [
  ...bezier([128, 27], [112, 50], [47, 116], [47, 155]),
  ...bezier([47, 155], [47, 202], [82, 231], [128, 231]),
  ...bezier([128, 231], [174, 231], [209, 202], [209, 155]),
  ...bezier([209, 155], [209, 116], [144, 50], [128, 27]),
];
const wave = [
  ...bezier([71, 157], [96, 124], [110, 133], [132, 154]),
  ...bezier([132, 154], [151, 173], [167, 169], [187, 145]),
  [187, 174],
  ...bezier([187, 174], [164, 195], [145, 193], [123, 172]),
  ...bezier([123, 172], [104, 154], [91, 151], [71, 178]),
];
function contains(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = points[i],
      [c, d] = points[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a)
      inside = !inside;
  }
  return inside;
}
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) {
  raw[y * (size * 4 + 1)] = 0;
  for (let x = 0; x < size; x++) {
    let color = [10, 15, 14, 0];
    const rx = Math.max(48 - x, 0, x - 207),
      ry = Math.max(48 - y, 0, y - 207);
    if (rx * rx + ry * ry < 48 * 48) color = [12, 20, 19, 255];
    if (contains(drop, x + 0.5, y + 0.5)) color = [42, 229, 159, 255];
    if (contains(wave, x + 0.5, y + 0.5)) color = [12, 40, 31, 255];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 4; c++) raw[offset + c] = color[c];
  }
}
function crc(data) {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc(Buffer.concat([name, data])), 8 + data.length);
  return result;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
await mkdir("assets", { recursive: true });
await writeFile("assets/icon.png", png);
await writeFile("assets/icon.ico", Buffer.concat([ico, png]));
