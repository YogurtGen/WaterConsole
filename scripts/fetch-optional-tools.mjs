import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
const folder = path.resolve(".local/optional-tools");
await mkdir(folder, { recursive: true });
const name = "ViGEmBus_1.22.0_x64_x86_arm64.exe";
const sha256 =
  "89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a";
const source =
  "https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/" + name;
const target = path.join(folder, name);
let bytes;
try {
  bytes = await readFile(target);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!bytes || createHash("sha256").update(bytes).digest("hex") !== sha256) {
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`Official driver download failed (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== sha256)
    throw new Error("Driver checksum mismatch; nothing will be installed.");
  await writeFile(target + ".tmp", bytes);
  await rename(target + ".tmp", target);
}
const signature = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.resolve("scripts/verify-driver.ps1"),
    "-DriverPath",
    target,
  ],
  { windowsHide: true, encoding: "utf8" },
);
if (signature.status !== 0)
  throw new Error("Driver Authenticode verification failed.");
const licenseResponse = await fetch(
  "https://raw.githubusercontent.com/nefarius/ViGEmBus/v1.22.0/LICENSE",
);
if (!licenseResponse.ok)
  throw new Error("Could not download the BSD-3-Clause driver license.");
const license = await licenseResponse.text();
if (
  !license.includes("Redistribution and use") ||
  !license.includes("Nefarius")
)
  throw new Error("Unexpected driver license.");
await writeFile(path.join(folder, "ViGEmBus-LICENSE.txt"), license);
await writeFile(
  path.join(folder, "ViGEmBus-SOURCE.json"),
  JSON.stringify(
    {
      name,
      version: "1.22.0",
      source,
      sha256,
      license: "BSD-3-Clause",
      publisher: "Nefarius Software Solutions e.U.",
      upstreamStatus: "Retired in 2023; optional legacy developer support",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Verified optional driver and license downloaded to .local/optional-tools. No driver was installed.",
);
