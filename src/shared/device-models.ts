import type { OutputBinding } from "./studio-model";
export interface DeviceKey {
  id: string;
  label: string;
  code?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  reason?: string;
}
const key = (
  code: string,
  label = code,
  w = 1,
  h = 1,
): Omit<DeviceKey, "x" | "y"> => ({ id: code, code, label, w, h });
export function keyboardModel() {
  const keys: DeviceKey[] = [];
  const add = (items: Omit<DeviceKey, "x" | "y">[], x: number, y: number) => {
    for (const item of items) {
      keys.push({ ...item, x, y });
      x += item.w;
    }
  };
  const reserved = (id: string, label: string, w = 1) => ({
    ...key(id, label, w),
    code: undefined,
    reason: "System or lock key — not sent by the game helper.",
  });
  add([key("Escape", "Esc")], 0, 0);
  for (let group = 0; group < 3; group++)
    add(
      Array.from({ length: 4 }, (_, i) => key("F" + (group * 4 + i + 1))),
      2 + group * 4.5,
      0,
    );
  add(
    [
      reserved("PrintScreen", "Print\nScreen"),
      reserved("ScrollLock", "Scroll\nLock"),
      reserved("Pause", "Pause"),
    ],
    15.75,
    0,
  );
  add(
    [
      key("Backquote", "~\n`"),
      ...Array.from("1234567890", (n) => key(n)),
      key("Minus", "_\n−"),
      key("Equal", "+\n="),
      key("Backspace", "Backspace", 2),
    ],
    0,
    1.5,
  );
  add(
    [
      key("Tab", "Tab", 1.5),
      ...Array.from("QWERTYUIOP", (n) => key(n)),
      key("BracketLeft", "{\n["),
      key("BracketRight", "}\n]"),
      key("Backslash", "|\n\\", 1.5),
    ],
    0,
    2.5,
  );
  add(
    [
      reserved("CapsLock", "Caps Lock", 1.75),
      ...Array.from("ASDFGHJKL", (n) => key(n)),
      key("Semicolon", ":\n;"),
      key("Quote", "\"\n'"),
      key("Enter", "Enter", 2.25),
    ],
    0,
    3.5,
  );
  add(
    [
      key("ShiftLeft", "Shift", 2.25),
      ...Array.from("ZXCVBNM", (n) => key(n)),
      key("Comma", "<\n,"),
      key("Period", ">\n."),
      key("Slash", "?\n/"),
      key("ShiftRight", "Shift", 2.75),
    ],
    0,
    4.5,
  );
  add(
    [
      key("ControlLeft", "Ctrl", 1.25),
      reserved("MetaLeft", "Win", 1.25),
      key("AltLeft", "Alt", 1.25),
      key("Space", "Space", 6.25),
      key("AltRight", "Alt", 1.25),
      reserved("MetaRight", "Win", 1.25),
      reserved("ContextMenu", "Menu", 1.25),
      key("ControlRight", "Ctrl", 1.25),
    ],
    0,
    5.5,
  );
  add(
    [key("Insert", "Insert"), key("Home", "Home"), key("PageUp", "Page\nUp")],
    15.75,
    1.5,
  );
  add(
    [key("Delete", "Delete"), key("End", "End"), key("PageDown", "Page\nDown")],
    15.75,
    2.5,
  );
  add([key("ArrowUp", "↑")], 16.75, 4.5);
  add(
    [key("ArrowLeft", "←"), key("ArrowDown", "↓"), key("ArrowRight", "→")],
    15.75,
    5.5,
  );
  add(
    [
      reserved("NumLock", "Num\nLock"),
      key("NumpadDivide", "/"),
      key("NumpadMultiply", "*"),
      key("NumpadSubtract", "−"),
    ],
    19.5,
    1.5,
  );
  add(
    [
      key("Numpad7", "7"),
      key("Numpad8", "8"),
      key("Numpad9", "9"),
      key("NumpadAdd", "+", 1, 2),
    ],
    19.5,
    2.5,
  );
  add(
    [key("Numpad4", "4"), key("Numpad5", "5"), key("Numpad6", "6")],
    19.5,
    3.5,
  );
  add(
    [
      key("Numpad1", "1"),
      key("Numpad2", "2"),
      key("Numpad3", "3"),
      key("NumpadEnter", "Enter", 1, 2),
    ],
    19.5,
    4.5,
  );
  add([key("Numpad0", "0", 2), key("NumpadDecimal", ".")], 19.5, 5.5);
  return keys;
}
export interface PadTarget {
  id: string;
  label: string;
  short: string;
  x: number;
  y: number;
  radius?: number;
  w?: number;
  h?: number;
  output?: OutputBinding;
  pair?: "left" | "right" | "pad";
  reason?: string;
}
export function gamepadModel(ps = false): PadTarget[] {
  const b = (
    id: string,
    short: string,
    x: number,
    y: number,
    radius = 25,
  ): PadTarget => ({
    id: "button:" + id,
    label:
      (
        {
          a: ps ? "Cross" : "A",
          b: ps ? "Circle" : "B",
          x: ps ? "Square" : "X",
          y: ps ? "Triangle" : "Y",
          l: ps ? "L1" : "LB",
          r: ps ? "R1" : "RB",
          ls: "L3 — left stick click",
          rs: "R3 — right stick click",
          select: ps ? "Create" : "View",
          start: ps ? "Options" : "Menu",
          up: "D-pad Up",
          down: "D-pad Down",
          left: "D-pad Left",
          right: "D-pad Right",
        } as Record<string, string>
      )[id] ?? short,
    short,
    x,
    y,
    radius,
    output: { kind: "button", code: id },
  });
  const left = ps ? { x: 365, y: 397 } : { x: 270, y: 275 },
    right = ps ? { x: 615, y: 397 } : { x: 610, y: 399 },
    pad = ps ? { x: 244, y: 267 } : { x: 374, y: 400 };
  return [
    {
      id: "axis:lt:+",
      label: ps ? "L2 — left trigger" : "LT — left trigger",
      short: ps ? "L2" : "LT",
      x: 265,
      y: 54,
      w: 154,
      h: 42,
      output: { kind: "axis", code: "lt", value: 1 },
    },
    {
      id: "axis:rt:+",
      label: ps ? "R2 — right trigger" : "RT — right trigger",
      short: ps ? "R2" : "RT",
      x: 715,
      y: 54,
      w: 154,
      h: 42,
      output: { kind: "axis", code: "rt", value: 1 },
    },
    { ...b("l", ps ? "L1" : "LB", 260, 111), w: 170, h: 36 },
    { ...b("r", ps ? "R1" : "RB", 720, 111), w: 170, h: 36 },
    {
      id: "pair:left",
      label: "Map left stick axes",
      short: "Left stick",
      ...left,
      radius: 65,
      pair: "left",
    },
    {
      id: "pair:right",
      label: "Map right stick axes",
      short: "Right stick",
      ...right,
      radius: 65,
      pair: "right",
    },
    {
      id: "pair:pad",
      label: "Map D-pad axes",
      short: "D-pad",
      ...pad,
      radius: 70,
      pair: "pad",
    },
    b("ls", "L3", left.x, left.y, 29),
    b("rs", "R3", right.x, right.y, 29),
    ...(["up", "right", "down", "left"] as const).map((d, i) => ({
      ...b(
        d,
        ["↑", "→", "↓", "←"][i],
        pad.x + [0, 41, 0, -41][i],
        pad.y + [-41, 0, 41, 0][i],
        20,
      ),
      w: 34,
      h: 34,
    })),
    b("y", ps ? "△" : "Y", 734, 220, 26),
    b("x", ps ? "□" : "X", 680, 274, 26),
    b("b", ps ? "○" : "B", 788, 274, 26),
    b("a", ps ? "×" : "A", 734, 328, 26),
    b("select", ps ? "Create" : "View", ps ? 342 : 431, ps ? 195 : 262, 20),
    b("start", ps ? "Options" : "Menu", ps ? 638 : 549, ps ? 195 : 262, 20),
    {
      id: "system:home",
      label: ps ? "PS button" : "Xbox button",
      short: ps ? "Home" : "Home",
      x: 490,
      y: ps ? 408 : 187,
      radius: 23,
      reason:
        "System button — unavailable through the Xbox/XInput game output.",
    },
    ...(ps
      ? [
          {
            id: "system:touchpad",
            label: "Touch pad",
            short: "Touch pad",
            x: 490,
            y: 224,
            w: 232,
            h: 117,
            reason:
              "Touch pad and gestures are not provided by the Xbox/XInput backend.",
          },
          {
            id: "system:mute",
            label: "Microphone mute",
            short: "Mic",
            x: 490,
            y: 459,
            w: 46,
            h: 15,
            reason:
              "Microphone mute is a device feature, not an XInput game button.",
          },
        ]
      : [
          {
            id: "system:share",
            label: "Share button",
            short: "Share",
            x: 490,
            y: 313,
            radius: 18,
            reason:
              "Share/capture is a system feature, unavailable through XInput.",
          },
        ]),
    ...(["lx", "ly", "rx", "ry"] as const).flatMap((code) =>
      [-1, 1].map((value) => {
        const center = code.startsWith("l") ? left : right;
        const horizontal = code.endsWith("x");
        return {
          id: `axis:${code}:${value < 0 ? "-" : "+"}`,
          label: `${code.startsWith("l") ? "Left" : "Right"} stick ${horizontal ? (value < 0 ? "left" : "right") : value < 0 ? "down" : "up"}`,
          short: horizontal ? (value < 0 ? "‹" : "›") : value < 0 ? "⌄" : "⌃",
          x: center.x + (horizontal ? value * 49 : 0),
          y: center.y + (horizontal ? 0 : -value * 49),
          radius: 14,
          output: { kind: "axis" as const, code, value },
        };
      }),
    ),
  ];
}
