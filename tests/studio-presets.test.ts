import { describe, it, expect } from "vitest";
import { createController, createBindings } from "../src/shared/studio-model";
import {
  fitControls,
  resolveBindings,
  resolveTheme,
} from "../src/shared/studio-engine";

describe("Console presets", () => {
  for (const variant of ["classic", "assisted"] as const) {
    it(
      variant +
        " keeps visible controls separate and proportional on phone canvases",
      () => {
        const def = createController();
        for (const mode of def.modes) {
          for (const [w, h] of [
            [780, 248],
            [844, 278],
            [915, 300],
            [390, 732],
          ]) {
            const fit = fitControls(mode.controls, w, h, variant);
            expect(fit.error).toBeUndefined();
            for (let i = 0; i < fit.items.length; i++) {
              const a = fit.items[i].visual,
                c = fit.items[i].control;
              expect(a.w / a.h).toBeCloseTo(c.w / c.h);
              expect(a.x).toBeGreaterThanOrEqual(0);
              expect(a.y).toBeGreaterThanOrEqual(0);
              expect(a.x + a.w).toBeLessThanOrEqual(w);
              expect(a.y + a.h).toBeLessThanOrEqual(h);
              for (const b of fit.items.slice(i + 1).map((x) => x.visual)) {
                const overlap =
                  Math.max(
                    0,
                    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
                  ) *
                  Math.max(
                    0,
                    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
                  );
                expect(overlap, mode.id + " visual overlap").toBe(0);
              }
            }
          }
        }
      },
    );
  }
  it("keeps Race linked inputs as real simultaneous bindings for all players", () => {
    const def = createController(),
      bindings = createBindings(def),
      mode = def.modes.find((m) => m.id === "race")!,
      linked = mode.controls.find((c) => c.label === "RT + B")!;
    for (let slot = 1; slot <= 4; slot++) {
      const frame = {
        revision: 1,
        modeId: mode.id,
        variant: "assisted" as const,
        pressed: [linked.id],
        values: {},
      };
      const output = resolveBindings(def, bindings, "gamepad", slot, frame);
      expect(output.buttons).toEqual(["b"]);
      expect(output.axes.rt).toBe(1);
      const released = resolveBindings(def, bindings, "gamepad", slot, {
        ...frame,
        pressed: [],
      });
      expect(released.buttons).toEqual([]);
      expect(released.axes.rt).toBe(0);
    }
  });
  it("primary buttons inherit the player accent while explicit colors still win", () => {
    const def = createController(),
      mode = def.modes[0],
      c = mode.controls.find((c) => c.label === "Confirm")!;
    def.playerThemes[2] = { accent: "#aabbcc", background: "#112233" };
    const theme = resolveTheme(def, mode, false, 2, c);
    expect(theme.button).toBe("#aabbcc");
    expect(theme.text).toBe("#112233");
    c.theme = { button: "#ff0000", text: "#ffffff" };
    expect(resolveTheme(def, mode, false, 2, c).button).toBe("#ff0000");
    expect(resolveTheme(def, mode, false, 2, c).text).toBe("#ffffff");
  });
});
