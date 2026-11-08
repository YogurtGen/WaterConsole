import { _electron, expect } from "playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = path.join(root, ".local/game-session-test"),
  data = path.join(out, "data-" + Date.now());
await fs.mkdir(out, { recursive: true });
await build({
  entryPoints: ["src/shared/studio-model.ts"],
  outfile: out + "/model.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { newLocalGame, gameManifest } = await import(
  pathToFileURL(out + "/model.mjs").href
);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DISABLE_NATIVE: "1",
  WATERCONSOLE_DATA_DIR: data,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath:
    process.env.WATERCONSOLE_EXECUTABLE || (await import("electron")).default,
  args: process.env.WATERCONSOLE_APP_ROOT
    ? [process.env.WATERCONSOLE_APP_ROOT]
    : process.env.WATERCONSOLE_EXECUTABLE
      ? []
      : [root],
  env,
});
const isCore =
  JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
    .name === "waterconsole-core";
const checks = [],
  errors = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const base = await page.evaluate(() => window.waterconsole.getState());
  // This fixture replaces only test-process IPC. No native adapter or game is started.
  await app.evaluate(({ ipcMain }) => {
    globalThis.__sessionCommands = [];
    ipcMain.removeHandler("wc:command");
    ipcMain.handle("wc:command", (_e, c) => {
      globalThis.__sessionCommands.push(c);
      return { ok: true };
    });
  });
  const originalPng = await page.evaluate(async () => {
    const image = new Image();
    image.src = "waterconsole://app/assets/lab-world.svg";
    await image.decode();
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    c.getContext("2d").drawImage(image, 0, 0, 1600, 1000);
    return c.toDataURL("image/png").split(",")[1];
  });
  const bytes = Buffer.from(originalPng, "base64"),
    id = createHash("sha256").update(bytes).digest("hex");
  await fs.mkdir(data + "/library/images", { recursive: true });
  await fs.writeFile(data + "/library/images/" + id + ".png", bytes);
  const game = newLocalGame();
  game.title = "Forest Workshop";
  game.connection = "offline-online";
  game.maxPlayers = 4;
  game.artwork.banner = {
    source: id,
    asset: id,
    crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, ratio: "free" },
    fit: "cover",
  };
  let state = {
    ...base,
    phase: "native",
    profile: "gamepad",
    selectedGameId: game.id,
    catalog: [gameManifest(game)],
    studio: { definition: game.controller, modeId: "menu", preview: false },
    network: { ...base.network, address: "192.0.2.10", status: "online" },
    pending: [],
    pairing: {
      url: "http://127.0.0.1:8787/?invite=example",
      code: "000000",
      expiresAt: Date.now() + 120000,
    },
    players: [
      {
        id: "fixture-p1",
        slot: 1,
        name: "Alex",
        color: "#32e49e",
        connected: true,
        ready: true,
        canNavigate: true,
        buttons: [],
        axes: { x: 0, y: 0 },
        position: { x: 0, y: 0 },
        pressCount: 0,
      },
    ],
    native: {
      available: true,
      games: { [game.id]: true },
      gameId: game.id,
      maxPlayers: 4,
      requiresGamepad: true,
      gamepad: { available: true },
      status: "paused",
      focused: false,
      controls: "menu",
    },
  };
  async function push() {
    await app.evaluate(
      ({ BrowserWindow }, s) =>
        BrowserWindow.getAllWindows()[0].webContents.send("wc:state", s),
      state,
    );
    await expect(page.locator(".configured-game-screen")).toBeVisible();
  }
  const commands = () => app.evaluate(() => globalThis.__sessionCommands);
  async function size(w, h) {
    await app.evaluate(
      ({ BrowserWindow }, { w, h }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.setMinimumSize(0, 0);
        win.setContentSize(w, h);
      },
      { w, h },
    );
    await page.waitForTimeout(80);
  }
  async function contained() {
    const boxes = await page
      .locator(".configured-game-screen")
      .evaluate((el) => {
        const r = (e) => {
          const b = e.getBoundingClientRect();
          return {
            x: b.x,
            y: b.y,
            w: b.width,
            h: b.height,
            right: b.right,
            bottom: b.bottom,
          };
        };
        return {
          width: document.documentElement.clientWidth,
          stage: r(el.querySelector(".native-stage")),
          art: r(el.querySelector(".native-art")),
          session: r(el.querySelector(".native-session")),
          slots: r(el.querySelector(".native-players")),
          cards: [...el.querySelectorAll(".native-player")].map(r),
          modes: [...el.querySelectorAll(".native-mode-buttons button")].map(r),
        };
      });
    assert(boxes.stage.x >= 0);
    assert(boxes.stage.right <= boxes.width + 1);
    assert(boxes.slots.y >= boxes.stage.bottom);
    for (const b of [...boxes.cards, ...boxes.modes]) {
      assert(b.x >= 0);
      assert(b.right <= boxes.width + 1);
      assert(b.w > 0);
      assert(b.h > 0);
    }
    if (boxes.width >= 800) {
      assert(boxes.art.right <= boxes.session.x + 1);
      assert(Math.abs(boxes.art.h - boxes.session.h) < 1);
    }
    return boxes;
  }
  await size(1920, 1080);
  await push();
  await expect(page.locator(".native-session h2")).toHaveText(
    "Input is paused.",
  );
  await expect(page.locator(".native-art img")).toHaveJSProperty(
    "naturalWidth",
    1600,
  );
  await expect(page.locator(".native-players .native-player")).toHaveCount(4);
  await expect(page.locator(".native-mode-buttons button.active")).toHaveText(
    "Menu",
  );
  await contained();
  await page.screenshot({ path: out + "/session-paused.png" });
  checks.push(
    "Configured games use saved banner artwork, a split session card and player slots matching the built-in presentation",
  );
  await page.getByRole("button", { name: "Focus game", exact: true }).click();
  assert.deepEqual((await commands()).at(-1), { type: "nativeFocus" });
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  assert.deepEqual((await commands()).at(-1), {
    type: "studioMode",
    modeId: "standard",
  });
  state.studio.modeId = "standard";
  await push();
  await expect(page.locator(".native-mode-buttons button.active")).toHaveText(
    "Standard",
  );
  checks.push(
    "Focus and dynamic mode controls send the existing commands and visibly select the active mode",
  );
  state.native.status = "starting";
  state.native.message = "Opening the game through its original launcher.";
  await push();
  await expect(page.locator(".native-session .native-status")).toHaveText(
    "STARTING",
  );
  await expect(
    page.getByRole("button", { name: "Focus game", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: out + "/session-starting.png" });
  state.native.status = "error";
  state.native.message =
    "The game window was not found. Check the launcher on the PC.";
  await push();
  await expect(page.locator(".native-session .native-status")).toHaveText(
    "NEEDS ATTENTION",
  );
  await expect(page.locator(".native-session > p").first()).toHaveText(
    state.native.message,
  );
  checks.push(
    "Starting and failed launches retain artwork and show the correct status and actionable message",
  );
  state.native.status = "running";
  state.native.focused = true;
  delete state.native.message;
  await push();
  await expect(page.locator(".native-session .native-status")).toHaveText(
    "GAME IN FOCUS",
  );
  await expect(page.locator(".native-player").first()).toContainText(
    "Controller ready",
  );
  state.native.quitting = true;
  await push();
  await expect(page.locator(".native-session .native-status")).toHaveText(
    "CLOSING",
  );
  await expect(
    page.getByRole("button", { name: "Closing game…", exact: true }),
  ).toBeDisabled();
  for (const b of await page.locator(".native-mode-buttons button").all())
    await expect(b).toBeDisabled();
  delete state.native.quitting;
  checks.push(
    "Focused, closing and disconnected-player states preserve input and close-state semantics",
  );
  for (const count of [1, 2, 4]) {
    state.native.maxPlayers = count;
    await push();
    await expect(page.locator(".native-player")).toHaveCount(count);
  }
  state.players[0].connected = false;
  await push();
  await expect(page.locator(".native-player").first()).toContainText(
    "Reconnecting",
  );
  state.players[0].connected = true;
  await push();
  await page
    .getByRole("button", { name: "Connect a phone", exact: true })
    .first()
    .click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.keyboard.press("Escape");
  checks.push(
    "Only the supported one/two/four player slots are shown; empty slots open phone pairing",
  );
  const standard = structuredClone(game.controller.modes[1]);
  for (let i = 4; i < 8; i++)
    state.studio.definition.modes.push({
      ...structuredClone(standard),
      id: "custom-" + i,
      name: "Extra controller mode " + i,
    });
  state.catalog[0].title =
    "A very long local game title that stays readable inside the heading";
  state.players[0].name = "A player name that should wrap inside its card";
  for (const [w, h] of [
    [1920, 1080],
    [1280, 720],
    [800, 600],
    [640, 720],
  ]) {
    await size(w, h);
    await push();
    await contained();
  }
  await page.screenshot({ path: out + "/session-small.png", fullPage: true });
  checks.push(
    "Long names and eight modes stay contained from 1080p through small windows",
  );
  delete state.catalog[0].banner;
  state.catalog[0].cover = game.artwork.banner;
  await push();
  await expect(page.locator(".native-art img")).toHaveJSProperty(
    "naturalWidth",
    1600,
  );
  delete state.catalog[0].cover;
  await push();
  await expect(
    page.locator(".native-art .custom-art-placeholder"),
  ).toBeVisible();
  await expect(page.locator(".native-art img")).toHaveCount(0);
  checks.push(
    "Cover artwork and an original placeholder are used when no banner is available",
  );
  if (isCore) {
    delete state.studio;
    state.native.controls = "menu";
    await push();
    await page
      .getByRole("button", { name: "Game controls", exact: true })
      .click();
    assert.deepEqual((await commands()).at(-1), {
      type: "nativeControls",
      mode: "game",
    });
  }
  await page
    .getByRole("button", { name: "Stop & return Home", exact: true })
    .click();
  assert.deepEqual((await commands()).at(-1), { type: "stopGame" });
  checks.push(
    isCore
      ? "Source-adapter fallback modes and Stop keep their original command contracts"
      : "Configured-game Stop keeps its original command contract",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/result.json",
    JSON.stringify({ checks, errors, noCommercialGameLaunched: true }, null, 2),
  );
  for (const check of checks) console.log("PASS " + check);
} finally {
  await app.close();
}
