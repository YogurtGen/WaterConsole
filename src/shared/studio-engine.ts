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
      else if (output.kind === "key-direction" && amount * output.value > 0.3)
        keys.add(output.code);
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
  const alt = ["Alt", "AltLeft", "AltRight"].some((k) => keys.has(k)),
    ctrl = ["Control", "ControlLeft", "ControlRight"].some((k) => keys.has(k));
  if (alt) {
    keys.delete("Space");
    keys.delete("F4");
    keys.delete("Tab");
    keys.delete("Escape");
  }
  if (ctrl) keys.delete("Escape");
  if (ctrl && alt) keys.delete("Delete");
  out.buttons = [...buttons];
  out.keys = [
    ...new Set(
      [...keys].map(
        (k) =>
          (
            ({
              Shift: "ShiftLeft",
              Control: "ControlLeft",
              Alt: "AltLeft",
            }) as Record<string, string>
          )[k] ?? k,
      ),
    ),
  ];
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
  visual: { x: number; y: number; w: number; h: number };
  scale: number;
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
  layout: "design" | "responsive" | "content" | "canvas" = "responsive",
): {
  items: FittedControl[];
  compact: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  error?: string;
} {
  const visible = controls.filter(
    (c) => c.variant === "all" || c.variant === variant,
  );
  const empty = {
    items: [] as FittedControl[],
    compact: false,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
  if (width < 240 || height < 160)
    return {
      ...empty,
      error:
        "More room needed. Enter fullscreen or rotate your phone. Your layout will not be rearranged.",
    };
  if (!visible.length) return empty;
  const padding = layout === "design" ? 0 : 8;
  const bounds =
    layout === "content" || layout === "responsive"
      ? {
          x: Math.min(...visible.map((c) => c.x)),
          y: Math.min(...visible.map((c) => c.y)),
          right: Math.max(...visible.map((c) => c.x + c.w)),
          bottom: Math.max(...visible.map((c) => c.y + c.h)),
        }
      : { x: 0, y: 0, right: 960, bottom: 540 };
  const bw = Math.max(1, bounds.right - bounds.x),
    bh = Math.max(1, bounds.bottom - bounds.y);
  const scale = Math.min(
    (width - padding * 2) / bw,
    (height - padding * 2) / bh,
    layout === "design"
      ? Infinity
      : Math.max(1, Math.min(width / 960, height / 540)),
  );
  const offsetX = (width - bw * scale) / 2 - bounds.x * scale,
    offsetY = (height - bh * scale) / 2 - bounds.y * scale;
  const slack = Math.max(0, width - padding * 2 - bw * scale);
  const groupAnchors = new Map<string, StudioControl["anchor"]>();
  for (const c of visible)
    if (c.group && !groupAnchors.has(c.group))
      groupAnchors.set(c.group, c.anchor);
  const items = visible.map((c) => {
    const anchor = c.group ? groupAnchors.get(c.group)! : c.anchor;
    const spread =
      layout === "responsive"
        ? anchor === "left"
          ? -slack / 2
          : anchor === "right"
            ? slack / 2
            : 0
        : 0;
    const visual = {
      x: offsetX + c.x * scale + spread,
      y: offsetY + c.y * scale,
      w: c.w * scale,
      h: c.h * scale,
    };
    const w = c.kind === "label" ? visual.w : Math.max(44, visual.w),
      h = c.kind === "label" ? visual.h : Math.max(44, visual.h);
    return {
      control: c,
      scale,
      visual,
      w,
      h,
      x: clamp(visual.x - (w - visual.w) / 2, 0, width - w),
      y: clamp(visual.y - (h - visual.h) / 2, 0, height - h),
    };
  });
  return { items, compact: false, scale, offsetX, offsetY };
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
