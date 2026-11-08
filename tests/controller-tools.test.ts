import { describe, it, expect } from "vitest";
import { newLocalGame, KEYS, control } from "../src/shared/studio-model";
import { validateGame, validateTheme } from "../src/shared/studio-validation";
import { resolveBindings } from "../src/shared/studio-engine";
import {
  setButtonOutputs,
  setAxisOutputs,
  outputUsage,
  controlOutputs,
  outputKey,
} from "../src/shared/binding-tools";
import { gamepadModel, keyboardModel } from "../src/shared/device-models";
import {
  fitPersonalRect,
  readPersonalLayout,
} from "../src/shared/personal-layout";
describe("Visual input assignment", () => {
  it("models every ANSI104 key once with only allowlisted keys bindable", () => {
    const keys = keyboardModel();
    expect(keys).toHaveLength(104);
    expect(new Set(keys.map((k) => k.id)).size).toBe(104);
    expect(keys.filter((k) => !k.code)).toHaveLength(8);
    expect(
      keys.filter((k) => k.code).every((k) => KEYS.includes(k.code!)),
    ).toBe(true);
  });
  it("has correct face positions and symmetric PS versus offset Xbox sticks", () => {
    for (const ps of [true, false]) {
      const m = gamepadModel(ps),
        get = (id: string) => m.find((p) => p.id === id)!;
      expect(get("button:y").y).toBeLessThan(get("button:a").y);
      expect(get("button:x").x).toBeLessThan(get("button:b").x);
      expect(get("pair:left").y === get("pair:right").y).toBe(ps);
      expect(get("axis:rt:+").output).toEqual({
        kind: "axis",
        code: "rt",
        value: 1,
      });
      expect(get("system:home").output).toBeUndefined();
    }
  });
  it("keeps another button and P2-P4 unchanged when editing a shared action", () => {
    const g = newLocalGame(),
      m = g.controller.modes[0],
      c = m.controls.find((c) => c.label === "Confirm")!;
    const other = { ...structuredClone(c), id: "other" };
    m.controls.push(other);
    const before = structuredClone(g);
    setButtonOutputs(g, m.id, 1, c.id, [
      { kind: "button", code: "x" },
      { kind: "button", code: "y" },
    ]);
    expect(controlOutputs(g, m.id, 1, other)).toEqual(
      controlOutputs(before, m.id, 1, other),
    );
    for (let p = 2; p <= 4; p++)
      expect(controlOutputs(g, m.id, p, c)).toEqual(
        controlOutputs(
          before,
          m.id,
          p,
          before.controller.modes[0].controls.find((x) => x.id === c.id)!,
        ),
      );
    expect(controlOutputs(g, m.id, 1, c)).toHaveLength(2);
  });
  it("reports shared hardware input including owner and combined output", () => {
    const g = newLocalGame(),
      m = g.controller.modes[0],
      a = m.controls.find((c) => c.label === "Confirm")!,
      b = m.controls.find((c) => c.label === "Back")!;
    setButtonOutputs(g, m.id, 1, a.id, [{ kind: "button", code: "a" }]);
    setButtonOutputs(g, m.id, 1, b.id, [
      { kind: "button", code: "a" },
      { kind: "button", code: "b" },
    ]);
    const uses = outputUsage(g, m.id, 1, "xbox").get("button:a")!;
    expect(uses.map((u) => u.label)).toEqual(["Confirm", "Back"]);
    expect(uses[1].summary).toBe("A + B");
    expect(outputUsage(g, m.id, 2, "xbox").get("button:a")).toHaveLength(1);
  });
  it("preserves old semantic aliases while new presets use physical inputs", () => {
    const g = newLocalGame();
    expect(g.bindings.gamepad[1].race.accelerate).toBeUndefined();
    g.bindings.gamepad[1].race.accelerate = [
      { kind: "axis", code: "rt", value: 1 },
    ];
    g.controller.modes[3].controls.push(
      control("button", "Old throttle", 0, 0, 60, 60, ["accelerate"]),
    );
    g.launch.executable = "E:\\Games\\fixture.exe";
    expect(() => validateGame(g)).not.toThrow();
  });
  it("maps both polarities of a phone axis to keyboard keys and releases cleanly", () => {
    const g = newLocalGame(),
      m = g.controller.modes[1],
      c = m.controls[0];
    g.inputMethod = "keyboard";
    setAxisOutputs(g, m.id, 4, c.id, "x", [
      { kind: "key-direction", code: "Comma", value: -1 },
      { kind: "key-direction", code: "Period", value: 1 },
    ]);
    const frame = (x: number) => ({
      revision: 1,
      modeId: m.id,
      variant: "classic" as const,
      pressed: [],
      values: { [c.id]: { x, y: 0 } },
    });
    expect(
      resolveBindings(g.controller, g.bindings, "keyboard", 4, frame(-1)).keys,
    ).toEqual(["Comma"]);
    expect(
      resolveBindings(g.controller, g.bindings, "keyboard", 4, frame(1)).keys,
    ).toEqual(["Period"]);
    expect(
      resolveBindings(g.controller, g.bindings, "keyboard", 4, frame(0)).keys,
    ).toEqual([]);
  });
  it("counts keyboard collisions across players, gamepads separately", () => {
    const g = newLocalGame(),
      c = g.controller.modes[0].controls.find((c) => c.label === "Confirm")!;
    g.inputMethod = "keyboard";
    expect(
      outputUsage(g, "menu", 1, "keyboard")
        .get("key:Enter")
        ?.map((u) => u.slot),
    ).toEqual([1, 2, 3, 4]);
    expect(outputKey({ kind: "key", code: "Shift" })).toBe("key:ShiftLeft");
  });
});
it("detaches a dedicated action also referenced by an axis", () => {
  const g = newLocalGame(),
    m = g.controller.modes[0],
    c = m.controls.find((c) => c.label === "Confirm")!,
    pad = m.controls[0];
  setButtonOutputs(g, m.id, 1, c.id, [{ kind: "button", code: "a" }]);
  const old = c.actions[0];
  pad.axisX = old;
  setButtonOutputs(g, m.id, 1, c.id, [{ kind: "button", code: "b" }]);
  expect(c.actions[0]).not.toBe(old);
  expect(g.bindings.gamepad[1].menu[old]).toEqual([
    { kind: "button", code: "a" },
  ]);
});
describe("Phone layout boundaries", () => {
  it("fits negative/oversized controls inside different phone canvases", () => {
    for (const [w, h] of [
      [320, 180],
      [800, 280],
      [280, 600],
    ]) {
      const r = fitPersonalRect({ x: -100, y: 800, w: 900, h: 600 }, w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
    }
  });
  it("rejects corrupted and unbounded local layout data", () => {
    expect(readPersonalLayout("{")).toEqual({});
    expect(
      readPersonalLayout(
        '{"bad":{"x":0,"y":0,"w":5,"h":1},"ok":{"x":0.1,"y":0.2,"w":0.3,"h":0.4}}',
      ),
    ).toEqual({ ok: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
  });
});

it("accepts optional independent icon colors while preserving older themes", () => {
  const g = newLocalGame();
  expect(g.controller.theme.icon).toBeUndefined();
  expect(() => validateTheme(g.controller.theme, false)).not.toThrow();
  g.controller.theme.icon = "#65b9ff";
  g.controller.theme.pressedIcon = "#973abb";
  expect(() => validateTheme(g.controller.theme, false)).not.toThrow();
  expect(() =>
    validateTheme({
      ...g.controller.theme,
      icon: "url(https://invalid.test/image)",
    }),
  ).toThrow();
});
