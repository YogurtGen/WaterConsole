import type { Action } from "../shared/types";
export type PadDirection = Extract<Action, "up" | "right" | "down" | "left">;
const sectors: PadDirection[][] = [
  ["right"],
  ["right", "down"],
  ["down"],
  ["left", "down"],
  ["left"],
  ["left", "up"],
  ["up"],
  ["right", "up"],
];
export function readDirectionPad(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
) {
  const neutral = { directions: [] as PadDirection[], x: 0, y: 0 };
  if (bounds.width <= 0 || bounds.height <= 0) return neutral;
  const x = (clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
  const y = (clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
  const distance = Math.hypot(x, y);
  if (!Number.isFinite(distance) || distance < 0.2) return neutral;
  const sector = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
  return {
    directions: sectors[sector],
    x: x / Math.max(1, distance),
    y: y / Math.max(1, distance),
  };
}
