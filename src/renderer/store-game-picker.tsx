import { useEffect, useRef, useState } from "react";
import type { InstalledStoreGame } from "../shared/store-model";
import type { LocalGameRecord } from "../shared/studio-model";
import { libraryCall, trapDialog } from "./builder-primitives";
export function StoreGamePicker({
  onPick,
  onClose,
}: {
  onPick: (game: LocalGameRecord, notes: string[]) => void;
  onClose: () => void;
}) {
  const [games, setGames] = useState<InstalledStoreGame[]>([]),
    [query, setQuery] = useState(""),
    [store, setStore] = useState("all"),
    [selected, setSelected] = useState(""),
    [exe, setExe] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notes, setNotes] = useState<string[]>([]);
  const active = useRef(true),
    search = useRef<HTMLInputElement>(null);
  async function scan() {
    setLoading(true);
    setError("");
    try {
      const r = await libraryCall({ type: "scan-stores" });
      if (active.current) {
        setGames(r?.scan?.games || []);
        setNotes(r?.scan?.notes || []);
        setSelected("");
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setLoading(false);
    }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    active.current = true;
    void scan();
    search.current?.focus();
    return () => {
      active.current = false;
      previous?.focus();
    };
  }, []);
  const choice = games.find((g) => g.key === selected),
    visible = games.filter(
      (g) =>
        (store === "all" || g.store === store) &&
        g.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
  async function prepare() {
    if (!choice) return;
    setBusy(true);
    setError("");
    try {
      const r = await libraryCall({
        type: "prepare-store-game",
        key: choice.key,
        executable: exe,
      });
      if (active.current && r?.game) onPick(r.game, r.notes || []);
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className="builder-overlay builder-inner-overlay">
      <section
        className="running-game-picker store-game-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Import installed game"
        onKeyDown={(e) =>
          trapDialog(e, () => {
            if (!busy) onClose();
          })
        }
      >
        <header>
          <div>
            <span className="builder-kicker">FROM YOUR PC LIBRARIES</span>
            <h2>Import installed game</h2>
          </div>
          <button disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </header>
        <p>
          Choose a game from your PC. Missing details and artwork download when
          online and stay saved locally. You can edit everything before saving.
        </p>
        <div className="running-game-search">
          <label className="builder-field">
            Find a game
            <input
              aria-label="Find a game"
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search installed games"
              disabled={busy}
            />
          </label>
          <label className="builder-field">
            Library
            <select
              aria-label="Store library"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              disabled={busy}
            >
              <option value="all">Steam & Epic</option>
              <option value="steam">Steam</option>
              <option value="epic">Epic Games</option>
            </select>
          </label>
          <button disabled={loading || busy} onClick={() => void scan()}>
            Scan again
          </button>
        </div>
        <div className="store-game-results" role="status">
          <span>
            {loading
              ? "Finding installed games…"
              : `${visible.length} ${visible.length === 1 ? "game" : "games"} found`}
          </span>
          {!loading && <span>Steam & Epic · installed on this PC</span>}
        </div>
        <div className="running-game-list" aria-busy={loading || busy}>
          {loading ? (
            <p role="status">Reading local Steam and Epic installations…</p>
          ) : visible.length ? (
            visible.map((g) => (
              <button
                key={g.key}
                className={
                  "running-game-choice store-game-row" +
                  (g.key === selected ? " selected" : "")
                }
                disabled={busy || g.alreadyAdded}
                aria-pressed={g.key === selected}
                onClick={() => {
                  setSelected(g.key);
                  setExe(g.executable || "");
                }}
              >
                <span className="store-game-logo" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M8 7h8c2 0 3 1.5 3.5 3.5l1 5c.5 2-1.5 3-3 1.5l-2-2h-7l-2 2c-1.5 1.5-3.5.5-3-1.5l1-5C5 8.5 6 7 8 7Z" />
                    <path d="M8 9v5m-2.5-2.5h5M15 10h.01M18 13h.01" />
                  </svg>
                </span>
                <span className="store-game-copy">
                  <strong title={g.name}>{g.name}</strong>
                  <span className="store-game-meta">
                    <span className="store-game-badge">
                      {g.store === "steam" ? "Steam" : "Epic Games"}
                    </span>
                    <span>
                      {g.alreadyAdded
                        ? "Already in library"
                        : g.needsReview
                          ? "Choose launch file"
                          : "Ready to import"}
                    </span>
                  </span>
                  <small title={g.directory}>{g.directory}</small>
                </span>
                <span className="store-game-pickmark" aria-hidden="true">
                  {g.alreadyAdded || g.key === selected ? "✓" : "+"}
                </span>
              </button>
            ))
          ) : (
            <p role="status">
              No matching installed game. Browse to its .exe or choose a running
              game instead.
            </p>
          )}
        </div>
        {choice && (
          <label className="builder-field store-game-executable">
            Launch file
            <select
              aria-label="Launch file"
              value={exe}
              disabled={busy}
              onChange={(e) => setExe(e.target.value)}
            >
              {choice.executables.map((e) => (
                <option key={e} value={e}>
                  {e.slice(choice.directory.length + 1)}
                </option>
              ))}
            </select>
            <small>
              {choice.needsReview
                ? "Several executables were found. Check the original game file; you can change it in setup."
                : "Detected from the local installation."}
            </small>
          </label>
        )}
        {notes.map((n) => (
          <p key={n} className="builder-hint">
            {n}
          </p>
        ))}
        {error && (
          <p role="alert" className="builder-error">
            {error}
          </p>
        )}
        <footer>
          <span className="store-game-next" role="status">
            <strong>
              {busy
                ? "Preparing your game…"
                : choice?.name || "Choose a game to continue"}
            </strong>
            <small>
              {busy
                ? "Downloading available details and artwork."
                : "Review the setup next. No game is launched."}
            </small>
          </span>
          <button
            className="builder-primary"
            disabled={!choice || !exe || loading || busy}
            onClick={() => void prepare()}
          >
            {busy ? "Preparing…" : "Use game details"}
          </button>
        </footer>
      </section>
    </div>
  );
}
