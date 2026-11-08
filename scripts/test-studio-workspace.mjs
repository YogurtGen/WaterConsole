import { _electron, expect } from "playwright/test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = path.join(root, ".local/studio-workspace-test");
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
const checks = [],
  errors = [];
const normalize = (g) => {
  const v = structuredClone(g);
  delete v.revision;
  delete v.updatedAt;
  delete v.controller.revision;
  return v;
};
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000),
  );
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const library = (c) =>
      page.evaluate((c) => window.waterconsole.library(c), c),
    command = (c) => page.evaluate((c) => window.waterconsole.command(c), c);
  let game = newLocalGame();
  game.title = "Studio workspace fixture";
  game.inputMethod = "keyboard";
  game.controller.grid.visible = false;
  game.bindings.gamepad[1].standard.a = [{ kind: "button", code: "x" }];
  game.bindings.keyboard[1].standard.a = [{ kind: "key", code: "Space" }];
  const original = structuredClone(game);
  const saved = await library({ type: "save", game });
  assert(saved.ok, saved.error);
  game = saved.game;
  await command({ type: "selectGame", gameId: game.id });
  await page
    .getByRole("button", { name: "Controller Studio", exact: true })
    .click();
  await expect(page.locator(".guide-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  const bounds = () =>
    page.locator(".studio-resizable-workspace").evaluate((el) => {
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
        body: r(el),
        left: r(el.querySelector(".studio-palette")),
        right: r(el.querySelector(".studio-inspector")),
        canvas: r(el.querySelector(".studio-canvas-scroll")),
        tools: r(el.querySelector(".studio-bottom-panel")),
      };
    });
  async function contained() {
    const values = await page
      .locator(".studio-model-palette")
      .evaluate((el) => {
        const panel = el.closest(".builder-panel").getBoundingClientRect();
        return [...el.querySelectorAll(":scope>button")].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            box: { x: r.x, right: r.right, y: r.y, bottom: r.bottom },
            panel: {
              x: panel.x,
              right: panel.right,
              y: panel.y,
              bottom: panel.bottom,
            },
            items: [
              ...b.querySelectorAll(
                ".studio-model-name,.console-model-preview",
              ),
            ].map((e) => {
              const t = e.getBoundingClientRect();
              return { x: t.x, right: t.right, y: t.y, bottom: t.bottom };
            }),
          };
        });
      });
    for (const v of values) {
      assert(v.box.x >= v.panel.x + 2);
      assert(v.box.right <= v.panel.right - 2);
      assert(v.box.bottom <= v.panel.bottom - 2);
      for (const i of v.items) {
        assert(i.x >= v.box.x);
        assert(i.right <= v.box.right + 0.1);
        assert(i.y >= v.box.y);
        assert(i.bottom <= v.box.bottom + 0.1);
      }
    }
    const b = await bounds();
    assert(b.left.right <= b.canvas.x);
    assert(b.canvas.right <= b.right.x);
    assert(b.right.right <= b.body.right + 0.1);
    assert(b.tools.bottom <= b.body.bottom + 0.1);
  }
  async function drag(name, dx, dy) {
    const handle = page.getByRole("separator", { name, exact: true }),
      b = await handle.boundingBox();
    assert(b);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await expect(page.getByRole("separator")).toHaveCount(3);
  await contained();
  await page
    .getByRole("button", { name: "Primary action", exact: true })
    .focus();
  await page
    .locator(".studio-palette .builder-panel")
    .filter({ has: page.locator(".studio-model-palette") })
    .screenshot({ path: out + "/console-models.png" });
  let start = await bounds();
  await drag("Resize controls panel", 90, 0);
  let next = await bounds();
  assert(next.left.w > start.left.w + 85);
  assert(Math.abs(next.canvas.w - (start.canvas.w - 90)) < 2);
  assert(Math.abs(next.right.w - start.right.w) < 1);
  checks.push(
    "Dragging the controls divider resizes its neighbor while keeping models inside their cards",
  );
  start = next;
  await drag("Resize inspector panel", -70, 0);
  next = await bounds();
  assert(next.right.w > start.right.w + 65);
  assert(next.canvas.w < start.canvas.w - 65);
  await contained();
  checks.push(
    "Inspector divider resizes the inspector and canvas without overlap",
  );
  start = next;
  await drag("Resize canvas tools", 0, -45);
  next = await bounds();
  assert(next.tools.h > start.tools.h + 40);
  assert(next.canvas.h < start.canvas.h - 40);
  checks.push(
    "Horizontal divider shares space between the canvas and its tools",
  );
  const preferred = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("waterconsole.studio.panels.v1")),
  );
  assert(preferred.left > 300);
  assert(preferred.right > 350);
  await page.getByRole("button", { name: "Game setup", exact: false }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Controller Studio", exact: true })
    .click();
  await expect
    .poll(async () => (await bounds()).left.w)
    .toBeCloseTo(next.left.w, 0);
  checks.push("Panel preferences survive closing and reopening Studio");
  const separator = page.getByRole("separator", {
    name: "Resize controls panel",
    exact: true,
  });
  await separator.focus();
  const beforeKey = await bounds();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await bounds()).left.w)
    .toBeLessThan(beforeKey.left.w - 10);
  await separator.dblclick();
  await expect.poll(async () => (await bounds()).left.w).toBeCloseTo(240, 0);
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  next = await bounds();
  assert(Math.abs(next.left.w - 240) < 1);
  assert(Math.abs(next.right.w - 320) < 1);
  assert(Math.abs(next.tools.h - 184) < 1);
  await page
    .getByRole("button", { name: "Save controller", exact: true })
    .click();
  let record = (await library({ type: "list" })).games[0];
  assert.deepEqual(normalize(record), normalize(original));
  checks.push(
    "Keyboard resize, double-click reset and Reset layout leave controller data and bindings unchanged",
  );
  for (const [w, h] of [
    [1280, 720],
    [1024, 768],
    [800, 600],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, { w, h }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(w, h),
      { w, h },
    );
    await page.waitForTimeout(100);
    await contained();
  }
  checks.push(
    "All six model previews and labels remain contained down to 800×600",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000),
  );
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  await page.locator(".studio-palette").evaluate((el) => (el.scrollTop = 0));
  await page.locator(".studio-inspector").evaluate((el) => (el.scrollTop = 0));
  await page
    .locator(".controller-studio")
    .screenshot({ path: out + "/workspace-default.png" });
  const sourceA = game.controller.modes[1].controls.find(
      (c) => c.label === "A",
    ),
    sourceB = game.controller.modes[1].controls.find((c) => c.label === "B");
  const layer = (id) => page.locator('[data-layer-id="' + id + '"]');
  await layer(sourceA.id).click();
  const count = await page.locator(".studio-edit-control").count();
  await page.keyboard.press("Control+c");
  await expect(page.locator(".studio-clipboard-status")).toContainText(
    "Copied 1 control",
  );
  await page.keyboard.press("Control+v");
  await expect(page.locator(".studio-edit-control")).toHaveCount(count + 1);
  await page.keyboard.press("Control+d");
  await expect(page.locator(".studio-edit-control")).toHaveCount(count + 2);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".studio-edit-control")).toHaveCount(count + 1);
  await page.keyboard.press("Control+y");
  await expect(page.locator(".studio-edit-control")).toHaveCount(count + 2);
  checks.push(
    "Ctrl+C / Ctrl+V, Ctrl+D and Undo/Redo duplicate real selected controls",
  );
  await layer(sourceA.id).click();
  await layer(sourceB.id).click({ modifiers: ["Shift"] });
  await page.keyboard.press("Control+c");
  await expect(page.locator(".studio-clipboard-status")).toContainText(
    "Copied 2 controls",
  );
  await page
    .locator(".studio-editor-header nav")
    .getByRole("button", { name: "Fight", exact: true })
    .click();
  const targetCount = await page.locator(".studio-edit-control").count();
  await page.keyboard.press("Control+v");
  await expect(page.locator(".studio-edit-control")).toHaveCount(
    targetCount + 2,
  );
  await expect(page.locator(".studio-edit-control.selected")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Save controller", exact: true })
    .click();
  record = (await library({ type: "list" })).games[0];
  const pasted = record.controller.modes
    .find((m) => m.id === "fight")
    .controls.filter(
      (c) =>
        !game.controller.modes
          .find((m) => m.id === "fight")
          .controls.some((old) => old.id === c.id),
    );
  assert.equal(pasted.length, 2);
  const a = pasted.find((c) => c.label === "A");
  assert(a);
  assert.deepEqual(record.bindings.gamepad[1].fight[a.actions[0]], [
    { kind: "button", code: "x" },
  ]);
  assert.deepEqual(record.bindings.keyboard[1].fight[a.actions[0]], [
    { kind: "key", code: "Space" },
  ]);
  assert.deepEqual(
    record.bindings.gamepad[1].fight.a,
    game.bindings.gamepad[1].fight.a,
  );
  checks.push(
    "Multi-select copies across modes with original PC bindings and no changes to existing controls",
  );
  await layer(a.id).click();
  const input = page.getByLabel("Label / accessible name", { exact: true });
  await input.focus();
  const intercepted = await input.evaluate((el) => {
    const c = new KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
      v = new KeyboardEvent("keydown", {
        key: "v",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
    el.dispatchEvent(c);
    el.dispatchEvent(v);
    return c.defaultPrevented || v.defaultPrevented;
  });
  assert.equal(intercepted, false);
  checks.push(
    "Text-field copy and paste remain native and do not duplicate controls",
  );
  await page
    .locator(".controller-studio")
    .screenshot({ path: out + "/workspace.png" });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/result.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  checks.forEach((c) => console.log("PASS " + c));
} catch (e) {
  console.error(e);
  try {
    await (await app.firstWindow()).screenshot({ path: out + "/failure.png" });
  } catch {}
  process.exitCode = 1;
} finally {
  await app.close();
}
