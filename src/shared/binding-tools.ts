import {
  PAD_BUTTONS,
  type LocalGameRecord,
  type OutputBinding,
  type StudioControl,
  type StudioMode,
} from "./studio-model";
export type DeviceDrawing = "xbox" | "playstation" | "keyboard";
const xbox: Record<string, string> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  l: "LB",
  r: "RB",
  ls: "L3",
  rs: "R3",
  start: "Menu",
  select: "View",
  up: "D-pad Up",
  down: "D-pad Down",
  left: "D-pad Left",
  right: "D-pad Right",
  lt: "LT",
  rt: "RT",
  lx: "Left stick X",
  ly: "Left stick Y",
  rx: "Right stick X",
  ry: "Right stick Y",
};
const ps: Record<string, string> = {
  a: "× Cross",
  b: "○ Circle",
  x: "□ Square",
  y: "△ Triangle",
  l: "L1",
  r: "R1",
  ls: "L3",
  rs: "R3",
  start: "Options",
  select: "Create",
  lt: "L2",
  rt: "R2",
};
export function keyLabel(code: string) {
  return (
    (
      {
        Space: "Space",
        ArrowUp: "↑",
        ArrowDown: "↓",
        ArrowLeft: "←",
        ArrowRight: "→",
        Backquote: "` ~",
        Minus: "− _",
        Equal: "= +",
        BracketLeft: "[ {",
        BracketRight: "] }",
        Backslash: "\\ |",
        Semicolon: "; :",
        Quote: "' \"",
        Comma: ", <",
        Period: ". >",
        Slash: "/ ?",
        Control: "Ctrl",
        ControlLeft: "Left Ctrl",
        ControlRight: "Right Ctrl",
        ShiftLeft: "Left Shift",
        ShiftRight: "Right Shift",
        AltLeft: "Left Alt",
        AltRight: "Right Alt",
        PageUp: "Page Up",
        PageDown: "Page Down",
        NumpadAdd: "Num +",
        NumpadSubtract: "Num −",
        NumpadMultiply: "Num *",
        NumpadDivide: "Num /",
        NumpadDecimal: "Num .",
        NumpadEnter: "Num Enter",
      } as Record<string, string>
    )[code] ?? code.replace(/^Numpad/, "Num ")
  );
}
export const outputKey = (o: OutputBinding) =>
  o.kind === "axis"
    ? `axis:${o.code}:${o.value < 0 ? "-" : "+"}`
    : o.kind === "button-axis"
      ? `buttons:${o.negative}:${o.positive}`
      : o.kind === "key-axis"
        ? `keys:${o.negative}:${o.positive}`
        : o.kind === "key-direction"
          ? `key:${o.code}`
          : `${o.kind}:${({ Shift: "ShiftLeft", Control: "ControlLeft", Alt: "AltLeft" } as Record<string, string>)[o.code] ?? o.code}`;
