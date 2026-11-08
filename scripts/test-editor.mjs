import { _electron, expect } from "playwright/test";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
const root = process.cwd(),
  output = path.join(root, ".local", "editor-test");
await fs.mkdir(output, { recursive: true });
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
    "/out:" + path.join(output, "WaterConsole.InputFixture.exe"),
    path.join(root, "tests/fixtures/InputFixture.cs"),
  ],
  { windowsHide: true },
);
const data = output + "/ui-" + Date.now();
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: data,
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
const executablePath =
  process.env.WATERCONSOLE_EXECUTABLE || (await import("electron")).default;
const appArgs = process.env.WATERCONSOLE_APP_ROOT
  ? [process.env.WATERCONSOLE_APP_ROOT]
  : process.env.WATERCONSOLE_EXECUTABLE
    ? []
    : [root];
let app;
const checks = [],
  errors = [];
try {
  app = await _electron.launch({
    executablePath,
    args: [...appArgs, "--force-device-scale-factor=1"],
    env,
    timeout: 35000,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
  );
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  const art = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    const x = c.getContext("2d");
    x.fillStyle = "#214734";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#83e8b3";
    x.fillRect(0, 0, 800, 500);
    return c.toDataURL("image/png").split(",")[1];
  });
  await fs.writeFile(output + "/art.png", Buffer.from(art, "base64"));
  await page.getByRole("button", { name: "Add game", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Add a game", exact: true }),
  ).toBeVisible();
  checks.push("Add Game opens on the actual host");
  await expect(page.locator(".guide-card")).toBeVisible();
  await expect(page.locator(".guide-card")).toContainText(
    "Choose your own game",
  );
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await expect(page.locator(".guided-tour")).toHaveCount(0);
  checks.push("First-use spotlight can be skipped");
  await page
    .getByRole("button", { name: "Replay game setup guide", exact: true })
    .click();
  for (let i = 0; i < 3; i++)
    await page
      .locator(".guide-card")
      .getByRole("button", { name: "Next", exact: true })
      .click();
  await expect(page.locator(".guide-card")).toContainText(
    "Gamepad or keyboard?",
  );
  await expect(page.locator(".guide-highlight")).toHaveAttribute(
    "data-guide-target",
    '[data-guide="pc-output"]',
  );
  await page.locator('[data-guide="pc-output"]').selectOption("keyboard");
  await expect(page.locator('[data-guide="pc-output"]')).toHaveValue(
    "keyboard",
  );
  await page.locator('[data-guide="pc-output"]').selectOption("gamepad");
  const location = await page.locator(".builder-storage small").innerText();
  await page
    .locator(".builder-storage small")
    .evaluate((el) => (el.textContent = "Your chosen local data folder"));
  await page.screenshot({ path: output + "/tutorial-output.png" });
  await page
    .locator(".builder-storage small")
    .evaluate((el, text) => (el.textContent = text), location);
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await page.locator(".builder-steps button").nth(0).click();
  checks.push(
    "Question-mark replay explains output choice and allows the highlighted control to change",
  );

  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, output + "/WaterConsole.InputFixture.exe");
  await page.getByRole("button", { name: "Browse .exe", exact: true }).click();
  await expect(page.getByLabel("Game title", { exact: true })).toHaveValue(
    "WaterConsole.InputFixture",
  );
  await page.getByLabel("Game title", { exact: true }).fill("My Fixture Game");
  checks.push("Native picker stores a validated executable and editable title");
  await page.locator(".builder-steps button").nth(1).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("A local test setup, not a bundled game.");
  await page.getByRole("button", { name: "Racing", exact: true }).click();
  await page.getByLabel("Connection label").selectOption("offline");
  await page.locator(".builder-steps button").nth(2).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, output + "/art.png");
  await page
    .getByRole("button", { name: "Upload image", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Crop cover", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guide-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replay crop guide", exact: true })
    .click();
  for (let i = 0; i < 3; i++) {
    await expect(page.locator(".guide-highlight")).toBeVisible();
    await page
      .locator(".guide-card")
      .getByRole("button", { name: "Next", exact: true })
      .click();
  }
  await page
    .locator(".guide-card")
    .getByRole("button", { name: "Finish", exact: true })
    .click();
  checks.push(
    "Crop spotlight replays all four steps and finishes without applying a crop",
  );
  await expect(page.getByLabel("Crop ratio", { exact: true })).toHaveValue(
    "recommended",
  );
  await expect(
    page.getByRole("button", { name: "Use this crop", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: output + "/crop-editor.png" });
  await page
    .getByRole("button", { name: "Use this crop", exact: true })
    .click();
  checks.push(
    "Cover crop GUI defaults to its own recommended size and saves artwork",
  );
  await page.locator(".builder-art-slot.banner").getByRole("button", { name: "Upload image", exact: true }).click();
  if (await page.locator(".guide-card").count())
    await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Crop banner", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Artwork fit", { exact: true })).toHaveValue(
    "cover",
  );
  await page
    .getByRole("button", { name: "Use this crop", exact: true })
    .click();

  await page.locator(".builder-steps button").nth(3).click();
  await page
    .getByRole("button", { name: "Open Controller Studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Controller Studio", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guide-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".guide-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Controller Studio", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Replay controller studio guide",
      exact: true,
    })
    .click();
  for (let i = 0; i < 9; i++) {
    await expect(page.locator(".guide-highlight")).toBeVisible();
    await page
      .locator(".guide-card")
      .getByRole("button", { name: "Next", exact: true })
      .click();
  }
  await page
    .locator(".guide-card")
    .getByRole("button", { name: "Finish", exact: true })
    .click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  checks.push(
    "Studio spotlight covers ten targets, replays and Escape dismisses only the guide",
  );
  await page.getByRole("button", { name: "Race", exact: true }).click();
  await page.getByLabel("View", { exact: true }).selectOption("390x844");
  await page.screenshot({ path: output + "/studio-phone-preview.png" });
  await page.getByLabel("View", { exact: true }).selectOption("design");
  await page.screenshot({ path: output + "/studio-default.png" });
  checks.push("Studio opens with modes and device preview");
  await page
    .getByRole("button", { name: "Button", exact: false })
    .filter({ hasText: "＋ Button" })
    .click();
  await page.getByLabel("Label / accessible name").fill("Inventory");
  await page.getByLabel("Shape", { exact: true }).selectOption("triangle");
  await page.getByLabel("Show", { exact: true }).selectOption("icon-text");
  await page.getByRole("button", { name: "Choose icon", exact: false }).click();
  await page.locator(".icon-picker-scroll").evaluate((el) => {
    el.scrollTop = 1500;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(100);
  if (errors.length) throw Error(errors.join("\n"));
  checks.push("Scrolling the icon catalog keeps the editor mounted");
  await page.getByLabel("Search icons").fill("zzzznomatchingicon");
  await page.getByLabel("Search icons").press("ArrowDown");
  await page.getByLabel("Search icons").fill("backpack");
  await expect(
    page.getByRole("button", { name: "backpack · outline", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "backpack · outline", exact: true })
    .click();
  await page.getByRole("button", { name: "Use icon", exact: true }).click();
  await page.locator(".studio-theme-advanced > summary").click();
  await page.getByLabel("Edit theme for").selectOption("navigator");
  await page
    .locator(".studio-theme-advanced")
    .getByRole("button", { name: "Edit Button fill", exact: true })
    .click();
  await page.getByLabel("Button fill HEX").fill("#235c44");
  await page.getByLabel("Button fill HEX").blur();
  await page.screenshot({ path: output + "/studio-editor.png" });
  checks.push("Shapes, labels, offline icon search and Navigator colors edit");
  await page.locator(".studio-theme-advanced > summary").click();
  await page
    .locator(".studio-control-colors")
    .getByRole("button", { name: "Edit Button fill", exact: true })
    .click();
  await expect(page.getByLabel("Background HEX", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Button fill HEX").fill("#d14672");
  await page.getByLabel("Button fill HEX").press("Enter");
  const inventory = page.locator('.studio-widget[aria-label="Inventory"]');
  await expect(inventory).toHaveCSS("--control-bg", "#d14672");
  await page.getByLabel("Button fill color", { exact: true }).evaluate((el) => {
    el.value = "#293b7a";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(inventory).toHaveCSS("--control-bg", "#293b7a");
  checks.push(
    "Control color uses effective inheritance and applies HEX Enter/native input live",
  );

  await page
    .getByRole("button", { name: "Background image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this crop", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".studio-surface")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
    )
    .toContain("user-assets/");
  const loaded = await page.locator(".studio-surface").evaluate(async (el) => {
    const url = getComputedStyle(el).backgroundImage.slice(5, -2);
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalWidth;
  });
  if (loaded !== 1920) throw Error("Recommended controller backdrop missing");
  await page.locator('.studio-canvas-colors').getByRole('button',{name:'Remove image',exact:true}).click();
  await expect(page.locator('.studio-surface')).toHaveCSS('background-image','none');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect.poll(()=>page.locator('.studio-surface').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('user-assets/');
  checks.push('Canvas background image removes cleanly and Undo restores it');

  checks.push(
    "Persistent canvas background crop loads through the local asset protocol in the design canvas",
  );
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page
    .getByRole("button", { name: "Visual binding", exact: false })
    .click();
  const binding = page.getByRole("dialog", {
    name: "Visual input binding",
    exact: true,
  });
  await expect(binding).toBeVisible();
  await binding
    .getByLabel("Visual model", { exact: true })
    .selectOption("xbox");
  await binding
    .getByRole("button", { name: "Clear this control", exact: true })
    .click();
  await binding.getByRole("button", { name: "Bind A", exact: true }).click();
  await binding.getByRole("button", { name: "Bind B", exact: true }).click();
  await expect(binding.locator(".binding-chips")).toContainText("A");
  await expect(
    binding.getByRole("button", { name: "Bind A", exact: true }),
  ).toHaveClass(/is-shared/);
  await binding.getByRole("button", { name: "Bind A", exact: true }).hover();
  await expect(binding.locator(".hardware-info")).toContainText("Inventory");
  await expect(binding.locator(".hardware-info")).toContainText("A + B");
  await binding.getByLabel("Binding player").selectOption("2");
  await expect(binding.locator(".binding-chips button")).toHaveCount(1);
  await expect(binding.locator(".binding-chips")).not.toContainText("B");
  await binding.getByLabel("Binding player").selectOption("1");
  await binding
    .getByLabel("Visual model", { exact: true })
    .selectOption("playstation");
  await expect(
    binding.getByRole("button", { name: "Bind Cross", exact: true }),
  ).toBeVisible();

  const checkPadGeometry = async () => {
    const problems = await binding.locator("svg").evaluate((svg) => {
      const shell = svg.querySelector(".hardware-shell"),
        bad = [];
      for (const g of svg.querySelectorAll(".hardware-key")) {
        const name = g.getAttribute("aria-label");
        if (/Bind (LT|RT|L2|R2|LB|RB|L1|R1) —|^Bind (LB|RB|L1|R1)$/.test(name))
          continue;
        const shape = g.querySelector("circle,rect"),
          r = shape.getBBox();
        for (let i = 0; i < 24; i++) {
          const t = (i * Math.PI * 2) / 24;
          const point = new DOMPoint(
            r.x + r.width / 2 + (Math.cos(t) * r.width) / 2,
            r.y + r.height / 2 + (Math.sin(t) * r.height) / 2,
          );
          if (!shell.isPointInFill(point)) {
            bad.push(name + " escapes shell");
            break;
          }
        }
        for (const text of g.querySelectorAll(":scope > text")) {
          const a = text.getBBox();
          if (
            a.x < r.x - 1 ||
            a.y < r.y - 1 ||
            a.x + a.width > r.x + r.width + 1 ||
            a.y + a.height > r.y + r.height + 1
          )
            bad.push(name + " text escapes button");
        }
      }
      return bad;
    });
    if (problems.length) throw Error(problems.join("\n"));
    await expect(
      binding.locator(".hardware-callouts [data-callout-for]"),
    ).toHaveCount(7);
  };
  await checkPadGeometry();
  await page.screenshot({ path: output + "/visual-playstation.png" });
  await binding
    .getByLabel("Visual model", { exact: true })
    .selectOption("keyboard");
  await expect(binding.locator(".hardware-key")).toHaveCount(104);
  await binding
    .getByRole("button", { name: "Bind Space", exact: true })
    .click();
  await expect(binding.locator(".binding-chips")).toContainText("Space");
  await page.screenshot({ path: output + "/visual-keyboard.png" });
  await binding
    .getByLabel("Visual model", { exact: true })
    .selectOption("xbox");
  await checkPadGeometry();
  await page.screenshot({ path: output + "/visual-xbox.png" });
  await binding.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  checks.push(
    "Visual Xbox/PlayStation/full keyboard assignment preserves per-player mapping, highlights shared inputs and explains compound usage; hotspots remain inside the shell and callout labels stay readable",
  );

  await page.getByLabel("Shape", { exact: true }).selectOption("circle");
  await page.getByLabel("Show", { exact: true }).selectOption("image");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(page.locator(".crop-result-frame")).toHaveCSS(
    "border-top-left-radius",
    "999px",
  );
  await page
    .getByRole("button", { name: "Use this crop", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pressed image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this crop", exact: true })
    .click();
  await page.getByLabel("View", { exact: true }).selectOption("844x390");
  for (const shape of ["circle", "square", "triangle", "rounded", "pill"]) {
    await page.getByLabel("Shape", { exact: true }).selectOption(shape);
    const clip = inventory.locator(".studio-image-content");
    await expect(clip).toHaveCSS("overflow", "hidden");
    const bounds = await inventory.boundingBox(),
      imageBounds = await clip.boundingBox();
    if (
      imageBounds.x < bounds.x - 1 ||
      imageBounds.y < bounds.y - 1 ||
      imageBounds.x + imageBounds.width > bounds.x + bounds.width + 1 ||
      imageBounds.y + imageBounds.height > bounds.y + bounds.height + 1
    )
      throw Error(shape + " image escapes button");
    const mask = await clip.evaluate((el) => ({
      path: getComputedStyle(el).clipPath,
      radius: getComputedStyle(el).borderTopLeftRadius,
    }));
    if (shape === "triangle" && !mask.path.startsWith("polygon"))
      throw Error("Triangle image is not clipped");
    if (["circle", "pill"].includes(shape) && mask.radius === "0px")
      throw Error("Round image is not clipped");
    await page
      .getByLabel("Button image fit", { exact: true })
      .selectOption("cover");
    await expect(clip.locator("img")).toHaveCSS("object-fit", "cover");
    await page
      .getByLabel("Button image fit", { exact: true })
      .selectOption("contain");
    await expect(clip.locator("img")).toHaveCSS("object-fit", "contain");
  }
  await page
    .getByRole("button", { name: "Remove pressed image", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove pressed image", exact: true }),
  ).toHaveCount(0);
  await expect(inventory.locator("img")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove pressed image", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove button image", exact: true }).click();
  await expect(inventory.locator("img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove pressed image", exact: true })
    .click();
  await expect(page.getByLabel("Show", { exact: true })).toHaveValue("text");
  await page.getByLabel("View", { exact: true }).selectOption("design");
  checks.push(
    "Normal/pressed button images can be removed and undone; every shape clips images correctly with Fit/Fill",
  );
  await page
    .getByRole("button", { name: "Save controller", exact: true })
    .click();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() =>
    window.waterconsole.library({ type: "list" }),
  );
  if (!saved.ok || saved.games.length !== 1)
    throw new Error(JSON.stringify(saved));
  if (saved.games[0].title !== "My Fixture Game")
    throw new Error("Saved title mismatch");
  checks.push("GUI setup persists through the restricted library API");
  await page.getByRole("button", { name: "Game setup", exact: false }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Show My Fixture Game details",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: output + "/home-library.png" });
  checks.push("Saved game appears in the dynamic Home catalog");
  await page
    .getByRole("button", { name: "Show My Fixture Game details", exact: true })
    .first()
    .click();
  for (const [width, height] of [
    [1920, 1080],
    [1280, 720],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(width, height),
      { width, height },
    );
    const art = page.locator(".hero-detail .hero-art"),
      hero = page.locator(".hero-detail");
    await expect(art.locator("img")).toHaveCSS("object-fit", "cover");
    await expect
      .poll(async () => {
        const a = await art.boundingBox(),
          h = await hero.boundingBox();
        return Math.abs(a.y - h.y) < 1 && Math.abs(a.height - h.height) < 1;
      })
      .toBe(true);
  }
  const latest = await page.evaluate(() =>
    window.waterconsole.library({ type: "list" }),
  );
  const fitGame = latest.games[0];
  fitGame.artwork.banner.fit = "contain";
  const fitSaved = await page.evaluate(
    (game) => window.waterconsole.library({ type: "save", game }),
    fitGame,
  );
  if (!fitSaved.ok) throw Error(fitSaved.error);
  await expect(page.locator(".hero-detail .hero-art img")).toHaveCSS(
    "object-fit",
    "contain",
  );
  checks.push(
    "New banner defaults to Fill, fills the full Home panel at 1080p/720p and preserves an explicit Fit choice",
  );

  await page.getByRole("button", { name: "Add game", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Add a game", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".guided-tour")).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  checks.push(
    "Skipped first-use guide stays dismissed when the workspace reopens",
  );
  console.log(JSON.stringify({ checks, errors, data }, null, 2));
  await fs.writeFile(
    output + "/ui-result.json",
    JSON.stringify({ checks, errors, data }, null, 2),
  );
  if (errors.length) process.exitCode = 1;
} catch (error) {
  console.error(error.stack);
  if (app) {
    const page = await app.firstWindow().catch(() => null);
    if (page) {
      console.error(
        "Editor UI check failed; see the private failure screenshot.",
      );
      await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
    }
  }
  process.exitCode = 1;
} finally {
  await app?.close();
}
