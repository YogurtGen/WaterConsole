import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export function GameShelf({
  label,
  selectedId,
  itemIds,
  children,
  revealOnNavigation = true,
}: {
  label: string;
  selectedId?: string;
  itemIds: string;
  children: ReactNode;
  revealOnNavigation?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    row = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ before: false, after: false });
  const update = () => {
    const e = row.current;
    if (e)
      setEnds((old) => {
        const before = e.scrollLeft > 2,
          after = e.scrollLeft + e.clientWidth < e.scrollWidth - 2;
        return old.before === before && old.after === after
          ? old
          : { before, after };
      });
  };
  useLayoutEffect(() => {
    const e = row.current;
    if (!e) return;
    const observer = new ResizeObserver(update);
    observer.observe(e);
    for (const child of e.children) observer.observe(child);
    update();
    return () => observer.disconnect();
  }, [itemIds]);
  useLayoutEffect(() => {
    if (!selectedId) return;
    const e = row.current,
      card = e?.querySelector<HTMLElement>(
        `[data-game-id="${CSS.escape(selectedId)}"]`,
      );
    if (!e || !card) return;
    const r = e.getBoundingClientRect(),
      c = card.getBoundingClientRect();
    const delta =
      c.left < r.left + 12
        ? c.left - r.left - 12
        : c.right > r.right - 12
          ? c.right - r.right + 12
          : 0;
    if (delta)
      e.scrollTo({
        left: e.scrollLeft + delta,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    if (
      revealOnNavigation &&
      document.documentElement.dataset.keyboard === "true"
    )
      root.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId, itemIds, revealOnNavigation]);
  useEffect(() => {
    const e = row.current;
    if (!e) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return;
      const amount =
        event.deltaY *
        (event.deltaMode === 1
          ? 32
          : event.deltaMode === 2
            ? e.clientWidth
            : 1);
      const next = Math.max(
        0,
        Math.min(e.scrollWidth - e.clientWidth, e.scrollLeft + amount),
      );
      if (Math.abs(next - e.scrollLeft) < 0.5) return;
      event.preventDefault();
      e.scrollLeft = next;
    };
    e.addEventListener("wheel", wheel, { passive: false });
    return () => e.removeEventListener("wheel", wheel);
  }, []);
  const page = (direction: number) => {
    const e = row.current;
    if (e)
      e.scrollBy({
        left: direction * Math.max(240, e.clientWidth * 0.8),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  };
  const overflow = ends.before || ends.after;
  return (
    <div className="game-shelf" ref={root}>
      <div
        ref={row}
        className="game-row"
        role="region"
        aria-label={label}
        onScroll={update}
      >
        {children}
      </div>
      {overflow && (
        <>
          <button
            className="shelf-arrow shelf-previous"
            aria-label={"Scroll " + label.toLowerCase() + " left"}
            disabled={!ends.before}
            onClick={() => page(-1)}
          >
            ‹
          </button>
          <button
            className="shelf-arrow shelf-next"
            aria-label={"Scroll " + label.toLowerCase() + " right"}
            disabled={!ends.after}
            onClick={() => page(1)}
          >
            ›
          </button>
          <p className="shelf-hint">
            Scroll to browse <span>Mouse wheel / swipe · Phone: ◀ ▶</span>
          </p>
        </>
      )}
    </div>
  );
}
