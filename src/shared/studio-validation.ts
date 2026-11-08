import {
  ASSET_ID,
  COLOR,
  ID,
  KEYS,
  PAD_BUTTONS,
  type ControllerDefinition,
  type LocalGameRecord,
  type OutputBinding,
  type StudioControl,
  type StudioInput,
  type Theme,
} from "./studio-model";
const obj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function assert(v: unknown, message: string): asserts v {
  if (!v) throw new Error(message);
}
function only(value: Record<string, unknown>, keys: string[]) {
  assert(
    Object.keys(value).every((k) => keys.includes(k)),
    "Unknown configuration property.",
  );
}
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const str = (v: unknown, max: number) =>
  typeof v === "string" &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b-\u001f]/.test(v);
const identifier = (v: unknown) =>
  typeof v === "string" &&
  ID.test(v) &&
  !["constructor", "prototype", "__proto__"].includes(v);
export function validateTheme(
  value: unknown,
  partial = true,
): asserts value is Theme {
  assert(obj(value), "Invalid theme.");
  for (const [k, v] of Object.entries(value)) {
    assert(
      [
        "background",
        "panel",
        "button",
        "text",
        "border",
        "accent",
        "pressed",
        "disabled",
        "focus",
        "pressedText",
        "icon",
        "pressedIcon",
        "backgroundImage",
      ].includes(k),
      "Unknown theme property.",
    );
    assert(
      k === "backgroundImage"
        ? v === undefined ||
            v === "" ||
            (typeof v === "string" && ASSET_ID.test(v))
        : typeof v === "string" && COLOR.test(v),
      "Choose valid HEX colors and local images.",
    );
  }
  if (!partial)
    for (const k of [
      "background",
      "panel",
      "button",
      "text",
      "border",
      "accent",
      "pressed",
      "disabled",
      "focus",
    ])
      assert(typeof value[k] === "string", "Incomplete theme.");
}
export function validateController(
  value: unknown,
): asserts value is ControllerDefinition {
  assert(
    obj(value) &&
      value.version === 1 &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 1,
    "Unsupported controller version.",
  );
  assert(
    ["xbox", "playstation", "custom"].includes(value.labels),
    "Invalid label style.",
  );
  validateTheme(value.theme, false);
  validateTheme(value.hostTheme);
  assert(
    obj(value.roleThemes) && obj(value.playerThemes),
    "Invalid player themes.",
  );
  validateTheme(value.roleThemes.navigator);
  validateTheme(value.roleThemes.player);
  for (const [k, v] of Object.entries(value.playerThemes)) {
    assert(["1", "2", "3", "4"].includes(k), "Invalid theme player.");
    validateTheme(v);
  }
  assert(
    obj(value.grid) &&
      typeof value.grid.visible === "boolean" &&
      typeof value.grid.snap === "boolean" &&
      Number.isInteger(value.grid.size) &&
      number(value.grid.size, 1, 128),
    "Grid size must be between 1 and 128.",
  );
  assert(
    typeof value.allowPersonal === "boolean",
    "Invalid personal layout option.",
  );
  assert(
    Array.isArray(value.modes) &&
      value.modes.length >= 1 &&
      value.modes.length <= 8,
    "Use one to eight controller modes.",
  );
  const modes = new Set<string>();
  for (const mode of value.modes) {
    assert(
      obj(mode) &&
        identifier(mode.id) &&
        !modes.has(mode.id) &&
        str(mode.name, 32) &&
        mode.name.trim(),
      "Invalid or duplicate mode.",
    );
    modes.add(mode.id);
    assert(
      ["menu", "fight", "race", "standard"].includes(mode.purpose),
      "Invalid mode template.",
    );
    validateTheme(mode.theme);
    assert(
      Array.isArray(mode.controls) && mode.controls.length <= 64,
      "Use no more than 64 controls per mode.",
    );
    const ids = new Set<string>();
    let axes = 0;
    for (const c of mode.controls) {
      assert(
        obj(c) && identifier(c.id) && !ids.has(c.id),
        "Invalid or duplicate control.",
      );
      ids.add(c.id);
      assert(
        ["button", "stick", "dpad", "trigger", "label"].includes(c.kind),
        "Unknown control type.",
      );
      if (["stick", "dpad", "trigger"].includes(c.kind)) axes++;
      assert(
        str(c.label, 64) && ["left", "center", "right"].includes(c.anchor),
        "Invalid control label/anchor.",
      );
      assert(
        number(c.x, 0, 960) &&
          number(c.y, 0, 540) &&
          number(c.w, 44, 960) &&
          number(c.h, 44, 540) &&
          c.x + c.w <= 960.1 &&
          c.y + c.h <= 540.1,
        "Controls must fit inside the design area (minimum 44). ",
      );
      assert(
        ["circle", "square", "triangle", "rounded", "pill"].includes(c.shape) &&
          number(c.radius, 0, 100),
        "Invalid button shape.",
      );
      assert(
        ["icon", "icon-text", "text", "image"].includes(c.display) &&
          str(c.icon, 100) &&
          /^[a-z0-9-]+$/.test(c.icon),
        "Invalid button appearance.",
      );
      for (const a of [c.image, c.pressedImage])
        assert(
          a === undefined || (typeof a === "string" && ASSET_ID.test(a)),
          "Use an imported local image.",
        );
      assert(
        ["contain", "cover"].includes(c.fit) &&
          number(c.iconSize, 8, 160) &&
          number(c.fontSize, 8, 72) &&
          number(c.opacity, 0.15, 1),
        "Invalid image/text size or opacity.",
      );
      validateTheme(c.theme);
      assert(
        Array.isArray(c.actions) &&
          c.actions.length <= 8 &&
          new Set(c.actions).size === c.actions.length &&
          c.actions.every(identifier),
        "Choose up to eight unique actions.",
      );
      for (const a of [c.axisX, c.axisY])
        assert(a === undefined || identifier(a), "Invalid analog action.");
      assert(
        number(c.deadZone, 0, 0.6) &&
          [4, 8].includes(c.ways) &&
          typeof c.floating === "boolean" &&
          ["all", "classic", "assisted"].includes(c.variant) &&
          number(c.feedback, 0, 100),
        "Invalid control behavior.",
      );
      assert(
        c.slideGroup === undefined || identifier(c.slideGroup),
        "Invalid slide group.",
      );
      assert(
        c.locked === undefined || typeof c.locked === "boolean",
        "Invalid lock option.",
      );
      assert(c.group === undefined || identifier(c.group), "Invalid group.");
      for (const id of [c.imageSource, c.pressedImageSource])
        assert(
          id === undefined || (typeof id === "string" && ASSET_ID.test(id)),
          "Invalid source image.",
        );
      for (const crop of [c.imageCrop, c.pressedImageCrop])
        if (crop !== undefined) validateCrop(crop);
    }
    assert(axes <= 8, "Use no more than eight analog controls.");
  }
  assert(modes.has("menu"), "Keep a Menu mode for recovery.");
}
export function validateBinding(v: unknown): asserts v is OutputBinding {
  assert(obj(v), "Invalid binding.");
  if (v.kind === "button")
    assert(PAD_BUTTONS.includes(v.code as any), "Unknown gamepad button.");
  else if (v.kind === "key")
    assert(KEYS.includes(v.code), "Choose a supported game key.");
  else if (v.kind === "key-direction")
    assert(
      KEYS.includes(v.code) && [-1, 1].includes(v.value),
      "Invalid directional key.",
    );
  else if (v.kind === "axis")
    assert(
      ["lx", "ly", "rx", "ry", "lt", "rt"].includes(v.code) &&
        number(v.value, -1, 1),
      "Invalid axis output.",
    );
  else if (v.kind === "button-axis")
    assert(
      PAD_BUTTONS.includes(v.negative) && PAD_BUTTONS.includes(v.positive),
      "Invalid directional gamepad buttons.",
    );
  else if (v.kind === "key-axis")
    assert(
      KEYS.includes(v.negative) && KEYS.includes(v.positive),
      "Invalid directional keys.",
    );
  else throw new Error("Unsupported output binding.");
}
export function validateGame(value: unknown): asserts value is LocalGameRecord {
  assert(
    obj(value) &&
      value.schemaVersion === 1 &&
      typeof value.id === "string" &&
      /^local-[a-f0-9-]{36}$/.test(value.id),
    "Unsupported game record.",
  );
  assert(
    Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      str(value.title, 120) &&
      value.title.trim() &&
      str(value.description, 2000),
    "Enter a title (120 characters) and description (2000 maximum).",
  );
  assert(
    Array.isArray(value.tags) &&
      value.tags.length <= 12 &&
      value.tags.every((t: unknown) => str(t, 24)),
    "Use up to 12 tags of 24 characters.",
  );
  assert(
    ["offline", "online", "offline-online", "unknown"].includes(
      value.connection,
    ) && ["gamepad", "keyboard"].includes(value.inputMethod),
    "Invalid connection/input method.",
  );
  assert(
    Number.isInteger(value.minPlayers) &&
      Number.isInteger(value.maxPlayers) &&
      number(value.minPlayers, 1, 4) &&
      number(value.maxPlayers, value.minPlayers, 4),
    "Choose one to four players.",
  );
  assert(
    Array.isArray(value.displayModes) &&
      value.displayModes.length > 0 &&
      value.displayModes.length <= 3 &&
      value.displayModes.every((x: unknown) =>
        ["shared", "split-2", "split-4"].includes(String(x)),
      ),
    "Choose supported display modes.",
  );
  assert(
    obj(value.launch) &&
      str(value.launch.executable, 2048) &&
      str(value.launch.cwd, 2048) &&
      typeof value.launch.attachOnly === "boolean" &&
      (value.launch.method === undefined ||
        ["auto", "direct"].includes(value.launch.method)) &&
      Array.isArray(value.launch.args) &&
      value.launch.args.length <= 32 &&
      value.launch.args.every((x: unknown) => str(x, 1024)),
    "Invalid local launch settings.",
  );
  assert(
    value.launch.attachPid === undefined ||
      (Number.isSafeInteger(value.launch.attachPid) &&
        value.launch.attachPid > 0),
    "Invalid process selection.",
  );
  validateController(value.controller);
  assert(obj(value.bindings), "Invalid bindings.");
  for (const backend of ["gamepad", "keyboard"]) {
    assert(obj(value.bindings[backend]), "Missing player bindings.");
    for (const [slot, modes] of Object.entries(value.bindings[backend])) {
      assert(
        ["1", "2", "3", "4"].includes(slot) && obj(modes),
        "Invalid binding player.",
      );
      for (const [modeId, actions] of Object.entries(
        modes as Record<string, unknown>,
      )) {
        assert(
          identifier(modeId) &&
            obj(actions) &&
            Object.keys(actions).length <= 128,
          "Invalid mode bindings.",
        );
        for (const [action, outputs] of Object.entries(
          actions as Record<string, unknown>,
        )) {
          assert(
            identifier(action) && Array.isArray(outputs) && outputs.length <= 8,
            "Invalid action bindings.",
          );
          outputs.forEach((output) => {
            validateBinding(output);
            assert(
              backend === "gamepad"
                ? ["button", "axis", "button-axis"].includes(output.kind)
                : ["key", "key-axis", "key-direction"].includes(output.kind),
              "Binding type does not match its input method.",
            );
          });
        }
      }
    }
  }
  assert(
    obj(value.artwork) &&
      Object.keys(value.artwork).every((x) => ["cover", "banner"].includes(x)),
    "Invalid artwork.",
  );
  for (const art of Object.values(value.artwork)) {
    if (!art) continue;
    assert(
      obj(art) &&
        ASSET_ID.test(art.source) &&
        ASSET_ID.test(art.asset) &&
        ["contain", "cover"].includes(art.fit),
      "Invalid artwork reference.",
    );
    validateCrop(art.crop);
  }
  assert(
    obj(value.tests) &&
      ["launch", "menu", "gameplay", "offline"].every(
        (k) => typeof value.tests[k] === "boolean",
      ) &&
      number(value.tests.players, 1, 4) &&
      str(value.tests.notes, 2000),
    "Invalid test notes.",
  );
  assert(str(value.updatedAt, 80), "Invalid update date.");
  assert(
    JSON.stringify(value).length <= 2 * 1024 * 1024,
    "Game configuration is too large.",
  );
}
export function validateCrop(v: unknown): asserts v is {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: 0 | 90 | 180 | 270;
  ratio: string;
} {
  assert(
    obj(v) &&
      number(v.x, 0, 1) &&
      number(v.y, 0, 1) &&
      number(v.w, 0.001, 1) &&
      number(v.h, 0.001, 1) &&
      v.x + v.w <= 1.0001 &&
      v.y + v.h <= 1.0001 &&
      [0, 90, 180, 270].includes(v.rotation) &&
      str(v.ratio, 20),
    "Crop must stay inside the image.",
  );
}
export function validStudioInput(
  v: unknown,
  definition: ControllerDefinition,
  modeId: string,
): v is StudioInput {
  if (
    !obj(v) ||
    !Object.keys(v).every((k) =>
      ["revision", "modeId", "variant", "pressed", "values"].includes(k),
    ) ||
    v.revision !== definition.revision ||
    v.modeId !== modeId ||
    !["classic", "assisted"].includes(v.variant) ||
    !Array.isArray(v.pressed) ||
    v.pressed.length > 64 ||
    new Set(v.pressed).size !== v.pressed.length ||
    !obj(v.values) ||
    Object.keys(v.values).length > 8
  )
    return false;
  const controls =
    definition.modes
      .find((m) => m.id === modeId)
      ?.controls.filter(
        (c) => c.variant === "all" || c.variant === v.variant,
      ) ?? [];
  return (
    v.pressed.every((id: unknown) =>
      controls.some((c) => c.id === id && c.kind === "button"),
    ) &&
    Object.entries(v.values).every(
      ([id, a]) =>
        controls.some(
          (c) => c.id === id && ["stick", "dpad", "trigger"].includes(c.kind),
        ) &&
        obj(a) &&
        Object.keys(a).every((k) => ["x", "y"].includes(k)) &&
        number(a.x, -1, 1) &&
        number(a.y, -1, 1),
    )
  );
}
export function controllerAssets(def: ControllerDefinition) {
  const ids = new Set<string>();
  for (const t of [
    def.theme,
    def.hostTheme,
    ...Object.values(def.roleThemes),
    ...Object.values(def.playerThemes),
    ...def.modes.map((m) => m.theme),
  ])
    if (t.backgroundImage) ids.add(t.backgroundImage);
  for (const c of def.modes.flatMap((m) => m.controls)) {
    if (c.image) ids.add(c.image);
    if (c.pressedImage) ids.add(c.pressedImage);
  }
  return [...ids];
}
