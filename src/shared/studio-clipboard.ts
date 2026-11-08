import type {
  ActionBindings,
  LocalGameRecord,
  StudioControl,
} from "./studio-model";
import { validateGame } from "./studio-validation";
export interface ControlClipboard {
  controls: StudioControl[];
  bindings: Record<"gamepad" | "keyboard", Record<string, ActionBindings>>;
}
export function copyControls(
  game: LocalGameRecord,
  modeId: string,
  ids: string[],
): ControlClipboard {
  const mode = game.controller.modes.find((m) => m.id === modeId);
  const controls = mode?.controls.filter((c) => ids.includes(c.id)) ?? [];
  if (!controls.length) throw new Error("Select a control to copy.");
  const actions = new Set(
    controls.flatMap((c) => [
      ...c.actions,
      ...[c.axisX, c.axisY].filter((a): a is string => !!a),
    ]),
  );
  const bindings: ControlClipboard["bindings"] = { gamepad: {}, keyboard: {} };
  for (const backend of ["gamepad", "keyboard"] as const)
    for (let slot = 1; slot <= 4; slot++)
      bindings[backend][slot] = Object.fromEntries(
        [...actions].map((a) => [
          a,
          structuredClone(game.bindings[backend][slot]?.[modeId]?.[a] ?? []),
        ]),
      );
  return { controls: structuredClone(controls), bindings };
}
export function pasteControls(
  game: LocalGameRecord,
  modeId: string,
  clipboard: ControlClipboard,
  repeat = 1,
) {
  const result = structuredClone(game),
    mode = result.controller.modes.find((m) => m.id === modeId);
  if (!mode) throw new Error("Choose a controller mode.");
  const copied = clipboard.controls;
  if (!copied.length || copied.length + mode.controls.length > 64)
    throw new Error(
      "A mode supports up to 64 controls. Make room before pasting.",
    );
  if (
    [...mode.controls, ...copied].filter((c) =>
      ["stick", "dpad", "trigger"].includes(c.kind),
    ).length > 8
  )
    throw new Error("A mode supports up to eight analog controls.");
  const actions = new Map<string, string>(),
    groups = new Map<string, string>(),
    slides = new Map<string, string>();
  const fresh = (map: Map<string, string>, value: string, prefix: string) => {
    if (!map.has(value))
      map.set(value, prefix + crypto.randomUUID().slice(0, 24));
    return map.get(value)!;
  };
  const amount = 24 * Math.max(1, Math.min(20, repeat));
  const offset = (before: number, after: number) =>
    after >= amount
      ? amount
      : before >= amount
        ? -amount
        : Math.max(0, Math.min(24, after));
  const dx = offset(
      Math.min(...copied.map((c) => c.x)),
      960 - Math.max(...copied.map((c) => c.x + c.w)),
    ),
    dy = offset(
      Math.min(...copied.map((c) => c.y)),
      540 - Math.max(...copied.map((c) => c.y + c.h)),
    );
  const controls = copied.map((c) => ({
    ...structuredClone(c),
    id: "ctl-" + crypto.randomUUID().slice(0, 24),
    x: c.x + dx,
    y: c.y + dy,
    locked: false,
    group: c.group ? fresh(groups, c.group, "group-") : undefined,
    slideGroup: c.slideGroup
      ? fresh(slides, c.slideGroup, "slide-")
      : undefined,
    actions: c.actions.map((a) => fresh(actions, a, "bind-")),
    axisX: c.axisX ? fresh(actions, c.axisX, "bind-") : undefined,
    axisY: c.axisY ? fresh(actions, c.axisY, "bind-") : undefined,
  }));
  for (const backend of ["gamepad", "keyboard"] as const)
    for (let slot = 1; slot <= 4; slot++) {
      result.bindings[backend][slot] ??= {};
      result.bindings[backend][slot][modeId] ??= {};
      const map = result.bindings[backend][slot][modeId];
      if (Object.keys(map).length + actions.size > 128)
        throw new Error(
          "This mode has too many action bindings. Paste fewer controls or choose another mode.",
        );
      for (const [original, alias] of actions)
        map[alias] = structuredClone(
          clipboard.bindings[backend][slot]?.[original] ?? [],
        );
    }
  mode.controls.push(...controls);
  validateGame(result);
  return { game: result, ids: controls.map((c) => c.id) };
}
