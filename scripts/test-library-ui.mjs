import { _electron, chromium, expect } from "playwright/test";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = path.join(root, ".local/library-ui");
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
    "/out:" + out + "/WaterConsole.InputFixture.exe",
    path.join(root, "tests/fixtures/InputFixture.cs"),
  ],
  { windowsHide: true },
);
await build({
  entryPoints: [path.join(root, "src/shared/studio-model.ts")],
  outfile: out + "/model.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { newLocalGame } = await import(pathToFileURL(out + "/model.mjs"));
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: out + "/profile-" + Date.now(),
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const executablePath =
    process.env.WATERCONSOLE_EXECUTABLE || (await import("electron")).default,
  args = process.env.WATERCONSOLE_APP_ROOT
    ? [process.env.WATERCONSOLE_APP_ROOT]
    : process.env.WATERCONSOLE_EXECUTABLE
      ? []
      : [root];
const errors = [],
  checks = [];
let app, browser, page;
const pass = (m) => {
  checks.push(m);
  console.log("PASS " + m);
};
const state = () => page.evaluate(() => window.waterconsole.getState());
const ipc = (c) => page.evaluate((c) => window.waterconsole.library(c), c);
const command = (c) => page.evaluate((c) => window.waterconsole.command(c), c);
try {
  app = await _electron.launch({ executablePath, args, env, timeout: 35000 });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 900),
  );
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const games = [];
  for (let i = 1; i <= 8; i++) {
    const g = newLocalGame();
    g.title = "Fixture " + i;
    g.launch.executable = out + "/WaterConsole.InputFixture.exe";
    g.inputMethod = "keyboard";
    const saved = await ipc({ type: "save", game: g });
    assert(saved.ok, saved.error);
    games.push(saved.game);
  }
  const shelf = page.locator(".game-shelf").first(),
    row = shelf.locator(".game-row");
  await expect
    .poll(() => row.evaluate((e) => e.scrollWidth > e.clientWidth))
    .toBe(true);
  await expect(row).toHaveCSS("scrollbar-width", "none");
  assert.equal(
    await row.evaluate(
      (e) => getComputedStyle(e, "::-webkit-scrollbar").display,
    ),
    "none",
  );
  await row.hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => row.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(300);
  const before = await row.evaluate((e) => e.scrollLeft);
  await shelf
    .getByRole("button", { name: "Scroll game library left", exact: true })
    .click();
  await expect
    .poll(() => row.evaluate((e) => e.scrollLeft))
    .toBeLessThan(before - 50);
  pass(
    "Mouse wheel and visible carousel arrows browse the library with its scrollbar hidden",
  );
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await context.newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto((await state()).pairing.url);
  await phone.getByLabel("Your name", { exact: true }).fill("Navigator");
  await phone
    .getByRole("button", { name: "Connect to console", exact: true })
    .click();
  await expect.poll(async () => (await state()).pending.length).toBe(1);
  assert(
    (
      await command({
        type: "approve",
        requestId: (await state()).pending[0].id,
      })
    ).ok,
  );
  await phone
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  const first = (await state()).catalog[0].id;
  await command({ type: "selectGame", gameId: first });
  const navigationSteps = (await state()).catalog.findIndex(
    (g) => g.id === games[7].id,
  );
  for (let i = 0; i < navigationSteps; i++) {
    const previous = (await state()).selectedGameId;
    await phone.getByRole("button", { name: "Right", exact: true }).click();
    await expect
      .poll(async () => (await state()).selectedGameId)
      .not.toBe(previous);
  }
  assert.equal((await state()).selectedGameId, games[7].id);
  const selected = row.locator(`[data-game-id="${games[7].id}"]`);
  await expect
    .poll(async () =>
      selected.evaluate((e) => {
        const r = e.getBoundingClientRect(),
          p = e.parentElement.getBoundingClientRect();
        return r.left >= p.left - 1 && r.right <= p.right + 1;
      }),
    )
    .toBe(true);
  await expect(
    phone.getByRole("button", { name: "Edit game", exact: true }),
  ).toHaveCount(0);
  pass(
    "Approved phone D-pad selection scrolls the PC carousel to the selected offscreen game without exposing editing controls",
  );
  await selected
    .getByRole("button", { name: "Show Fixture 8 details", exact: true })
    .click({ button: "right" });
  const menu = page.getByRole("menu", {
    name: "Fixture 8 options",
    exact: true,
  });
  await expect(menu).toBeVisible();
  const selectionBefore = (await state()).selectedGameId;
  await page.keyboard.press("ArrowDown");
  assert.equal((await state()).selectedGameId, selectionBefore);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await selected
    .getByRole("button", { name: "Show Fixture 8 details", exact: true })
    .press("Shift+F10");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Edit game", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Edit game", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue(
    "Fixture 8",
  );
  if (await page.locator(".guide-card").count())
    await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  pass(
    "Right-click and Shift+F10 open a keyboard-friendly Edit menu for the correct entry",
  );
  const seventh = row.locator(`[data-game-id="${games[6].id}"]`);
  await seventh
    .getByRole("button", { name: "Show Fixture 7 details", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete from library", exact: false })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(
    "Your game installation and original images stay",
  );
  await confirm.getByRole("button", { name: "Keep game", exact: true }).click();
  assert((await state()).catalog.some((g) => g.id === games[6].id));
  await seventh
    .getByRole("button", { name: "Show Fixture 7 details", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete from library", exact: false })
    .click();
  await confirm
    .getByRole("button", { name: "Delete from library", exact: true })
    .click();
  await expect
    .poll(async () => (await state()).catalog.some((g) => g.id === games[6].id))
    .toBe(false);
  assert((await fs.stat(out + "/WaterConsole.InputFixture.exe")).isFile());
  pass(
    "Delete can be cancelled and removes only the chosen WaterConsole entry, preserving its executable",
  );
  await selected
    .getByRole("button", { name: "Show Fixture 8 details", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Controller Studio", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Controller Studio", exact: true }),
  ).toBeVisible();
  if (await page.locator(".guide-card").count())
    await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Button", exact: false })
    .filter({ hasText: "＋ Button" })
    .click();
  await page.getByLabel("Label / accessible name").fill("Colored attack");
  await page.getByLabel("Show", { exact: true }).selectOption("icon-text");
  const colors = page.locator(".studio-control-colors");
  await expect(page.locator(".studio-canvas-colors")).toBeVisible();
  await expect(page.locator(".theme-color-editor")).toHaveCount(0);
  for (const [label, value] of [
    ["Text color", "#ffb39f"],
    ["Icon color", "#65b9ff"],
    ["Pressed text color", "#14221c"],
    ["Pressed icon color", "#973abb"],
  ]) {
    await colors
      .getByRole("button", {
        name: label.startsWith("Pressed") ? "While pressed" : "Normal",
        exact: true,
      })
      .click();
    await colors
      .getByRole("button", { name: "Edit " + label, exact: true })
      .click();
    await colors.getByLabel(label + " HEX", { exact: true }).fill(value);
    await colors.getByLabel(label + " HEX", { exact: true }).press("Enter");
  }
  await expect(page.locator(".theme-color-editor")).toHaveCount(1);
  await page
    .locator(".studio-canvas-colors")
    .getByRole("button", { name: "Edit Background", exact: true })
    .click();
  await expect(page.locator(".theme-color-editor")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Close color picker", exact: true })
    .click();
  await colors.getByRole("button", { name: "Normal", exact: true }).click();
  await expect(page.locator(".theme-color-editor")).toHaveCount(0);
  await page
    .locator(".studio-editor-body")
    .screenshot({ path: out + "/contextual-colors.png" });
  const widget = page.locator('.studio-widget[aria-label="Colored attack"]');
  await expect(widget).toHaveCSS("--control-fg", "#ffb39f");
  await expect(widget.locator(".controller-glyph")).toHaveCSS(
    "color",
    "rgb(101, 185, 255)",
  );
  await page
    .getByRole("button", { name: "Save controller", exact: true })
    .click();
  await expect
    .poll(async () => {
      const saved = await ipc({ type: "list" });
      return saved.games
        .find((g) => g.id === games[7].id)
        ?.controller.modes.flatMap((m) => m.controls)
        .some(
          (c) =>
            c.label === "Colored attack" &&
            c.theme.icon === "#65b9ff" &&
            c.theme.text === "#ffb39f",
        );
    })
    .toBe(true);
  await page
    .getByRole("button", { name: "Preview on my phone", exact: true })
    .click();
  const remote = phone.getByRole("button", {
    name: "Colored attack",
    exact: true,
  });
  await expect(remote).toBeVisible();
  await expect(remote).toHaveCSS("--control-fg", "#ffb39f");
  await expect(remote.locator(".controller-glyph")).toHaveCSS(
    "color",
    "rgb(101, 185, 255)",
  );
  const b = await remote.boundingBox();
  const cdp = await context.newCDPSession(phone);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 }],
  });
  await expect(remote).toHaveCSS("--control-fg", "#14221c");
  await expect(remote.locator(".controller-glyph")).toHaveCSS(
    "color",
    "rgb(151, 58, 187)",
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(remote).toHaveCSS("--control-fg", "#ffb39f");
  pass(
    "Studio text and icon colors save independently and reach the phone with separate held/released colors",
  );
  await page
    .locator(".studio-stage-shell")
    .screenshot({ path: out + "/text-and-icon-preview.png" });
  const canvas = page.locator(".studio-design-overlay"),
    rect = await canvas.boundingBox();
  await canvas.click({
    position: { x: rect.width * 0.98, y: rect.height * 0.97 },
  });
  await expect(page.locator(".studio-control-colors")).toHaveCount(0);
  await expect(page.locator(".studio-canvas-colors")).toBeVisible();
  pass(
    "Contextual color controls disappear with no selection; canvas background stays available and only one picker opens",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/report.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.error(error.stack);
  if (page)
    await page.screenshot({ path: out + "/failure.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  await app?.close();
}
