import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as PE,
} from "react";
import {
  fitPersonalRect,
  readPersonalLayout,
  type PersonalLayout,
  type PersonalRect,
} from "../shared/personal-layout";
type Item = {
  id: string;
  label: string;
  el: HTMLElement;
  base: PersonalRect;
  rect: PersonalRect;
};
type Bounds = { x: number; y: number; width: number; height: number };
export function usePersonalLayout(
  root: RefObject<HTMLElement | null>,
  profile: string,
  onNeutral: () => void,
  refresh: unknown = 0,
) {
  const [editing, setEditing] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [notice, setNotice] = useState(""),
    [orientation, setOrientation] = useState(
      innerWidth > innerHeight ? "landscape" : "portrait",
    );
  const editingRef = useRef(false),
    neutral = useRef(onNeutral);
  neutral.current = onNeutral;
  const bounds = useRef<Bounds>({ x: 0, y: 0, width: 1, height: 1 }),
    records = useRef<PersonalLayout>({}),
    saved = useRef<PersonalLayout>({}),
    elements = useRef<Item[]>([]),
    key = "waterconsole.layout.v1." + profile + "." + orientation;
  const restore = (el: HTMLElement) => {
    el.style.removeProperty("translate");
    el.style.removeProperty("scale");
    el.style.removeProperty("transform-origin");
  };
  const render = () => {
    const b = bounds.current;
    for (const i of elements.current) {
      const r = records.current[i.id];
      restore(i.el);
      if (!r) {
        i.rect = { ...i.base };
        continue;
      }
      const desired = fitPersonalRect(
        {
          x: r.x * b.width,
          y: r.y * b.height,
          w: r.w * b.width,
          h: r.h * b.height,
        },
        b.width,
        b.height,
      );
      const factor = Math.min(desired.w / i.base.w, desired.h / i.base.h);
      i.rect = fitPersonalRect(
        { ...desired, w: i.base.w * factor, h: i.base.h * factor },
        b.width,
        b.height,
      );
      i.el.style.transformOrigin = "0 0";
      i.el.style.translate = `${i.rect.x - i.base.x}px ${i.rect.y - i.base.y}px`;
      i.el.style.scale = String(factor);
    }
    setItems(elements.current.map((i) => ({ ...i })));
  };
  const measure = () => {
    const el = root.current;
    if (!el) return;
    elements.current.forEach((i) => restore(i.el));
    const box = el.getBoundingClientRect();
    const safe = getComputedStyle(el);
    let top = Math.max(0, box.top) + parseFloat(safe.paddingTop || "0"),
      bottom =
        Math.min(innerHeight, box.bottom) -
        parseFloat(safe.paddingBottom || "0");
    el.querySelectorAll<HTMLElement>(
      ".controller-top,.controller-identity,.controller-toolbar,.lab-controller-title,.native-phone-toolbar,.studio-phone-toolbar,.studio-phone-modes,.studio-phone-notice",
    ).forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height) top = Math.max(top, r.bottom + 6);
    });
    el.querySelectorAll<HTMLElement>(
      ".lab-controller-footer,.native-phone-footer,.controller-message,.fullscreen-hint",
    ).forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.height && r.top > top) bottom = Math.min(bottom, r.top - 6);
    });
    const b = {
      x: Math.max(8, box.left + parseFloat(safe.paddingLeft || "0")),
      y: top,
      width: Math.max(
        44,
        Math.min(
          innerWidth - 8,
          box.right - parseFloat(safe.paddingRight || "0"),
        ) - Math.max(8, box.left + parseFloat(safe.paddingLeft || "0")),
      ),
      height: Math.max(44, bottom - top),
    };
    bounds.current = b;
    const selector =
      ".studio-widget:not(.kind-label),.drag-pad,.brawl-stick,.dpad,.touch-button";
    const counts = new Map<string, number>();
    elements.current = [...el.querySelectorAll<HTMLElement>(selector)]
      .filter(
        (e) =>
          e.getClientRects().length &&
          e.getBoundingClientRect().width > 0 &&
          !e.parentElement?.closest(selector),
      )
      .map((e) => {
        restore(e);
        const r = e.getBoundingClientRect(),
          name =
            e.dataset.layoutId ||
            e.getAttribute("aria-label") ||
            e.className.split(" ")[0],
          n = counts.get(name) ?? 0;
        counts.set(name, n + 1);
        return {
          id: name + ":" + n,
          label: e.getAttribute("aria-label") || name,
          el: e,
          base: { x: r.left - b.x, y: r.top - b.y, w: r.width, h: r.height },
          rect: { x: 0, y: 0, w: 0, h: 0 },
        };
      });
    render();
  };
  useLayoutEffect(() => {
    editingRef.current = false;
    setEditing(false);
    try {
      records.current = readPersonalLayout(localStorage.getItem(key));
    } catch {
      records.current = {};
    }
    saved.current = structuredClone(records.current);
    let pending = 0;
    const schedule = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(measure);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    if (root.current) {
      observer.observe(root.current);
      mutations.observe(root.current, { childList: true, subtree: true });
    }
    const resize = () => {
      neutral.current();
      if (editingRef.current) {
        records.current = structuredClone(saved.current);
        editingRef.current = false;
        setEditing(false);
        setNotice("Layout editing cancelled after the screen changed.");
      }
      setOrientation(innerWidth > innerHeight ? "landscape" : "portrait");
      requestAnimationFrame(measure);
    };
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      elements.current.forEach((i) => restore(i.el));
      elements.current = [];
    };
  }, [key, refresh]);
  useEffect(() => {
    if (!editing) return;
    const cancel = () => {
      records.current = structuredClone(saved.current);
      editingRef.current = false;
      setEditing(false);
      neutral.current();
      render();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [editing]);
  const begin = () => {
    neutral.current();
    saved.current = structuredClone(records.current);
    editingRef.current = true;
    setEditing(true);
    setNotice("");
    requestAnimationFrame(measure);
  };
  const finish = (save: boolean) => {
    neutral.current();
    if (save) {
      try {
        localStorage.setItem(key, JSON.stringify(records.current));
        setNotice("Layout saved on this phone only.");
      } catch {
        setNotice(
          "Storage is unavailable. Layout kept until this page closes.",
        );
      }
    } else records.current = structuredClone(saved.current);
    editingRef.current = false;
    setEditing(false);
    render();
  };
  const change = (id: string, r: PersonalRect) => {
    const b = bounds.current,
      v = fitPersonalRect(r, b.width, b.height);
    records.current[id] = {
      x: v.x / b.width,
      y: v.y / b.height,
      w: v.w / b.width,
      h: v.h / b.height,
    };
    render();
  };
  return {
    editing,
    editingRef,
    items,
    bounds: bounds.current,
    notice,
    begin,
    finish,
    change,
    reset: () => {
      records.current = {};
      render();
    },
  };
}
export function PersonalLayoutEditor({
  model,
}: {
  model: ReturnType<typeof usePersonalLayout>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (model.editing)
      panel.current?.querySelector<HTMLElement>("button")?.focus();
  }, [model.editing]);
  const drag = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    rect: PersonalRect;
    resize: boolean;
  } | null>(null);
  if (!model.editing) return null;
  const b = model.bounds;
  const start = (e: PE<HTMLElement>, i: Item, resize = false) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: i.id,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      rect: { ...i.rect },
      resize,
    };
  };
  const move = (e: PE<HTMLElement>) => {
    const d = drag.current;
    if (
      !d ||
      d.pointer !== e.pointerId ||
      !e.currentTarget.hasPointerCapture(e.pointerId)
    )
      return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (d.resize) {
      const max = Math.min(b.width / d.rect.w, b.height / d.rect.h),
        factor = Math.max(
          Math.max(44 / d.rect.w, 44 / d.rect.h),
          Math.min(max, 1 + (dx + dy) / (d.rect.w + d.rect.h)),
        );
      model.change(d.id, {
        ...d.rect,
        w: d.rect.w * factor,
        h: d.rect.h * factor,
      });
    } else
      model.change(d.id, { ...d.rect, x: d.rect.x + dx, y: d.rect.y + dy });
  };
  return (
    <div
      ref={panel}
      className="personal-layout-editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          model.finish(false);
        }
        if (e.key === "Tab") {
          const items = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          ];
          if (e.shiftKey && document.activeElement === items[0]) {
            e.preventDefault();
            items.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
            e.preventDefault();
            items[0]?.focus();
          }
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Adjust your controller layout"
    >
      <div className="personal-layout-bar">
        <span>
          <strong>Your layout</strong>
          <small>Drag to move · corner to resize · this phone only</small>
        </span>
        <button onClick={model.reset}>Reset</button>
        <button onClick={() => model.finish(false)}>Cancel</button>
        <button className="done" onClick={() => model.finish(true)}>
          Done
        </button>
      </div>
      {model.items.map((i) => (
        <div
          key={i.id}
          className="personal-layout-handle"
          style={{
            left: b.x + i.rect.x,
            top: b.y + i.rect.y,
            width: i.rect.w,
            height: i.rect.h,
          }}
          aria-label={"Move " + i.label}
          onPointerDown={(e) => start(e, i)}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onLostPointerCapture={() => (drag.current = null)}
        >
          <span>{i.label}</span>
          <button
            aria-label={"Resize " + i.label}
            onPointerDown={(e) => start(e, i, true)}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onLostPointerCapture={() => (drag.current = null)}
          >
            ↘
          </button>
        </div>
      ))}
    </div>
  );
}
