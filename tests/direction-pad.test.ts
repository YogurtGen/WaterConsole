import { describe, expect, it } from "vitest";
import { readDirectionPad } from "../src/renderer/direction-pad";
const bounds = { left: 100, top: 50, width: 200, height: 200 };
describe("Sliding eight-way directional pad", () => {
  it.each([
    [280, 150, ["right"]],
    [280, 230, ["right", "down"]],
    [200, 230, ["down"]],
    [120, 230, ["left", "down"]],
    [120, 150, ["left"]],
    [120, 70, ["left", "up"]],
    [200, 70, ["up"]],
    [280, 70, ["right", "up"]],
  ])("maps screen point %s,%s to its digital direction", (x, y, expected) => {
    expect(readDirectionPad(x, y, bounds).directions).toEqual(expected);
  });
  it("returns neutral at the center and inside the dead zone", () => {
    expect(readDirectionPad(200, 150, bounds)).toEqual({
      directions: [],
      x: 0,
      y: 0,
    });
    expect(readDirectionPad(210, 156, bounds).directions).toEqual([]);
  });
  it("clamps captured drags outside the surface without changing direction", () => {
    const p = readDirectionPad(-500, 150, bounds);
    expect(p.directions).toEqual(["left"]);
    expect(p.x).toBe(-1);
    expect(p.y).toBe(0);
    const diagonal = readDirectionPad(900, 850, bounds);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });
  it("scales coordinates to a resized rectangular surface", () => {
    expect(
      readDirectionPad(190, 90, { left: 0, top: 0, width: 200, height: 100 })
        .directions,
    ).toEqual(["right", "down"]);
  });
  it("treats invalid geometry and non-finite coordinates as neutral", () => {
    expect(readDirectionPad(0, 0, { ...bounds, width: 0 }).directions).toEqual(
      [],
    );
    expect(readDirectionPad(NaN, 0, bounds).directions).toEqual([]);
  });
});
