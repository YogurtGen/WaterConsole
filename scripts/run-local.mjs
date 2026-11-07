import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directories = Object.fromEntries(
  ["npm", "electron", "electron-builder", "node-gyp", "playwright", "tmp"].map(
    (name) => [name, path.join(root, ".cache", name)],
  ),
);
await Promise.all(
  Object.values(directories).map((directory) =>
    mkdir(directory, { recursive: true }),
  ),
);
const env = {
  ...process.env,
  npm_config_cache: directories.npm,
  electron_config_cache: directories.electron,
  ELECTRON_CACHE: directories.electron,
  ELECTRON_BUILDER_CACHE: directories["electron-builder"],
  npm_config_devdir: directories["node-gyp"],
  PLAYWRIGHT_BROWSERS_PATH: directories.playwright,
  TEMP: directories.tmp,
  TMP: directories.tmp,
  TMPDIR: directories.tmp,
};
const [entry, ...args] = process.argv.slice(2);
let script;
if (entry === "--install") {
  if (!process.env.npm_execpath)
    throw new Error("Use npm run setup to install dependencies.");
  script = process.env.npm_execpath;
  args.unshift("ci");
} else {
  if (!entry) throw new Error("A project Node script is required.");
  script = path.resolve(root, entry);
  if (!script.startsWith(path.resolve(root) + path.sep))
    throw new Error("Script must be inside the project.");
}
const child = spawn(process.execPath, [script, ...args], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
