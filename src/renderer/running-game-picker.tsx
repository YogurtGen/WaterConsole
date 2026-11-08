import { useEffect, useRef, useState } from "react";
import type { RunningGameWindow } from "../shared/studio-model";
import { libraryCall, trapDialog } from "./builder-primitives";
export function RunningGamePicker({
  onPick,
  onClose,
}: {
  onPick: (window: RunningGameWindow) => void;
  onClose: () => void;
}) {
  const [windows, setWindows] = useState<RunningGameWindow[]>([]),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const search = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  async function refresh() {
    const run = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await libraryCall({ type: "running-windows" });
      if (run === generation.current) setWindows(result?.windows ?? []);
    } catch (e) {
      if (run === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to list game windows.",
        );
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    void refresh();
    search.current?.focus();
    return () => {
      generation.current++;
      previous?.focus();
    };
  }, []);
  const visible = windows.filter((w) =>
    `${w.title} ${w.executable}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="builder-overlay builder-inner-overlay">
      <section
        className="running-game-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose running game"
        onKeyDown={(e) => trapDialog(e, onClose)}
      >
        <header>
          <div>
            <span className="builder-kicker">FROM YOUR PC</span>
            <h2>Choose a running game</h2>
          </div>
          <button onClick={onClose}>Cancel</button>
        </header>
        <p>
          Open the game first, then choose its window here. WaterConsole finds
          the executable for you. Choose the game itself, rather than Steam or a
          browser.
        </p>
        <div className="running-game-search">
          <label className="builder-field">
            Find a window
            <input
              ref={search}
              value={query}
              placeholder="Search by window title or executable"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button disabled={loading} onClick={() => void refresh()}>
            {loading ? "Scanning…" : "Refresh windows"}
          </button>
        </div>
        <div className="running-game-list" aria-busy={loading}>
          {error ? (
            <p role="alert" className="builder-error">
              {error}
            </p>
          ) : loading ? (
            <p role="status">Looking for visible application windows…</p>
          ) : visible.length ? (
            visible.map((w) => (
              <button
                key={w.pid}
                className="running-game-choice"
                onClick={() => onPick(w)}
              >
                <span className="running-game-symbol" aria-hidden="true">
                  ▣
                </span>
                <span>
                  <strong>{w.title || "Untitled window"}</strong>
                  <span className="running-game-file">
                    {w.executable.split(/[\\/]/).pop()} · Process {w.pid}
                  </span>
                  <small>{w.executable}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))
          ) : (
            <p role="status">
              {query
                ? "No matching window. Try another title or executable name."
                : "No game window found. Open your game, then refresh. You can also use Browse .exe."}
            </p>
          )}
        </div>
        <footer>
          Choosing a window fills your setup. Save before connecting a phone. An
          already open game is reused; if it is closed later, Start game can
          launch it.
        </footer>
      </section>
    </div>
  );
}
