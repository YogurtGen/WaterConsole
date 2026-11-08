import { useEffect, useRef, useState } from "react";
import type { LocalGameRecord, OutputBinding } from "../shared/studio-model";
import {
  controlOutputs,
  expandOutputs,
  outputKey,
  outputLabel,
  outputUsage,
  setButtonOutputs,
  setAxisOutputs,
  uniqueOutputs,
  type DeviceDrawing,
} from "../shared/binding-tools";
import {
  gamepadModel,
  keyboardModel,
  type PadTarget,
} from "../shared/device-models";
import { trapDialog } from "./builder-primitives";
export function VisualBinding({
  game,
  modeId,
  controlId,
  initialSlot,
  onCommit,
  onClose,
}: {
  game: LocalGameRecord;
  modeId: string;
  controlId: string;
  initialSlot: number;
  onCommit: (fn: (draft: LocalGameRecord) => void) => void;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState(initialSlot),
    [id, setId] = useState(controlId),
    [device, setDevice] = useState<DeviceDrawing>(
      game.inputMethod === "keyboard"
        ? "keyboard"
        : game.controller.labels === "playstation"
          ? "playstation"
          : "xbox",
    ),
    [part, setPart] = useState<"x" | "y">("x"),
    [direction, setDirection] = useState<-1 | 1>(1),
    [hover, setHover] = useState(""),
    [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  const mode = game.controller.modes.find((m) => m.id === modeId)!,
    c =
      mode.controls.find((c) => c.id === id) ??
      mode.controls.find((c) => c.kind !== "label")!;
  if (!c) return null;
  const analog = c.kind !== "button",
    map = game.bindings[game.inputMethod][slot]?.[modeId] ?? {},
    axis = part === "x" ? c.axisX : c.axisY;
  const outputs = analog
      ? axis
        ? (map[axis] ?? [])
        : []
      : controlOutputs(game, modeId, slot, c),
    expanded = expandOutputs(outputs),
    selected = new Set(expanded.map(outputKey)),
    usage = outputUsage(game, modeId, slot, device);
  const write = (list: OutputBinding[]) => {
    if (list.length > 8) {
      setMessage(
        "A control can hold up to 8 outputs. Remove one before adding another.",
      );
      return;
    }
    setMessage("");
    onCommit((d) =>
      analog
        ? setAxisOutputs(d, modeId, slot, c.id, part, list)
        : setButtonOutputs(d, modeId, slot, c.id, list),
    );
  };
  const toggle = (output: OutputBinding) => {
    if (analog && device === "keyboard" && output.kind === "key")
      output = { kind: "key-direction", code: output.code, value: direction };
    const key = outputKey(output);
    const exists = expanded.some(
      (o) =>
        outputKey(o) === key &&
        (o.kind !== "key-direction" || o.value === direction),
    );
    write(
      exists
        ? expanded.filter(
            (o) =>
              !(
                outputKey(o) === key &&
                (o.kind !== "key-direction" || o.value === direction)
              ),
          )
        : uniqueOutputs([...expanded, output]),
    );
  };
  const state = (key: string) =>
    selected.has(key)
      ? (usage.get(key)?.length ?? 0) > 1
        ? "assigned is-shared"
        : "assigned"
      : (usage.get(key)?.length ?? 0) > 1
        ? "shared"
        : usage.has(key)
          ? "used"
          : "unused";
  const info = (key: string, label: string, reason?: string) =>
    [
      label,
      reason,
      ...(usage.get(key) ?? []).map(
        (u) => `P${u.slot} · ${u.label} · ${u.variant}: ${u.summary}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
  const focus = (key: string, label: string, reason?: string) =>
    setHover(info(key, label, reason));
  function pair(p: PadTarget) {
    if (!analog) {
      setMessage(
        "Select a phone analog stick or D-pad to map both axes. For a phone button, choose a direction arrow or stick click.",
      );
      return;
    }
    onCommit((d) => {
      const axisCode = p.pair === "right" ? "r" : "l";
      setAxisOutputs(
        d,
        modeId,
        slot,
        c.id,
        "x",
        p.pair === "pad"
          ? [{ kind: "button-axis", negative: "left", positive: "right" }]
          : [{ kind: "axis", code: axisCode === "r" ? "rx" : "lx", value: 1 }],
      );
      if (c.kind !== "trigger")
        setAxisOutputs(
          d,
          modeId,
          slot,
          c.id,
          "y",
          p.pair === "pad"
            ? [{ kind: "button-axis", negative: "down", positive: "up" }]
            : [
                {
                  kind: "axis",
                  code: axisCode === "r" ? "ry" : "ly",
                  value: 1,
                },
              ],
        );
    });
  }
  return (
    <div
      className="visual-binding-overlay"
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Visual input binding"
      onKeyDown={(e) => trapDialog(e, onClose)}
    >
      <header>
        <div>
          <small>CONTROLLER STUDIO</small>
          <h2>Choose what this control presses.</h2>
        </div>
        <button onClick={onClose}>Done</button>
      </header>
      <div className="visual-binding-options">
        <label>
          Player
          <select
            aria-label="Binding player"
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
          Phone control
          <select
            aria-label="Phone control"
            value={c.id}
            onChange={(e) => setId(e.target.value)}
          >
            {mode.controls
              .filter((c) => c.kind !== "label")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.kind} · {c.variant}
                </option>
              ))}
          </select>
        </label>
        <label>
          Visual model
          <select
            aria-label="Visual model"
            value={device}
            onChange={(e) => {
              const next = e.target.value as DeviceDrawing;
              setDevice(next);
              onCommit((d) => {
                d.inputMethod = next === "keyboard" ? "keyboard" : "gamepad";
              });
            }}
          >
            <option value="xbox">Xbox controller</option>
            <option value="playstation">PlayStation controller</option>
            <option value="keyboard">Full keyboard · ANSI 104</option>
          </select>
        </label>
        {analog && (
          <>
            <label>
              Phone axis
              <select
                aria-label="Phone axis"
                value={part}
                onChange={(e) => setPart(e.target.value as any)}
              >
                <option value="x">Horizontal / trigger</option>
                {c.kind !== "trigger" && <option value="y">Vertical</option>}
              </select>
            </label>
            {device === "keyboard" && (
              <label>
                Direction
                <select
                  value={direction}
                  aria-label="Key direction"
                  onChange={(e) =>
                    setDirection(Number(e.target.value) as -1 | 1)
                  }
                >
                  <option value={-1}>Negative · left / down</option>
                  <option value={1}>Positive · right / up</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
      <div className="visual-binding-body">
        <div className="hardware-scroll">
          <div className="hardware-drawing">
            {device === "keyboard" ? (
              <svg
                viewBox="-0.5 -0.5 24.5 7.5"
                aria-label="Full keyboard diagram"
              >
                <rect
                  x={-0.4}
                  y={-0.4}
                  width={24.3}
                  height={7.2}
                  rx={0.3}
                  fill="#1f2a25"
                  stroke="#607368"
                  strokeWidth={0.03}
                />
                {keyboardModel().map((k) => (
                  <g
                    key={k.id}
                    role="button"
                    tabIndex={0}
                    aria-disabled={!k.code}
                    aria-label={
                      k.code
                        ? `Bind ${k.label.replaceAll("\n", " ")}`
                        : k.label.replaceAll("\n", " ") + " unavailable"
                    }
                    className={
                      "hardware-key " +
                      (!k.code ? "reserved" : state("key:" + k.code))
                    }
                    onMouseEnter={() =>
                      focus("key:" + k.code, k.label, k.reason)
                    }
                    onFocus={() => focus("key:" + k.code, k.label, k.reason)}
                    onClick={() =>
                      k.code && toggle({ kind: "key", code: k.code })
                    }
                    onKeyDown={(e) => {
                      if (["Enter", " "].includes(e.key)) {
                        e.preventDefault();
                        if (k.code) toggle({ kind: "key", code: k.code });
                      }
                    }}
                  >
                    <title>{info("key:" + k.code, k.label, k.reason)}</title>
                    <rect
                      x={k.x + 0.04}
                      y={k.y + 0.04}
                      width={k.w - 0.08}
                      height={k.h - 0.08}
                      rx={0.09}
                    />
                    {k.label.split("\n").map((l, i, a) => (
                      <text
                        key={i}
                        x={k.x + k.w / 2}
                        y={k.y + k.h / 2 + (i - (a.length - 1) / 2) * 0.23}
                        dominantBaseline="central"
                        textAnchor="middle"
                        fontSize={l.length > 8 ? 0.18 : 0.23}
                      >
                        {l}
                      </text>
                    ))}
                  </g>
                ))}
              </svg>
            ) : (
              <svg
                viewBox="0 0 980 650"
                aria-label={
                  device === "xbox"
                    ? "Xbox controller diagram"
                    : "PlayStation controller diagram"
                }
              >
                <defs>
                  <linearGradient id="pad-shell" x2="0.5" y2="1">
                    <stop
                      stopColor={device === "xbox" ? "#35413b" : "#cbd5d1"}
                    />
                    <stop
                      offset="1"
                      stopColor={device === "xbox" ? "#151e19" : "#869b91"}
                    />
                  </linearGradient>
                </defs>
                <path
                  d={
                    device === "xbox"
                      ? "M215 138 Q240 112 335 139 Q490 170 645 139 Q735 112 768 147 C835 214 902 418 903 546 Q900 630 849 610 L693 497 Q490 455 287 497 L132 610 Q80 631 77 546 C78 412 144 205 215 138Z"
                      : "M210 139 Q260 115 337 143 L643 143 Q720 115 770 139 C839 206 875 412 867 557 Q861 615 814 596 L675 480 Q490 516 305 480 L166 596 Q119 615 113 557 C105 412 141 206 210 139Z"
                  }
                  className="hardware-shell"
                  fill="url(#pad-shell)"
                  stroke="#6d8275"
                  strokeWidth={3}
                />
                {device === "playstation" && (
                  <path
                    d="M340 328 Q490 307 640 328 L692 469 Q490 510 288 469Z"
                    fill="#17221d"
                  />
                )}
                {gamepadModel(device === "playstation").map((p) => (
                  <g
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    aria-label={"Bind " + p.label}
                    aria-disabled={!!p.reason}
                    className={
                      "hardware-key " +
                      (p.reason ? "reserved" : state(p.id)) +
                      (p.pair ? " hardware-pair" : "")
                    }
                    onMouseEnter={() => focus(p.id, p.label, p.reason)}
                    onFocus={() => focus(p.id, p.label, p.reason)}
                    onClick={() =>
                      p.pair ? pair(p) : p.output && toggle(p.output)
                    }
                    onKeyDown={(e) => {
                      if (["Enter", " "].includes(e.key)) {
                        e.preventDefault();
                        if (p.pair) pair(p);
                        else if (p.output) toggle(p.output);
                      }
                    }}
                  >
                    <title>{info(p.id, p.label, p.reason)}</title>
                    {p.w ? (
                      <rect
                        x={p.x - p.w / 2}
                        y={p.y - p.h! / 2}
                        width={p.w}
                        height={p.h}
                        rx={p.id.includes("touchpad") ? 20 : 10}
                      />
                    ) : (
                      <circle cx={p.x} cy={p.y} r={p.radius} />
                    )}
                    {!p.pair &&
                      ![
                        "button:select",
                        "button:start",
                        "system:home",
                        "system:share",
                        "system:mute",
                      ].includes(p.id) && (
                        <text
                          x={p.x}
                          y={p.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={p.short.length > 4 ? 12 : 19}
                        >
                          {p.short}
                        </text>
                      )}
                    {[
                      "button:select",
                      "button:start",
                      "system:home",
                      "system:share",
                      "system:mute",
                    ].includes(p.id) && (
                      <g
                        className="hardware-symbol"
                        transform={`translate(${p.x},${p.y})`}
                        aria-hidden="true"
                      >
                        {p.id === "button:start" ? (
                          <path d="M-8-5H8 M-8 0H8 M-8 5H8" />
                        ) : p.id === "button:select" ? (
                          device === "xbox" ? (
                            <path d="M-8-6H3V3H-8Z M-3-2H8V7H-3" />
                          ) : (
                            <path d="M-7-4L-11-9 M0-7V-13 M7-4L11-9" />
                          )
                        ) : p.id === "system:home" ? (
                          <path d="M-9 0L0-8L9 0 M-6-2V8H6V-2" />
                        ) : p.id === "system:share" ? (
                          <path d="M0 5V-7 M-5-2L0-7L5-2 M-7 2V8H7V2" />
                        ) : (
                          <path d="M-7-3H7 M-5 0H5 M-3 3H3" />
                        )}
                      </g>
                    )}
                  </g>
                ))}
                <PadCallouts playstation={device === "playstation"} />
                <text
                  x="490"
                  y="631"
                  textAnchor="middle"
                  fill="#9bb4a5"
                  fontSize="13"
                >
                  {device === "playstation"
                    ? "PlayStation labels · Xbox/XInput output"
                    : "Xbox / XInput output"}{" "}
                  · original schematic
                </text>
              </svg>
            )}
          </div>
          <div className="binding-legend">
            <span className="unused">Unused</span>
            <span className="used">Used</span>
            <span className="shared">Shared</span>
            <span className="assigned">Selected control</span>
            <span>System keys unavailable</span>
          </div>
        </div>
        <aside>
          <h3>
            P{slot} · {c.label || c.kind}
          </h3>
          <p>
            Click an input to add or remove it. Multiple inputs are held
            together. Reusing an input is allowed.
          </p>
          <div className="binding-chips">
            {outputs.map((o, i) => (
              <button
                key={i}
                aria-label={"Remove " + outputLabel(o, device)}
                onClick={() => write(outputs.filter((_, n) => n !== i))}
              >
                {outputLabel(o, device)} ×
              </button>
            ))}
            {!outputs.length && <span>No output assigned.</span>}
          </div>
          <button onClick={() => write([])}>
            Clear this {analog ? "axis" : "control"}
          </button>
          <p className="hardware-info" aria-live="polite">
            {hover ||
              "Hover or focus an input to see every phone control using it."}
          </p>
          {message && <p role="status">{message}</p>}
          <small>
            {device === "keyboard"
              ? "All players share the PC keyboard. Matching keys can affect several players."
              : "Each player has a separate virtual Xbox gamepad. PlayStation labels change the diagram, not the device type."}{" "}
            Changes stay in your draft until you save.
          </small>
        </aside>
      </div>
    </div>
  );
}

function PadCallouts({ playstation: ps }: { playstation: boolean }) {
  const labels = ps
    ? [
        {
          id: "pair:pad",
          text: "D-pad",
          path: "M198 286L155 309H102",
          x: 94,
          y: 309,
          anchor: "end",
        },
        {
          id: "pair:left",
          text: "Left stick",
          path: "M331 450L305 525H269",
          x: 261,
          y: 525,
          anchor: "end",
        },
        {
          id: "pair:right",
          text: "Right stick",
          path: "M645 455L675 525H711",
          x: 719,
          y: 525,
          anchor: "start",
        },
        {
          id: "button:select",
          text: "Create",
          path: "M342 174L358 151H371",
          x: 378,
          y: 151,
          anchor: "start",
        },
        {
          id: "button:start",
          text: "Options",
          path: "M638 174L622 151H609",
          x: 602,
          y: 151,
          anchor: "end",
        },
        {
          id: "system:home",
          text: "Home",
          path: "M490 384V364",
          x: 490,
          y: 353,
          anchor: "middle",
        },
        {
          id: "system:mute",
          text: "Mic",
          path: "M490 468V496",
          x: 490,
          y: 508,
          anchor: "middle",
        },
      ]
    : [
        {
          id: "pair:left",
          text: "Left stick",
          path: "M214 308L167 345H113",
          x: 105,
          y: 345,
          anchor: "end",
        },
        {
          id: "pair:pad",
          text: "D-pad",
          path: "M343 464L313 532H279",
          x: 271,
          y: 532,
          anchor: "end",
        },
        {
          id: "pair:right",
          text: "Right stick",
          path: "M651 450L682 532H718",
          x: 726,
          y: 532,
          anchor: "start",
        },
        {
          id: "button:select",
          text: "View",
          path: "M431 241L411 188H388",
          x: 380,
          y: 188,
          anchor: "end",
        },
        {
          id: "button:start",
          text: "Menu",
          path: "M549 241L569 188H592",
          x: 600,
          y: 188,
          anchor: "start",
        },
        {
          id: "system:home",
          text: "Home",
          path: "M490 163V145",
          x: 490,
          y: 133,
          anchor: "middle",
        },
        {
          id: "system:share",
          text: "Share",
          path: "M490 332V354",
          x: 490,
          y: 368,
          anchor: "middle",
        },
      ];
  return (
    <g className="hardware-callouts" aria-hidden="true">
      {labels.map((l) => (
        <g key={l.id} data-callout-for={l.id}>
          <path d={l.path} />
          <text
            x={l.x}
            y={l.y}
            textAnchor={l.anchor as "start"|"middle"|"end"}
            dominantBaseline="central"
          >
            {l.text}
          </text>
        </g>
      ))}
    </g>
  );
}
