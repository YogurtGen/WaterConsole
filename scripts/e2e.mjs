import { _electron, chromium, expect } from "playwright/test";

import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";

const output = path.resolve("test-results");
const checks = [];
const errors = [];
const external = [];
const dataDir = path.resolve(".local", `e2e-${Date.now()}`);
await mkdir(output, { recursive: true });
let desktop, browser, host, serverPort;
const executablePath =
  process.env.WATERCONSOLE_EXECUTABLE || (await import("electron")).default;
const env = {
  ...process.env,
  WATERCONSOLE_TEST: "1",
  WATERCONSOLE_WINDOWED: "1",
  WATERCONSOLE_ADDRESS: "127.0.0.1",
  WATERCONSOLE_DATA_DIR: dataDir,
  WATERCONSOLE_DISABLE_NATIVE: "1",
};
delete env.ELECTRON_RUN_AS_NODE;
function check(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function state() {
  return host.evaluate(() => window.waterconsole.getState());
}
async function captureHost(filename) {
  await host.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
    );
  });
  const data = await desktop.evaluate(async ({ BrowserWindow }) => {
    const image =
      await BrowserWindow.getAllWindows()[0].webContents.capturePage(
        undefined,
        { stayHidden: true, stayAwake: true },
      );
    return image.toPNG().toString("base64");
  });
  await writeFile(path.join(output, filename), Buffer.from(data, "base64"));
}
function track(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:")
    )
      external.push(request.url());
  });
}
async function launchDesktop() {
  desktop = await _electron.launch({
    executablePath,
    args: [
      ...(process.env.WATERCONSOLE_EXECUTABLE ? [] : ["."]),
      "--force-device-scale-factor=1",
    ],
    env,
    timeout: 35000,
  });
  host = await desktop.firstWindow();
  track(host);
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080),
  );
  await host.setViewportSize({ width: 1920, height: 1080 });
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .waitFor({ timeout: 20000 });
}
async function phone(name) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await context.route("**/*", (route) =>
    /^https?:/.test(route.request().url()) &&
    !route.request().url().startsWith("http://127.0.0.1:")
      ? route.abort()
      : route.continue(),
  );
  await context.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (duration) => {
        window.__vibrations.push(duration);
        return true;
      },
    });
  });
  const page = await context.newPage();
  track(page);
  await page.goto((await state()).pairing.url);
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Connect to console", exact: true })
    .click();
  return { context, page };
}
async function approve(name, page) {
  await expect
    .poll(async () => (await state()).pending.some((p) => p.name === name))
    .toBe(true);
  const card = host.locator(".pending-card").filter({ hasText: name });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter controller", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await state()).players.some((p) => p.name === name && p.connected),
    )
    .toBe(true);
}
async function free(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}
try {
  await launchDesktop();
  serverPort = (await state()).network.port;
  assert.equal(host.url(), "waterconsole://app/host.html");
  const isolated = await host.evaluate(() => ({
    node: typeof window.require,
    process: typeof window.process,
    bridge: Object.keys(window.waterconsole).sort(),
  }));
  assert.equal(isolated.node, "undefined");
  assert.equal(isolated.process, "undefined");
  assert.deepEqual(isolated.bridge, [
    "command",
    "getFullscreen",
    "getState",
    "minimize",
    "onState",
    "quit",
    "toggleFullscreen",
  ]);
  check(
    "Desktop uses isolated custom protocol and a restricted preload bridge",
  );
  await captureHost("01-lobby.png");
  await host
    .getByRole("button", { name: "Continue to Home", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Start playing", exact: true })
    .waitFor();
  await captureHost("02-home.png");
  await host.getByLabel("Find a game", { exact: true }).fill("Lab");
  await expect(
    host.locator(".game-row").first().locator(".game-card"),
  ).toHaveCount(1);
  await host
    .getByRole("button", { name: "Show Controller Lab details", exact: true })
    .first()
    .click();
  await host
    .getByRole("button", { name: "Favorite Controller Lab", exact: true })
    .first()
    .click();
  await expect
    .poll(async () => (await state()).favorites.includes("controller-lab"))
    .toBe(true);
  await host.getByLabel("Find a game", { exact: true }).fill("missing");
  await expect(
    host.getByRole("heading", { name: "No games found", exact: true }),
  ).toBeVisible();
  await host.getByLabel("Find a game", { exact: true }).fill("");
  await captureHost("03-game-details.png");
  check(
    "Home search, detail selection, empty results, and favorites work with the single Lab entry",
  );
  browser = await chromium.launch({
    ...(process.env.WATERCONSOLE_BROWSER === "chromium"
      ? {}
      : { channel: "chrome" }),
    headless: true,
  });
  const first = await phone("Mint");
  await first.page
    .getByRole("heading", { name: "Look at the big screen." })
    .waitFor();
  assert.equal((await state()).players.length, 0);
  check("A pending phone cannot acquire a player slot before PC approval");
  await captureHost("04-approve-phone.png");
  await approve("Mint", first.page);
  await first.page.screenshot({
    path: path.join(output, "05-phone-home.png"),
    fullPage: true,
  });
  const phones = [first];
  for (const name of ["Blue", "Amber", "Violet"]) {
    const next = await phone(name);
    await approve(name, next.page);
    phones.push(next);
  }
  let snapshot = await state();
  assert.deepEqual(snapshot.players.map((p) => p.slot).sort(), [1, 2, 3, 4]);
  assert.equal(snapshot.players.filter((p) => p.canNavigate).length, 1);
  assert.equal(snapshot.players.find((p) => p.canNavigate).name, "Mint");
  await expect(
    phones[1].page.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeDisabled();
  check(
    "Four browser controllers have independent slots; only the navigator can control Home",
  );
  const fifth = await phone("Fifth");
  await expect(fifth.page.getByRole("alert")).toContainText(
    "four player slots",
  );
  assert.equal((await state()).players.length, 4);
  check("A fifth controller is rejected without disturbing existing players");
  await host
    .getByRole("button", { name: "Start playing", exact: true })
    .click();
  await first.page.getByRole("button", { name: "A", exact: true }).waitFor();
  await first.context.setDefaultTimeout(10000);
  await first.page.setViewportSize({ width: 844, height: 390 });
  const touch = await first.context.newCDPSession(first.page);
  const right = await first.page
    .getByRole("button", { name: "Right", exact: true })
    .boundingBox();
  const a = await first.page
    .getByRole("button", { name: "A", exact: true })
    .boundingBox();
  assert.ok(right && a);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 1 },
      { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 2 },
    ],
  });
  await expect
    .poll(async () => {
      const p = (await state()).players.find((p) => p.slot === 1);
      return p.buttons.includes("right") && p.buttons.includes("a");
    })
    .toBe(true);
  await expect
    .poll(
      async () => (await state()).players.find((p) => p.slot === 1).position.x,
    )
    .toBeGreaterThan(0.52);
  await first.page.screenshot({ path: path.join(output, "06-phone-lab.png") });
  const pad = await first.page.locator(".drag-pad").boundingBox();
  const cx = pad.x + pad.width / 2,
    cy = pad.y + pad.height / 2;
  for (const [dx, dy, expected] of [
    [0, 0.75, ["down"]],
    [-0.75, 0, ["left"]],
    [0, -0.75, ["up"]],
    [0.65, 0.65, ["down", "right"]],
  ]) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: cx + (dx * pad.width) / 2, y: cy + (dy * pad.height) / 2, id: 1 },
        { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 2 },
      ],
    });
    await expect
      .poll(async () => {
        const p = (await state()).players.find((p) => p.slot === 1);
        return [...p.buttons].sort();
      })
      .toEqual(["a", ...expected].sort());
  }
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(
      async () =>
        (await state()).players.find((p) => p.slot === 1).buttons.length,
    )
    .toBe(0);
  check(
    "Real browser multi-touch dispatch drives directional and face-button input independently",
  );
  assert.ok(await first.page.evaluate(() => window.__vibrations.includes(20)));
  await first.page
    .getByRole("button", { name: "Controller settings", exact: true })
    .click();
  await first.page
    .getByRole("button", { name: "Test vibration", exact: true })
    .click();
  assert.equal(await first.page.evaluate(() => window.__vibrations.at(-1)), 50);
  await first.page.screenshot({
    path: path.join(output, "phone-vibration.png"),
  });
  await first.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await expect(
    first.page.getByRole("button", { name: "Test vibration", exact: true }),
  ).toBeDisabled();
  await first.page
    .getByRole("button", { name: "Phone vibration", exact: true })
    .click();
  await first.page
    .getByRole("button", { name: "Close controller settings", exact: true })
    .click();
  check(
    "Per-phone vibration toggle/Test and bounded action-button pulses work with a mocked browser vibration API",
  );

  await host.getByRole("button", { name: "2 viewports", exact: true }).click();
  await expect(host.locator(".arena")).toHaveCount(2);
  await host.getByRole("button", { name: "4 viewports", exact: true }).click();
  await expect(host.locator(".arena")).toHaveCount(4);
  await captureHost("07-four-viewports.png");
  check("Shared, two-viewport, and four-viewport Lab layouts render");
  await first.page
    .getByRole("button", { name: "Return to console", exact: true })
    .click();
  await expect.poll(async () => (await state()).phase).toBe("home");
  await expect
    .poll(async () =>
      (await state()).players.every((p) => p.buttons.length === 0),
    )
    .toBe(true);
  check("Navigator returns from Lab to Home with all input neutralized");
  const firstId = (await state()).players.find((p) => p.slot === 1).id;
  await first.page.reload();
  await first.page
    .getByRole("button", { name: "Enter controller", exact: true })
    .waitFor();
  await first.page
    .getByRole("button", { name: "Enter controller", exact: true })
    .click();
  assert.equal((await state()).players.find((p) => p.slot === 1).id, firstId);
  check("Reload reconnects to the same player slot with sessionStorage token");
  await host.setViewportSize({ width: 1280, height: 720 });
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
  );
  await captureHost("08-home-720p.png");
  await host
    .getByRole("button", { name: "Session settings", exact: true })
    .click();
  await host.getByRole("button", { name: "End session", exact: true }).click();
  await host
    .getByRole("dialog")
    .getByRole("button", { name: "End session", exact: true })
    .click();
  await expect.poll(async () => (await state()).players.length).toBe(0);
  await expect(
    first.page.getByRole("heading", { name: "Session ended.", exact: true }),
  ).toBeVisible();
  check(
    "Ending a session disconnects controllers and returns the host to Lobby",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  check(
    "Host and controller UI complete the flow without page errors or external HTTP resources",
  );
  await browser.close();
  browser = null;
  await desktop.close();
  desktop = null;
  await expect.poll(() => free(serverPort)).toBe(true);
  check("Closing the desktop releases the local server port");
  await launchDesktop();
  assert.ok((await state()).favorites.includes("controller-lab"));
  assert.ok((await state()).recent.includes("controller-lab"));
  check("Favorites and recent history survive a full desktop restart");
  await desktop.close();
  desktop = null;
  console.log(`Completed ${checks.length} end-to-end checks.`);
} catch (error) {
  if (host && !host.isClosed())
    await captureHost("failure.png").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (desktop) await desktop.close().catch(() => {});
  await writeFile(
    path.join(output, "e2e-report.json"),
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        executable: process.env.WATERCONSOLE_EXECUTABLE
          ? "packaged app"
          : "development Electron",
        checks,
        pageErrors: errors,
        externalUiRequests: external,
        passed: !process.exitCode,
      },
      null,
      2,
    ),
  );
}
