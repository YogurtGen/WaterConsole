import { readdir, readFile, stat, realpath } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { InstalledStoreGame, StoreScan } from "../shared/store-model";
const run = promisify(execFile);
export const normalizeTitle = (s: string) =>
  s
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f™®©]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function steamManifest(text: string) {
  const get = (key: string) =>
    new RegExp('"' + key + '"\\s+"([^"\\r\\n]*)"', "i").exec(text)?.[1];
  const id = get("appid"),
    name = get("name"),
    folder = get("installdir"),
    flags = get("StateFlags");
  return id &&
    flags &&
    /^\d{1,10}$/.test(flags) &&
    Number(flags) <= 0xffffffff &&
    (Number(flags) & 4) !== 0 &&
    /^[1-9]\d{0,9}$/.test(id) &&
    Number(id) <= 0xffffffff &&
    name &&
    folder &&
    !/[\\/]/.test(folder) &&
    ![".", ".."].includes(folder)
    ? { id, name, folder }
    : undefined;
}
const badExe =
  /(?:^|[\\/])(?:_?commonredist|redist|installer|installers|dotnet|support|easyanticheat|battleye)(?:[\\/]|$)|(?:unins\d*|uninstall|setup|crash.*|unitycrashhandler.*|ue[45]prereq.*|vc_redist.*|dxsetup|steam.*|eac.*|.*server)\.exe$/i;
