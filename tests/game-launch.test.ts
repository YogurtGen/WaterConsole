import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  detectSteamApp,
  selectGameProcess,
  waitForGameWindow,
} from "../src/electron/game-launch";
import { newLocalGame } from "../src/shared/studio-model";
import { validateGame } from "../src/shared/studio-validation";
const root = path.resolve(".local"),
  directories: string[] = [];
async function installation() {
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, "launch-check-"));
  directories.push(dir);
  const steamapps = path.join(dir, "steamapps");
  const executable = path.join(
    steamapps,
    "common",
    "Puzzle Story",
    "bin",
    "Game.exe",
  );
  await mkdir(path.dirname(executable), { recursive: true });
  return { steamapps, executable };
}
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    if (!path.resolve(dir).startsWith(root + path.sep))
      throw Error("Test cleanup escaped local workspace");
    await rm(dir, { recursive: true, force: true });
  }
});
describe("Desktop game launch selection", () => {
  it("recognizes a selected Steam executable inside a nested game directory", async () => {
    const { steamapps, executable } = await installation();
    await writeFile(
      path.join(steamapps, "appmanifest_1234.acf"),
      '"AppState" { "appid" "1234" "installdir" "Puzzle Story" }',
    );
    expect(await detectSteamApp(executable)).toBe("1234");
  });
  it("rejects mismatched IDs, traversal folders and unrelated executables", async () => {
    const { steamapps, executable } = await installation();
    await writeFile(
      path.join(steamapps, "appmanifest_1234.acf"),
      '"appid" "9999" "installdir" "Puzzle Story"',
    );
    await writeFile(
      path.join(steamapps, "appmanifest_4567.acf"),
      '"appid" "4567" "installdir" "../Puzzle Story"',
    );
    expect(await detectSteamApp(executable)).toBeUndefined();
    expect(
      await detectSteamApp(path.join(root, "standalone", "Game.exe")),
    ).toBeUndefined();
  });
  it("reuses a matching visible window even when a saved PID is stale", () => {
    const found = [
      { pid: 31, title: "Game", window: true },
      { pid: 32, title: "Background", window: false },
    ];
    expect(selectGameProcess(found, 12)?.pid).toBe(31);
  });
  it("requires a selected current window when several processes match", () => {
    const found = [
      { pid: 31, title: "One", window: true },
      { pid: 32, title: "Two", window: true },
    ];
    expect(() => selectGameProcess(found, 12)).toThrow("Several windows");
    expect(selectGameProcess(found, 32)?.pid).toBe(32);
  });
  it("waits for the real game window rather than attaching a short-lived startup PID", async () => {
    let calls = 0;
    const found = await waitForGameWindow(
      async () =>
        ++calls === 1
          ? [{ pid: 31, title: "", window: false }]
          : [{ pid: 42, title: "Game", window: true }],
      1500,
    );
    expect(found.pid).toBe(42);
    expect(calls).toBe(2);
  });
  it("gives a launcher recovery error when no game window appears", async () => {
    await expect(waitForGameWindow(async () => [], 0)).rejects.toThrow(
      "original launcher",
    );
  });
  it("accepts Auto/Direct and old records while rejecting arbitrary launch methods", () => {
    const game = newLocalGame();
    expect(() => validateGame(game)).not.toThrow();
    game.launch.method = "auto";
    expect(() => validateGame(game)).not.toThrow();
    game.launch.method = "direct";
    expect(() => validateGame(game)).not.toThrow();
    (game.launch as any).method = "shell://bad";
    expect(() => validateGame(game)).toThrow("launch");
  });
});
