import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
export interface GuideStep {
  target: string;
  title: string;
  description: string;
  enter?: () => void;
}
const guideKey = (id: string) => `waterconsole.guide.${id}.v1`;
export function useGuidedHelp(id: string, ready = true) {
  const [open, setOpen] = useState(false);
  const checked = useRef(false);
  const show = useCallback(() => {
    try {
      localStorage.setItem(guideKey(id), "seen");
    } catch {}
    setOpen(true);
  }, [id]);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!ready || checked.current) return;
    checked.current = true;
    let seen = false;
    try {
      seen = !!localStorage.getItem(guideKey(id));
    } catch {}
    if (!seen) show();
  }, [ready, show, id]);
  return { open, show, close };
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  vw: number;
  vh: number;
}
const focusable =
  'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]';
export function SpotlightGuide({
  steps,
  onClose,
  label,
}: {
  steps: GuideStep[];
  onClose: () => void;
  label: string;
}) {
  const [index, setIndex] = useState(0),
    [box, setBox] = useState<Box | null>(null),
    [cardHeight, setCardHeight] = useState(240);
  const latest = useRef(steps);
  latest.current = steps;
  const close = useRef(onClose);
  close.current = onClose;
  const target = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement;
    return () => {
      if (previous.current?.isConnected)
        previous.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setCardHeight(el.getBoundingClientRect().height),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    latest.current[index]?.enter?.();
    let scrollTarget: Element | null = null;
    let frame = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        latest.current[index]?.target ?? "",
      );
      target.current = el;
      if (el && el.getClientRects().length) {
        if (scrollTarget !== el) {
          scrollTarget = el;
          el.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "instant",
          });
        }
        const r = el.getBoundingClientRect(),
          vw = window.innerWidth,
          vh = window.innerHeight,
          x = Math.max(6, r.left - 7),
          y = Math.max(6, r.top - 7);
        const next = {
          x,
          y,
          w: Math.max(0, Math.min(vw - 6, r.right + 7) - x),
          h: Math.max(0, Math.min(vh - 6, r.bottom + 7) - y),
          vw,
          vh,
        };
        setBox((old) =>
          old &&
          Object.keys(next).every(
            (k) => Math.abs(old[k as keyof Box] - next[k as keyof Box]) < 0.5,
          )
            ? old
            : next,
        );
      } else setBox(null);
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    const focus = requestAnimationFrame(() =>
      card.current
        ?.querySelector<HTMLButtonElement>("[data-guide-next]")
        ?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focus);
    };
  }, [index]);
  const advance = useCallback(() => {
    if (index >= latest.current.length - 1) close.current();
    else setIndex((i) => i + 1);
  }, [index]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key === "Tab") {
        const t = target.current;
        const list = [
          ...(t?.matches(focusable) ? [t] : []),
          ...Array.from(t?.querySelectorAll<HTMLElement>(focusable) ?? []),
          ...Array.from(
            card.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
          ),
        ].filter(
          (el) =>
            el.getClientRects().length > 0 &&
            el.getAttribute("tabindex") !== "-1",
        );
        if (!list.length) return;
        const at = list.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        event.stopPropagation();
        list[
          (at + (event.shiftKey ? -1 : 1) + list.length) % list.length
        ].focus({ preventScroll: true });
        return;
      }
      if (
        (event.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        advance();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [advance]);
  const step = steps[index];
  if (!step) return null;
  const vw = box?.vw ?? window.innerWidth,
    vh = box?.vh ?? window.innerHeight,
    width = Math.min(328, vw - 32),
    height = Math.min(cardHeight, vh - 32),
    gap = 18;
  let left = (vw - width) / 2,
    top = (vh - height) / 2;
  if (box) {
    if (vw - box.x - box.w >= width + gap + 16) {
      left = box.x + box.w + gap;
      top = box.y;
    } else if (box.x >= width + gap + 16) {
      left = box.x - width - gap;
      top = box.y;
    } else if (vh - box.y - box.h >= height + gap + 16) {
      left = box.x + (box.w - width) / 2;
      top = box.y + box.h + gap;
    } else if (box.y >= height + gap + 16) {
      left = box.x + (box.w - width) / 2;
      top = box.y - height - gap;
    } else {
      left = vw - width - 16;
      top = vh - height - 16;
    }
  }
  left = Math.max(16, Math.min(left, vw - width - 16));
  top = Math.max(16, Math.min(top, vh - height - 16));
  const shade = (key: string, x: number, y: number, w: number, h: number) => (
    <div
      key={key}
      className="guide-shade"
      style={{ left: x, top: y, width: Math.max(0, w), height: Math.max(0, h) }}
    />
  );
  return createPortal(
    <div
      className="guided-tour"
      data-guide-step={index + 1}
      aria-label={label + " spotlight"}
    >
      {box ? (
        <>
          {shade("top", 0, 0, vw, box.y)}
          {shade("left", 0, box.y, box.x, box.h)}
          {shade("right", box.x + box.w, box.y, vw - box.x - box.w, box.h)}
          {shade("bottom", 0, box.y + box.h, vw, vh - box.y - box.h)}
          <div
            className="guide-highlight"
            data-guide-target={step.target}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        </>
      ) : (
        shade("all", 0, 0, vw, vh)
      )}
      <div
        ref={card}
        className="guide-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="guide-title"
        aria-describedby="guide-description"
        style={{ left, top, width, maxHeight: vh - 32 }}
      >
        <div className="guide-topline">
          <span>
            {label} · {index + 1} / {steps.length}
          </span>
          <button aria-label="Close tutorial" onClick={onClose}>
            ×
          </button>
        </div>
        <div
          className="guide-progress"
          role="progressbar"
          aria-label="Tutorial progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <i style={{ width: ((index + 1) / steps.length) * 100 + "%" }} />
        </div>
        <h2 id="guide-title">{step.title}</h2>
        <p id="guide-description">{step.description}</p>
        <small>
          Try the highlighted control, or choose Next. You can replay this guide
          with “?”.
        </small>
        <footer>
          <button className="guide-skip" onClick={onClose}>
            Skip tutorial
          </button>
          <div>
            <button
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            <button data-guide-next className="guide-next" onClick={advance}>
              {index === steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
