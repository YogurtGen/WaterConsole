import type { DisplayMode, GameManifest } from "./types";
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
  pressedText?: string;
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
export interface LibraryResult {
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
  | { type: "list" }
  | { type: "choose-executable" }
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
            ? "accelerate"
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
    lt: [{ kind: "axis", code: "lt", value: 1 }],
    rt: [{ kind: "axis", code: "rt", value: 1 }],
    start: [{ kind: "button", code: "start" }],
    select: [{ kind: "button", code: "select" }],
    accelerate: [{ kind: "axis", code: "rt", value: 1 }],
    brake: [{ kind: "axis", code: "lt", value: 1 }],
    drift: [{ kind: "button", code: "b" }],
    boost: [{ kind: "button", code: "a" }],
  };
}
export function createController(): ControllerDefinition {
  const menu = [
    control("dpad", "Navigate", 70, 100, 230, 230),
    control("button", "Confirm", 660, 130, 160, 120, ["a"]),
    control("button", "Back", 480, 130, 130, 120, ["b"]),
    control("button", "Start", 420, 330, 170, 60, ["start"]),
  ];
  const fight = [
    control("dpad", "Move", 60, 100, 240, 240),
    control("button", "Light", 550, 100, 125, 105, ["x"]),
    control("button", "Heavy", 700, 100, 125, 105, ["b"]),
    control("button", "Jump", 550, 235, 275, 85, ["a"]),
    control("button", "Dodge", 550, 350, 125, 65, ["lt"]),
    control("button", "Throw", 700, 350, 125, 65, ["r"]),
  ];
  const race = [
    control("stick", "Steer", 60, 100, 240, 240),
    control("button", "Throttle", 690, 190, 160, 185, ["accelerate"]),
    control("button", "Drift", 510, 190, 150, 185, ["drift"]),
    control("button", "Drift + gas", 630, 190, 220, 185, [
      "accelerate",
      "drift",
    ]),
    control("button", "Boost", 510, 90, 340, 70, ["boost"]),
    control("button", "Brake", 510, 400, 150, 58, ["brake"]),
    control("button", "Pause", 350, 350, 120, 58, ["start"]),
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
  standard[1].axisX = "look-x";
  standard[1].axisY = "look-y";
  standard[8].axisX = "lt";
  standard[10].axisX = "rt";
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
                          accelerate: "W",
                          brake: "S",
                          drift: "Space",
                          boost: "Shift",
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