export function outputLabel(o: OutputBinding, device: DeviceDrawing = "xbox") {
  const label = (code: string) =>
    device === "playstation"
      ? (ps[code] ?? xbox[code] ?? code)
      : (xbox[code] ?? code);
  if (o.kind === "key" || o.kind === "key-direction") return keyLabel(o.code);
  if (o.kind === "key-axis")
    return `${keyLabel(o.negative)} / ${keyLabel(o.positive)}`;
  if (o.kind === "button-axis")
    return `${label(o.negative)} / ${label(o.positive)}`;
  if (o.kind === "axis")
    return (
      label(o.code) +
      (["lt", "rt"].includes(o.code) ? "" : o.value < 0 ? " −" : " +")
    );
  return label(o.code);
}
export function uniqueOutputs(outputs: OutputBinding[]) {
  return [...new Map(outputs.map((o) => [JSON.stringify(o), o])).values()];
}
export function expandOutputs(outputs: OutputBinding[]): OutputBinding[] {
  return uniqueOutputs(
    outputs.flatMap((o) =>
      o.kind === "key-axis"
        ? [
            {
              kind: "key-direction",
              code: o.negative,
              value: -1,
            } as OutputBinding,
            {
              kind: "key-direction",
              code: o.positive,
              value: 1,
            } as OutputBinding,
          ]
        : o.kind === "button-axis"
          ? [
              { kind: "button", code: o.negative } as OutputBinding,
              { kind: "button", code: o.positive } as OutputBinding,
            ]
          : [o],
    ),
  );
}
export function controlOutputs(
  game: LocalGameRecord,
  modeId: string,
  slot: number,
  control: StudioControl,
) {
  const map = game.bindings[game.inputMethod][slot]?.[modeId] ?? {};
  return uniqueOutputs(
    (control.kind === "button"
      ? control.actions
      : [control.axisX, control.axisY].filter((x): x is string => !!x)
    ).flatMap((a) => map[a] ?? []),
  );
}
export function actionLabel(
  action: string,
  map: Record<string, OutputBinding[]>,
  device: DeviceDrawing,
) {
  const output = map[action] ?? [];
  const names: Record<string, string> = {
    "pad-x": "D-pad · horizontal",
    "pad-y": "D-pad · vertical",
    "move-x": "Left stick · horizontal",
    "move-y": "Left stick · vertical",
    "look-x": "Right stick · horizontal",
    "look-y": "Right stick · vertical",
  };
  if (names[action]) return names[action];
  if (output.length)
    return output.map((o) => outputLabel(o, device)).join(" + ");
  return action.replace(/^action-/, "").replaceAll("-", " ");
}
export function actionChoices(
  game: LocalGameRecord,
  modeId: string,
  slot: number,
  control: StudioControl,
) {
  const map = game.bindings[game.inputMethod][slot]?.[modeId] ?? {};
  const legacy = new Set(["accelerate", "brake", "drift", "boost"]);
  return Object.keys(map).filter(
    (id) =>
      (!id.startsWith("bind-") && !legacy.has(id)) ||
      control.actions.includes(id) ||
      control.axisX === id ||
      control.axisY === id,
  );
}
function references(mode:StudioMode,action:string){return mode.controls.reduce((n,c)=>n+c.actions.filter(a=>a===action).length+Number(c.axisX===action)+Number(c.axisY===action),0);}
export function setButtonOutputs(
  game: LocalGameRecord,
  modeId: string,
  slot: number,
  id: string,
  outputs: OutputBinding[],
) {
  const mode = game.controller.modes.find((m) => m.id === modeId),
    control = mode?.controls.find((c) => c.id === id);
  if (!control || control.kind !== "button")
    throw Error("Choose a phone button.");
  let action =
    control.actions.length === 1 &&
    control.actions[0].startsWith("bind-") &&
    references(mode!,control.actions[0]) === 1
      ? control.actions[0]
      : undefined;
  if (!action) {
    action = "bind-" + crypto.randomUUID().slice(0, 24);
    for (const backend of ["keyboard", "gamepad"] as const)
      for (let player = 1; player <= 4; player++) {
        game.bindings[backend][player] ??= {};
        game.bindings[backend][player][modeId] ??= {};
        const map = game.bindings[backend][player][modeId];
        map[action] = uniqueOutputs(
          control.actions.flatMap((a) => map[a] ?? []),
        );
      }
    control.actions = [action];
  }
  game.bindings[game.inputMethod][slot][modeId][action] = uniqueOutputs(
    outputs,
  ).slice(0, 8);
}
export type AxisPart = "x" | "y";
export function setAxisOutputs(
  game: LocalGameRecord,
  modeId: string,
  slot: number,
  id: string,
  part: AxisPart,
  outputs: OutputBinding[],
) {
  const mode = game.controller.modes.find((m) => m.id === modeId),
    control = mode?.controls.find((c) => c.id === id);
  if (!control || !["stick", "dpad", "trigger"].includes(control.kind))
    throw Error("Choose an analog, D-pad or trigger.");
  const key = part === "x" ? "axisX" : "axisY";
  const original = control[key];
  let action =
    original?.startsWith("bind-") &&
    references(mode!,original) === 1
      ? original
      : undefined;
  if (!action) {
    action = "bind-" + crypto.randomUUID().slice(0, 24);
    for (const backend of ["keyboard", "gamepad"] as const)
      for (let player = 1; player <= 4; player++) {
        game.bindings[backend][player] ??= {};
        game.bindings[backend][player][modeId] ??= {};
        const map = game.bindings[backend][player][modeId];
        map[action] = structuredClone(original ? (map[original] ?? []) : []);
      }
    control[key] = action;
  }
  game.bindings[game.inputMethod][slot][modeId][action] = uniqueOutputs(
    outputs,
  ).slice(0, 8);
}
export interface InputUse {
  slot: number;
  controlId: string;
  label: string;
  variant: string;
  summary: string;
}
export function outputUsage(
  game: LocalGameRecord,
  modeId: string,
  slot: number,
  device: DeviceDrawing,
) {
  const uses = new Map<string, InputUse[]>(),
    mode = game.controller.modes.find((m) => m.id === modeId);
  for (const player of game.inputMethod === "keyboard" ? [1, 2, 3, 4] : [slot])
    for (const c of mode?.controls ?? []) {
      if (c.kind === "label") continue;
      const outputs = controlOutputs(game, modeId, player, c),
        summary = outputs.map((o) => outputLabel(o, device)).join(" + ");
      for (const key of new Set(
        expandOutputs(outputs).flatMap((o) =>
          o.kind === "axis" &&
          c.kind !== "button" &&
          ["lx", "ly", "rx", "ry"].includes(o.code)
            ? [`axis:${o.code}:+`, `axis:${o.code}:-`]
            : [outputKey(o)],
        ),
      )) {
        const list = uses.get(key) ?? [];
        if (!list.some((x) => x.slot === player && x.controlId === c.id))
          list.push({
            slot: player,
            controlId: c.id,
            label: c.label || c.kind,
            variant: c.variant,
            summary,
          });
        uses.set(key, list);
      }
    }
  return uses;
}
export const standardButtons = PAD_BUTTONS;
