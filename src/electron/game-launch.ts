import { readdir, readFile, stat, realpath } from "node:fs/promises";
import path from "node:path";
export function epicRoute(manifest: any) {
  const ids = [
    manifest?.CatalogNamespace,
    manifest?.CatalogItemId,
    manifest?.AppName,
  ];
  if (
    !ids.every((v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v))
  )
    return;
  return (
    "com.epicgames.launcher://apps/" +
    ids.map(encodeURIComponent).join("%3A") +
    "?action=launch&silent=true"
  );
}
export async function detectEpicApp(
  executable: string,
  directory = path.join(
    process.env.ProgramData || "C:/ProgramData",
    "Epic",
    "EpicGamesLauncher",
    "Data",
    "Manifests",
  ),
) {
  try {
    const selected = await realpath(executable);
    for (const name of (await readdir(directory))
      .filter((n) => n.endsWith(".item"))
      .slice(0, 3000))
      try {
        const file = path.join(directory, name);
        if ((await stat(file)).size > 1024 * 1024) continue;
        const m = JSON.parse(await readFile(file, "utf8"));
        if (
          m.bIsIncompleteInstall ||
          typeof m.InstallLocation !== "string" ||
          typeof m.LaunchExecutable !== "string"
        )
          continue;
        const root = await realpath(m.InstallLocation),
          target = await realpath(path.resolve(root, m.LaunchExecutable));
        if (
          target.toLowerCase() === selected.toLowerCase() &&
          target.toLowerCase().startsWith(root.toLowerCase() + path.sep)
        )
          return epicRoute(m);
      } catch {}
  } catch {}
}
export interface RunningGameWindow {
  pid: number;
  title: string;
  executable: string;
}
export interface GameProcess {
  pid: number;
  title: string;
  window: boolean;
}
export function selectGameProcess(found: GameProcess[], preferred?: number) {
  const windows = found.filter(
    (p) => p.window && Number.isSafeInteger(p.pid) && p.pid > 0,
  );
  const selected = windows.find((p) => p.pid === preferred);
  if (selected) return selected;
  if (windows.length > 1)
    throw new Error(
      "Several windows match this executable. Use Choose running game in Edit game to select one.",
    );
  return windows[0];
}
export async function waitForGameWindow(
  find: () => Promise<GameProcess[]>,
  timeout = 45000,
  preferred?: number,
) {
  const deadline = Date.now() + timeout;
  do {
    const match = selectGameProcess(await find(), preferred);
    if (match) return match;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  } while (Date.now() < deadline);
  throw new Error(
    "The game window did not appear. Check its original launcher for sign-in, updates or a startup error, then try again.",
  );
}
export async function detectSteamApp(
  executable: string,
): Promise<string | undefined> {
  let directory = path.dirname(path.resolve(executable));
  for (let depth = 0; depth < 32; depth++) {
    const parent = path.dirname(directory);
    if (parent === directory) return;
    if (
      path.basename(parent).toLowerCase() === "common" &&
      path.basename(path.dirname(parent)).toLowerCase() === "steamapps"
    ) {
      const install = path.basename(directory),
        steamapps = path.dirname(parent);
      const manifests = (await readdir(steamapps))
        .filter((name) => /^appmanifest_[1-9]\d{0,9}\.acf$/i.test(name))
        .slice(0, 4096);
      for (const name of manifests) {
        try {
          const file = path.join(steamapps, name);
          if ((await stat(file)).size > 256 * 1024) continue;
          const text = await readFile(file, "utf8");
          const id = /"appid"\s+"([1-9]\d{0,9})"/i.exec(text)?.[1];
          const folder = /"installdir"\s+"([^"\\/]+)"/i.exec(text)?.[1];
          if (
            id &&
            Number(id) <= 0xffffffff &&
            name.toLowerCase() === `appmanifest_${id}.acf` &&
            folder?.toLowerCase() === install.toLowerCase()
          )
            return id;
        } catch {
          /* Another Steam update may replace a manifest while it is read. */
        }
      }
      return;
    }
    directory = parent;
  }
}
