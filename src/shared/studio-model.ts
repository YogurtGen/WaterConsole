import type { DisplayMode, GameManifest } from "./types";
import type { StoreReference, StoreScan } from "./store-model";
export const STUDIO_SCHEMA = 1 as const;
export type ControlKind = "button" | "stick" | "dpad" | "trigger" | "label";
export type ButtonShape = "circle" | "square" | "triangle" | "rounded" | "pill";
export type LabelMode = "icon" | "icon-text" | "text" | "image";
export type AxisCode = "lx" | "ly" | "rx" | "ry" | "lt" | "rt";
export const PAD_BUTTONS = [
  "a",
  "b",
  "x",
  "y",
  "l",
  "r",
  "start",
  "select",
  "up",
  "down",
  "left",
  "right",
  "ls",
  "rs",
] as const;
export type OutputBinding =
  | { kind: "button"; code: string }
  | { kind: "key"; code: string }
  | { kind: "key-direction"; code: string; value: -1 | 1 }
  | { kind: "axis"; code: AxisCode; value: number }
  | { kind: "button-axis"; negative: string; positive: string }
  | { kind: "key-axis"; negative: string; positive: string };
export interface Theme {
  background: string;
  panel: string;
  button: string;
  text: string;
  border: string;
  accent: string;
  pressed: string;
  disabled: string;
  focus: string;
  icon?: string;
  pressedText?: string;
  pressedIcon?: string;
  backgroundImage?: string;
}
export const DEFAULT_THEME: Theme = {
  background: "#14221c",
  panel: "#1f3328",
  button: "#304737",
  text: "#f0f5ed",
  border: "#58735d",
  accent: "#83e8b3",
  pressed: "#83e8b3",
  disabled: "#39413c",
  focus: "#b6e9ff",
  pressedText: "#123321",
};
export interface StudioControl {
  appearance?: "console" | "primary" | "raised" | "outline";
  dpadStyle?: "cross" | "petals" | "disc";
  locked?: boolean;
  group?: string;
  imageSource?: string;
  imageCrop?: CropSpec;
  pressedImageSource?: string;
  pressedImageCrop?: CropSpec;
  id: string;
  kind: ControlKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: "left" | "center" | "right";
  shape: ButtonShape;
  radius: number;
  display: LabelMode;
  icon: string;
  image?: string;
  pressedImage?: string;
  fit: "contain" | "cover";
  iconSize: number;
  fontSize: number;
  opacity: number;
  theme: Partial<Theme>;
  actions: string[];
  axisX?: string;
  axisY?: string;
  deadZone: number;
  ways: 4 | 8;
  floating: boolean;
  variant: "all" | "classic" | "assisted";
  feedback: number;
  slideGroup?: string;
}
export interface StudioMode {
  id: string;
  name: string;
  purpose: "menu" | "fight" | "race" | "standard";
  controls: StudioControl[];
  theme: Partial<Theme>;
}
export interface ControllerDefinition {
  layoutFit?: "responsive" | "content" | "canvas";
  version: 1;
  revision: number;
  labels: "xbox" | "playstation" | "custom";
  modes: StudioMode[];
  theme: Theme;
  roleThemes: { navigator: Partial<Theme>; player: Partial<Theme> };
  playerThemes: Record<string, Partial<Theme>>;
  hostTheme: Partial<Theme>;
  grid: { visible: boolean; snap: boolean; size: number };
  allowPersonal: boolean;
}
export interface StudioInput {
  revision: number;
  modeId: string;
  variant: "classic" | "assisted";
  pressed: string[];
  values: Record<string, { x: number; y: number }>;
}
export type ActionBindings = Record<string, OutputBinding[]>;
export type GameBindings = {
  gamepad: Record<string, Record<string, ActionBindings>>;
  keyboard: Record<string, Record<string, ActionBindings>>;
};
export const ART_RECOMMENDATIONS = {
  cover: {
    width: 900,
    height: 1200,
    label: "Cover · 900 × 1200",
    ratio: 3 / 4,
  },
  banner: {
    width: 1920,
    height: 1080,
    label: "Banner · 1920 × 1080",
    ratio: 16 / 9,
  },
  button: {
    width: 512,
    height: 512,
    label: "Button image · 512 × 512",
    ratio: 1,
  },
} as const;
export interface CropSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: 0 | 90 | 180 | 270;
  ratio: string;
}
export interface ArtworkSlot {
  source: string;
  asset: string;
  crop: CropSpec;
  fit: "cover" | "contain";
}
export interface LocalGameRecord {
  storeRef?: StoreReference;
  schemaVersion: 1;
  id: string;
  revision: number;
  title: string;
  description: string;
  tags: string[];
  connection: "offline" | "online" | "offline-online" | "unknown";
  minPlayers: number;
  maxPlayers: number;
  displayModes: DisplayMode[];
  inputMethod: "gamepad" | "keyboard";
  launch: {
    executable: string;
    cwd: string;
    args: string[];
    attachOnly: boolean;
    method?: "auto" | "direct";
    attachPid?: number;
  };
  artwork: { cover?: ArtworkSlot; banner?: ArtworkSlot };
  controller: ControllerDefinition;
  bindings: GameBindings;
  tests: {
    launch: boolean;
    menu: boolean;
    gameplay: boolean;
    offline: boolean;
    players: number;
    notes: string;
    updatedAt?: string;
  };
  updatedAt: string;
}
export interface StudioSession {
  definition: ControllerDefinition;
  modeId: string;
  preview: boolean;
}
export interface RunningGameWindow {
  pid: number;
  title: string;
  executable: string;
}
export interface LibraryResult {
  scan?: StoreScan;
  notes?: string[];
  windows?: RunningGameWindow[];
  ok: boolean;
  error?: string;
  games?: LocalGameRecord[];
  game?: LocalGameRecord;
  file?: {
    name: string;
    path?: string;
    id?: string;
    width?: number;
    height?: number;
  };
  config?: unknown;
}
export type LibraryCommand =
  | { type: "scan-stores" }
  | { type: "prepare-store-game"; key: string; executable?: string }
  | { type: "list" }
  | { type: "choose-executable" }
  | { type: "running-windows" }
  | { type: "choose-image" }
  | { type: "save"; game: LocalGameRecord }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | {
      type: "crop";
      source: string;
      crop: CropSpec;
      purpose?: "cover" | "banner" | "button";
    }
  | { type: "save-draft"; game: LocalGameRecord }
  | { type: "load-draft" }
  | { type: "processes"; executable: string }
  | {
      type: "preview";
      gameId: string;
      definition: ControllerDefinition;
      modeId: string;
    }
  | { type: "end-preview" }
  | { type: "capabilities" }
  | { type: "storage" }
  | { type: "choose-storage" };
