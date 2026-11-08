import { _electron, chromium, expect } from "playwright/test";
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = path.join(root, ".local/layout-fidelity");
await fs.mkdir(out, { recursive: true });
await build({
  entryPoints: ["src/shared/studio-model.ts"],
  outfile: out + "/model.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { newLocalGame } = await import(pathToFileURL(out + "/model.mjs").href);
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DISABLE_NATIVE: "1",
  WATERCONSOLE_DATA_DIR: out + "/data-" + Date.now(),
};
delete env.ELECTRON_RUN_AS_NODE;
let app, browser;
const checks = [],
  errors = [];
try {
  app = await _electron.launch({
    executablePath:
      process.env.WATERCONSOLE_EXECUTABLE || (await import("electron")).default,
    args: process.env.WATERCONSOLE_APP_ROOT
      ? [process.env.WATERCONSOLE_APP_ROOT]
      : [root],
    env,
  });
  const host = await app.firstWindow();
  host.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000),
  );
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const library = (c) =>
      host.evaluate((c) => window.waterconsole.library(c), c),
    command = (c) => host.evaluate((c) => window.waterconsole.command(c), c),
    state = () => host.evaluate(() => window.waterconsole.getState());
  let game = newLocalGame();
  game.title = "Controller Layout Test";
  game.inputMethod = "keyboard";
  const saved = await library({ type: "save", game });
  assert(saved.ok, saved.error);
  game = saved.game;
  await command({ type: "selectGame", gameId: game.id });
  await host
    .getByRole("button", { name: "Controller Studio", exact: true })
    .click();
  await expect(host.locator(".guide-card")).toBeVisible();
  await host
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await expect(host.locator(".guide-card")).toHaveCount(0);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 780, height: 360 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(screen.orientation, "lock", {
      value: async () => {},
      configurable: true,
    });
    Object.defineProperty(screen.orientation, "unlock", {
      value: () => {},
      configurable: true,
    });
  });
  const phone = await ctx.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto((await state()).pairing.url);
  await phone.getByLabel("Your name", { exact: true }).fill("Layout Test");
  await phone
    .getByRole("button", { name: "Connect to console", exact: true })
    .click();
  await expect.poll(async () => (await state()).pending.length).toBe(1);
  await command({ type: "approve", requestId: (await state()).pending[0].id });
  await phone
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  const geometry = (page) =>
    page.locator(".studio-surface").evaluate((el) => {
      const box = el.getBoundingClientRect(),
        scale = box.width / el.clientWidth;
      return {
        width: el.clientWidth,
        height: el.clientHeight,
        items: [...el.querySelectorAll(".studio-widget")].map((b) => {
          const r = b
            .querySelector(".studio-widget-visual")
            .getBoundingClientRect();
          return {
            id: b.dataset.layoutId,
            x: (r.x - box.x) / scale,
            y: (r.y - box.y) / scale,
            w: r.width / scale,
            h: r.height / scale,
          };
        }),
      };
    });
  for (const [width, height] of [
    [780, 360],
    [844, 390],
    [915, 412],
    [390, 844],
  ]) {
    await phone.setViewportSize({ width, height });
    await host
      .getByLabel("View", { exact: true })
      .selectOption(`${width}x${height}`);
    for (const modeId of ["standard", "menu"]) {
      await host
        .locator(".studio-editor-header")
        .getByRole("button", {
          name: game.controller.modes.find((m) => m.id === modeId).name,
          exact: true,
        })
        .click();
      assert(
        (
          await library({
            type: "preview",
            gameId: game.id,
            definition: game.controller,
            modeId,
          })
        ).ok,
      );
      await expect(phone.locator(".studio-phone-modes .selected")).toHaveText(
        game.controller.modes.find((m) => m.id === modeId).name,
      );
      await expect
        .poll(async () => {
          const a = await geometry(host),
            b = await geometry(phone);
          return a.width === b.width && a.height === b.height;
        })
        .toBe(true);
      const a = await geometry(host),
        b = await geometry(phone);
      assert.equal(a.items.length, b.items.length);
      for (const item of a.items) {
        const other = b.items.find((i) => i.id === item.id);
        assert(other);
        for (const k of ["x", "y", "w", "h"])
          assert(
            Math.abs(item[k] - other[k]) < 1.1,
            `${width} ${modeId} ${item.id} ${k}: ${item[k]} != ${other[k]}`,
          );
      }
      if (width === 780 && modeId === "standard")
        await phone.screenshot({ path: out + "/phone-standard.png" });
    }
    checks.push(
      `Studio and phone use identical visual geometry at ${width}×${height}`,
    );
  }
  await phone.setViewportSize({ width: 844, height: 390 });
  await host.getByLabel("View", { exact: true }).selectOption("844x390");
  await host
    .locator(".studio-editor-header")
    .getByRole("button", { name: "Standard", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Preview on my phone", exact: true })
    .click();
  await expect(phone.locator(".studio-phone-modes .selected")).toHaveText(
    "Standard",
  );
  for(const display of await host.locator(".studio-widget:not(.kind-dpad) .studio-widget-body").evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).display)))assert.notEqual(display,"none");
  assert.equal(await host.locator(".studio-pad-model .pad-arrow").count(),4);
  const id = game.controller.modes
    .find((m) => m.id === "standard")
    .controls.find((c) => c.label === "Y").id;
  const target = host.locator('[data-edit-control="' + id + '"]'),
    beforeEdit = (await geometry(host)).items.find((i) => i.id === id);
  await expect(target).toBeVisible();
  let box = await target.boundingBox();
  await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await host.mouse.down();
  await host.mouse.move(
    box.x + box.width / 2 - 24,
    box.y + box.height / 2 + 12,
    { steps: 5 },
  );
  await host.mouse.up();
  const moved = (await geometry(host)).items.find((i) => i.id === id);
  assert(
    Math.abs(moved.x - beforeEdit.x) > 4,
    "Phone canvas must edit the real position",
  );
  const handle = target.locator(".studio-resize");
  box = await handle.boundingBox();
  assert(box);
  await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await host.mouse.down();
  await host.mouse.move(
    box.x + box.width / 2 + 14,
    box.y + box.height / 2 + 14,
    { steps: 5 },
  );
  await host.mouse.up();
  const resized = (await geometry(host)).items.find((i) => i.id === id);
  assert(resized.w > moved.w + 4, "Phone canvas must resize the real control");
  await expect
    .poll(async () => {
      const a = await geometry(host),
        b = await geometry(phone);
      return a.items.every((i) => {
        const j = b.items.find((j) => j.id === i.id);
        return (
          j && ["x", "y", "w", "h"].every((k) => Math.abs(i[k] - j[k]) < 1.1)
        );
      });
    })
    .toBe(true);
  checks.push(
    "Phone canvas supports direct selection, dragging and resizing; approved phone receives exactly the edited geometry",
  );
  await host.getByLabel("View", { exact: true }).selectOption("design");
  await host.getByRole("button", { name: "Petal D-pad", exact: true }).click();
  await host
    .getByRole("button", { name: "Primary action", exact: true })
    .click();
  await expect(host.locator(".studio-widget.pad-petals")).toHaveCount(2);
  await expect(host.locator(".studio-widget.appearance-primary")).toHaveCount(
    1,
  );
  checks.push(
    "Existing-console button and petal D-pad models can be added without replacing the layout",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/result.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  checks.forEach((c) => console.log("PASS " + c));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await app?.close();
}
