import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  COLOR,
  DEFAULT_THEME,
  type LibraryCommand,
  type LibraryResult,
  type Theme,
} from "../shared/studio-model";
export async function libraryCall(
  command: LibraryCommand,
): Promise<LibraryResult | null> {
  const api = window.waterconsole?.library;
  if (!api)
    throw new Error(
      "The library editor is unavailable. Update the desktop app.",
    );
  const result = await api(command);
  if (!result.ok) {
    if (result.error) throw new Error(result.error);
    return null;
  }
  return result;
}
export function trapDialog(
  event: KeyboardEvent<HTMLElement>,
  close?: () => void,
) {
  if (event.key === "Escape" && close) {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
    ),
  ].filter((el) => el.getClientRects().length > 0);
  if (!items.length) return;
  const first = items[0],
    last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => {
    const parsed = Number(text);
    if (Number.isFinite(parsed) && text.trim()) {
      const v = Math.max(min, Math.min(max, parsed));
      onChange(v);
      setText(String(v));
    } else setText(String(value));
  };
  return (
    <label className="builder-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
    </label>
  );
}
export const THEME_LABELS: Record<
  keyof Omit<Theme, "backgroundImage">,
  string
> = {
  background: "Background",
  panel: "Panels",
  button: "Button fill",
  text: "Text color",
  icon: "Icon color",
  border: "Borders",
  accent: "Analog knob / accent",
  pressed: "Pressed fill",
  disabled: "Disabled fill",
  focus: "Focus ring",
  pressedText: "Pressed text color",
  pressedIcon: "Pressed icon color",
};
function ColorField({
  label,
  value,
  onChange,
  onReset,
  inherited,
}: {
  inherited: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
  onReset?: () => void;
}) {
  const [hex, setHex] = useState(value ?? "");
  useEffect(() => setHex(value ?? ""), [value]);
  const apply = () => {
    if (COLOR.test(hex) && hex !== value) onChange(hex);
    else setHex(value ?? "");
  };
  return (
    <div className="builder-color">
      <span>
        {label}
        {!value && <small>Inherited</small>}
      </span>
      <div>
        <input
          aria-label={label + " color"}
          type="color"
          value={(value ?? inherited).slice(0, 7)}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
        <input
          aria-label={label + " HEX"}
          value={hex}
          placeholder={inherited}
          maxLength={9}
          onChange={(e) => {
            const v = e.target.value;
            setHex(v);
            if (COLOR.test(v)) onChange(v);
          }}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
        {onReset && (
          <button type="button" aria-label={"Reset " + label} onClick={onReset}>
            ↺
          </button>
        )}
      </div>
      <div className="color-presets">
        {[
          "#83e8b3",
          "#ffcf73",
          "#94c9ff",
          "#d5a8ff",
          "#f48791",
          "#f0f5ed",
          "#14221c",
          "#304737",
        ].map((c) => (
          <button
            type="button"
            key={c}
            aria-label={label + " preset " + c}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}
export type ThemeColorKey = keyof Omit<Theme, "backgroundImage">;
export function ThemeFields({
  value,
  onChange,
  partial = true,
  effective = DEFAULT_THEME,
  controlOnly = false,
  fields,
  editing,
  onEditingChange,
}: {
  value: Partial<Theme>;
  onChange: (theme: Partial<Theme>) => void;
  partial?: boolean;
  effective?: Theme;
  controlOnly?: boolean;
  fields?: ThemeColorKey[];
  editing?: ThemeColorKey | null;
  onEditingChange?: (key: ThemeColorKey | null) => void;
}) {
  const [state, setState] = useState<"normal" | "pressed">("normal"),
    [localEditing, setLocalEditing] = useState<ThemeColorKey | null>(null);
  const editorRef=useRef<HTMLDivElement>(null);
  const selected = editing === undefined ? localEditing : editing,
    select = onEditingChange ?? setLocalEditing;
  useEffect(()=>{if(selected)editorRef.current?.scrollIntoView({block:'nearest',inline:'nearest'});},[selected]);
  const inherited = (key: ThemeColorKey) =>
    effective[key] ??
    (key === "icon"
      ? effective.text
      : key === "pressedIcon"
        ? (effective.pressedText ?? effective.background)
        : DEFAULT_THEME.button);
  const main: ThemeColorKey[] =
    fields ??
    (state === "normal"
      ? controlOnly
        ? ["button", "text", "icon"]
        : ["background", "button", "text", "icon"]
      : ["pressed", "pressedText", "pressedIcon"]);
  const extra: ThemeColorKey[] = controlOnly
    ? ["border", "accent", "disabled", "focus"]
    : ["panel", "border", "accent", "disabled", "focus"];
  const tile = (key: ThemeColorKey) => (
    <button
      type="button"
      key={key}
      className={"theme-property " + (selected === key ? "selected" : "")}
      aria-label={"Edit " + THEME_LABELS[key]}
      aria-expanded={selected === key}
      onClick={() => select(selected === key ? null : key)}
    >
      <i style={{ background: value[key] ?? inherited(key) }} />
      <span>
        {(
          {
            button: "Fill",
            text: "Text",
            icon: "Icon",
            pressed: "Fill",
            pressedText: "Text",
            pressedIcon: "Icon",
            background: "Background",
          } as Partial<Record<ThemeColorKey, string>>
        )[key] ?? THEME_LABELS[key]}
      </span>
      <small>{value[key] ?? "Inherited"}</small>
    </button>
  );
  return (
    <div className="builder-theme-fields theme-compact">
      {!fields && (
        <div className="theme-state-tabs" role="group" aria-label="Color state">
          <button
            type="button"
            aria-pressed={state === "normal"}
            onClick={() => {
              setState("normal");
              select(null);
            }}
          >
            Normal
          </button>
          <button
            type="button"
            aria-pressed={state === "pressed"}
            onClick={() => {
              setState("pressed");
              select(null);
            }}
          >
            While pressed
          </button>
        </div>
      )}
      <div
        className={"theme-properties " + (fields?.length === 1 ? "single" : "")}
      >
        {main.map(tile)}
      </div>
      {!fields && (
        <details className="theme-more-colors">
          <summary>More colors</summary>
          <div className="theme-properties">{extra.map(tile)}</div>
        </details>
      )}
      {selected && (
        <div
          ref={editorRef}
          className="theme-color-editor"
          role="group"
          aria-label={THEME_LABELS[selected] + " picker"}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              select(null);
            }
          }}
        >
          <div className="theme-picker-heading">
            <span>Adjust color</span>
            <button
              type="button"
              aria-label="Close color picker"
              onClick={() => select(null)}
            >
              ×
            </button>
          </div>
          <ColorField
            key={selected}
            label={THEME_LABELS[selected]}
            inherited={inherited(selected)}
            value={value[selected]}
            onChange={(color) => onChange({ ...value, [selected]: color })}
            onReset={
              partial
                ? () => {
                    const next = { ...value };
                    delete next[selected];
                    onChange(next);
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="builder-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
