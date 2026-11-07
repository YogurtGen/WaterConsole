import { useEffect, useMemo, useRef, useState } from "react";
import { ControllerGlyph } from "./studio-surface";
import { trapDialog } from "./builder-primitives";
interface Entry {
  id: string;
  name: string;
  style: string;
  category: string;
  gaming: boolean;
  aliases: string[];
}
let catalogPromise: Promise<Entry[]> | undefined;
const load = () =>
  (catalogPromise ??= fetch("/assets/controller-icons/catalog.json")
    .then((r) => {
      if (!r.ok)
        throw new Error(
          "The offline icon pack is missing. Reinstall this build.",
        );
      return r.json();
    })
    .catch((error) => {
      catalogPromise = undefined;
      throw error;
    }));
function saved(key: string) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v)
      ? v.filter((x) => typeof x === "string").slice(0, 300)
      : [];
  } catch {
    return [];
  }
}
export function IconPicker({
  value,
  onChoose,
  onClose,
}: {
  value: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<Entry[]>([]),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Gaming"),
    [style, setStyle] = useState("all"),
    [selected, setSelected] = useState(value),
    [favorites, setFavorites] = useState<string[]>(() =>
      saved("waterconsole.icons.favorites"),
    ),
    [recent] = useState<string[]>(() => saved("waterconsole.icons.recent"));
  const scroll = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, width: 640, height: 400 });
  useEffect(() => {
    let active = true;
    void load()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) =>
      setView((v) => ({
        ...v,
        width: e.contentRect.width,
        height: e.contentRect.height,
      })),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const categories = useMemo(
    () => [
      "Gaming",
      "All icons",
      "Favorites",
      "Recent",
      ...new Set(catalog.filter((c) => c.gaming).map((c) => c.category)),
    ],
    [catalog],
  );
  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return catalog.filter(
      (i) =>
        (category === "All icons" ||
          (category === "Gaming" && i.gaming) ||
          (category === "Favorites" && favorites.includes(i.id)) ||
          (category === "Recent" && recent.includes(i.id)) ||
          i.category === category) &&
        (style === "all" || i.style === style) &&
        terms.every((term) =>
          (i.name + " " + i.aliases.join(" ")).toLowerCase().includes(term),
        ),
    );
  }, [catalog, query, category, style, favorites, recent]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    setView((v) => ({ ...v, top: 0 }));
  }, [query, category, style]);
  const cols = Math.max(3, Math.floor(view.width / 88)),
    rowHeight = 90,
    start = Math.max(0, Math.floor(view.top / rowHeight) - 2) * cols,
    end = Math.min(
      results.length,
      start + (Math.ceil(view.height / rowHeight) + 4) * cols,
    );
  const pick = (id: string) => {
    try {
      localStorage.setItem(
        "waterconsole.icons.recent",
        JSON.stringify([id, ...recent.filter((x) => x !== id)].slice(0, 60)),
      );
    } catch {}
    onChoose(id);
  };
  const star = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id].slice(-300);
    setFavorites(next);
    try {
      localStorage.setItem(
        "waterconsole.icons.favorites",
        JSON.stringify(next),
      );
    } catch {}
  };
  return (
    <div className="builder-overlay">
      <section
        className="icon-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a button icon"
        onKeyDown={(e) => trapDialog(e, onClose)}
      >
        <header>
          <div>
            <span className="builder-kicker">OFFLINE ICON LIBRARY</span>
            <h2>Find the right symbol.</h2>
          </div>
          <button onClick={onClose}>Close</button>
        </header>
        <div className="icon-picker-tools">
          <input
            autoFocus
            aria-label="Search icons"
            placeholder="Inventory, gas, arrows, shield…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (category === "Gaming") setCategory("All icons");
            }}
          />
          <select
            aria-label="Icon category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Icon style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          >
            <option value="all">Outline + filled</option>
            <option value="outline">Outline</option>
            <option value="filled">Filled</option>
          </select>
        </div>
        <p className="builder-muted">
          {results.length.toLocaleString()} icons · Bundled locally · Tabler /
          MIT
        </p>
        {error && <p className="builder-error">{error}</p>}
        <div
          ref={scroll}
          className="icon-picker-scroll"
          role="grid"
          aria-label="Icon results"
          onScroll={(e) =>
            setView((v) => ({ ...v, top: e.currentTarget.scrollTop }))
          }
          onKeyDown={(e) => {
            const current = results.findIndex((i) => i.id === selected),
              delta = (
                {
                  ArrowRight: 1,
                  ArrowLeft: -1,
                  ArrowDown: cols,
                  ArrowUp: -cols,
                } as Record<string, number>
              )[e.key];
            if (delta) {
              e.preventDefault();
              const next = Math.max(
                0,
                Math.min(results.length - 1, current + delta),
              );
              setSelected(results[next]?.id);
              scroll.current!.scrollTop = Math.max(
                0,
                Math.floor(next / cols) * rowHeight - view.height / 2,
              );
            } else if (e.key === "Enter" && selected) {
              e.preventDefault();
              pick(selected);
            }
          }}
        >
          <div
            style={{
              height: Math.ceil(results.length / cols) * rowHeight,
              position: "relative",
            }}
          >
            {results.slice(start, end).map((i, n) => {
              const index = start + n;
              return (
                <div
                  key={i.id}
                  className={
                    "icon-cell " + (selected === i.id ? "selected" : "")
                  }
                  role="gridcell"
                  style={{
                    position: "absolute",
                    left: ((index % cols) * 100) / cols + "%",
                    top: Math.floor(index / cols) * rowHeight,
                    width: 100 / cols + "%",
                    height: 86,
                  }}
                >
                  <button
                    className="icon-choice"
                    aria-label={i.name + " · " + i.style}
                    aria-pressed={selected === i.id}
                    onClick={() => setSelected(i.id)}
                    onDoubleClick={() => pick(i.id)}
                  >
                    <ControllerGlyph id={i.id} size={29} />
                    <small>{i.name}</small>
                  </button>
                  <button
                    className="icon-star"
                    aria-label={
                      (favorites.includes(i.id) ? "Unfavorite " : "Favorite ") +
                      i.name
                    }
                    onClick={() => star(i.id)}
                  >
                    {favorites.includes(i.id) ? "★" : "☆"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {!results.length && !error && (
          <p className="builder-muted">Try another word or category.</p>
        )}
        <footer>
          <span>
            <ControllerGlyph id={selected || "circle"} size={24} />
            {selected}
          </span>
          <button
            className="builder-primary"
            disabled={!selected}
            onClick={() => pick(selected)}
          >
            Use icon
          </button>
        </footer>
      </section>
    </div>
  );
}
