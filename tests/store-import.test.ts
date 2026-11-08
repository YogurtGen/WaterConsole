import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { discoverStores, steamManifest } from "../src/electron/store-discovery";
import { detectEpicApp, epicRoute } from "../src/electron/game-launch";
import {
  officialURL,
  officialBytes,
  parseSteamMetadata,
  parseEpicMetadata,
  epicSlug,
} from "../src/electron/store-metadata";
import { newLocalGame, gameManifest } from "../src/shared/studio-model";
import { validateGame } from "../src/shared/studio-validation";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "wc-store-"));
  roots.push(root);
  return root;
}
describe("Installed store discovery", () => {
  it("skips incomplete, missing and empty installations and notices removal on rescan", async () => {
    const root = await fixture(),
      steam = path.join(root, "Steam"),
      apps = path.join(steam, "steamapps"),
      epic = path.join(root, "EpicManifests");
    await mkdir(apps, { recursive: true });
    await mkdir(epic, { recursive: true });
    for (const [id, flags, bytes] of [
      [201, "2", "leftover"],
      [202, "4", null],
      [203, "4", ""],
      [204, "6", "installed"],
    ] as const) {
      const dir = path.join(apps, "common", "Fixture" + id);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(apps, `appmanifest_${id}.acf`),
        `"appid" "${id}" "name" "Fixture ${id}" "installdir" "Fixture${id}" "StateFlags" "${flags}"`,
      );
      if (bytes !== null) await writeFile(path.join(dir, "Game.exe"), bytes);
    }
    for (const [id, incomplete, bytes] of [
      [301, true, "leftover"],
      [302, false, null],
      [303, false, ""],
    ] as const) {
      const dir = path.join(root, "Epic" + id);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(epic, id + ".item"),
        JSON.stringify({
          DisplayName: "Epic fixture",
          InstallLocation: dir,
          LaunchExecutable: "Game.exe",
          CatalogItemId: "item" + id,
          CatalogNamespace: "namespace",
          AppName: "app" + id,
          bIsIncompleteInstall: incomplete,
        }),
      );
      if (bytes !== null) await writeFile(path.join(dir, "Game.exe"), bytes);
    }
    const options = { steamRoots: [steam], epicDirectory: epic };
    expect((await discoverStores(options)).games.map((g) => g.key)).toEqual([
      "steam:204",
    ]);
    await rm(path.join(apps, "common", "Fixture204", "Game.exe"));
    expect((await discoverStores(options)).games).toEqual([]);
  });
  it("reads Steam libraries and Epic base games without running executables", async () => {
    const root = await fixture(),
      steam = path.join(root, "Steam"),
      library = path.join(root, "Library"),
      game = path.join(library, "steamapps/common/Green Game"),
      epic = path.join(root, "EpicManifests"),
      epicGame = path.join(root, "EpicGame");
    await Promise.all([
      mkdir(path.join(steam, "steamapps"), { recursive: true }),
      mkdir(game, { recursive: true }),
      mkdir(epic, { recursive: true }),
      mkdir(epicGame, { recursive: true }),
    ]);
    await writeFile(
      path.join(steam, "steamapps/libraryfolders.vdf"),
      `"libraryfolders" { "0" { "path" "${library.replace(/\\/g, "\\\\")}" } }`,
    );
    await writeFile(
      path.join(library, "steamapps/appmanifest_123.acf"),
      '"AppState" { "appid" "123" "name" "Green Game" "StateFlags" "4" "installdir" "Green Game" }',
    );
    await writeFile(path.join(game, "GreenGame.exe"), "test fixture only");
    await writeFile(path.join(game, "uninstall.exe"), "excluded");
    const manifest = {
      DisplayName: "Epic Fixture",
      bIsIncompleteInstall: false,
      InstallLocation: epicGame,
      LaunchExecutable: "EpicGame.exe",
      CatalogItemId: "item-id",
      CatalogNamespace: "namespace",
      AppName: "app-name",
    };
    await writeFile(path.join(epicGame, "EpicGame.exe"), "test fixture only");
    await writeFile(path.join(epic, "base.item"), JSON.stringify(manifest));
    await writeFile(
      path.join(epic, "dlc.item"),
      JSON.stringify({
        ...manifest,
        AppName: "dlc",
        MainGameAppName: "app-name",
      }),
    );
    const scan = await discoverStores({
      steamRoots: [steam],
      epicDirectory: epic,
    });
    expect(scan.games).toHaveLength(2);
    expect(scan.games.find((g) => g.store === "steam")?.executables).toEqual([
      await import("node:fs/promises").then((fs) =>
        fs.realpath(path.join(game, "GreenGame.exe")),
      ),
    ]);
    expect(await detectEpicApp(path.join(epicGame, "EpicGame.exe"), epic)).toBe(
      epicRoute(manifest),
    );
    expect(
      await detectEpicApp(path.join(game, "GreenGame.exe"), epic),
    ).toBeUndefined();
  });
  it("rejects traversal manifests and unsafe launcher identifiers", () => {
    expect(
      steamManifest('"appid" "123" "name" "No" "installdir" "../escape"'),
    ).toBeUndefined();
    expect(
      epicRoute({
        CatalogNamespace: "x",
        CatalogItemId: "y",
        AppName: "game?command=evil",
      }),
    ).toBeUndefined();
  });
});
describe("Official metadata boundaries", () => {
  it("allows only HTTPS official APIs and image CDNs", () => {
    expect(
      officialURL("https://store.steampowered.com/api/appdetails").hostname,
    ).toBe("store.steampowered.com");
    for (const u of [
      "http://cdn1.epicgames.com/a.jpg",
      "https://cdn1.epicgames.com.evil.test/a",
      "https://user:pass@cdn1.epicgames.com/a",
      "https://cdn1.epicgames.com:444/a",
      "http://127.0.0.1/",
    ])
      expect(() => officialURL(u, true)).toThrow();
  });
  it("rejects redirect escape and bounded response overflow", async () => {
    const redirect = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }),
    );
    await expect(
      officialBytes("https://store.steampowered.com/api", false, redirect),
    ).rejects.toThrow("Unsupported");
    expect(redirect).toHaveBeenCalledTimes(1);
    await expect(
      officialBytes(
        "https://store.steampowered.com/api",
        false,
        vi
          .fn()
          .mockResolvedValue(
            new Response("x", { headers: { "content-length": "999999999" } }),
          ),
      ),
    ).rejects.toThrow("large");
  });
  it("checks game identity and imports descriptive fields without claiming compatibility", () => {
    const m = parseSteamMetadata(
      {
        123: {
          success: true,
          data: {
            steam_appid: 123,
            short_description: "<b>A &amp; B</b>",
            genres: [{ description: "Action" }],
          },
        },
      },
      "123",
    );
    expect(m.description).toBe("A & B");
    expect(m.tags).toEqual(["Action"]);
    expect(() =>
      parseSteamMetadata(
        { 123: { success: true, data: { steam_appid: 999 } } },
        "123",
      ),
    ).toThrow();
    expect(epicSlug("My Game™: It's Great")).toBe("my-game-its-great");
    expect(() =>
      parseEpicMetadata({ namespace: "other" }, "expected"),
    ).toThrow();
    const g = newLocalGame();
    g.storeRef = { store: "epic", id: "id", namespace: "ns", appName: "app" };
    validateGame(g);
    expect(g.connection).toBe("unknown");
    expect(g.tests.gameplay).toBe(false);
    expect(gameManifest(g)).not.toHaveProperty("storeRef");
    g.storeRef.id = "../../escape";
    expect(() => validateGame(g)).toThrow("store reference");
  });
});
