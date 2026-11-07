import { readFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
  throw new Error("Invalid release version");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const installer = "WaterConsole-Core-Setup-" + version + "-x64.exe";
const portable = "WaterConsole-Core-" + version + "-x64.zip";
const source = "WaterConsole-Core-Source-" + version + ".zip";
const releaseDir = "releases/" + version;
const hash = async (file) => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
};
const exists = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};
function absolute(relative) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep))
    throw new Error("Release path escaped project");
  return file;
}
async function place(fromRelative, toRelative) {
  const from = absolute(fromRelative),
    to = absolute(toRelative);
  if (!(await exists(from))) return;
  await mkdir(path.dirname(to), { recursive: true });
  if (await exists(to)) {
    if ((await hash(from)) === (await hash(to))) {
      await rm(from);
      return;
    }
    const backup = absolute(
      ".maintenance/replaced-releases/" + stamp + "/" + toRelative,
    );
    await mkdir(path.dirname(backup), { recursive: true });
    await rename(to, backup);
  }
  await rename(from, to);
}
for (const name of [installer, installer + ".blockmap"])
  await place("dist/" + name, "Setup/" + name);
await place("dist/" + portable, releaseDir + "/" + portable);
await place("dist/" + source, releaseDir + "/" + source);
for (const name of ["builder-debug.yml", "delivery-sha256.json"])
  await place("dist/" + name, releaseDir + "/metadata/" + name);
const pending = absolute(releaseDir + "/source-" + stamp + ".tmp.zip");
const archive = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    absolute("scripts/archive-source.ps1"),
    "-OutputPath",
    pending,
  ],
  { cwd: root, env: process.env, stdio: "inherit", windowsHide: true },
);
if (archive.error) throw archive.error;
if (archive.status !== 0) throw new Error("Public source archive failed");
await place(path.relative(root, pending), releaseDir + "/" + source);
const optional = "WaterConsole-Optional-Controller-Tools-" + version + ".zip";
if (
  await exists(
    absolute(".local/optional-tools/ViGEmBus_1.22.0_x64_x86_arm64.exe"),
  )
) {
  const tools = spawnSync(
    process.execPath,
    [absolute("scripts/package-optional-tools.mjs")],
    { cwd: root, env: process.env, stdio: "inherit", windowsHide: true },
  );
  if (tools.status !== 0)
    throw new Error("Optional controller tools package failed");
}
const files = [];
for (const relative of [
  "Setup/" + installer,
  "Setup/" + installer + ".blockmap",
  releaseDir + "/" + portable,
  releaseDir + "/" + source,
  ...((await exists(absolute(releaseDir + "/" + optional)))
    ? [releaseDir + "/" + optional]
    : []),
]) {
  const file = absolute(relative);
  if (!(await exists(file)))
    throw new Error("Missing release file: " + relative);
  files.push({
    path: relative,
    bytes: (await stat(file)).size,
    sha256: await hash(file),
  });
}
await writeFile(
  absolute(releaseDir + "/manifest.json"),
  JSON.stringify(
    { version, generated: new Date().toISOString(), files },
    null,
    2,
  ) + "\n",
);
await writeFile(
  absolute(releaseDir + "/SHA256SUMS.txt"),
  files
    .map((file) => file.sha256 + "  " + path.basename(file.path))
    .join("\n") + "\n",
);
console.log("Installer: Setup/" + installer);
console.log("Portable and public source: " + releaseDir + "/");
