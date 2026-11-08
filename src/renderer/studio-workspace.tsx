import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as PE,
  type KeyboardEvent as KE,
} from "react";
export interface StudioPanelSizes {
  left: number;
  right: number;
  bottom: number;
}
export const DEFAULT_STUDIO_PANELS: StudioPanelSizes = {
  left: 240,
  right: 320,
  bottom: 184,
};
const KEY = "waterconsole.studio.panels.v1",
  GAP = 8;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
export function fitStudioPanels(
  p: StudioPanelSizes,
  width: number,
  height: number,
) {
  const gap = Math.min(GAP, width / 8),
    center = Math.min(260, width * 0.37),
    available = Math.max(0, width - 2 * gap - center),
    ratio = Math.min(
      1,
      available /
        Math.max(1, Math.min(184, width * 0.24) + Math.min(232, width * 0.3)),
    ),
    leftMin = Math.min(184, width * 0.24) * ratio,
    rightMin = Math.min(232, width * 0.3) * ratio;
  let left = clamp(p.left, leftMin, Math.min(480, available - rightMin)),
    right = clamp(p.right, rightMin, Math.min(560, available - leftMin));
  if (left + right > available) {
    const excess = left + right - available,
      extra = left - leftMin + right - rightMin;
    if (extra > 0) {
      left -= (excess * (left - leftMin)) / extra;
      right = available - left;
    }
  }
  const bottomMin = Math.min(112, height * 0.25),
    bottomMax = Math.max(bottomMin, Math.min(480, height - 220, height * 0.55));
  return {
    left,
    right,
    gap,
    bottom: clamp(p.bottom, bottomMin, bottomMax),
    limits: {
      leftMin,
      rightMin,
      leftMax: Math.min(480, available - right),
      rightMax: Math.min(560, available - left),
      bottomMin,
      bottomMax,
    },
  };
}
function storedPanels(): StudioPanelSizes {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      v &&
      ["left", "right", "bottom"].every(
        (k) =>
          typeof v[k] === "number" &&
          Number.isFinite(v[k]) &&
          v[k] >= 40 &&
          v[k] <= 2000,
      )
    )
      return { left: v.left, right: v.right, bottom: v.bottom };
  } catch {}
  return { ...DEFAULT_STUDIO_PANELS };
}
function persist(v: StudioPanelSizes) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}
type Part = keyof StudioPanelSizes;
export function useStudioWorkspace(onResizeStart: () => void) {
  const ref = useRef<HTMLDivElement>(null),
    [preferred, setPreferred] = useState(storedPanels),
    [space, setSpace] = useState({ width: 1280, height: 700 }),
    [dragging, setDragging] = useState<Part | null>(null);
  const latest = useRef(preferred),
    startCallback = useRef(onResizeStart);
  latest.current = preferred;
  startCallback.current = onResizeStart;
  const drag = useRef<{
    part: Part;
    x: number;
    y: number;
    before: StudioPanelSizes;
    effective: ReturnType<typeof fitStudioPanels>;
  } | null>(null);
  const sizes = fitStudioPanels(preferred, space.width, space.height);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const r = element.getBoundingClientRect();
      setSpace((old) =>
        old.width === r.width && old.height === r.height
          ? old
          : { width: r.width, height: r.height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function change(next: StudioPanelSizes, save = false) {
    latest.current = next;
    setPreferred(next);
    if (save) persist(next);
  }
  function finish(save: boolean) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(null);
    if (save) persist(latest.current);
    else change(current.before);
  }
  useEffect(() => {
    if (!dragging) return;
    const cls =
      dragging === "bottom" ? "studio-resizing-row" : "studio-resizing-column";
    document.documentElement.classList.add(cls);
    const cancel = () => finish(false);
    window.addEventListener("blur", cancel);
    return () => {
      document.documentElement.classList.remove(cls);
      window.removeEventListener("blur", cancel);
    };
  }, [dragging]);
  const resetPart = (part: Part) => {
    startCallback.current();
    change({ ...latest.current, [part]: DEFAULT_STUDIO_PANELS[part] }, true);
  };
  const reset = () => {
    startCallback.current();
    finish(false);
    change({ ...DEFAULT_STUDIO_PANELS }, true);
  };
  function separator(part: Part) {
    const vertical = part !== "bottom",
      value = sizes[part],
      min =
        part === "left"
          ? sizes.limits.leftMin
          : part === "right"
            ? sizes.limits.rightMin
            : sizes.limits.bottomMin,
      max =
        part === "left"
          ? sizes.limits.leftMax
          : part === "right"
            ? sizes.limits.rightMax
            : sizes.limits.bottomMax;
    return {
      role: "separator" as const,
      tabIndex: 0,
      "aria-orientation": vertical
        ? ("vertical" as const)
        : ("horizontal" as const),
      "aria-label":
        part === "left"
          ? "Resize controls panel"
          : part === "right"
            ? "Resize inspector panel"
            : "Resize canvas tools",
      "aria-valuemin": Math.round(min),
      "aria-valuemax": Math.round(max),
      "aria-valuenow": Math.round(value),
      "aria-valuetext": `${Math.round(value)} pixels`,
      title: "Drag to resize · Arrow keys adjust · Double-click to reset",
      className: `studio-panel-divider ${vertical ? "vertical" : "horizontal"}${dragging === part ? " is-dragging" : ""}`,
      onDoubleClick: () => resetPart(part),
      onPointerDown: (e: PE<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        startCallback.current();
        drag.current = {
          part,
          x: e.clientX,
          y: e.clientY,
          before: { ...latest.current },
          effective: sizes,
        };
        setDragging(part);
      },
      onPointerMove: (e: PE<HTMLDivElement>) => {
        const d = drag.current;
        if (
          !d ||
          d.part !== part ||
          !e.currentTarget.hasPointerCapture(e.pointerId)
        )
          return;
        const delta =
          part === "bottom"
            ? d.y - e.clientY
            : part === "right"
              ? d.x - e.clientX
              : e.clientX - d.x;
        const l = d.effective.limits,
          low =
            part === "left"
              ? l.leftMin
              : part === "right"
                ? l.rightMin
                : l.bottomMin,
          high =
            part === "left"
              ? l.leftMax
              : part === "right"
                ? l.rightMax
                : l.bottomMax;
        change({
          left: d.effective.left,
          right: d.effective.right,
          bottom: d.effective.bottom,
          [part]: clamp(d.effective[part] + delta, low, high),
        });
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
      onLostPointerCapture: () => finish(false),
      onKeyDown: (e: KE<HTMLDivElement>) => {
        if (e.key === "Escape") {
          finish(false);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          resetPart(part);
          return;
        }
        let next = value;
        const step = e.shiftKey ? 48 : 12;
        if (e.key === "Home") next = min;
        else if (e.key === "End") next = max;
        else if (vertical && ["ArrowLeft", "ArrowRight"].includes(e.key))
          next +=
            step *
            (e.key === "ArrowRight" ? 1 : -1) *
            (part === "right" ? -1 : 1);
        else if (!vertical && ["ArrowUp", "ArrowDown"].includes(e.key))
          next += step * (e.key === "ArrowUp" ? 1 : -1);
        else return;
        e.preventDefault();
        startCallback.current();
        change(
          {
            left: sizes.left,
            right: sizes.right,
            bottom: sizes.bottom,
            [part]: clamp(next, min, max),
          },
          true,
        );
      },
    };
  }
  return {
    ref,
    reset,
    separator,
    style: {
      "--studio-left": `${sizes.left}px`,
      "--studio-right": `${sizes.right}px`,
      "--studio-bottom": `${sizes.bottom}px`,
      "--studio-divider": `${sizes.gap}px`,
    } as CSSProperties,
  };
}
