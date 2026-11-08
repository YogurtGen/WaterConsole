import { VisualBinding } from "./visual-binding";
import { EditorBoundary } from "./editor-boundary";
import { actionChoices, actionLabel } from "../shared/binding-tools";
import { SpotlightGuide, useGuidedHelp, type GuideStep } from "./guided-tour";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as PE,
  type CSSProperties,
} from "react";
import {
  control,
  clamp,
  createController,
  createBindings,
  KEYS,
  PAD_BUTTONS,
  DEFAULT_THEME,
  type StudioControl,
  type LocalGameRecord,
  type Theme,
  type OutputBinding,
  type ArtworkSlot,
} from "../shared/studio-model";
import { snappedRect, resolveTheme } from "../shared/studio-engine";
import type { HostState } from "../shared/types";
import { StudioSurface, hostAsset } from "./studio-surface";
import {
  libraryCall,
  NumberField,
  ThemeFields,
  type ThemeColorKey,
  Panel,
  trapDialog,
} from "./builder-primitives";
import { IconPicker } from "./icon-picker";
import { CropEditor } from "./crop-editor";
interface Props {
  game: LocalGameRecord;
  onChange: (game: LocalGameRecord) => void;
  onExit: () => void;
  onSave: () => Promise<void>;
  onTest: () => Promise<void>;
  onConnect: () => void;
  state: HostState;
}
export function ControllerStudio({
  game,
  onChange,
  onExit,
  onSave,
  onTest,
  onConnect,
  state,
}: Props) {
  const [modeId, setModeId] = useState(
      game.controller.modes.find((m) => m.id !== "menu")?.id ?? "menu",
    ),
    [selected, setSelected] = useState<string[]>([]),
    [tab, setTab] = useState<"appearance" | "actions">("appearance"),
    [themeScope, setThemeScope] = useState("base"),
    [slot, setSlot] = useState(1),
    [role, setRole] = useState("navigator"),
    [variant, setVariant] = useState<"classic" | "assisted">("assisted"),
    [size, setSize] = useState("design"),
    [iconOpen, setIconOpen] = useState(false),
    [visualOpen, setVisualOpen] = useState(false),
    [crop, setCrop] = useState<{
      source: string;
      pressed: boolean;
      initial?: ArtworkSlot;
    } | null>(null),
    [preview, setPreview] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [historyTick, setHistoryTick] = useState(0),
    [newAction, setNewAction] = useState("");
  const [colorEditor, setColorEditor] = useState<{
    scope: string;
    key: ThemeColorKey;
  } | null>(null);
  const picker = (scope: string) => ({
    editing: colorEditor?.scope === scope ? colorEditor.key : null,
    onEditingChange: (key: ThemeColorKey | null) =>
      setColorEditor(key ? { scope, key } : null),
  });
  const guide = useGuidedHelp("controller-studio");
  useEffect(() => {
    if (iconOpen || crop || visualOpen) guide.close();
  }, [iconOpen, crop, visualOpen, guide.close]);
  const current = useRef(game);
  current.current = game;
  const undo = useRef<LocalGameRecord[]>([]),
    redo = useRef<LocalGameRecord[]>([]);
  const canvasHost = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(700);
  const gesture = useRef<{
    x: number;
    y: number;
    resize: boolean;
    ids: string[];
    original: StudioControl[];
  } | null>(null);
  const mode =
    game.controller.modes.find((m) => m.id === modeId) ??
    game.controller.modes[0];
  const active = mode.controls.find((c) => selected.includes(c.id));
  useEffect(() => {
    setThemeScope(active ? "control" : "base");
  }, [active?.id]);
  useEffect(() => setColorEditor(null), [active?.id, modeId, themeScope]);
  useEffect(() => {
    document.querySelector(".studio-inspector")?.scrollTo({ top: 0 });
  }, [active?.id]);
  const scale = Math.min(canvasWidth / 960, 1);
  const visible = mode.controls.filter(
    (c) => c.variant === "all" || c.variant === variant,
  );
  function commit(update: (draft: LocalGameRecord) => void, record = true) {
    const before = current.current,
      next = structuredClone(before);
    if (record) {
      undo.current.push(structuredClone(before));
      undo.current = undo.current.slice(-50);
      redo.current = [];
      setHistoryTick((x) => x + 1);
    }
    update(next);
    onChange(next);
  }
  function patchControl(patch: Partial<StudioControl>) {
    if (!active) return;
    commit((d) => {
      const c = d.controller.modes
        .find((m) => m.id === mode.id)!
        .controls.find((c) => c.id === active.id)!;
      Object.assign(c, patch);
      if (["circle", "square", "triangle"].includes(c.shape)) {
        c.w = c.h = clamp(patch.w ?? patch.h ?? Math.min(c.w, c.h), 44, 540);
      }
      c.x = clamp(c.x, 0, 960 - c.w);
      c.y = clamp(c.y, 0, 540 - c.h);
    });
  }
  function removeButtonImage(pressed = false) {
    if (!active) return;
    const other = pressed ? active.image : active.pressedImage;
    patchControl({
      ...(pressed
        ? {
            pressedImage: undefined,
            pressedImageSource: undefined,
            pressedImageCrop: undefined,
          }
        : { image: undefined, imageSource: undefined, imageCrop: undefined }),
      ...(!other && active.display === "image"
        ? { display: "text" as const }
        : {}),
    });
  }
  function history(back = true) {
    const source = back ? undo : redo,
      destination = back ? redo : undo;
    const next = source.current.pop();
    if (!next) return;
    destination.current.push(structuredClone(current.current));
    next.revision = current.current.revision;
    next.controller.revision = current.current.controller.revision;
    onChange(next);
    setHistoryTick((x) => x + 1);
  }
  useEffect(() => {
    const el = canvasHost.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) =>
      setCanvasWidth(Math.max(260, e.contentRect.width - 32)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setSelected([]);
  }, [modeId]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(
      () =>
        void libraryCall({
          type: "preview",
          gameId: game.id,
          definition: game.controller,
          modeId: mode.id,
        }).catch((e) => setError(e.message)),
      500,
    );
    return () => clearTimeout(timer);
  }, [preview, game.controller, mode.id]);
  useEffect(
    () => () => {
      void window.waterconsole?.library?.({ type: "end-preview" });
    },
    [],
  );
  function removeSelected() {
    commit((d) => {
      const m = d.controller.modes.find((m) => m.id === mode.id)!;
      m.controls = m.controls.filter((c) => !selected.includes(c.id));
    });
    setSelected([]);
  }
  function duplicate() {
    if (!selected.length) return;
    const ids: string[] = [];
    commit((d) => {
      const m = d.controller.modes.find((m) => m.id === mode.id)!;
      for (const c of m.controls.filter((c) => selected.includes(c.id))) {
        if (m.controls.length >= 64) break;
        const next = {
          ...structuredClone(c),
          id: "ctl-" + crypto.randomUUID().slice(0, 8),
          x: clamp(c.x + 24, 0, 960 - c.w),
          y: clamp(c.y + 24, 0, 540 - c.h),
          group: undefined,
        };
        ids.push(next.id);
        m.controls.push(next);
      }
    });
    setSelected(ids);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        history(!e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history(false);
      } else if (e.key === "Delete" && selected.length) {
        e.preventDefault();
        removeSelected();
      } else if (
        selected.length &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const amount =
          (game.controller.grid.snap ? game.controller.grid.size : 1) *
          (e.shiftKey ? 10 : 1);
        commit((d) => {
          const controls = d.controller.modes.find(
            (m) => m.id === mode.id,
          )!.controls;
          for (const c of controls.filter(
            (c) => selected.includes(c.id) && !c.locked,
          ))
            Object.assign(
              c,
              snappedRect(
                c,
                {
                  x:
                    c.x +
                    (e.key === "ArrowLeft"
                      ? -amount
                      : e.key === "ArrowRight"
                        ? amount
                        : 0),
                  y:
                    c.y +
                    (e.key === "ArrowUp"
                      ? -amount
                      : e.key === "ArrowDown"
                        ? amount
                        : 0),
                },
                1,
                false,
              ),
            );
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, game, mode]);
  function begin(e: PE<HTMLDivElement>, c: StudioControl, resize = false) {
    e.preventDefault();
    e.stopPropagation();
    let ids = e.shiftKey
      ? selected.includes(c.id)
        ? selected.filter((id) => id !== c.id)
        : [...selected, c.id]
      : selected.includes(c.id)
        ? selected
        : [c.id];
    if (c.group && !e.shiftKey)
      ids = mode.controls.filter((i) => i.group === c.group).map((i) => i.id);
    setSelected(ids);
    if (c.locked || !ids.length) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    undo.current.push(structuredClone(game));
    undo.current = undo.current.slice(-50);
    redo.current = [];
    setHistoryTick((x) => x + 1);
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      resize,
      ids,
      original: structuredClone(mode.controls),
    };
  }
  function drag(e: PE<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    let dx = (e.clientX - g.x) / scale,
      dy = (e.clientY - g.y) / scale;
    const controls = g.original.filter(
      (c) => g.ids.includes(c.id) && !c.locked,
    );
    if (!controls.length) return;
    const grid = game.controller.grid;
    if (grid.snap) {
      dx = Math.round(dx / grid.size) * grid.size;
      dy = Math.round(dy / grid.size) * grid.size;
    }
    if (!g.resize) {
      dx = clamp(
        dx,
        -Math.min(...controls.map((c) => c.x)),
        960 - Math.max(...controls.map((c) => c.x + c.w)),
      );
      dy = clamp(
        dy,
        -Math.min(...controls.map((c) => c.y)),
        540 - Math.max(...controls.map((c) => c.y + c.h)),
      );
    }
    commit((d) => {
      const m = d.controller.modes.find((m) => m.id === mode.id)!;
      for (const c of controls) {
        const index = m.controls.findIndex((t) => t.id === c.id);
        m.controls[index] = snappedRect(
          c,
          g.resize
            ? { w: c.w + dx, h: c.h + dy }
            : { x: c.x + dx, y: c.y + dy },
          g.resize ? grid.size : 1,
          g.resize && grid.snap,
        );
      }
    }, false);
  }
  function add(kind: StudioControl["kind"]) {
    if (mode.controls.length >= 64) {
      setError("A mode supports up to 64 controls.");
      return;
    }
    const c = control(
      kind,
      kind === "button"
        ? "New button"
        : kind === "dpad"
          ? "Move"
          : kind === "stick"
            ? "Analog"
            : kind === "trigger"
              ? "Throttle"
              : "Label",
      360,
      190,
      kind === "button" ? 150 : kind === "label" ? 170 : 190,
      kind === "button" ? 90 : kind === "label" ? 50 : 190,
      kind === "button" ? ["a"] : [],
    );
    commit((d) =>
      d.controller.modes.find((m) => m.id === mode.id)!.controls.push(c),
    );
    setSelected([c.id]);
  }
  function align(action: string) {
    const controls = mode.controls.filter((c) => selected.includes(c.id));
    if (controls.length < 2) return;
    commit((d) => {
      const list = d.controller.modes
        .find((m) => m.id === mode.id)!
        .controls.filter((c) => selected.includes(c.id));
      const left = Math.min(...list.map((c) => c.x)),
        right = Math.max(...list.map((c) => c.x + c.w)),
        top = Math.min(...list.map((c) => c.y)),
        bottom = Math.max(...list.map((c) => c.y + c.h));
      if (action === "horizontal" || action === "vertical") {
        const horizontal = action === "horizontal";
        list.sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
        const total = list.reduce(
            (sum, c) => sum + (horizontal ? c.w : c.h),
            0,
          ),
          space = (horizontal ? right - left : bottom - top) - total;
        if (space < 0) {
          setError(
            "Make room or shrink the selected controls before distributing.",
          );
          return;
        }
        let next = horizontal ? left : top;
        for (const c of list) {
          if (horizontal) c.x = next;
          else c.y = next;
          next += (horizontal ? c.w : c.h) + space / (list.length - 1);
        }
      } else
        for (const c of list) {
          if (action === "left") c.x = left;
          if (action === "right") c.x = right - c.w;
          if (action === "center") c.x = (left + right - c.w) / 2;
          if (action === "top") c.y = top;
          if (action === "bottom") c.y = bottom - c.h;
          if (action === "middle") c.y = (top + bottom - c.h) / 2;
        }
    });
  }
  function themeValue(scope = themeScope): Partial<Theme> {
    if (scope === "base") return game.controller.theme;
    if (scope === "mode") return mode.theme;
    if (scope === "navigator") return game.controller.roleThemes.navigator;
    if (scope === "player") return game.controller.roleThemes.player;
    if (scope === "host") return game.controller.hostTheme;
    if (scope.startsWith("slot-"))
      return game.controller.playerThemes[scope.slice(5)] ?? {};
    return active?.theme ?? {};
  }
  function setTheme(value: Partial<Theme>, scope = themeScope) {
    commit((d) => {
      if (scope === "base") d.controller.theme = { ...DEFAULT_THEME, ...value };
      else if (scope === "mode")
        d.controller.modes.find((m) => m.id === mode.id)!.theme = value;
      else if (scope === "navigator" || scope === "player")
        d.controller.roleThemes[scope] = value;
      else if (scope === "host") d.controller.hostTheme = value;
      else if (scope.startsWith("slot-"))
        d.controller.playerThemes[scope.slice(5)] = value;
      else if (active)
        d.controller.modes
          .find((m) => m.id === mode.id)!
          .controls.find((c) => c.id === active.id)!.theme = value;
    });
  }
  async function upload(
    pressed = false,
    background = false,
    backgroundScope = themeScope,
  ) {
    try {
      const result = await libraryCall({ type: "choose-image" });
      if (!result?.file?.id) return;
      const c = background ? undefined : active;
      const initial =
        c &&
        (pressed
          ? c.pressedImage && c.pressedImageSource && c.pressedImageCrop
            ? {
                source: c.pressedImageSource,
                asset: c.pressedImage,
                crop: c.pressedImageCrop,
                fit: c.fit,
              }
            : undefined
          : c.image && c.imageSource && c.imageCrop
            ? {
                source: c.imageSource,
                asset: c.image,
                crop: c.imageCrop,
                fit: c.fit,
              }
            : undefined);
      setCrop({
        source: result.file.id,
        pressed,
        background,
        backgroundScope,
        initial,
      } as any);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function togglePreview() {
    try {
      if (preview) {
        await libraryCall({ type: "end-preview" });
        setPreview(false);
      } else {
        await libraryCall({
          type: "preview",
          gameId: game.id,
          definition: game.controller,
          modeId: mode.id,
        });
        setPreview(true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function task(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function addMode() {
    if (game.controller.modes.length >= 8) return;
    const template = createController().modes[1],
      id = "mode-" + crypto.randomUUID().slice(0, 8);
    commit((d) => {
      d.controller.modes.push({
        ...template,
        id,
        name: "Custom " + (d.controller.modes.length - 3),
      });
      const defaults = createBindings(createController());
      for (const backend of ["gamepad", "keyboard"] as const)
        for (let player = 1; player <= 4; player++)
          d.bindings[backend][player][id] = structuredClone(
            defaults[backend][player].standard,
          );
    });
    setModeId(id);
  }
  function applyPreset(preset: string) {
    const defaults = createController(),
      template = defaults.modes.find((m) => m.id === preset);
    if (!template) return;
    commit((d) => {
      const i = d.controller.modes.findIndex((m) => m.id === mode.id);
      d.controller.modes[i] = {
        ...structuredClone(template),
        id: mode.id,
        name: mode.name,
      };
      const bindings = createBindings(defaults);
      for (const backend of ["gamepad", "keyboard"] as const)
        for (let p = 1; p <= 4; p++)
          d.bindings[backend][p][mode.id] = structuredClone(
            bindings[backend][p][preset],
          );
    });
    setSelected([]);
  }
  const actionMap = game.bindings[game.inputMethod][slot]?.[mode.id] ?? {};
  const actions = active
    ? actionChoices(game, mode.id, slot, active)
    : Object.keys(actionMap);
  const selectedActions =
    active?.kind === "button"
      ? active.actions
      : ([active?.axisX, active?.axisY].filter(Boolean) as string[]);
  function binding(action: string, outputs: OutputBinding[]) {
    commit((d) => {
      d.bindings[d.inputMethod][slot] ??= {};
      d.bindings[d.inputMethod][slot][mode.id] ??= {};
      d.bindings[d.inputMethod][slot][mode.id][action] = outputs;
    });
  }
  function updateOutput(action: string, index: number, output: OutputBinding) {
    const list = [...(actionMap[action] ?? [])];
    list[index] = output;
    binding(action, list);
  }
  function inspectButton(actions = false) {
    const button = mode.controls.find(
      (c) =>
        c.kind === "button" && (c.variant === "all" || c.variant === variant),
    );
    if (button) setSelected([button.id]);
    setTab(actions ? "actions" : "appearance");
  }
  const guideSteps: GuideStep[] = [
    {
      target: ".studio-editor-header nav",
      title: "A mode for every moment",
      description:
        "Menu, Standard, Fight and Race have separate controls and bindings. Add a custom mode or start from a preset. The Navigator switches the shared mode; the app does not guess your game scene.",
    },
    {
      target: ".studio-palette",
      title: "Add the controls you need",
      description:
        "Choose a button, analog stick, draggable + D-pad, trigger or label. Layers let you select and lock controls. Adding a control is a real edit; Undo can restore it.",
    },
    {
      target: ".studio-stage-shell",
      title: "Place controls for your thumbs",
      description:
        "Drag a selected control to move it and drag its corner to resize. Shift-click for multiple selection. Device previews help you check portrait and landscape without clipping.",
      enter: () => setSize("design"),
    },
    {
      target: ".studio-grid-toolbar",
      title: "Keep it lined up",
      description:
        "Show grid and Snap to grid are independent. Change spacing or switch snapping off. Use alignment/distribution and grouping below the canvas, with Undo/Redo for changes.",
    },
    {
      target: '[data-guide="control-shape"]',
      title: "Make each button yours",
      description:
        "Select a control to choose its shape, exact size, icon, text or uploaded image. Appearance controls never change what the button does.",
      enter: () => inspectButton(false),
    },
    {
      target: '[data-guide="canvas-background"]',
      title: "Colors without the clutter",
      description:
        "Canvas background is always available. Select a control for Color & fill: Fill, Text and Icon, with a separate While pressed state. Open one color picker at a time. Role & player themes keeps advanced overrides available.",
      enter: () => {
        setTab("appearance");
        setThemeScope("base");
      },
    },
    {
      target: ".studio-action-checks",
      title: "Link actions while held",
      description:
        "Check multiple actions for one button: for example Accelerate + Drift. Releasing it stops only its contribution, so a separately held gas button stays active. Classic and Assisted can have different controls.",
      enter: () => inspectButton(true),
    },
    {
      target: '[data-guide="studio-output"]',
      title: "Map the actual game input",
      description:
        "Choose the PC output for this player and mode. Use Visual binding to click a full Xbox, PlayStation or keyboard diagram. Colors show used/shared inputs; hover shows their owners. Gamepad buttons/axes and keyboard keys are configured here, not on the phone. Check menus and gameplay bindings separately.",
      enter: () => inspectButton(true),
    },
    {
      target: ".studio-canvas-footer",
      title: "Preview safely, then test",
      description:
        "Preview on my phone sends your draft to approved phones without controlling a game. Save & test in game launches explicitly. Your phone has its own Vibration toggle and Test button.",
    },
    {
      target: '[data-guide="studio-save"]',
      title: "Save your controller",
      description:
        "Save keeps your local profile. You can keep editing or return to game setup. Replay this tutorial any time with the ? button; no AI subscription is needed.",
    },
  ];
  const visibleTheme = {
    ...resolveTheme(game.controller, mode, role === "navigator", slot),
    ...(role === "host" ? game.controller.hostTheme : {}),
  };
  const device =
    size === "design"
      ? { w: 960, h: 540 }
      : { w: Number(size.split("x")[0]), h: Number(size.split("x")[1]) };
  const viewScale = Math.min(
    canvasWidth / device.w,
    size === "design" ? 1 : 500 / device.h,
  );
  return (
    <section
      className="controller-studio"
      aria-label="Controller Studio"
      onKeyDown={(e) => trapDialog(e)}
    >
      <header className="studio-editor-header">
        <div>
          <button className="builder-quiet" onClick={onExit}>
            ← Game setup
          </button>
          <h2>Controller Studio</h2>
          <small>{game.title}</small>
        </div>
        <nav>
          {game.controller.modes.map((m) => (
            <button
              key={m.id}
              className={m.id === mode.id ? "selected" : ""}
              onClick={() => setModeId(m.id)}
            >
              {m.name}
            </button>
          ))}
          <button
            onClick={addMode}
            disabled={game.controller.modes.length >= 8}
          >
            + Mode
          </button>
        </nav>
        <div className="builder-actions">
          <button
            className="guide-help"
            aria-label="Replay controller studio guide"
            title="Replay tutorial"
            onClick={guide.show}
          >
            ?
          </button>
          <button
            onClick={() => {
              guide.close();
              onConnect();
            }}
          >
            Phones{state.pending.length ? " · " + state.pending.length : ""}
          </button>
          <button disabled={!undo.current.length} onClick={() => history()}>
            Undo
          </button>
          <button
            disabled={!redo.current.length}
            onClick={() => history(false)}
          >
            Redo
          </button>
          <button
            data-guide="studio-save"
            className="builder-primary"
            disabled={busy}
            onClick={() => void task(onSave)}
          >
            Save controller
          </button>
        </div>
      </header>
      {error && (
        <div className="builder-error" role="alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      <div className="studio-editor-body">
        <aside className="studio-palette">
          <Panel title="Add a control">
            {(
              [
                ["button", "Button"],
                ["stick", "Analog stick"],
                ["dpad", "D-pad +"],
                ["trigger", "Trigger / slider"],
                ["label", "Label / spacer"],
              ] as const
            ).map(([kind, label]) => (
              <button key={kind} onClick={() => add(kind)}>
                ＋ {label}
              </button>
            ))}
          </Panel>
          <Panel title="Mode">
            <label className="builder-field">
              Name
              <input
                value={mode.name}
                maxLength={32}
                onChange={(e) =>
                  commit((d) => {
                    d.controller.modes.find((m) => m.id === mode.id)!.name =
                      e.target.value;
                  })
                }
              />
            </label>
            <label className="builder-field">
              Start from preset
              <select value="" onChange={(e) => applyPreset(e.target.value)}>
                <option value="" disabled>
                  Choose template…
                </option>
                {["menu", "standard", "fight", "race"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {mode.id !== "menu" && (
              <button
                onClick={() => {
                  commit((d) => {
                    d.controller.modes = d.controller.modes.filter(
                      (m) => m.id !== mode.id,
                    );
                  });
                  setModeId("menu");
                }}
              >
                Delete this mode
              </button>
            )}
            <small>Preset replaces this mode. Undo restores it.</small>
          </Panel>
          <Panel title="Layers">
            {[...mode.controls].reverse().map((c) => (
              <button
                key={c.id}
                className={selected.includes(c.id) ? "selected" : ""}
                onClick={() => {
                  setSelected([c.id]);
                  if (c.variant !== "all") setVariant(c.variant);
                }}
              >
                {c.locked ? "🔒 " : ""}
                {c.label || c.kind}
                {c.group ? " · group" : ""}
              </button>
            ))}
          </Panel>
        </aside>
        <div className="studio-canvas-column" ref={canvasHost}>
          <div className="studio-canvas-tools">
            <label>
              View
              <select
                aria-label="View"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="design">Design · 960 × 540</option>
                {[
                  "568x320",
                  "640x360",
                  "844x390",
                  "915x412",
                  "320x568",
                  "390x844",
                  "412x915",
                  "1024x768",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Player
              <select
                aria-label="Player"
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>
                    P{p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select
                aria-label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="navigator">Navigator</option>
                <option value="player">Other player</option>
                <option value="host">PC preview</option>
              </select>
            </label>
            <label>
              Variant
              <select
                aria-label="Variant"
                value={variant}
                onChange={(e) => setVariant(e.target.value as any)}
              >
                <option value="assisted">Assisted</option>
                <option value="classic">Classic</option>
              </select>
            </label>
          </div>
          <div className="studio-canvas-scroll">
            <div
              className="studio-stage-shell"
              style={{
                width: device.w * viewScale,
                height: device.h * viewScale,
              }}
            >
              <div
                className="studio-design-stage"
                style={{
                  width: device.w,
                  height: device.h,
                  transform: `scale(${viewScale})`,
                  background: visibleTheme.background,
                }}
              >
                <StudioSurface
                  definition={game.controller}
                  modeId={mode.id}
                  slot={slot}
                  navigator={role === "navigator"}
                  hostPreview={role === "host"}
                  variant={variant}
                  enabled={size !== "design"}
                  readOnly={size === "design"}
                  observed={
                    preview
                      ? state.players.find((p) => p.slot === slot)?.studio
                      : undefined
                  }
                />
                {size === "design" && (
                  <div
                    className={
                      "studio-design-overlay " +
                      (game.controller.grid.visible ? "grid-visible" : "")
                    }
                    style={{
                      backgroundSize: `${game.controller.grid.size}px ${game.controller.grid.size}px`,
                    }}
                    onPointerDown={(e) => {
                      if (e.target === e.currentTarget) setSelected([]);
                    }}
                  >
                    {visible.map((c) => (
                      <div
                        key={c.id}
                        className={
                          "studio-edit-control " +
                          (selected.includes(c.id) ? "selected" : "") +
                          (c.locked ? " locked" : "")
                        }
                        style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
                        onPointerDown={(e) => begin(e, c)}
                        onPointerMove={drag}
                        onPointerUp={() => {
                          gesture.current = null;
                        }}
                        onPointerCancel={() => {
                          gesture.current = null;
                        }}
                        onLostPointerCapture={() => {
                          gesture.current = null;
                        }}
                      >
                        <span className="studio-control-name">
                          {c.label || c.kind}
                        </span>
                        {selected.includes(c.id) && !c.locked && (
                          <div
                            className="studio-resize"
                            aria-label="Resize control"
                            onPointerDown={(e) => begin(e, c, true)}
                            onPointerMove={drag}
                            onPointerUp={() => {
                              gesture.current = null;
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="studio-grid-toolbar">
            <label>
              <input
                type="checkbox"
                checked={game.controller.grid.visible}
                onChange={(e) =>
                  commit((d) => {
                    d.controller.grid.visible = e.target.checked;
                  })
                }
              />
              Show grid
            </label>
            <label>
              <input
                type="checkbox"
                checked={game.controller.grid.snap}
                onChange={(e) =>
                  commit((d) => {
                    d.controller.grid.snap = e.target.checked;
                  })
                }
              />
              Snap to grid
            </label>
            <NumberField
              label="Grid spacing"
              value={game.controller.grid.size}
              min={1}
              max={128}
              onChange={(v) =>
                commit((d) => {
                  d.controller.grid.size = Math.round(v);
                })
              }
            />
            <span>Shift-click: multi-select · Arrow keys: nudge</span>
          </div>
          <div className="studio-selection-tools">
            <button disabled={!selected.length} onClick={duplicate}>
              Duplicate
            </button>
            <button disabled={!selected.length} onClick={removeSelected}>
              Delete
            </button>
            <button
              disabled={selected.length < 2}
              onClick={() =>
                commit((d) => {
                  const id = "group-" + crypto.randomUUID().slice(0, 8);
                  d.controller.modes
                    .find((m) => m.id === mode.id)!
                    .controls.filter((c) => selected.includes(c.id))
                    .forEach((c) => (c.group = id));
                })
              }
            >
              Group
            </button>
            <button
              disabled={!selected.length}
              onClick={() =>
                commit((d) => {
                  d.controller.modes
                    .find((m) => m.id === mode.id)!
                    .controls.filter((c) => selected.includes(c.id))
                    .forEach((c) => delete c.group);
                })
              }
            >
              Ungroup
            </button>
            <button
              disabled={!selected.length}
              onClick={() =>
                commit((d) => {
                  const next = !active?.locked;
                  d.controller.modes
                    .find((m) => m.id === mode.id)!
                    .controls.filter((c) => selected.includes(c.id))
                    .forEach((c) => (c.locked = next));
                })
              }
            >
              {active?.locked ? "Unlock" : "Lock"}
            </button>
            <select
              aria-label="Align selected controls"
              value=""
              disabled={selected.length < 2}
              onChange={(e) => align(e.target.value)}
            >
              <option value="" disabled>
                Align / distribute
              </option>
              {[
                "left",
                "center",
                "right",
                "top",
                "middle",
                "bottom",
                "horizontal",
                "vertical",
              ].map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a, actionMap, "xbox")}
                </option>
              ))}
            </select>
          </div>
          <footer className="studio-canvas-footer">
            <button onClick={() => void togglePreview()}>
              {preview ? "End phone preview" : "Preview on my phone"}
            </button>
            <button
              onClick={() =>
                void task(async () => {
                  await libraryCall({ type: "end-preview" });
                  setPreview(false);
                  await onTest();
                })
              }
              disabled={busy}
            >
              Save & test in game
            </button>
            <small>
              {size === "design"
                ? "Edit selects controls; it never controls your game."
                : "Device simulation · drag controls to test locally. Safe areas are reserved on your actual phone."}
            </small>
          </footer>
        </div>
        <aside className="studio-inspector">
          <div className="studio-inspector-title">
            <span className="builder-kicker">INSPECTOR</span>
            <h3>{active?.label || "Controller appearance"}</h3>
            <div className="builder-tabs">
              <button
                className={tab === "appearance" ? "selected" : ""}
                onClick={() => setTab("appearance")}
              >
                Appearance
              </button>
              <button
                className={tab === "actions" ? "selected" : ""}
                onClick={() => setTab("actions")}
              >
                Actions
              </button>
            </div>
          </div>
          <section
            className="studio-canvas-colors"
            data-guide="canvas-background"
          >
            <h3>Canvas background</h3>
            <p>Base for every mode. Select a control below to edit its fill.</p>
            <ThemeFields
              fields={["background"]}
              value={game.controller.theme}
              effective={game.controller.theme}
              partial={false}
              onChange={(value) => setTheme(value, "base")}
              {...picker("canvas")}
            />
            <div className="builder-actions">
              <button onClick={() => void upload(false, true, "base")}>
                {game.controller.theme.backgroundImage
                  ? "Replace image"
                  : "Background image"}
              </button>
              {game.controller.theme.backgroundImage && (
                <button
                  onClick={() => {
                    const value = { ...game.controller.theme };
                    delete value.backgroundImage;
                    setTheme(value, "base");
                  }}
                >
                  Remove image
                </button>
              )}
            </div>
          </section>
          {tab === "appearance" ? (
            <>
              {active && (
                <section className="studio-control-colors">
                  <div className="context-color-title">
                    <span>SELECTED CONTROL</span>
                    <h3>Color &amp; fill</h3>
                    <small>{active.label || active.kind}</small>
                  </div>
                  <ThemeFields
                    controlOnly
                    value={active.theme}
                    effective={resolveTheme(
                      game.controller,
                      mode,
                      role === "navigator",
                      slot,
                      active,
                    )}
                    onChange={(theme) => patchControl({ theme })}
                    {...picker("control:" + active.id)}
                  />
                  <div className="builder-actions">
                    <button onClick={() => void upload()}>
                      Use button image…
                    </button>
                  </div>
                  <p>
                    Text and icon colors are separate. Uploaded images keep
                    their own colors.
                  </p>
                </section>
              )}
              <Panel title="Controller">
                <label className="builder-field">
                  Button labels
                  <select
                    value={game.controller.labels}
                    onChange={(e) =>
                      commit((d) => {
                        d.controller.labels = e.target.value as any;
                      })
                    }
                  >
                    <option value="xbox">Xbox style</option>
                    <option value="playstation">PlayStation style</option>
                    <option value="custom">Custom labels</option>
                  </select>
                </label>
                <small>
                  Label style changes appearance, not the native device type.
                </small>
                <label className="builder-check">
                  <input
                    type="checkbox"
                    checked={game.controller.allowPersonal}
                    onChange={(e) =>
                      commit((d) => {
                        d.controller.allowPersonal = e.target.checked;
                      })
                    }
                  />
                  Let players choose their layout variant
                </label>
              </Panel>
              {active && (
                <>
                  <Panel title="Selected control">
                    <label className="builder-field">
                      Label / accessible name
                      <input
                        value={active.label}
                        maxLength={64}
                        onChange={(e) =>
                          patchControl({ label: e.target.value })
                        }
                      />
                    </label>
                    <div className="builder-two">
                      <label className="builder-field">
                        Shape
                        <select
                          data-guide="control-shape"
                          aria-label="Shape"
                          value={active.shape}
                          onChange={(e) =>
                            patchControl({ shape: e.target.value as any })
                          }
                        >
                          {[
                            ["circle", "Circle"],
                            ["square", "Square"],
                            ["triangle", "Triangle"],
                            ["rounded", "Rounded rectangle"],
                            ["pill", "Pill"],
                          ].map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <NumberField
                        label="Corner radius"
                        value={active.radius}
                        min={0}
                        max={100}
                        onChange={(v) => patchControl({ radius: v })}
                      />
                    </div>
                    <div className="builder-two">
                      {(
                        [
                          ["x", "Left", 0, 960],
                          ["y", "Top", 0, 540],
                          ["w", "Width", 44, 960],
                          ["h", "Height", 44, 540],
                        ] as const
                      ).map(([key, label, min, max]) => (
                        <NumberField
                          key={key}
                          label={label}
                          value={active[key]}
                          min={min}
                          max={max}
                          onChange={(v) => patchControl({ [key]: v })}
                        />
                      ))}
                    </div>
                    <small>
                      Logical design units. Phone previews fit inside their
                      usable viewport.
                    </small>
                  </Panel>
                  <Panel title="Button content">
                    <label className="builder-field">
                      Show
                      <select
                        aria-label="Show"
                        value={active.display}
                        onChange={(e) =>
                          patchControl({ display: e.target.value as any })
                        }
                      >
                        <option value="icon">Icon only</option>
                        <option value="icon-text">Icon + text</option>
                        <option value="text">Text only</option>
                        <option value="image">Custom image</option>
                      </select>
                    </label>
                    {(active.display === "icon" ||
                      active.display === "icon-text") && (
                      <button onClick={() => setIconOpen(true)}>
                        Choose icon · {active.icon}
                      </button>
                    )}
                    {active.display === "image" && (
                      <div className="builder-actions">
                        <button onClick={() => void upload()}>
                          Upload image
                        </button>
                        {active.image && (
                          <button
                            onClick={() =>
                              setCrop({
                                source: active.imageSource ?? active.image!,
                                pressed: false,
                                initial:
                                  active.imageSource && active.imageCrop
                                    ? {
                                        source: active.imageSource,
                                        asset: active.image!,
                                        crop: active.imageCrop,
                                        fit: active.fit,
                                      }
                                    : undefined,
                              })
                            }
                          >
                            Re-crop
                          </button>
                        )}
                        <button onClick={() => void upload(true)}>
                          Pressed image
                        </button>
                      </div>
                    )}
                    {(active.image || active.pressedImage) && (
                      <div className="builder-actions">
                        {active.image && (
                          <button aria-label="Remove button image" onClick={() => removeButtonImage()}>
                            Remove image
                          </button>
                        )}
                        {active.pressedImage && (
                          <button onClick={() => removeButtonImage(true)}>
                            Remove pressed image
                          </button>
                        )}
                      </div>
                    )}
                    {active.display === "image" && (
                      <label className="builder-field">
                        Image fit
                        <select
                          aria-label="Button image fit"
                          value={active.fit}
                          onChange={(e) =>
                            patchControl({
                              fit: e.target.value as "cover" | "contain",
                            })
                          }
                        >
                          <option value="cover">Fill · cover button</option>
                          <option value="contain">
                            Fit · keep proportions
                          </option>
                        </select>
                        <small>
                          The image is clipped to the selected button shape.
                        </small>
                      </label>
                    )}
                    <div className="builder-two">
                      <NumberField
                        label="Icon size"
                        value={active.iconSize}
                        min={8}
                        max={160}
                        onChange={(v) => patchControl({ iconSize: v })}
                      />
                      <NumberField
                        label="Text size"
                        value={active.fontSize}
                        min={8}
                        max={72}
                        onChange={(v) => patchControl({ fontSize: v })}
                      />
                    </div>
                    <NumberField
                      label="Opacity"
                      value={active.opacity}
                      min={0.15}
                      max={1}
                      step={0.05}
                      onChange={(v) => patchControl({ opacity: v })}
                    />
                  </Panel>
                </>
              )}
              <details className="studio-theme-advanced">
                <summary>Role &amp; player themes</summary>{" "}
                <Panel title="Theme target">
                  <label className="builder-field">
                    Edit theme for
                    <select
                      data-guide="theme-scope"
                      value={themeScope}
                      onChange={(e) => {
                        const scope = e.target.value;
                        setThemeScope(scope);
                        if (["navigator", "player", "host"].includes(scope))
                          setRole(scope);
                        if (scope.startsWith("slot-"))
                          setSlot(Number(scope.slice(5)));
                      }}
                    >
                      <option value="control" disabled={!active}>
                        Selected control
                      </option>
                      <option value="base">Controller base</option>
                      <option value="mode">This mode</option>
                      <option value="navigator">Navigator</option>
                      <option value="player">Other players</option>
                      {[1, 2, 3, 4].map((p) => (
                        <option key={p} value={"slot-" + p}>
                          Player {p} override
                        </option>
                      ))}
                      <option value="host">Host preview</option>
                    </select>
                  </label>
                  {themeScope === "control" &&
                    active?.theme.backgroundImage && (
                      <button
                        onClick={() => {
                          commit((d) => {
                            const m = d.controller.modes.find(
                                (m) => m.id === mode.id,
                              )!,
                              c = m.controls.find((c) => c.id === active.id)!;
                            m.theme.backgroundImage = c.theme.backgroundImage;
                            delete c.theme.backgroundImage;
                          });
                          setThemeScope("mode");
                        }}
                      >
                        Use existing image as mode background
                      </button>
                    )}
                  <ThemeFields
                    {...picker("theme:" + themeScope)}
                    key={themeScope}
                    value={themeValue()}
                    effective={resolveTheme(
                      game.controller,
                      mode,
                      role === "navigator",
                      slot,
                      themeScope === "control" ? active : undefined,
                    )}
                    controlOnly={themeScope === "control"}
                    partial={themeScope !== "base"}
                    onChange={(value) => setTheme(value)}
                  />
                  <small>
                    Text color changes labels. Icon color changes built-in icons
                    and direction symbols. Uploaded images keep their original
                    colors. Pressed colors apply while held.
                  </small>
                  {themeScope === "control" ? (
                    <p className="builder-hint">
                      Button fill colors this control. To add an image to a
                      button, use Button content.{" "}
                      <button onClick={() => setThemeScope("mode")}>
                        Edit mode background
                      </button>
                    </p>
                  ) : (
                    <div className="builder-actions">
                      <button onClick={() => void upload(false, true)}>
                        Background image
                      </button>
                      <button
                        onClick={() => {
                          const next = { ...themeValue() };
                          delete next.backgroundImage;
                          setTheme(next);
                        }}
                      >
                        Clear background
                      </button>
                    </div>
                  )}
                  <small>
                    Role colors follow the current Navigator. Player identity
                    and permissions remain separate.
                  </small>
                </Panel>{" "}
              </details>
            </>
          ) : active ? (
            <>
              <Panel title="How it behaves">
                {active.kind === "button" ? (
                  <>
                    <strong>While held, also hold…</strong>
                    <div className="studio-action-checks">
                      {actions.map((a) => (
                        <label key={a}>
                          <input
                            type="checkbox"
                            checked={active.actions.includes(a)}
                            disabled={
                              !active.actions.includes(a) &&
                              active.actions.length >= 8
                            }
                            onChange={(e) =>
                              patchControl({
                                actions: e.target.checked
                                  ? [...active.actions, a]
                                  : active.actions.filter((x) => x !== a),
                              })
                            }
                          />
                          {actionLabel(
                            a,
                            actionMap,
                            game.controller.labels === "playstation"
                              ? "playstation"
                              : game.inputMethod === "keyboard"
                                ? "keyboard"
                                : "xbox",
                          )}
                        </label>
                      ))}
                    </div>
                    <small>
                      Select physical inputs to hold together, such as RT + B.
                      Their function depends on the game’s bindings. Both
                      release together, without releasing another held source.
                    </small>
                  </>
                ) : (
                  <div className="builder-two">
                    {(["axisX", "axisY"] as const).map((key) => (
                      <label className="builder-field" key={key}>
                        {key === "axisX"
                          ? "Horizontal / trigger action"
                          : "Vertical action"}
                        <select
                          value={active[key] ?? ""}
                          onChange={(e) =>
                            patchControl({ [key]: e.target.value || undefined })
                          }
                        >
                          <option value="">Not assigned</option>
                          {actions.map((a) => (
                            <option key={a} value={a}>
                              {actionLabel(a, actionMap, "xbox")}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                <div className="builder-actions">
                  <input
                    aria-label="New action name"
                    placeholder="New action…"
                    value={newAction}
                    maxLength={32}
                    onChange={(e) => setNewAction(e.target.value)}
                  />
                  <button
                    disabled={!newAction.trim()}
                    onClick={() => {
                      const id =
                        "action-" +
                        newAction
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/-+$/, "");
                      if (!id || id === "action-") return;
                      binding(id, []);
                      setNewAction("");
                    }}
                  >
                    Add action
                  </button>
                </div>
                <label className="builder-field">
                  Show in variant
                  <select
                    value={active.variant}
                    onChange={(e) =>
                      patchControl({ variant: e.target.value as any })
                    }
                  >
                    <option value="all">Both variants</option>
                    <option value="classic">Classic only</option>
                    <option value="assisted">Assisted only</option>
                  </select>
                </label>
                {["stick", "dpad"].includes(active.kind) && (
                  <>
                    <NumberField
                      label="Dead zone"
                      value={active.deadZone}
                      min={0}
                      max={0.6}
                      step={0.01}
                      onChange={(v) => patchControl({ deadZone: v })}
                    />
                    {active.kind === "dpad" ? (
                      <label className="builder-field">
                        Directions
                        <select
                          value={active.ways}
                          onChange={(e) =>
                            patchControl({
                              ways: Number(e.target.value) as 4 | 8,
                            })
                          }
                        >
                          <option value={4}>4 way</option>
                          <option value={8}>8 way · diagonals</option>
                        </select>
                      </label>
                    ) : (
                      <label className="builder-check">
                        <input
                          type="checkbox"
                          checked={active.floating}
                          onChange={(e) =>
                            patchControl({ floating: e.target.checked })
                          }
                        />
                        Floating analog center
                      </label>
                    )}
                  </>
                )}
                {active.kind === "button" && (
                  <label className="builder-field">
                    Slide-between-buttons group
                    <input
                      placeholder="Empty = hold original button"
                      maxLength={32}
                      value={active.slideGroup ?? ""}
                      onChange={(e) =>
                        patchControl({
                          slideGroup:
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "") || undefined,
                        })
                      }
                    />
                  </label>
                )}
                <NumberField
                  label="Press vibration (ms)"
                  value={active.feedback}
                  min={0}
                  max={100}
                  onChange={(v) => patchControl({ feedback: Math.round(v) })}
                />
                <small>
                  Press feedback, not collision detection. Each phone can turn
                  it off.
                </small>
              </Panel>
              <Panel title={"Output bindings · Player " + slot}>
                <button
                  data-guide="visual-binding"
                  onClick={() => setVisualOpen(true)}
                >
                  Visual binding · choose on a diagram
                </button>
                <small>
                  Optional visual editor: Xbox, PlayStation or full keyboard.
                  The fields below are the advanced editor.
                </small>
                <label className="builder-field">
                  Input method
                  <select
                    data-guide="studio-output"
                    value={game.inputMethod}
                    onChange={(e) =>
                      commit((d) => {
                        d.inputMethod = e.target.value as any;
                      })
                    }
                  >
                    <option value="gamepad">Virtual gamepad</option>
                    <option value="keyboard">Keyboard</option>
                  </select>
                </label>
                <small>
                  {game.inputMethod === "gamepad"
                    ? "Each player gets a separate virtual controller. The optional PC driver must be available."
                    : "Keys are configured on this PC. Your phone keeps its gamepad layout. Separate keys do not guarantee multiple keyboard players."}
                </small>
                {[...new Set(selectedActions)].map((action) => (
                  <div className="studio-binding" key={action}>
                    <h4>{actionLabel(action, actionMap, "xbox")}</h4>
                    {(actionMap[action] ?? []).map((output, index) => (
                      <div className="studio-output" key={index}>
                        <select
                          aria-label={action + " output type"}
                          value={output.kind}
                          onChange={(e) =>
                            updateOutput(
                              action,
                              index,
                              e.target.value === "button"
                                ? { kind: "button", code: "a" }
                                : e.target.value === "axis"
                                  ? { kind: "axis", code: "rt", value: 1 }
                                  : e.target.value === "button-axis"
                                    ? {
                                        kind: "button-axis",
                                        negative: "left",
                                        positive: "right",
                                      }
                                    : e.target.value === "key-axis"
                                      ? {
                                          kind: "key-axis",
                                          negative: "ArrowLeft",
                                          positive: "ArrowRight",
                                        }
                                      : e.target.value === "key-direction"
                                        ? {
                                            kind: "key-direction",
                                            code: "W",
                                            value: 1,
                                          }
                                        : { kind: "key", code: "Space" },
                            )
                          }
                        >
                          {game.inputMethod === "gamepad" ? (
                            <>
                              <option value="button">Gamepad button</option>
                              <option value="axis">Axis / trigger</option>
                              <option value="button-axis">
                                Directional buttons
                              </option>
                            </>
                          ) : (
                            <>
                              <option value="key">Key</option>
                              <option value="key-direction">
                                Directional key
                              </option>
                              <option value="key-axis">
                                Negative / positive keys
                              </option>
                            </>
                          )}
                        </select>
                        {output.kind === "button" ? (
                          <select
                            aria-label={action + " button"}
                            value={output.code}
                            onChange={(e) =>
                              updateOutput(action, index, {
                                ...output,
                                code: e.target.value,
                              })
                            }
                          >
                            {PAD_BUTTONS.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        ) : output.kind === "axis" ? (
                          <>
                            <select
                              aria-label={action + " axis"}
                              value={output.code}
                              onChange={(e) =>
                                updateOutput(action, index, {
                                  ...output,
                                  code: e.target.value as any,
                                })
                              }
                            >
                              {["lx", "ly", "rx", "ry", "lt", "rt"].map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                            <NumberField
                              label="Amount / scale"
                              value={output.value}
                              min={-1}
                              max={1}
                              step={0.1}
                              onChange={(v) =>
                                updateOutput(action, index, {
                                  ...output,
                                  value: v,
                                })
                              }
                            />
                          </>
                        ) : output.kind === "key" ||
                          output.kind === "key-direction" ? (
                          <>
                            {output.kind === "key-direction" && (
                              <select
                                aria-label="Axis direction"
                                value={output.value}
                                onChange={(e) =>
                                  updateOutput(action, index, {
                                    ...output,
                                    value: Number(e.target.value) as -1 | 1,
                                  })
                                }
                              >
                                <option value={-1}>Negative direction</option>
                                <option value={1}>Positive direction</option>
                              </select>
                            )}
                            <select
                              aria-label={action + " key"}
                              value={output.code}
                              onChange={(e) =>
                                updateOutput(action, index, {
                                  ...output,
                                  code: e.target.value,
                                })
                              }
                            >
                              {KEYS.map((k) => (
                                <option key={k}>{k}</option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <>
                            {(["negative", "positive"] as const).map((key) => (
                              <select
                                key={key}
                                aria-label={action + " " + key + " key"}
                                value={output[key]}
                                onChange={(e) =>
                                  updateOutput(action, index, {
                                    ...output,
                                    [key]: e.target.value,
                                  })
                                }
                              >
                                {(output.kind === "button-axis"
                                  ? PAD_BUTTONS
                                  : KEYS
                                ).map((k) => (
                                  <option key={k}>{k}</option>
                                ))}
                              </select>
                            ))}
                          </>
                        )}
                        <button
                          aria-label="Remove output"
                          onClick={() =>
                            binding(
                              action,
                              (actionMap[action] ?? []).filter(
                                (_, i) => i !== index,
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {!(actionMap[action] ?? []).length && (
                      <small className="builder-warning">
                        Not assigned. Choose an output before testing this
                        action.
                      </small>
                    )}
                    <button
                      disabled={(actionMap[action] ?? []).length >= 8}
                      onClick={() =>
                        binding(action, [
                          ...(actionMap[action] ?? []),
                          game.inputMethod === "gamepad"
                            ? { kind: "button", code: "a" }
                            : { kind: "key", code: "Space" },
                        ])
                      }
                    >
                      + Output
                    </button>
                  </div>
                ))}
              </Panel>
            </>
          ) : (
            <Panel title="Choose a control">
              <p>
                Select a button, analog or D-pad to edit its actions and
                player-specific output.
              </p>
            </Panel>
          )}
        </aside>
      </div>
      {guide.open && !iconOpen && !crop && !visualOpen && (
        <SpotlightGuide
          label="Controller Studio"
          steps={guideSteps}
          onClose={guide.close}
        />
      )}
      {visualOpen && active && (
        <EditorBoundary onClose={() => setVisualOpen(false)}>
          <VisualBinding
            game={game}
            modeId={mode.id}
            controlId={active.id}
            initialSlot={slot}
            onCommit={commit}
            onClose={() => setVisualOpen(false)}
          />
        </EditorBoundary>
      )}
      {iconOpen && active && (
        <EditorBoundary onClose={() => setIconOpen(false)}>
          <IconPicker
            value={active.icon}
            onClose={() => setIconOpen(false)}
            onChoose={(id) => {
              patchControl({ icon: id });
              setIconOpen(false);
            }}
          />
        </EditorBoundary>
      )}
      {crop && (
        <CropEditor
          source={crop.source}
          purpose={(crop as any).background ? "banner" : "button"}
          initial={crop.initial}
          previewShape={(crop as any).background ? undefined : active?.shape}
          previewAspect={
            (crop as any).background
              ? undefined
              : active
                ? active.w / active.h
                : undefined
          }
          previewRadius={
            active
              ? {
                  x:
                    (Math.min(active.radius, active.w / 2, active.h / 2) /
                      active.w) *
                    100,
                  y:
                    (Math.min(active.radius, active.w / 2, active.h / 2) /
                      active.h) *
                    100,
                }
              : undefined
          }
          onClose={() => setCrop(null)}
          onApply={(art) => {
            if ((crop as any).background)
              setTheme(
                {
                  ...themeValue((crop as any).backgroundScope),
                  backgroundImage: art.asset,
                },
                (crop as any).backgroundScope,
              );
            else if (crop.pressed)
              patchControl({
                pressedImage: art.asset,
                pressedImageSource: art.source,
                pressedImageCrop: art.crop,
              });
            else
              patchControl({
                image: art.asset,
                imageSource: art.source,
                imageCrop: art.crop,
                display: "image",
                fit: art.fit,
              });
            setCrop(null);
          }}
        />
      )}
    </section>
  );
}
