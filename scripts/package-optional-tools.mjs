import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const source = path.resolve(".local/optional-tools");
const stage = path.resolve(".local/optional-package");
await mkdir(stage, { recursive: true });
const driver = "ViGEmBus_1.22.0_x64_x86_arm64.exe";
if (
  createHash("sha256")
    .update(await readFile(path.join(source, driver)))
    .digest("hex") !==
  "89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a"
)
  throw new Error("Run npm run tools:download first.");
for (const file of [driver, "ViGEmBus-LICENSE.txt", "ViGEmBus-SOURCE.json"])
  await copyFile(path.join(source, file), path.join(stage, file));
for (const file of [
  "WaterConsole.InputBridge.exe",
  "ViGEmClient.dll",
  "ViGEmClient-LICENSE.txt",
  "ViGEmClient-SOURCE.json",
])
  await copyFile(path.resolve("build/native", file), path.join(stage, file));
await copyFile("LICENSE", path.join(stage, "WaterConsole-LICENSE.txt"));
await writeFile(
  path.join(stage, "README.txt"),
  `WaterConsole optional native controller tools ${version}\n\nNot required for Controller Lab or phone touch vibration.\nNo game integrations are included. Developers must implement and verify an adapter.\n\nViGEmBus 1.22.0 is a third-party Windows system driver retired upstream in 2023.\nInstall only if you need compatible virtual Xbox controllers and accept that legacy dependency.\nThe signed upstream installer requires administrator approval. Nothing installs automatically.\nReview ViGEmBus-LICENSE.txt and ViGEmBus-SOURCE.json first.\n\nViGEmClient.dll is the MIT client library, not the bus driver.\nWaterConsole.InputBridge.exe provides a standard semantic gamepad transport.\nIt never launches a game, has no network listener, checks exact PID/executable and foreground focus,\nneutralizes after 300 ms, and routes per-slot/epoch motor feedback.\n\nDocs: https://github.com/YogurtGen/WaterConsole/blob/main/docs/INSTALL.md\nAdapter guide: https://github.com/YogurtGen/WaterConsole/blob/main/docs/ADDING-GAMES.md\n`,
);
const output = path.resolve(
  "releases",
  version,
  `WaterConsole-Optional-Controller-Tools-${version}.zip`,
);
await mkdir(path.dirname(output), { recursive: true });
const ps = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.resolve("scripts/archive-optional.ps1"),
    "-Stage",
    stage,
    "-OutputPath",
    output,
  ],
  { encoding: "utf8", windowsHide: true },
);
if (ps.status !== 0)
  throw new Error(ps.stderr || "Optional tools packaging failed.");
console.log("Optional controller tools packaged with licenses and provenance.");
