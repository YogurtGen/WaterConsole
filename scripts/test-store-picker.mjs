import { _electron, expect } from "playwright/test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = path.join(root, ".local/store-picker-test");
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
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  await page.getByRole("button", { name: "Add game", exact: false }).click();
  await expect(page.locator(".guide-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  const names = [
    "Forest Workshop",
    "A Very Long Game Name That Still Has to Fit in a Small Window Without Breaking the List",
    "Moonlight Circuit",
    "Garden Party",
    "Paper Trails",
    "Ocean Room",
  ];
  const fixtures = Array.from({ length: 18 }, (_, i) => ({
    key: "fixture:" + i,
    store: i % 3 === 0 ? "epic" : "steam",
    storeId: String(100 + i),
    name: names[i % names.length] + (i >= 6 ? " " + (i + 1) : ""),
    directory:
      "X:\\Example library\\" +
      (i === 1
        ? "A long installation folder name ".repeat(8)
        : names[i % names.length]),
    executable: "X:\\Example library\\game.exe",
    executables: [
      "X:\\Example library\\game.exe",
      ...(i === 1 ? ["X:\\Example library\\launcher.exe"] : []),
    ],
    alreadyAdded: i === 3,
    needsReview: i === 1,
  }));
  fixtures.forEach((g) => {
    g.executable = g.directory + "\\game.exe";
    g.executables = [
      g.executable,
      ...(g.needsReview ? [g.directory + "\\launcher.exe"] : []),
    ];
  });
  const draft = newLocalGame();
  draft.description = "An editable documentation fixture, not a bundled game.";
  await app.evaluate(
    ({ ipcMain }, { fixtures, draft }) => {
      ipcMain.removeHandler("wc:library");
      ipcMain.handle("wc:library", (_event, c) => {
        if (c.type === "scan-stores")
          return { ok: true, scan: { games: fixtures, notes: [] } };
        if (c.type === "prepare-store-game") {
          const g = fixtures.find((g) => g.key === c.key);
          return {
            ok: true,
            game: {
              ...draft,
              title: g.name,
              launch: {
                ...draft.launch,
                executable: c.executable,
                cwd: g.directory,
              },
            },
            notes: ["Documentation fixture"],
          };
        }
        return { ok: true };
      });
    },
    { fixtures, draft },
  );
  await page
    .getByRole("button", { name: "Scan Steam & Epic", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import installed game",
    exact: true,
  });
  await expect(dialog.locator(".store-game-row")).toHaveCount(18);
  async function assertLayout() {
    const data = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        footer = el.querySelector("footer").getBoundingClientRect();
      return {
        dialog: { x: r.x, y: r.y, right: r.right, bottom: r.bottom },
        footerBottom: footer.bottom,
        viewport: { w: innerWidth, h: innerHeight },
        rows: [...el.querySelectorAll(".store-game-row")].map((row) => {
          const b = row.getBoundingClientRect();
          return {
            y: b.y,
            bottom: b.bottom,
            h: b.height,
            text: [
              ...row.querySelectorAll(
                ".store-game-copy>strong,.store-game-meta,.store-game-copy>small",
              ),
            ].map((t) => {
              const r = t.getBoundingClientRect();
              return { y: r.y, bottom: r.bottom, right: r.right };
            }),
            right: b.right,
          };
        }),
      };
    });
    assert(data.dialog.y >= 8);
    assert(data.dialog.bottom <= data.viewport.h - 8);
    assert(
      data.footerBottom <= data.dialog.bottom - 8,
      "Footer stays inside dialog",
    );
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      assert(r.h >= 89, "Rows do not shrink below their content");
      for (const t of r.text) {
        assert(t.y >= r.y + 7);
        assert(t.bottom <= r.bottom - 7);
        assert(t.right <= r.right - 24);
      }
      assert(r.text[0].bottom <= r.text[1].y);
      assert(r.text[1].bottom <= r.text[2].y);
      if (i)
        assert(
          data.rows[i - 1].bottom + 5 <= r.y,
          "Adjacent rows never overlap",
        );
    }
  }
  for (const [w, h] of [
    [1600, 1000],
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
    await assertLayout();
  }
  checks.push(
    "Names, store/status badges and long paths remain inside non-overlapping rows at four desktop sizes",
  );
  await dialog.locator(".store-game-row").nth(1).click();
  await expect(
    dialog.getByLabel("Launch file", { exact: false }),
  ).toBeVisible();
  await assertLayout();
  await expect(
    dialog.getByRole("button", { name: "Use game details", exact: true }),
  ).toBeEnabled();
  checks.push(
    "Selected launch-file panel and footer remain readable at 800×600",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
  );
  await dialog
    .getByLabel("Store library", { exact: true })
    .selectOption("epic");
  await expect(dialog.locator(".store-game-row")).toHaveCount(6);
  await dialog.getByLabel("Find a game", { exact: true }).fill("Forest");
  await expect(dialog.locator(".store-game-row")).toHaveCount(3);
  await dialog.getByLabel("Find a game", { exact: true }).fill("");
  await dialog.getByLabel("Store library", { exact: true }).selectOption("all");
  checks.push(
    "Search and store filter work without changing the current selection",
  );
  await dialog.screenshot({ path: out + "/import-picker.png" });
  await dialog
    .getByRole("button", { name: "Use game details", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-guide="game-description"]')).toHaveValue(
    draft.description,
  );
  checks.push("Import fills an editable setup without launching a game");
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
  await app.close();
}
