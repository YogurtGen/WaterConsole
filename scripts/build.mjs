import { build } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir } from "node:fs/promises";
import "./make-icon.mjs";

await mkdir("build/electron", { recursive: true });
await Promise.all([
  build({
    entryPoints: ["src/electron/main.ts"],
    outfile: "build/electron/main.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/electron/preload.ts"],
    outfile: "build/electron/preload.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/server/entry.ts"],
    outfile: "build/server/entry.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    packages: "external",
    sourcemap: true,
  }),
  viteBuild(),
]);
if(process.platform==="win32")await import("./build-native.mjs");
await import("./notices.mjs");
console.log("Built offline host, controller, and local server.");