export const ID = /^[a-z][a-z0-9-]{0,63}$/;
export const ASSET_ID = /^[a-f0-9]{64}$/;
export const COLOR = /^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i;
export const KEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""),
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "Escape",
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "Backspace",
  ...Array.from({ length: 12 }, (_, i) => "F" + (i + 1)),
  ...Array.from({ length: 10 }, (_, i) => "Numpad" + i),
  "Backquote",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadMultiply",
  "NumpadDivide",
  "NumpadDecimal",
  "NumpadEnter",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
];
export const clamp = (n: number, lo = -1, hi = 1) =>
  Math.max(lo, Math.min(hi, n));
export function control(
  kind: ControlKind,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  actions: string[] = [],
): StudioControl {
  return {
    id: "ctl-" + Math.random().toString(36).slice(2, 10),
    kind,
    label,
    x,
    y,
    w,
    h,
    anchor: x < 340 ? "left" : x > 600 ? "right" : "center",
    shape: kind === "stick" || kind === "dpad" ? "circle" : "rounded",
    radius: 20,
    display: "text",
    icon: "circle",
    fit: "contain",
    iconSize: 30,
    fontSize: 18,
    opacity: 1,
    theme: {},
    actions,
    axisX:
      kind === "dpad"
        ? "pad-x"
        : kind === "stick"
          ? "move-x"
          : kind === "trigger"
            ? "rt"
            : undefined,
    axisY: kind === "dpad" ? "pad-y" : kind === "stick" ? "move-y" : undefined,
    deadZone: 0.18,
    ways: 8,
    floating: false,
    variant: "all",
    feedback: 20,
  };
}
function defaultActions(mode: string): ActionBindings {
  return {
    "pad-x": [{ kind: "button-axis", negative: "left", positive: "right" }],
    "pad-y": [{ kind: "button-axis", negative: "down", positive: "up" }],
    "move-x": [{ kind: "axis", code: "lx", value: 1 }],
    "move-y": [{ kind: "axis", code: "ly", value: 1 }],
    "look-x": [{ kind: "axis", code: "rx", value: 1 }],
    "look-y": [{ kind: "axis", code: "ry", value: 1 }],
    a: [{ kind: "button", code: "a" }],
    b: [{ kind: "button", code: "b" }],
    x: [{ kind: "button", code: "x" }],
    y: [{ kind: "button", code: "y" }],
    l: [{ kind: "button", code: "l" }],
    r: [{ kind: "button", code: "r" }],
    ls: [{ kind: "button", code: "ls" }],
    rs: [{ kind: "button", code: "rs" }],
    lt: [{ kind: "axis", code: "lt", value: 1 }],
    rt: [{ kind: "axis", code: "rt", value: 1 }],
    start: [{ kind: "button", code: "start" }],
    select: [{ kind: "button", code: "select" }],
  };
}
export function createController(): ControllerDefinition {
  const menu = [
    control("dpad", "Navigate", 64, 136, 264, 264),
    control("button", "Confirm", 552, 88, 352, 112, ["a"]),
    control("button", "Back", 552, 220, 352, 72, ["b"]),
    control("button", "LB", 552, 316, 164, 64, ["l"]),
    control("button", "RB", 740, 316, 164, 64, ["r"]),
    control("button", "Start", 552, 404, 164, 56, ["start"]),
    control("button", "X", 740, 404, 164, 56, ["x"]),
  ];
  const fight = [
    control("dpad", "Move", 56, 160, 264, 264),
    control("button", "X", 570, 112, 144, 108, ["x"]),
    control("button", "B", 738, 112, 144, 108, ["b"]),
    control("button", "A", 570, 244, 312, 96, ["a"]),
    control("button", "LT", 570, 364, 144, 64, ["lt"]),
    control("button", "RB", 738, 364, 144, 64, ["r"]),
    control("button", "Start", 396, 80, 112, 56, ["start"]),
  ];
  const race = [
    control("stick", "Steer", 64, 148, 248, 248),
    control("button", "RT", 736, 184, 168, 220, ["rt"]),
    control("button", "B", 560, 184, 152, 220, ["b"]),
    control("button", "RT + B", 560, 184, 344, 220, ["rt", "b"]),
    control("button", "A", 560, 84, 344, 72, ["a"]),
    control("button", "LT", 560, 428, 152, 64, ["lt"]),
    control("button", "Pause", 372, 380, 124, 60, ["start"]),
  ];
  race[1].variant = "classic";
  race[2].variant = "classic";
  race[3].variant = "assisted";
  race[0].axisY = undefined;
  const standard = [
    control("stick", "Left stick", 40, 190, 190, 190),
    control("stick", "Right stick", 470, 280, 160, 160),
    control("dpad", "D-pad", 250, 230, 150, 150),
    ...[
      ["Y", 750, 120, "y"],
      ["X", 660, 210, "x"],
      ["B", 840, 210, "b"],
      ["A", 750, 300, "a"],
    ].map(([l, x, y, a]) => ({
      ...control("button", String(l), Number(x), Number(y), 80, 80, [
        String(a),
      ]),
      shape: "circle" as const,
    })),
    control("button", "LB", 40, 45, 160, 60, ["l"]),
    control("trigger", "LT", 220, 45, 160, 60),
    control("button", "RB", 620, 45, 160, 60, ["r"]),
    control("trigger", "RT", 800, 45, 120, 60),
    control("button", "Back", 410, 100, 90, 60, ["select"]),
    control("button", "Start", 515, 100, 90, 60, ["start"]),
  ];
  standard[1].anchor = "right";
  standard[1].axisX = "look-x";
  standard[1].axisY = "look-y";
  standard[8].axisX = "lt";
  standard[10].axisX = "rt";
  for (const controls of [menu, standard, fight, race]) {
    for (const c of controls) {
      c.appearance = "console";
      if (c.kind === "dpad") c.dpadStyle = "petals";
      if (c.kind === "button" && c.h <= 72) c.shape = "pill";
      if (c.kind === "button" && c.shape === "rounded") c.radius = 24;
    }
  }
  // Keep each hand's composition together when a phone has extra horizontal room.
  for (const c of menu.slice(1)) c.anchor = "right";
  for (const c of fight.slice(1, 6)) c.anchor = "right";
  for (const c of race.slice(1, 6)) c.anchor = "right";
  menu[1].appearance = "primary";
  fight[3].appearance = "primary";
  race[1].appearance = "primary";
  race[3].appearance = "primary";
  return {
    version: 1,
    revision: 1,
    labels: "xbox",
    modes: [
      { id: "menu", name: "Menu", purpose: "menu", controls: menu, theme: {} },
      {
        id: "standard",
        name: "Standard",
        purpose: "standard",
        controls: standard,
        theme: {},
      },
      {
        id: "fight",
        name: "Fight",
        purpose: "fight",
        controls: fight,
        theme: {},
      },
      { id: "race", name: "Race", purpose: "race", controls: race, theme: {} },
    ],
    theme: { ...DEFAULT_THEME },
    roleThemes: { navigator: { accent: "#83e8b3" }, player: {} },
    playerThemes: {},
    hostTheme: {},
    grid: { visible: true, snap: true, size: 8 },
    allowPersonal: true,
  };
}
export function createBindings(def: ControllerDefinition): GameBindings {
  const bindings: GameBindings = { gamepad: {}, keyboard: {} };
  for (let slot = 1; slot <= 4; slot++) {
    bindings.gamepad[slot] = {};
    bindings.keyboard[slot] = {};
    for (const mode of def.modes) {
      bindings.gamepad[slot][mode.id] = defaultActions(mode.id);
      const map = defaultActions(mode.id);
      const directions =
        slot === 1
          ? ["A", "D", "S", "W"]
          : slot === 2
            ? ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"]
            : slot === 3
              ? ["J", "L", "K", "I"]
              : ["Numpad4", "Numpad6", "Numpad2", "Numpad8"];
      for (const [a, v] of Object.entries(map)) {
        map[a] =
          a === "move-x" || a === "pad-x"
            ? [
                {
                  kind: "key-axis",
                  negative: directions[0],
                  positive: directions[1],
                },
              ]
            : a === "move-y" || a === "pad-y"
              ? [
                  {
                    kind: "key-axis",
                    negative: directions[2],
                    positive: directions[3],
                  },
                ]
              : [
                  {
                    kind: "key",
                    code:
                      (
                        {
                          a: "Enter",
                          b: "Escape",
                          x: "J",
                          y: "K",
                          start: "Escape",
                          select: "Tab",
                          l: "Q",
                          r: "E",
                          lt: "Q",
                          rt: "E",
                        } as Record<string, string>
                      )[a] || "Space",
                  },
                ];
      }
      bindings.keyboard[slot][mode.id] = map;
    }
  }
  return bindings;
}
export function newLocalGame(): LocalGameRecord {
  const controller = createController();
  return {
    schemaVersion: 1,
    id: "local-" + crypto.randomUUID(),
    revision: 0,
    title: "My game",
    description: "",
    tags: [],
    connection: "unknown",
    minPlayers: 1,
    maxPlayers: 1,
    displayModes: ["shared"],
    inputMethod: "gamepad",
    launch: { executable: "", cwd: "", args: [], attachOnly: false },
    artwork: {},
    controller,
    bindings: createBindings(controller),
    tests: {
      launch: false,
      menu: false,
      gameplay: false,
      offline: false,
      players: 1,
      notes: "",
    },
    updatedAt: new Date().toISOString(),
  };
}
export function gameManifest(game: LocalGameRecord): GameManifest {
  return {
    id: game.id,
    title: game.title,
    subtitle: game.tags.join(" · "),
    description: game.description,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    runtime: "native",
    controllerProfile: "gamepad",
    availability: "available",
    displayModes: game.displayModes,
    requiresGamepad: game.inputMethod === "gamepad",
    connection: game.connection === "unknown" ? undefined : game.connection,
    tags: game.tags,
    local: true,
    cover: game.artwork.cover,
    banner: game.artwork.banner,
    setup: game.tests.gameplay
      ? "Tested by you"
      : game.launch.executable
        ? "Ready to test"
        : "Needs setup",
  };
}
