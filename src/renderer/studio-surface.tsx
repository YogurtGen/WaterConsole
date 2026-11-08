import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as PE,
} from "react";
import {
  fitControls,
  radialValues,
  resolveTheme,
} from "../shared/studio-engine";
import type {
  ControllerDefinition,
  StudioControl,
  StudioInput,
} from "../shared/studio-model";
export const hostAsset = (id?: string) =>
  id ? `waterconsole://app/user-assets/${id}` : undefined;
export function ControllerGlyph({
  id,
  size = 28,
}: {
  id: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="controller-glyph"
      style={{
        width: size,
        height: size,
        maskImage: `url(/assets/controller-icons/${id}.svg)`,
        WebkitMaskImage: `url(/assets/controller-icons/${id}.svg)`,
      }}
    />
  );
}
interface Props {
  hostPreview?: boolean;
  readOnly?: boolean;
  definition: ControllerDefinition;
  modeId: string;
  slot?: number;
  navigator?: boolean;
  variant?: "classic" | "assisted";
  epoch?: number;
  enabled?: boolean;
  mirror?: boolean;
  onInput?: (input: StudioInput) => void;
  onPress?: (duration: number) => void;
  asset?: (id: string) => string | undefined;
  observed?: StudioInput;
}
export function StudioSurface({
  definition,
  modeId,
  slot = 1,
  navigator = false,
  variant = "classic",
  epoch = 0,
  enabled = true,
  readOnly = false,
  hostPreview = false,
  mirror = false,
  onInput,
  onPress,
  asset = hostAsset,
  observed,
}: Props) {
  const root = useRef<HTMLDivElement>(null),
    widgets = useRef(new Map<string, HTMLElement>());
  const pointers = useRef(
    new Map<
      number,
      {
        controlId: string;
        originalId: string;
        group?: string;
        center?: { x: number; y: number };
      }
    >(),
  );
  const values = useRef<Record<string, { x: number; y: number }>>({});
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [input, setInput] = useState<StudioInput>({
    revision: definition.revision,
    modeId,
    variant,
    pressed: [],
    values: {},
  });
  const callback = useRef(onInput);
  callback.current = onInput;
  const press = useRef(onPress);
  press.current = onPress;
  const mode =
    definition.modes.find((m) => m.id === modeId) ?? definition.modes[0];
  const theme = {
    ...resolveTheme(definition, mode, navigator, slot),
    ...(hostPreview ? definition.hostTheme : {}),
  };
  const fitted = useMemo(
    () => fitControls(mode.controls, size.width, size.height, variant),
    [mode, size.width, size.height, variant],
  );
  const emit = useCallback(() => {
    const pressed = [
      ...new Set(
        [...pointers.current.values()]
          .map((p) => p.controlId)
          .filter((id) =>
            mode.controls.some((c) => c.id === id && c.kind === "button"),
          ),
      ),
    ];
    const next = {
      revision: definition.revision,
      modeId: mode.id,
      variant,
      pressed,
      values: structuredClone(values.current),
    };
    setInput(next);
    callback.current?.(next);
  }, [definition.revision, mode, variant]);
  const neutral = useCallback(() => {
    pointers.current.clear();
    values.current = {};
    emit();
  }, [emit]);
  const resetRef = useRef(neutral);
  resetRef.current = neutral;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      resetRef.current();
      setSize({ width: Math.floor(r.width), height: Math.floor(r.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    neutral();
  }, [
    epoch,
    definition.revision,
    modeId,
    variant,
    enabled,
    size.width,
    size.height,
    mirror,
  ]);
  useEffect(() => {
    const clear = () => neutral();
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("orientationchange", clear);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("orientationchange", clear);
      pointers.current.clear();
      values.current = {};
      callback.current?.({
        revision: definition.revision,
        modeId: mode.id,
        variant,
        pressed: [],
        values: {},
      });
    };
  }, [neutral]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (!document.hidden && document.hasFocus()) emit();
    }, 100);
    return () => clearInterval(timer);
  }, [enabled, emit]);
  function remove(pointer: number) {
    const owner = pointers.current.get(pointer);
    if (!owner) return;
    pointers.current.delete(pointer);
    if (
      ![...pointers.current.values()].some(
        (p) => p.controlId === owner.controlId,
      )
    )
      delete values.current[owner.controlId];
    emit();
  }
  function move(e: PE<HTMLElement>, control: StudioControl) {
    const pointer = pointers.current.get(e.pointerId);
    if (!pointer) return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
      remove(e.pointerId);
      return;
    }
    if (control.kind === "button") {
      if (pointer.group) {
        const next = mode.controls.find(
          (c) =>
            c.kind === "button" &&
            c.slideGroup === pointer.group &&
            c.variant !== (variant === "classic" ? "assisted" : "classic") &&
            (() => {
              const r = widgets.current.get(c.id)?.getBoundingClientRect();
              return (
                !!r &&
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              );
            })(),
        );
        const id = next?.id ?? "";
        if (id !== pointer.controlId) {
          pointer.controlId = id;
          emit();
          if (next) press.current?.(next.feedback);
        }
      }
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    let x = 0,
      y = 0;
    if (control.kind === "trigger")
      x =
        rect.height > rect.width
          ? 1 - (e.clientY - rect.top) / rect.height
          : (e.clientX - rect.left) / rect.width;
    else {
      const center = pointer.center ?? {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      x = (e.clientX - center.x) / (Math.min(rect.width, rect.height) / 2);
      y = (center.y - e.clientY) / (Math.min(rect.width, rect.height) / 2);
    }
    values.current[control.id] =
      control.kind === "trigger"
        ? { x: Math.max(0, Math.min(1, x)), y: 0 }
        : radialValues(
            x,
            y,
            control.deadZone,
            control.kind === "dpad" ? control.ways : undefined,
          );
    emit();
  }
  function down(e: PE<HTMLElement>, control: StudioControl) {
    if (
      !enabled ||
      control.kind === "label" ||
      (e.pointerType === "mouse" && e.button !== 0) ||
      [...pointers.current.values()].some(
        (p) => p.controlId === control.id && control.kind !== "button",
      )
    )
      return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const center =
      control.floating && control.kind === "stick"
        ? { x: e.clientX, y: e.clientY }
        : undefined;
    pointers.current.set(e.pointerId, {
      controlId: control.id,
      originalId: control.id,
      group: control.slideGroup,
      center,
    });
    if (control.kind === "button") emit();
    else move(e, control);
    press.current?.(control.feedback);
  }
  const shown = observed ?? input;
  return (
    <div
      ref={root}
      className={`studio-surface ${enabled || readOnly ? "" : "is-paused"}`}
      style={{
        background: theme.background,
        ...(theme.backgroundImage
          ? { backgroundImage: `url(${asset(theme.backgroundImage)})` }
          : {}),
      }}
      role="group"
      aria-label={mode.name + " controller"}
    >
      {fitted.error ? (
        <div className="studio-fit-message">
          <strong>Let's give your controls more room.</strong>
          <p>{fitted.error}</p>
        </div>
      ) : (
        fitted.items.map(({ control: c, x, y, w, h }) => {
          const colors = {
              ...resolveTheme(definition, mode, navigator, slot, c),
              ...(hostPreview ? definition.hostTheme : {}),
            },
            held =
              shown.pressed.includes(c.id) ||
              Math.hypot(
                shown.values[c.id]?.x ?? 0,
                shown.values[c.id]?.y ?? 0,
              ) > 0.01;
          const image = asset(
            held && c.pressedImage ? c.pressedImage : (c.image ?? ""),
          );
          const value = shown.values[c.id] ?? { x: 0, y: 0 };
          const label =
            definition.labels === "playstation"
              ? ((
                  {
                    A: "×",
                    B: "○",
                    X: "□",
                    Y: "△",
                    LB: "L1",
                    RB: "R1",
                    LT: "L2",
                    RT: "R2",
                  } as Record<string, string>
                )[c.label] ?? c.label)
              : c.label;
          const style = {
            left: mirror ? size.width - x - w : x,
            top: y,
            width: w,
            height: h,
            opacity: c.opacity,
            "--control-bg": held
              ? colors.pressed
              : enabled || readOnly
                ? colors.button
                : colors.disabled,
            "--control-fg": held
              ? (colors.pressedText ?? colors.background)
              : colors.text,
            "--control-icon": held
              ? (colors.pressedIcon ?? colors.pressedText ?? colors.background)
              : (colors.icon ?? colors.text),
            "--control-border": colors.border,
            "--control-focus": colors.focus,
            "--control-radius":
              c.shape === "circle" || c.shape === "pill"
                ? "999px"
                : c.shape === "square"
                  ? "0px"
                  : c.radius + "px",
            fontSize: Math.max(10, Math.min(c.fontSize, h * 0.27)),
          } as CSSProperties;
          return (
            <button
              key={c.id}
              data-layout-id={c.id}
              ref={(el) => {
                if (el) widgets.current.set(c.id, el);
                else widgets.current.delete(c.id);
              }}
              className={`studio-widget shape-${c.shape} kind-${c.kind} ${held ? "is-held" : ""}`}
              style={style}
              aria-label={c.label || c.actions.join(", ") || c.kind}
              aria-disabled={!enabled}
              tabIndex={enabled && c.kind !== "label" ? 0 : -1}
              onPointerDown={(e) => down(e, c)}
              onPointerMove={(e) => move(e, c)}
              onPointerUp={(e) => remove(e.pointerId)}
              onPointerCancel={(e) => remove(e.pointerId)}
              onLostPointerCapture={(e) => remove(e.pointerId)}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (
                  !enabled ||
                  c.kind !== "button" ||
                  ![" ", "Enter"].includes(e.key) ||
                  e.repeat
                )
                  return;
                e.preventDefault();
                pointers.current.set(-1, { controlId: c.id, originalId: c.id });
                emit();
                press.current?.(c.feedback);
              }}
              onKeyUp={(e) => {
                if ([" ", "Enter"].includes(e.key)) remove(-1);
              }}
              onBlur={() => {
                if (pointers.current.get(-1)?.controlId === c.id) remove(-1);
              }}
            >
              <span className="studio-widget-body" />
              {c.kind === "stick" ? (
                <>
                  <span className="studio-stick-ring" />
                  <span
                    className="studio-stick-knob"
                    style={{
                      transform: `translate(${value.x * w * 0.28}px,${-value.y * h * 0.28}px)`,
                      background: colors.accent,
                    }}
                  />
                  <span className="studio-control-caption">{label}</span>
                </>
              ) : c.kind === "dpad" ? (
                <>
                  <span className="studio-cross" />
                  <span
                    className={`studio-dir north ${value.y > 0.3 ? "active" : ""}`}
                  >
                    ▲
                  </span>
                  <span
                    className={`studio-dir south ${value.y < -0.3 ? "active" : ""}`}
                  >
                    ▼
                  </span>
                  <span
                    className={`studio-dir west ${value.x < -0.3 ? "active" : ""}`}
                  >
                    ◀
                  </span>
                  <span
                    className={`studio-dir east ${value.x > 0.3 ? "active" : ""}`}
                  >
                    ▶
                  </span>
                  <span className="studio-pad-center" />
                </>
              ) : (
                <>
                  {c.kind === "trigger" && (
                    <span
                      className="studio-trigger-fill"
                      style={{
                        width: value.x * 100 + "%",
                        background: colors.accent,
                      }}
                    />
                  )}
                  <span
                    className={
                      "studio-label-content" +
                      (c.display === "image" && image
                        ? " studio-image-content"
                        : "")
                    }
                  >
                    {c.display === "image" && image ? (
                      <img
                        draggable={false}
                        src={image}
                        alt=""
                        style={{ objectFit: c.fit }}
                      />
                    ) : c.display === "icon" || c.display === "icon-text" ? (
                      <ControllerGlyph
                        id={c.icon}
                        size={Math.min(c.iconSize, w * 0.5, h * 0.45)}
                      />
                    ) : null}
                    {(c.display === "text" ||
                      c.display === "icon-text" ||
                      (c.display === "image" && !image)) && (
                      <span>{label}</span>
                    )}
                  </span>
                </>
              )}
            </button>
          );
        })
      )}
      {fitted.compact && !fitted.error && (
        <span className="studio-compact-note">Compact fit</span>
      )}
    </div>
  );
}
