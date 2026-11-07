import {
  clamp,
  type ControllerDefinition,
  type GameBindings,
  type StudioControl,
  type StudioInput,
  type StudioMode,
  type Theme,
  type AxisCode,
} from "./studio-model";
export interface DeviceOutput {
  buttons: string[];
  keys: string[];
  axes: Record<AxisCode, number>;
}
export function resolveBindings(
  def: ControllerDefinition,
  bindings: GameBindings,
  backend: "gamepad" | "keyboard",
  slot: number,
  input: StudioInput,
): DeviceOutput {
  const out: DeviceOutput = {
    buttons: [],
    keys: [],
    axes: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 },
  };
  const buttons = new Set<string>(),
    keys = new Set<string>();
  const mode = def.modes.find((m) => m.id === input.modeId);
  const map = bindings[backend][slot]?.[input.modeId] ?? {};
  const active = new Map<string, number[]>();
  const add = (action: string | undefined, value: number) => {
    if (!action || !Number.isFinite(value)) return;
    const values = active.get(action) ?? [];
    values.push(value);
    active.set(action, values);
  };
  for (const control of mode?.controls ?? []) {
    if (control.variant !== "all" && control.variant !== input.variant)
      continue;
    if (control.kind === "button" && input.pressed.includes(control.id))
      for (const a of control.actions) add(a, 1);
    const axes = input.values[control.id];
    if (axes && ["stick", "dpad", "trigger"].includes(control.kind)) {
      add(control.axisX, axes.x);
      add(control.axisY, axes.y);
    }
  }
  for (const [action, values] of active) {
    const amount =
      Math.abs(values.reduce((a, b) => a + b, 0)) < 0.0001
        ? 0
        : clamp(values.reduce((a, b) => a + b, 0));
    const outputs = Object.hasOwn(map, action) ? map[action] : [];
    for (const output of outputs ?? []) {
      if (output.kind === "button" && amount > 0.3) buttons.add(output.code);
      else if (output.kind === "key" && amount > 0.3) keys.add(output.code);
      else if (output.kind === "button-axis") {
        if (amount > 0.3) buttons.add(output.positive);
        if (amount < -0.3) buttons.add(output.negative);
      } else if (output.kind === "key-axis") {
        if (amount > 0.3) keys.add(output.positive);
        if (amount < -0.3) keys.add(output.negative);
      } else if (output.kind === "axis") {
        const value = amount * output.value;
        out.axes[output.code] =
          output.code === "lt" || output.code === "rt"
            ? Math.max(out.axes[output.code], clamp(value, 0, 1))
            : out.axes[output.code] + value;
      }
    }
  }
  for (const code of ["lx", "ly", "rx", "ry"] as const)
    out.axes[code] = clamp(out.axes[code]);
  for (const [a, b] of [
    ["left", "right"],
    ["up", "down"],
  ])
    if (buttons.has(a) && buttons.has(b)) {
      buttons.delete(a);
      buttons.delete(b);
    }
  if (keys.has("Alt")) {
    keys.delete("F4");
    keys.delete("Tab");
    keys.delete("Escape");
  }
  if (keys.has("Control")) keys.delete("Escape");
  out.buttons = [...buttons];
  out.keys = [...keys];
  return out;
}
export function resolveTheme(
  def: ControllerDefinition,
  mode: StudioMode,
  navigator: boolean,
  slot: number,
  control?: StudioControl,
): Theme {
  return {
    ...def.theme,
    ...mode.theme,
    ...(navigator ? def.roleThemes.navigator : def.roleThemes.player),
    ...def.playerThemes[slot],
    ...control?.theme,
  };
}
export interface FittedControl {
  control: StudioControl;
  x: number;
  y: number;
  w: number;
  h: number;
}
export function fitControls(
  controls: StudioControl[],
  width: number,
  height: number,
  variant: "classic" | "assisted",
): { items: FittedControl[]; compact: boolean; error?: string } {
  const visible = controls.filter(
    (c) => c.variant === "all" || c.variant === variant,
  );
  if (width < 240 || height < 160)
    return {
      items: [],
      compact: true,
      error:
        "More room needed. Enter fullscreen, rotate your phone, or choose a compact mode.",
    };
  const scale = Math.min(width / 960, height / 540);
  const offX = (width - 960 * scale) / 2,
    offY = (height - 540 * scale) / 2;
  if (
    visible.every((c) => c.kind === "label" || Math.min(c.w, c.h) * scale >= 44)
  )
    return {
      compact: false,
      items: visible.map((c) => ({
        control: c,
        x: offX + c.x * scale,
        y: offY + c.y * scale,
        w: c.w * scale,
        h: c.h * scale,
      })),
    };
  const items: FittedControl[] = [];
  const ordered = [...visible].sort(
    (a, b) =>
      Number(["stick", "dpad"].includes(b.kind)) -
        Number(["stick", "dpad"].includes(a.kind)) || b.w * b.h - a.w * a.h,
  );
  for (const c of ordered) {
    const stick = c.kind === "stick" || c.kind === "dpad";
    let w = Math.max(
      stick ? 96 : 44,
      Math.min(c.w * scale, stick ? Math.min(176, height * 0.72) : width * 0.6),
    );
    let h = Math.max(
      stick ? 96 : 44,
      Math.min(
        c.h * scale,
        stick ? Math.min(176, height * 0.72) : height * 0.58,
      ),
    );
    if (
      ["circle", "square", "triangle"].includes(c.shape) &&
      c.kind !== "label"
    )
      w = h = Math.min(Math.max(w, h), height, width);
    const targetX = clamp(
        ((c.x + c.w / 2) / 960) * width - w / 2,
        0,
        width - w,
      ),
      targetY = clamp(((c.y + c.h / 2) / 540) * height - h / 2, 0, height - h);
    let best: { x: number; y: number; cost: number } | undefined;
    for (let y = 0; y + h <= height; y += 8)
      for (let x = 0; x + w <= width; x += 8) {
        const cost = (x - targetX) ** 2 + (y - targetY) ** 2;
        if (best && cost >= best.cost) continue;
        if (
          items.some(
            (r) =>
              x < r.x + r.w + 4 &&
              x + w + 4 > r.x &&
              y < r.y + r.h + 4 &&
              y + h + 4 > r.y,
          )
        )
          continue;
        best = { x, y, cost };
      }
    if (!best)
      return {
        items: [],
        compact: true,
        error:
          "This layout needs more room. Rotate your phone or choose a mode with fewer controls. The host can adjust its compact layout.",
      };
    items.push({ control: c, x: best.x, y: best.y, w, h });
  }
  return { items, compact: true };
}
export function snappedRect(
  c: StudioControl,
  patch: Partial<Pick<StudioControl, "x" | "y" | "w" | "h">>,
  size: number,
  snap: boolean,
): StudioControl {
  const n = (v: number) => (snap ? Math.round(v / size) * size : Math.round(v));
  let w = clamp(n(patch.w ?? c.w), 44, 960),
    h = clamp(n(patch.h ?? c.h), 44, 540);
  if (["circle", "square", "triangle"].includes(c.shape)) {
    w = h = clamp(
      patch.w !== undefined && patch.h === undefined
        ? w
        : patch.h !== undefined && patch.w === undefined
          ? h
          : Math.max(w, h),
      44,
      540,
    );
  }
  return {
    ...c,
    ...patch,
    w,
    h,
    x: clamp(n(patch.x ?? c.x), 0, 960 - w),
    y: clamp(n(patch.y ?? c.y), 0, 540 - h),
  };
}
export function radialValues(
  x: number,
  y: number,
  deadZone: number,
  ways?: 4 | 8,
) {
  const radius = Math.min(1, Math.hypot(x, y));
  if (radius <= deadZone) return { x: 0, y: 0 };
  if (ways) {
    const angle = Math.atan2(y, x);
    const step = (2 * Math.PI) / ways;
    const sector = Math.round(angle / step);
    return {
      x: Math.round(Math.cos(sector * step)),
      y: Math.round(Math.sin(sector * step)),
    };
  }
  const power = (radius - deadZone) / (1 - deadZone);
  const length = Math.hypot(x, y) || 1;
  return { x: clamp((x / length) * power), y: clamp((y / length) * power) };
}
