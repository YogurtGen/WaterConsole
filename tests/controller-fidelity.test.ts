import { describe, it, expect } from "vitest";
import { createController } from "../src/shared/studio-model";
import { fitControls } from "../src/shared/studio-engine";
describe("Phone layout fidelity", () => {
  for (const [w, h] of [
    [780, 248],
    [844, 278],
    [915, 300],
    [360, 620],
    [480, 200],
  ])
    it(`keeps one uniform composition at ${w}x${h}`, () => {
      const controls = createController().modes[1].controls,
        fit = fitControls(controls, w, h, "assisted", "content");
      expect(fit.error).toBeUndefined();
      expect(fit.compact).toBe(false);
      for (let i = 0; i < controls.length; i++) {
        const original = controls[i],
          item = fit.items.find((x) => x.control.id === original.id)!;
        expect(item.visual.w / original.w).toBeCloseTo(fit.scale, 7);
        expect(item.visual.h / original.h).toBeCloseTo(fit.scale, 7);
        expect(item.visual.x - original.x * fit.scale).toBeCloseTo(
          fit.offsetX,
          7,
        );
        expect(item.visual.y - original.y * fit.scale).toBeCloseTo(
          fit.offsetY,
          7,
        );
        expect(item.w).toBeGreaterThanOrEqual(44);
        expect(item.h).toBeGreaterThanOrEqual(44);
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.x + item.w).toBeLessThanOrEqual(w + 0.001);
        expect(item.y + item.h).toBeLessThanOrEqual(h + 0.001);
      }
      expect(fit.items[0].visual.w / fit.items[1].visual.w).toBeCloseTo(
        190 / 160,
        7,
      );
    });
});

describe("Hand anchored phone fit", () => {
  it("uses the screen edges without changing the size or internal spacing of a hand group", () => {
    const controls = createController().modes[1].controls,
      fit = fitControls(controls, 780, 248, "assisted", "responsive"),
      left = fit.items.filter((i) => i.control.anchor === "left"),
      right = fit.items.filter((i) => i.control.anchor === "right");
    expect(Math.min(...left.map((i) => i.visual.x))).toBeCloseTo(8);
    expect(Math.max(...right.map((i) => i.visual.x + i.visual.w))).toBeCloseTo(
      772,
    );
    for (const items of [left, right])
      for (const a of items)
        for (const b of items)
          expect(a.visual.x - b.visual.x).toBeCloseTo(
            (a.control.x - b.control.x) * fit.scale,
          );
    for (const i of fit.items) {
      expect(i.visual.w / i.control.w).toBeCloseTo(fit.scale);
      expect(i.visual.h / i.control.h).toBeCloseTo(fit.scale);
    }
  });
});