export async function findGameExecutables(directory: string) {
  const found: Array<{ file: string; score: number }> = [];
  let seen = 0;
  const root = await realpath(directory);
  const name = normalizeTitle(path.basename(root));
  async function visit(dir: string, depth: number) {
    if (depth > 6 || seen > 5000) return;
    let files;
    try {
      files = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of files) {
      if (++seen > 5000) break;
      if (entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name),
        relative = path.relative(root, file);
      if (badExe.test(relative)) continue;
      if (entry.isDirectory()) await visit(file, depth + 1);
      else if (entry.isFile() && /\.exe$/i.test(entry.name)) {
        const info = await stat(file).catch(() => undefined);
        if (!info?.isFile() || info.size === 0) continue;
        const base = normalizeTitle(entry.name.replace(/\.exe$/i, ""));
        found.push({
          file,
          score:
            (/shipping\.exe$/i.test(file) ? 100 : 0) +
            (base === name
              ? 85
              : base.includes(name) || name.includes(base)
                ? 45
                : 0) +
            (depth === 0 ? 35 : 0) -
            (/launcher/i.test(entry.name) ? 50 : 0) -
            depth,
        });
      }
    }
  }
  await visit(root, 0);
  return found
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .map((f) => f.file)
    .slice(0, 40);
}
export async function defaultSteamRoots() {
  const roots = new Set<string>();
  for (const key of [
    "HKCU\\Software\\Valve\\Steam",
    "HKLM\\Software\\WOW6432Node\\Valve\\Steam",
  ]) {
    try {
      const { stdout } = await run(
        "reg.exe",
        [
          "query",
          key,
          "/v",
          key.startsWith("HKCU") ? "SteamPath" : "InstallPath",
        ],
        { windowsHide: true, timeout: 2000 },
      );
      const value = /REG_(?:SZ|EXPAND_SZ)\s+([^\r\n]+)/
        .exec(stdout)?.[1]
        .trim();
      if (value) roots.add(value);
    } catch {}
  }
  for (const root of [
    process.env["ProgramFiles(x86)"],
    process.env.ProgramFiles,
  ])
    if (root) roots.add(path.join(root, "Steam"));
  return [...roots];
}
export async function discoverStores(
  options: { steamRoots?: string[]; epicDirectory?: string } = {},
): Promise<StoreScan> {
  const games: InstalledStoreGame[] = [],
    notes: string[] = [];
  const clients = options.steamRoots ?? (await defaultSteamRoots()),
    libraries = new Set(clients);
  for (const root of clients) {
    try {
      const file = path.join(root, "steamapps", "libraryfolders.vdf");
      if ((await stat(file)).size > 2e6) continue;
      const text = await readFile(file, "utf8");
      for (const m of text.matchAll(/"path"\s+"([^"\r\n]+)"/gi))
        libraries.add(m[1].replace(/\\\\/g, "\\"));
    } catch {}
  }
  for (const library of libraries) {
    try {
      const steamapps = path.join(library, "steamapps"),
        names = (await readdir(steamapps))
          .filter((f) => /^appmanifest_[1-9]\d{0,9}\.acf$/i.test(f))
          .slice(0, 3000);
      for (const file of names) {
        try {
          const manifestFile = path.join(steamapps, file);
          if ((await stat(manifestFile)).size > 256 * 1024) continue;
          const m = steamManifest(await readFile(manifestFile, "utf8"));
          if (!m || file.toLowerCase() !== `appmanifest_${m.id}.acf`) continue;
          const directory = await realpath(
            path.join(steamapps, "common", m.folder),
          );
          if (
            !directory.startsWith(
              (await realpath(path.join(steamapps, "common"))) + path.sep,
            )
          )
            continue;
          const executables = await findGameExecutables(directory);
          if (!executables.length) continue;
          games.push({
            key: "steam:" + m.id,
            store: "steam",
            storeId: m.id,
            name: m.name,
            directory,
            executable: executables[0],
            executables,
            needsReview: executables.length > 1,
            alreadyAdded: false,
          });
        } catch {}
      }
    } catch {}
  }
  const epic =
    options.epicDirectory ??
    path.join(
      process.env.ProgramData || "C:/ProgramData",
      "Epic",
      "EpicGamesLauncher",
      "Data",
      "Manifests",
    );
  try {
    for (const file of (await readdir(epic))
      .filter((n) => n.endsWith(".item"))
      .slice(0, 3000)) {
      try {
        const full = path.join(epic, file);
        if ((await stat(full)).size > 1024 * 1024) continue;
        const m = JSON.parse(await readFile(full, "utf8"));
        if (
          m.bIsIncompleteInstall !== false ||
          !m.DisplayName ||
          !m.InstallLocation ||
          !m.CatalogItemId ||
          !m.CatalogNamespace ||
          !m.AppName
        )
          continue;
        if (m.MainGameAppName && m.MainGameAppName !== m.AppName) continue;
        const directory = await realpath(m.InstallLocation);
        const executable = await realpath(
          path.resolve(directory, String(m.LaunchExecutable || "")),
        ).catch(() => undefined);
        if (
          !executable ||
          !executable.startsWith(directory + path.sep) ||
          !executable.toLowerCase().endsWith(".exe")
        )
          continue;
        const info = await stat(executable).catch(() => undefined);
        if (!info?.isFile() || info.size === 0) continue;
        games.push({
          key: "epic:" + m.CatalogNamespace + ":" + m.CatalogItemId,
          store: "epic",
          storeId: m.CatalogItemId,
          namespace: m.CatalogNamespace,
          appName: m.AppName,
          name: String(m.DisplayName).slice(0, 120),
          directory,
          executable,
          executables: [executable],
          alreadyAdded: false,
          needsReview: false,
        });
      } catch {}
    }
  } catch {}
  const unique = [...new Map(games.map((g) => [g.key, g])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  if (!unique.length)
    notes.push(
      "No installed Windows games found in the standard Steam or Epic libraries. You can still browse to an executable or choose a running game.",
    );
  return { games: unique, notes };
}
export async function localSteamArt(id: string, roots: string[]) {
  const result: { cover?: string; banner?: string } = {};
  for (const root of roots) {
    const dir = path.join(root, "appcache", "librarycache");
    for (const folder of [dir, path.join(dir, id)]) {
      let files: string[];
      try {
        files = (await readdir(folder)).slice(0, 20000);
      } catch {
        continue;
      }
      const choices = files.filter(
        (f) =>
          (folder !== dir || f.startsWith(id + "_")) &&
          /\.(?:png|jpg|jpeg|webp)$/i.test(f),
      );
      result.cover ??=
        choices.find((f) => /library_600x900|portrait/i.test(f)) &&
        path.join(
          folder,
          choices.find((f) => /library_600x900|portrait/i.test(f))!,
        );
      result.banner ??=
        choices.find((f) => /library_hero|header/i.test(f)) &&
        path.join(
          folder,
          choices.find((f) => /library_hero|header/i.test(f))!,
        );
    }
  }
  return result;
}
