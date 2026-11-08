import { describe, it, expect } from "vitest";
import { copyControls, pasteControls } from "../src/shared/studio-clipboard";
import { newLocalGame, control } from "../src/shared/studio-model";
import { resolveBindings } from "../src/shared/studio-engine";
import { setButtonOutputs } from "../src/shared/binding-tools";
import {
  fitStudioPanels,
  DEFAULT_STUDIO_PANELS,
} from "../src/renderer/studio-workspace";
describe("Studio control clipboard", () => {
  it("copies visual properties and keeps independent per-player linked outputs across modes", () => {
    const source = newLocalGame(),
      race = source.controller.modes.find((m) => m.id === "race")!,
      button = race.controls.find((c) => c.actions.length === 2)!;
    button.theme = { text: "#ffccdd", button: "#335544" };
    button.image = "a".repeat(64);
    button.imageSource = button.image;
    button.display = "image";
    for (let slot = 1; slot <= 4; slot++)
      source.bindings.gamepad[slot].race.b = [
        { kind: "button", code: ["a", "b", "x", "y"][slot - 1] },
      ];
    const target = newLocalGame(),
      before = structuredClone(target),
      clip = copyControls(source, "race", [button.id]),
      result = pasteControls(target, "menu", clip),
      pasted = result.game.controller.modes[0].controls.find(
        (c) => c.id === result.ids[0],
      )!;
    expect(target).toEqual(before);
    expect(clip).not.toHaveProperty("launch");
    expect(pasted.theme).toEqual(button.theme);
    expect(pasted.image).toBe(button.image);
    expect(pasted.w).toBe(button.w);
    expect(pasted.h).toBe(button.h);
    expect(pasted.actions).not.toEqual(button.actions);
    for (let slot = 1; slot <= 4; slot++) {
      const state = {
        revision: 1,
        modeId: "menu",
        variant: "assisted" as const,
        pressed: result.ids,
        values: {},
      };
      const pad = resolveBindings(
        result.game.controller,
        result.game.bindings,
        "gamepad",
        slot,
        state,
      );
      expect(pad.axes.rt).toBe(1);
      expect(pad.buttons).toEqual([["a", "b", "x", "y"][slot - 1]]);
      const keys = resolveBindings(
        result.game.controller,
        result.game.bindings,
        "keyboard",
        slot,
        state,
      );
      expect(keys.keys).toEqual(expect.arrayContaining(["E", "Escape"]));
    }
    const originalA = result.game.controller.modes[0].controls.find(
      (c) => c.label === "Confirm",
    )!;
    const oldMap = structuredClone(result.game.bindings.gamepad[1].menu.a);
    setButtonOutputs(result.game, "menu", 1, pasted.id, [
      { kind: "button", code: "l" },
    ]);
    expect(result.game.bindings.gamepad[1].menu.a).toEqual(oldMap);
    expect(originalA.actions).toEqual(["a"]);
  });
  it("moves a copied group as one unit, remaps drag groups and releases locks", () => {
    const g = newLocalGame(),
      m = g.controller.modes[1],
      a = m.controls.find((c) => c.label === "A")!,
      b = m.controls.find((c) => c.label === "B")!;
    a.group = b.group = "face-group";
    a.slideGroup = b.slideGroup = "face-slide";
    a.locked = b.locked = true;
    const clip = copyControls(g, m.id, [a.id, b.id]),
      p = pasteControls(g, m.id, clip),
      added = p.game.controller.modes[1].controls.filter((c) =>
        p.ids.includes(c.id),
      );
    expect(added[0].group).toBe(added[1].group);
    expect(added[0].group).not.toBe(a.group);
    expect(added[0].slideGroup).not.toBe(a.slideGroup);
    expect(added[0].slideGroup).toBe(added[1].slideGroup);
    const aa = added.find((c) => c.label === a.label)!,
      bb = added.find((c) => c.label === b.label)!;
    expect(aa.x - bb.x).toBe(a.x - b.x);
    expect(aa.y - bb.y).toBe(a.y - b.y);
    for (const c of added) {
      expect(c.locked).toBe(false);
      expect(c.x + c.w).toBeLessThanOrEqual(960);
      expect(c.y + c.h).toBeLessThanOrEqual(540);
    }
  });
  it("rejects a paste that exceeds control or analog limits without changing the game", () => {
    const g = newLocalGame(),
      mode = g.controller.modes[1],
      clip = copyControls(g, mode.id, [mode.controls[3].id]);
    mode.controls = Array.from({ length: 64 }, (_, i) => ({
      ...control("button", "Button", 10, 10, 50, 50, ["a"]),
      id: "control-" + i,
    }));
    const before = structuredClone(g);
    expect(() => pasteControls(g, mode.id, clip)).toThrow("64");
    expect(g).toEqual(before);
    const other = newLocalGame(),
      axes = other.controller.modes[1].controls
        .filter((c) => ["stick", "trigger", "dpad"].includes(c.kind))
        .slice(0, 4);
    expect(() =>
      pasteControls(
        other,
        "standard",
        copyControls(
          other,
          "standard",
          axes.map((c) => c.id),
        ),
      ),
    ).toThrow("eight analog");
  });
});
describe("Studio pane bounds", () => {
  for (const [width, height] of [
    [0, 0],
    [600, 320],
    [760, 440],
    [1240, 700],
    [1880, 900],
  ])
    it(`keeps neighboring panes and the canvas within ${width}×${height}`, () => {
      const p = fitStudioPanels(
        { left: 1800, right: 1800, bottom: 1800 },
        width,
        height,
      );
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.right).toBeGreaterThanOrEqual(0);
      expect(p.left + p.right + p.gap * 2).toBeLessThanOrEqual(width + 0.001);
      expect(p.bottom).toBeGreaterThanOrEqual(0);
      expect(p.bottom).toBeLessThanOrEqual(height);
      expect(p.left).toBeLessThanOrEqual(p.limits.leftMax + 0.001);
      expect(p.right).toBeLessThanOrEqual(p.limits.rightMax + 0.001);
    });
  it("restores default pane dimensions when there is enough room", () => {
    const p = fitStudioPanels(DEFAULT_STUDIO_PANELS, 1600, 900);
    expect(p.left).toBe(240);
    expect(p.right).toBe(320);
    expect(p.bottom).toBe(184);
  });
});
