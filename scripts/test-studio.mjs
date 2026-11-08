import { _electron, chromium, expect } from "playwright/test";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = path.join(root, ".local", "studio-test"),
  data = path.join(out, "integration-" + Date.now());
await fs.mkdir(out, { recursive: true });
execFileSync(
  path.join(
    process.env.WINDIR || "C:/Windows",
    "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
  ),
  [
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Web.Extensions.dll",
    "/out:" + path.join(out, "WaterConsole.InputFixture.exe"),
    path.join(root, "tests/fixtures/InputFixture.cs"),
  ],
  { windowsHide: true },
);
await build({
  entryPoints: [path.join(root, "src/shared/studio-model.ts")],
  outfile: path.join(out, "model.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
});
const { newLocalGame } = await import(
  pathToFileURL(path.join(out, "model.mjs")).href
);
const executablePath =
  process.env.WATERCONSOLE_EXECUTABLE || (await import("electron")).default;
const appArgs = process.env.WATERCONSOLE_APP_ROOT
  ? [process.env.WATERCONSOLE_APP_ROOT]
  : process.env.WATERCONSOLE_EXECUTABLE
    ? []
    : [root];
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: data,
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
let app, browser, host;
const phones = [],
  checks = [],
  errors = [];
const pass = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
const state = () => host.evaluate(() => window.waterconsole.getState());
const command = (c) => host.evaluate((c) => window.waterconsole.command(c), c);
const library = (c) => host.evaluate((c) => window.waterconsole.library(c), c);
const wait = async (f) => {
  for (let i = 0; i < 120; i++) {
    const v = await f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Condition timed out");
};
async function touch(phone, points, type = "touchStart") {
  await phone.cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    })),
  });
}
async function center(phone, label, dx = 0, dy = 0) {
  const box = await phone.page
    .getByRole("button", { name: label, exact: true })
    .boundingBox();
  assert(box, label + " visible");
  return {
    x: box.x + box.width * (0.5 + dx),
    y: box.y + box.height * (0.5 + dy),
  };
}
async function report() {
  try {
    return JSON.parse(await fs.readFile(out + "/native-report.json", "utf8"));
  } catch {
    return null;
  }
}
try {
  app = await _electron.launch({
    executablePath,
    args: appArgs,
    env,
    timeout: 35000,
  });
  host = await app.firstWindow();
  host.on("pageerror", (e) => errors.push(e.message));
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const image = await host.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1a3e2e";
    ctx.fillRect(0, 0, 1600, 1000);
    ctx.fillStyle = "#83e8b3";
    ctx.fillRect(0, 0, 800, 500);
    return c.toDataURL("image/png").split(",")[1];
  });
  await fs.writeFile(out + "/art.png", Buffer.from(image, "base64"));
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, out + "/art.png");
  const imported = await library({ type: "choose-image" });
  assert(imported.ok);
  const source = imported.file.id;
  const cover = await library({
    type: "crop",
    source,
    crop: {
      x: 0.265625,
      y: 0,
      w: 0.46875,
      h: 1,
      rotation: 0,
      ratio: "recommended",
    },
    purpose: "cover",
  });
  const banner = await library({
    type: "crop",
    source,
    crop: { x: 0, y: 0.05, w: 1, h: 0.9, rotation: 0, ratio: "recommended" },
    purpose: "banner",
  });
  assert.deepEqual([cover.file.width, cover.file.height], [900, 1200]);
  assert.deepEqual([banner.file.width, banner.file.height], [1920, 1080]);
  const rotated = await library({
    type: "crop",
    source,
    crop: { x: 0, y: 0, w: 1, h: 1, rotation: 90, ratio: "free" },
  });
  assert.deepEqual([rotated.file.width, rotated.file.height], [1000, 1600]);
  const rejected = await library({
    type: "crop",
    source,
    crop: { x: 0.9, y: 0, w: 0.8, h: 1, rotation: 0, ratio: "free" },
  });
  assert.equal(rejected.ok, false);
  pass(
    "Separate recommended cover/banner exports, rotation and crop boundary validation",
  );
  let game = newLocalGame();
  game.title = "WaterConsole Input Test";
  game.maxPlayers = 4;
  game.launch = {
    executable: out + "/WaterConsole.InputFixture.exe",
    cwd: out,
    args: [out + "/native-report.json"],
    attachOnly: false,
  };
  game.artwork = {
    cover: {
      source,
      asset: cover.file.id,
      crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, ratio: "recommended" },
      fit: "contain",
    },
    banner: {
      source,
      asset: banner.file.id,
      crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, ratio: "recommended" },
      fit: "contain",
    },
  };
  const saved = await library({ type: "save", game });
  assert(saved.ok, saved.error);
  game = saved.game;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (let i = 1; i <= 4; i++) {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      window.__vibrations = [];
      window.__orientationLocks = [];
      window.__orientationUnlocks = 0;
      window.__rejectRotation = false;
      let full = false;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => (full ? document.documentElement : null),
      });
      Element.prototype.requestFullscreen = function () {
        full = true;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      };
      document.exitFullscreen = () => {
        full = false;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      };
      Object.defineProperty(screen.orientation, "lock", {
        configurable: true,
        value: async (value) => {
          window.__orientationLocks.push(value);
          if (window.__rejectRotation) throw Error("Fixture denial");
        },
      });
      Object.defineProperty(screen.orientation, "unlock", {
        configurable: true,
        value: () => {
          window.__orientationUnlocks++;
        },
      });
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (v) => {
          window.__vibrations.push(v);
          return true;
        },
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto((await state()).pairing.url);
    await page.getByLabel("Your name", { exact: true }).fill("Test " + i);
    await page
      .getByRole("button", { name: "Connect to console", exact: true })
      .click();
    const pending = await wait(async () =>
      (await state()).pending.find((p) => p.name === "Test " + i),
    );
    assert((await command({ type: "approve", requestId: pending.id })).ok);
    await page
      .getByRole("button", { name: "Enter controller", exact: true })
      .click();
    await wait(
      async () =>
        (await state()).players.find((p) => p.name === "Test " + i)?.connected,
    );
    phones.push({ context, page, cdp: await context.newCDPSession(page) });
  }
  for (const phone of phones) {
    assert.equal(
      await phone.page.evaluate(() => window.__orientationLocks.length),
      0,
    );
  }
  assert(
    (
      await library({
        type: "preview",
        gameId: game.id,
        definition: game.controller,
        modeId: "menu",
      })
    ).ok,
  );
  for (const phone of phones) {
    await expect(
      phone.page.locator(".studio-phone-modes .selected"),
    ).toHaveText("Menu");
    await expect
      .poll(() =>
        phone.page.evaluate(() =>
          window.__orientationLocks.includes("landscape"),
        ),
      )
      .toBe(true);
  }
  const orientationBeforeModes = await Promise.all(
    phones.map((phone) =>
      phone.page.evaluate(() => ({
        locks: window.__orientationLocks.length,
        unlocks: window.__orientationUnlocks,
      })),
    ),
  );
  for (const modeId of ["standard", "menu", "fight", "race", "menu"]) {
    await phones[0].page
      .getByRole("button", {
        name: game.controller.modes.find((m) => m.id === modeId).name,
        exact: true,
      })
      .click();
    for (const [index, phone] of phones.entries()) {
      await expect(
        phone.page.locator(".studio-phone-modes .selected"),
      ).toHaveText(game.controller.modes.find((m) => m.id === modeId).name);
      assert.deepEqual(
        await phone.page.evaluate(() => ({
          locks: window.__orientationLocks.length,
          unlocks: window.__orientationUnlocks,
        })),
        orientationBeforeModes[index],
      );
      assert.equal(
        await phone.page.evaluate(() => !!document.fullscreenElement),
        true,
      );
    }
  }
  pass(
    "Menu / Standard / Fight / Race switches retain the same landscape lock and fullscreen on all four phones",
  );
  const menuPhone = phones[0];
  await menuPhone.page.evaluate(() => document.exitFullscreen());
  await expect(menuPhone.page.locator(".studio-phone-rotate")).toContainText(
    "Tap fullscreen",
  );
  const locksBeforeReentry = await menuPhone.page.evaluate(
    () => window.__orientationLocks.length,
  );
  await menuPhone.page
    .getByRole("button", { name: "Toggle fullscreen", exact: true })
    .click();
  await expect
    .poll(() => menuPhone.page.evaluate(() => window.__orientationLocks.length))
    .toBeGreaterThan(locksBeforeReentry);
  await expect(menuPhone.page.locator(".studio-phone-rotate")).toHaveCount(0);
  const unlocksBeforeHome = await menuPhone.page.evaluate(
    () => window.__orientationUnlocks,
  );
  assert((await library({ type: "end-preview" })).ok);
  await expect(menuPhone.page.locator(".studio-phone")).toHaveCount(0);
  await expect
    .poll(() => menuPhone.page.evaluate(() => window.__orientationUnlocks))
    .toBeGreaterThan(unlocksBeforeHome);
  pass(
    "Game Menu requests landscape on all phones, re-entering fullscreen retries it and Home releases the lock",
  );
  assert(
    (
      await library({
        type: "preview",
        gameId: game.id,
        definition: game.controller,
        modeId: "race",
      })
    ).ok,
  );
  for (const phone of phones)
    await expect(
      phone.page.getByRole("button", { name: "RT + B", exact: true }),
    ).toBeVisible();
  for (let i = 0; i < 4; i++) {
    const p = phones[i],
      a = await center(p, "Steer", i % 2 ? 0.4 : -0.4),
      b = await center(p, "RT + B");
    await touch(p, [
      { id: 1, ...a },
      { id: 2, ...b },
    ]);
  }
  await wait(async () =>
    (await state()).players.every(
      (p) =>
        p.studio?.pressed.length === 1 &&
        Math.abs(Object.values(p.studio.values)[0]?.x ?? 0) > 0.2,
    ),
  );
  pass(
    "Four approved browser controllers hold steering and linked RT + B independently",
  );
  for (const p of phones) await touch(p, [], "touchEnd");
  await wait(async () =>
    (await state()).players.every(
      (p) =>
        !p.studio?.pressed.length &&
        Object.keys(p.studio?.values ?? {}).length === 0,
    ),
  );
  const p = phones[0];
  await expect
    .poll(() =>
      p.page.evaluate(() => window.__orientationLocks.includes("landscape")),
    )
    .toBe(true);
  await p.page.evaluate(() => {
    window.__rejectRotation = true;
  });
  assert(
    (
      await library({
        type: "preview",
        gameId: game.id,
        definition: game.controller,
        modeId: "fight",
      })
    ).ok,
  );
  await p.page.evaluate(() => document.exitFullscreen());
  await p.page
    .getByRole("button", { name: "Toggle fullscreen", exact: true })
    .click();
  await expect(p.page.locator(".studio-phone-rotate")).toContainText(
    "could not lock",
  );
  await p.page.evaluate(() => {
    window.__rejectRotation = false;
  });
  assert(
    (
      await library({
        type: "preview",
        gameId: game.id,
        definition: game.controller,
        modeId: "race",
      })
    ).ok,
  );
  await p.page.evaluate(() => document.exitFullscreen());
  await p.page
    .getByRole("button", { name: "Toggle fullscreen", exact: true })
    .click();
  await expect(p.page.locator(".studio-phone-rotate")).toHaveCount(0);
  pass(
    "Gameplay requests landscape and shows an honest fallback when the browser denies it",
  );

  await p.page.waitForTimeout(200);
  const start = await center(p, "Steer", 0.4, 0);
  await touch(p, [{ id: 1, ...start }]);
  const end = await center(p, "Steer", -0.4, 0);
  await touch(p, [{ id: 1, ...end }], "touchMove");
  await wait(
    async () =>
      (Object.values((await state()).players[0].studio?.values ?? {})[0]?.x ??
        0) < -0.2,
  );
  await touch(p, [], "touchEnd");
  pass("Analog drag changes direction without lifting and releases to neutral");
  await p.page.setViewportSize({ width: 390, height: 844 });
  await expect(p.page.locator(".studio-fit-message")).toHaveCount(0);
  const rects = await p.page.locator(".studio-widget").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect(),
        s = n.parentElement.getBoundingClientRect();
      return {
        x: r.x - s.x,
        y: r.y - s.y,
        w: r.width,
        h: r.height,
        sw: s.width,
        sh: s.height,
      };
    }),
  );
  assert(
    rects.every(
      (r) =>
        r.x >= -0.1 &&
        r.y >= -0.1 &&
        r.x + r.w <= r.sw + 0.1 &&
        r.y + r.h <= r.sh + 0.1,
    ),
  );
  await p.page.screenshot({ path: out + "/actual-phone-portrait.png" });
  await p.page.setViewportSize({ width: 844, height: 390 });
  pass("Phone rotation fits controls inside the safe canvas without cropping");
  await p.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await p.page
    .getByRole("button", { name: "Test vibration", exact: true })
    .click();
  await expect
    .poll(() => p.page.evaluate(() => window.__vibrations.includes(50)))
    .toBe(true);
  await p.page.getByRole("button", { name: "Done", exact: true }).click();
  pass("Explicit Test vibration works while settings pause gameplay feedback");
  await p.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await p.page
    .getByRole("button", { name: "Adjust layout", exact: true })
    .click();
  await expect(
    p.page.getByRole("dialog", {
      name: "Adjust your controller layout",
      exact: true,
    }),
  ).toBeVisible();
  const handle = p.page.getByLabel("Move RT + B", { exact: true }),
    original = await p.page
      .getByRole("button", { name: "RT + B", exact: true })
      .boundingBox();
  const hb = await handle.boundingBox();
  await p.page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.page.mouse.down();
  await p.page.mouse.move(hb.x + hb.width / 2 - 65, hb.y + hb.height / 2 - 8, {
    steps: 6,
  });
  await p.page.mouse.up();
  await wait(async () => !(await state()).players[0].studio?.pressed.length);
  const moved = await p.page
    .getByRole("button", { name: "RT + B", exact: true })
    .boundingBox();
  assert(moved.x < original.x - 30);
  const resize = p.page.getByRole("button", {
      name: "Resize RT + B",
      exact: true,
    }),
    rb = await resize.boundingBox();
  await p.page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await p.page.mouse.down();
  await p.page.mouse.move(rb.x + rb.width / 2 - 35, rb.y + rb.height / 2 - 25, {
    steps: 6,
  });
  await p.page.mouse.up();
  const resized = await p.page
    .getByRole("button", { name: "RT + B", exact: true })
    .boundingBox();
  assert(resized.width < moved.width - 5);
  await expect
    .poll(async () => !(await state()).players[0].studio?.pressed.length)
    .toBe(true);

  await p.page.getByRole("button", { name: "Done", exact: true }).click();
  const savedLayout = await p.page.evaluate(() =>
    Object.entries(localStorage).filter(([k]) =>
      k.startsWith("waterconsole.layout.v1."),
    ),
  );
  assert(savedLayout.some(([, v]) => v !== "{}"));
  assert.equal(
    (
      await phones[1].page.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("waterconsole.layout.v1."),
        ),
      )
    ).length,
    0,
  );
  await p.page.reload();
  await p.page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  await expect(
    p.page.getByRole("button", { name: "RT + B", exact: true }),
  ).toBeVisible();
  await p.page.waitForTimeout(200);
  const reloaded = await p.page
    .getByRole("button", { name: "RT + B", exact: true })
    .boundingBox();
  assert(Math.abs(reloaded.x - resized.x) < 3);
  await p.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await p.page
    .getByRole("button", { name: "Adjust layout", exact: true })
    .click();
  await p.page.getByRole("button", { name: "Reset", exact: true }).click();
  await p.page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert(
    Math.abs(
      (
        await p.page
          .getByRole("button", { name: "RT + B", exact: true })
          .boundingBox()
      ).x - reloaded.x,
    ) < 3,
  );
  await p.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await p.page
    .getByRole("button", { name: "Adjust layout", exact: true })
    .click();
  await p.page.getByRole("button", { name: "Reset", exact: true }).click();
  await p.page.getByRole("button", { name: "Done", exact: true }).click();
  await p.page.screenshot({ path: out + "/phone-personal-layout.png" });
  pass(
    "Phone drag layout is neutral, device-local, survives reload, cancels safely and resets",
  );

  assert((await library({ type: "end-preview" })).ok);
  if (process.env.WATERCONSOLE_STUDIO_NATIVE === "1") {
    const capabilities = await library({ type: "capabilities" });
    assert(
      capabilities.config.gamepad,
      "Existing virtual gamepad support is required for this opt-in test",
    );
    const started = await command({ type: "startGame", gameId: game.id });
    assert(started.ok, started.error);
    await fs.writeFile(
      out + "/native-report.json.focus",
      "activate owned fixture",
    );
    await wait(async () => (await state()).native.focused);
    assert((await command({ type: "studioMode", modeId: "race" })).ok);
    await wait(async () => (await state()).native.controls === "game");
    for (let i = 0; i < 4; i++) {
      const phone = phones[i];
      const a = await center(phone, "Steer", i % 2 ? 0.4 : -0.4),
        b = await center(phone, "RT + B");
      await touch(phone, [
        { id: 1, ...a },
        { id: 2, ...b },
      ]);
    }
    const native = await wait(async () => {
      const r = await report();
      return r?.pads.filter(
        (p) =>
          p.connected &&
          p.report.rt === 255 &&
          p.report.buttons & 8192 &&
          Math.abs(p.report.lx) > 5000,
      ).length === 4
        ? r
        : null;
    });
    assert(
      native.pads[0].report.lx < 0 &&
        native.pads[1].report.lx > 0 &&
        native.pads[2].report.lx < 0 &&
        native.pads[3].report.lx > 0,
    );
    pass(
      "Real native helper delivers four separate XInput pads, held combos and true analog axes to the owned fixture",
    );
    await wait(async () =>
      (
        await Promise.all(
          phones.map((phone) =>
            phone.page.evaluate(() => window.__vibrations.some((v) => v > 100)),
          ),
        )
      ).every(Boolean),
    );
    pass(
      "Slot-tagged synthetic game rumble reaches each phone vibration callback",
    );
    for (const phone of phones) await touch(phone, [], "touchEnd");
    await wait(async () => {
      const r = await report();
      return r?.pads
        .filter((p) => p.connected)
        .every(
          (p) =>
            p.report.buttons === 0 && p.report.rt === 0 && p.report.lx === 0,
        );
    });
    pass("Native release resets every pad");
    assert((await command({ type: "studioMode", modeId: "standard" })).ok);
    const leftStick = await center(p, "Left stick", 0.35, 0),
      dpad = await center(p, "D-pad", -0.35, -0.35);
    await touch(p, [
      { id: 1, ...leftStick },
      { id: 2, ...dpad },
    ]);
    await wait(async () => {
      const r = await report(),
        v = r?.pads.find((p) => p.index === 0)?.report;
      return v && (v.buttons & 5) === 5 && v.lx > 5000;
    });
    await touch(p, [], "touchEnd");
    pass("Standard D-pad bits stay independent from the real left-stick axis");

    assert((await command({ type: "stopGame" })).ok);
    await wait(async () => (await state()).phase === "home");
    pass("Normal return Home waits for the owned test application to exit");
    game.bindings.keyboard[1].race.rt = [{ kind: "key", code: "W" }];
    game.bindings.keyboard[1].race.b = [{ kind: "key", code: "Space" }];
    game.inputMethod = "keyboard";
    game.maxPlayers = 1;
    const keyboard = await library({ type: "save", game });
    assert(keyboard.ok, keyboard.error);
    game = keyboard.game;
    assert((await command({ type: "startGame", gameId: game.id })).ok);
    await fs.writeFile(
      out + "/native-report.json.focus",
      "activate owned fixture",
    );
    await wait(async () => (await state()).native.focused);
    assert((await command({ type: "studioMode", modeId: "race" })).ok);
    await expect(
      phones[3].page.getByRole("button", { name: "RT + B", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    const steer = await center(p, "Steer", 0.4, 0),
      combo = await center(p, "RT + B");
    await touch(p, [
      { id: 1, ...steer },
      { id: 2, ...combo },
    ]);
    await wait(async () => {
      const r = await report();
      return (
        r?.keys.includes(0x57) && r.keys.includes(0x20) && r.keys.includes(0x44)
      );
    });
    pass(
      "Keyboard backend delivers steering + throttle + drift while extra slots are spectators",
    );
    await fs.writeFile(
      out + "/native-report.json.blur",
      "minimize owned fixture",
    );
    await wait(async () => !(await state()).native.focused);
    await wait(async () => {
      const r = await report();
      return r?.keys.length === 0;
    });
    await touch(p, [], "touchEnd");
    pass("Losing foreground focus releases real injected keyboard output");
    assert((await command({ type: "stopGame" })).ok);
    await wait(async () => (await state()).phase === "home");
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await fs.writeFile(
    out + "/integration-result.json",
    JSON.stringify({ checks, errors, data }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (e) {
  console.error(e.stack);
  if (host) {
    const current = await state().catch(() => null);
    console.error(
      JSON.stringify({ phase: current?.phase, native: current?.native }),
    );
    await host
      .screenshot({ path: out + "/integration-failure.png" })
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  for (const p of phones) await touch(p, [], "touchEnd").catch(() => {});
  if (host) await command({ type: "stopGame" }).catch(() => {});
  await browser?.close();
  await app?.close();
}
