import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  newLocalGame,
  createController,
  control,
  createBindings,
  type StudioInput,
} from "../src/shared/studio-model";
import {
  resolveBindings,
  fitControls,
  radialValues,
  snappedRect,
  resolveTheme,
} from "../src/shared/studio-engine";
import {
  validateGame,
  validStudioInput,
} from "../src/shared/studio-validation";
import { LibraryStore } from "../src/electron/library-store";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const input = (
  modeId: string,
  pressed: string[] = [],
  values: StudioInput["values"] = {},
  variant: StudioInput["variant"] = "assisted",
): StudioInput => ({ revision: 1, modeId, pressed, values, variant });
describe("Linked held actions", () => {
  it("releases only the contribution that ended (drift plus throttle)", () => {
    const d = createController(),
      b = createBindings(d),
      race = d.modes.find((m) => m.id === "race")!;
    const gas = control("button", "Independent gas", 100, 400, 100, 60, [
      "rt",
    ]);
    race.controls.push(gas);
    const combined = race.controls.find((c) => c.label === "RT + B")!;
    let out = resolveBindings(
      d,
      b,
      "gamepad",
      1,
      input("race", [combined.id, gas.id]),
    );
    expect(out.buttons).toContain("b");
    expect(out.axes.rt).toBe(1);
    out = resolveBindings(d, b, "gamepad", 1, input("race", [gas.id]));
    expect(out.buttons).not.toContain("b");
    expect(out.axes.rt).toBe(1);
    out = resolveBindings(d, b, "gamepad", 1, input("race"));
    expect(out.axes.rt).toBe(0);
  });
  it("classic cannot activate an assisted-only control", () => {
    const d = createController(),
      b = createBindings(d),
      c = d.modes[3].controls.find((c) => c.variant === "assisted")!;
    expect(
      resolveBindings(d, b, "gamepad", 1, input("race", [c.id], {}, "classic"))
        .axes.rt,
    ).toBe(0);
    expect(
      validStudioInput(input("race", [c.id], {}, "classic"), d, "race"),
    ).toBe(false);
  });
  it("combines true analog contributions before clamping", () => {
    const d = createController(),
      b = createBindings(d);
    d.modes[1].controls = ["one", "two", "three"].map((id, i) => ({
      ...control("button", id, i * 100, 0, 60, 60, [id]),
      id,
    }));
    for (const [i, id] of ["one", "two", "three"].entries())
      b.gamepad[1].standard[id] = [
        { kind: "axis", code: "lx", value: i === 2 ? -1 : 1 },
      ];
    const frame = input("standard", ["one", "two", "three"]);
    expect(resolveBindings(d, b, "gamepad", 1, frame).axes.lx).toBe(1);
    d.modes[1].controls.reverse();
    expect(resolveBindings(d, b, "gamepad", 1, frame).axes.lx).toBe(1);
  });
  it("isolates player outputs and blocks OS shortcut combinations", () => {
    const d = createController(),
      b = createBindings(d),
      c = d.modes[0].controls.find((c) => c.actions.includes("a"))!;
    b.keyboard[1].menu.a = [
      { kind: "key", code: "Alt" },
      { kind: "key", code: "F4" },
    ];
    b.keyboard[4].menu.a = [{ kind: "key", code: "Numpad0" }];
    expect(
      resolveBindings(d, b, "keyboard", 1, input("menu", [c.id])).keys,
    ).toEqual(["AltLeft"]);
    expect(
      resolveBindings(d, b, "keyboard", 4, input("menu", [c.id])).keys,
    ).toEqual(["Numpad0"]);
  });
});
describe("Responsive and drag geometry", () => {
  for (const [w, h] of [
    [568, 240],
    [640, 280],
    [844, 300],
    [915, 330],
    [320, 480],
    [390, 740],
    [412, 800],
    [1024, 650],
  ])
    for (const variant of ["classic", "assisted"] as const)
      it(`${w}x${h} ${variant} keeps presets within bounds or exposes a clear fallback`, () => {
        for (const m of createController().modes) {
          const fit = fitControls(m.controls, w, h, variant);
          if (fit.error) {
            expect(fit.items).toHaveLength(0);
            expect(fit.error).toMatch(/room/);
            continue;
          }
          for (const c of fit.items) {
            expect(c.x).toBeGreaterThanOrEqual(0);
            expect(c.y).toBeGreaterThanOrEqual(0);
            expect(c.x + c.w).toBeLessThanOrEqual(w + 0.01);
            expect(c.y + c.h).toBeLessThanOrEqual(h + 0.01);
            if (c.control.kind !== "label") {
              expect(c.w).toBeGreaterThanOrEqual(44);
              expect(c.h).toBeGreaterThanOrEqual(44);
            }
          }
        }
      });
  it("drag crosses diagonals and dead zone without another tap", () => {
    expect(radialValues(1, 0, 0.2, 8)).toEqual({ x: 1, y: 0 });
    expect(radialValues(-1, -1, 0.2, 8)).toEqual({ x: -1, y: -1 });
    expect(radialValues(0, -1, 0.2, 8)).toEqual({ x: 0, y: -1 });
    expect(radialValues(0.1, 0.1, 0.2, 8)).toEqual({ x: 0, y: 0 });
    expect(radialValues(0.5, 0, 0.2).x).toBeCloseTo(0.375);
  });
  it("resizes square controls and clamps snapped positions", () => {
    const c = {
      ...control("button", "Square", 0, 0, 80, 80),
      shape: "square" as const,
    };
    expect(snappedRect(c, { w: 160 }, 8, true).h).toBe(160);
    const x = snappedRect(c, { x: 999, y: 999 }, 8, true);
    expect(x.x + x.w).toBe(960);
    expect(x.y + x.h).toBe(540);
  });
  it("resolves base, mode, role, player and control overrides", () => {
    const d = createController(),
      m = d.modes[0],
      c = m.controls[0];
    d.theme.button = "#111111";
    m.theme.button = "#222222";
    d.roleThemes.navigator.button = "#333333";
    d.playerThemes[4] = { button: "#444444" };
    c.theme.button = "#555555";
    expect(resolveTheme(d, m, true, 4).button).toBe("#444444");
    expect(resolveTheme(d, m, true, 4, c).button).toBe("#555555");
  });
});
describe("PC records and phone contract", () => {
  it("rejects malformed analog values, unknown fields, hidden controls and stale revisions", () => {
    const d = createController(),
      m = d.modes[0],
      stick = m.controls[0];
    const frame = input("menu", [], { [stick.id]: { x: 0.5, y: 0 } });
    expect(validStudioInput(frame, d, "menu")).toBe(true);
    expect(validStudioInput({ ...frame, executable: "bad" }, d, "menu")).toBe(
      false,
    );
    expect(validStudioInput({ ...frame, revision: 2 }, d, "menu")).toBe(false);
    expect(
      validStudioInput(
        { ...frame, values: { [stick.id]: { x: NaN, y: 0 } } },
        d,
        "menu",
      ),
    ).toBe(false);
    expect(
      validStudioInput({ ...frame, pressed: ["missing"] }, d, "menu"),
    ).toBe(false);
  });
  it("rejects broken crop, impossible geometry and incompatible output backend", () => {
    const g = newLocalGame();
    expect(() => validateGame(g)).not.toThrow();
    g.controller.modes[0].controls[0].imageCrop = {
      x: 0.9,
      y: 0,
      w: 0.5,
      h: 1,
      rotation: 0,
      ratio: "free",
    };
    expect(() => validateGame(g)).toThrow(/Crop/);
    delete g.controller.modes[0].controls[0].imageCrop;
    g.bindings.gamepad[1].menu.a = [{ kind: "key", code: "W" }];
    expect(() => validateGame(g)).toThrow(/input method/);
  });
});
describe("Atomic library persistence", () => {
  async function setup() {
    const parent = path.resolve(".local/tests");
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(path.join(parent, "studio-"));
    roots.push(root);
    const store = new LibraryStore(root);
    await store.initialize();
    return { root, store };
  }
  it("serializes concurrent mutations without losing entries, and rejects stale edits", async () => {
    const { store } = await setup();
    const a = newLocalGame(),
      b = newLocalGame();
    await Promise.all([store.save(a), store.save(b)]);
    expect(store.list()).toHaveLength(2);
    const x = store.get(a.id)!;
    await store.save(x);
    await expect(store.save(x)).rejects.toThrow(/another editor/);
  });
  it("recovers a validated previous backup and preserves damaged bytes", async () => {
    const { root, store } = await setup();
    const g = await store.save(newLocalGame());
    g.title = "Changed";
    await store.save(g);
    await writeFile(path.join(root, "library/catalog.json"), "broken");
    const recovered = new LibraryStore(root);
    await recovered.initialize();
    expect(recovered.list()[0].title).toBe("My game");
    expect(recovered.recoveryMessage).toMatch(/Recovered/);
  });
  it("enforces immutable asset hashes and excludes launch settings from manifests", async () => {
    const { store } = await setup();
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    const id = await store.writeAsset(bytes);
    expect(await store.readAsset(id)).toEqual(bytes);
    await writeFile(
      path.join(store.assetsDirectory, id + ".png"),
      Buffer.from("changed"),
    );
    await expect(store.readAsset(id)).rejects.toThrow(/integrity/);
    await store.save(newLocalGame());
    const json = JSON.stringify(store.manifests());
    expect(json).not.toContain("executable");
    expect(json).not.toContain("bindings");
    await expect(store.readAsset("../outside")).rejects.toThrow();
  });
});

it("keeps standard D-pad buttons independent from the true left analog stick", () => {
  const d = createController(),
    b = createBindings(d),
    m = d.modes.find((m) => m.id === "standard")!,
    stick = m.controls.find((c) => c.label === "Left stick")!,
    pad = m.controls.find((c) => c.kind === "dpad")!;
  const result = resolveBindings(
    d,
    b,
    "gamepad",
    1,
    input("standard", [], {
      [stick.id]: { x: 0.5, y: 0 },
      [pad.id]: { x: -1, y: 1 },
    }),
  );
  expect(result.buttons.sort()).toEqual(["left", "up"]);
  expect(result.axes.lx).toBe(0.5);
  expect(result.axes.ly).toBe(0);
});
