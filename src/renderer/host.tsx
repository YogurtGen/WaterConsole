import { ConfiguredGameScreen } from "./configured-game-screen";
import { GameShelf } from "./game-shelf";
import { LibraryCardMenu, type CardMenuAnchor } from "./library-card-menu";
import { LibraryWorkspace } from "./library-workspace";
import { libraryCall } from "./builder-primitives";
import type { ArtworkSlot } from "../shared/studio-model";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import {
  GAMES,
  nativeAvailable,
  COLORS,
  type HostCommand,
  type HostState,
  type GameManifest,
  type DisplayMode,
  type Player,
  type Action,
} from "../shared/types";
import { Avatar, Brand, Icon, IconButton, Mark, asset } from "./ui";
import { ConsoleSounds } from "./sounds";

function GameArtwork({
  gameId,
  art,
  variant,
  alt = "",
}: {
  gameId: string;
  art?: ArtworkSlot;
  variant: "cover" | "hero";
  alt?: string;
}) {
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(false), [gameId, variant, art?.asset]);
  if (art && !fallback)
    return (
      <img
        src={`waterconsole://app/user-assets/${art.asset}`}
        style={{ objectFit: art.fit, objectPosition: "center" }}
        alt={alt}
        data-library-art="true"
        onError={() => setFallback(true)}
      />
    );
  if (gameId.startsWith("local-"))
    return (
      <div className="custom-art-placeholder" aria-hidden="true">
        <span>YOUR LOCAL GAME</span>
        <strong>Play it your way.</strong>
      </div>
    );
  const local = gameId !== "controller-lab" && !fallback;
  return (
    <img
      src={local ? `/library-art/${gameId}-${variant}` : asset("lab-world")}
      alt={alt}
      data-library-art={local || undefined}
      onError={local ? () => setFallback(true) : undefined}
    />
  );
}

type Panel = "pair" | "players" | "network" | "end" | null;
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,[tabindex="0"]',
        );
        if (!els?.length) return;
        const a = els[0],
          b = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton name="close" label="Close" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
function Qr({ url }: { url: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#102521", light: "#ffffff" },
    })
      .then((s) => {
        if (active) setImage(s);
      })
      .catch(() => setImage(""));
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <div className="qr-wrap">
      {image ? (
        <img
          src={image}
          alt="Scan this QR code with your phone to connect to WaterConsole"
        />
      ) : (
        <span>Preparing QR…</span>
      )}
    </div>
  );
}
function PlayerSlots({
  state,
  onClick,
}: {
  state: HostState;
  onClick?: () => void;
}) {
  return (
    <div className="player-slots">
      {[1, 2, 3, 4].map((slot) => {
        const p = state.players.find((p) => p.slot === slot);
        return (
          <button
            key={slot}
            className={`player-slot ${p ? "filled" : ""}`}
            onClick={onClick}
            aria-label={
              p
                ? `Player ${slot}: ${p.name}${p.connected ? " connected" : " reconnecting"}`
                : `Player ${slot}: available`
            }
          >
            <span style={{ "--player": COLORS[slot - 1] } as CSSProperties}>
              {p ? (
                <Avatar small name={p.name} color={p.color} />
              ) : (
                <Icon name="phone" size={20} />
              )}
            </span>
            <div>
              <strong>{p ? p.name : `Player ${slot}`}</strong>
              <small>
                {p
                  ? p.connected
                    ? p.ready
                      ? "Ready"
                      : "Connected"
                    : "Reconnecting…"
                  : "Waiting for a phone"}
              </small>
            </div>
            {p?.canNavigate && <i title="Navigates Home">●</i>}
          </button>
        );
      })}
    </div>
  );
}
function Pairing({ state }: { state: HostState }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(
    0,
    Math.ceil((state.pairing.expiresAt - now) / 1000),
  );
  return (
    <div className="pairing-content">
      <div className="pairing-copy">
        <span className="eyebrow">
          <span className="status-dot" /> YOUR LOCAL CONNECTION
        </span>
        <h2>
          One screen. <br />
          Everyone's in.
        </h2>
        <p>
          Connect your phone to the same Wi-Fi as this PC, then scan the QR
          code.
        </p>
        <ol className="steps">
          <li>
            <span>1</span>Open your phone camera and scan.
          </li>
          <li>
            <span>2</span>Check your code and approve on this PC.
          </li>
          <li>
            <span>3</span>Tap <strong>Enter controller</strong>. You're in.
          </li>
        </ol>
        <div className="manual-connect">
          <small>Prefer to type it?</small>
          <strong>
            {state.network.address}:{state.network.port}
          </strong>
          <span>
            Enter code <b className="manual-code">{state.pairing.code}</b>
          </span>
        </div>
        <p className="network-note">
          <Icon name="lock" size={15} /> Every phone needs your approval.
        </p>
      </div>
      <div className="pairing-scan">
        {state.pairingLocked ? (
          <div className="locked-qr">
            <Icon name="lock" size={58} />
            <h3>Pairing is locked</h3>
            <p>Unlock it in session settings to add phones.</p>
          </div>
        ) : (
          <>
            <Qr url={state.pairing.url} />
            <span className="scan-caption">Scan to join WaterConsole</span>
            <small>
              Code refreshes in {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, "0")}
            </small>
          </>
        )}
        <div
          className={`connection-pill ${state.network.status !== "online" ? "warning" : ""}`}
        >
          <Icon name="wifi" size={17} />
          {state.network.status === "online"
            ? "Private network · local only"
            : state.network.error ||
              (state.network.status === "offline"
                ? "This PC only"
                : "Network unavailable")}
        </div>
      </div>
    </div>
  );
}
function Pending({
  state,
  send,
}: {
  state: HostState;
  send: (c: HostCommand) => void;
}) {
  if (!state.pending.length) return null;
  return (
    <aside className="pending-stack" aria-live="polite">
      {state.pending.map((p) => (
        <div className="pending-card" key={p.id}>
          <span className="pending-device">
            <Icon name="phone" size={28} />
          </span>
          <div>
            <span className="eyebrow">PHONE WANTS TO JOIN</span>
            <h3>{p.name}</h3>
            <p>
              Check this code on their phone: <b>{p.verificationCode}</b>
            </p>
            <div className="pending-actions">
              <button
                className="button primary compact"
                onClick={() => send({ type: "approve", requestId: p.id })}
              >
                <Icon name="check" size={17} />
                Approve
              </button>
              <button
                className="button compact"
                onClick={() => send({ type: "reject", requestId: p.id })}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </aside>
  );
}
function GameCard({
  game,
  state,
  send,
  onEdit,
  onMenu,
}: {
  game: GameManifest;
  state: HostState;
  send: (c: HostCommand) => void;
  onEdit?: (id: string, studio?: boolean) => void;
  onMenu?: (game: GameManifest, anchor: CardMenuAnchor) => void;
}) {
  const selected =
    state.heroMode === "detail" && state.selectedGameId === game.id;
  const available =
    game.availability === "available" &&
    (game.runtime === "native" ? nativeAvailable(state.native, game.id) : true);
  return (
    <div
      data-game-id={game.id}
      className={`game-card ${selected ? "selected" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onMenu?.(game, {
          x: e.clientX || r.left + 20,
          y: e.clientY || r.top + 20,
          trigger:
            e.currentTarget.querySelector<HTMLElement>(".game-card-select")!,
        });
      }}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu?.(game, {
            x: r.left + 20,
            y: r.top + 20,
            trigger: e.target as HTMLElement,
          });
        }
      }}
    >
      <button
        className="game-card-select"
        title={
          game.local
            ? "Right-click or press Shift+F10 to edit this game"
            : undefined
        }
        onClick={() => send({ type: "selectGame", gameId: game.id })}
        aria-label={`Show ${game.title} details`}
        aria-pressed={selected}
      >
        <div className={`game-cover ${game.local ? "local-game" : game.id}`}>
          <GameArtwork gameId={game.id} variant="cover" art={game.cover} />
          <span className="card-selected" aria-hidden="true">
            <Icon name="check" size={12} />
            Selected
          </span>
          <div className="cover-title">
            {game.id === "controller-lab" ? (
              <>
                <span>CONTROLLER</span>
                <strong>
                  LAB<span className="cover-dot">.</span>
                </strong>
              </>
            ) : (
              <>
                <span>LOCAL LIBRARY</span>
                <strong>{game.title}</strong>
              </>
            )}
          </div>
          <span className={`cover-status ${available ? "available" : ""}`}>
            {game.local
              ? available
                ? game.setup
                : "Needs setup"
              : game.connection === "offline-online" && available
                ? "OFFLINE · ONLINE"
                : game.connection === "online" && available
                  ? "ONLINE"
                  : game.launchRequirement
                    ? "OFFLINE CHECK REQUIRED"
                    : game.runtime === "native"
                      ? available
                        ? "INSTALLED ON THIS PC"
                        : "GAME NOT FOUND"
                      : available
                        ? "READY TO PLAY"
                        : "INTEGRATION PLANNED"}
          </span>
        </div>
        <span className="card-label">{game.title}</span>
        <span className="card-meta">
          {game.launchRequirement ? (
            <>
              <Icon name="clock" size={14} />
              Phone controls pending <span>•</span> PC adapter
            </>
          ) : (
            <>
              <Icon name="people" size={14} />
              {game.minPlayers === game.maxPlayers
                ? game.maxPlayers
                : `${game.minPlayers}–${game.maxPlayers}`}{" "}
              {game.maxPlayers === 1 ? "player" : "players"} <span>•</span>{" "}
              {game.runtime === "web" ? "Built in" : "PC game"}
            </>
          )}
        </span>
      </button>
      <button
        className={`card-favorite ${state.favorites.includes(game.id) ? "is-favorite" : ""}`}
        title={
          state.favorites.includes(game.id)
            ? "Remove from favorites"
            : "Add to favorites"
        }
        aria-label={`${state.favorites.includes(game.id) ? "Unfavorite" : "Favorite"} ${game.title}`}
        onClick={() => send({ type: "toggleFavorite", gameId: game.id })}
      >
        <Icon name="heart" size={19} />
      </button>
    </div>
  );
}
function Home({
  state,
  send,
  openPair,
  onAdd,
  onEdit,
}: {
  state: HostState;
  send: (c: HostCommand) => void;
  openPair: () => void;
  onAdd: () => void;
  onEdit: (id: string, studio?: boolean) => void;
}) {
  const [tag, setTag] = useState(""),
    [players, setPlayers] = useState(""),
    [connection, setConnection] = useState(""),
    [setup, setSetup] = useState("");
  const [cardMenu, setCardMenu] = useState<{
    gameId: string;
    anchor: CardMenuAnchor;
  } | null>(null);
  const openCardMenu = (game: GameManifest, anchor: CardMenuAnchor) =>
    setCardMenu({ gameId: game.id, anchor });
  const games = state.catalog ?? GAMES;
  const game = games.find((g) => g.id === state.selectedGameId) || GAMES[0];
  const available =
    game.availability === "available" &&
    (game.runtime === "native" ? nativeAvailable(state.native, game.id) : true);
  const featured = state.heroMode === "featured";
  const list = games.filter(
    (g) =>
      [g.title, g.description, ...(g.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(state.search.toLowerCase()) &&
      (!tag || g.tags?.includes(tag)) &&
      (!players || g.maxPlayers >= Number(players)) &&
      (!connection || g.connection === connection) &&
      (!setup || g.setup === setup) &&
      (state.libraryView === "favorites"
        ? state.favorites.includes(g.id)
        : state.libraryView === "recent"
          ? state.recent.includes(g.id)
          : true),
  );
  const saved = games.filter(
    (g) => state.favorites.includes(g.id) || state.recent.includes(g.id),
  );
  return (
    <main className={`home ${featured ? "featured-home" : ""}`}>
      <section
        className={`hero ${featured ? "hero-featured" : "hero-detail"}`}
        key={`${featured}-${game.id}`}
      >
        <div className="hero-art">
          <GameArtwork
            gameId={game.id}
            variant="hero"
            art={game.banner}
            alt={
              game.id === "controller-lab"
                ? "Four colorful players exploring an original miniature island arena"
                : `${game.title} library artwork`
            }
          />
        </div>
        <div className="hero-shade" />
        <div className="hero-copy">
          <span className="eyebrow">
            {featured
              ? "FEATURED EXPERIENCE"
              : game.runtime === "native"
                ? available
                  ? "FROM YOUR PC LIBRARY"
                  : game.launchRequirement
                    ? "OFFLINE COMPATIBILITY"
                    : "INSTALLATION NEEDED"
                : available
                  ? "BUILT FOR YOUR LIVING ROOM"
                  : "COMING TO YOUR CONSOLE"}
          </span>
          <h1>{game.title}</h1>
          <div className="hero-meta">
            <span>
              <Icon name="people" size={19} />
              {game.launchRequirement ? (
                "Phone controls pending"
              ) : (
                <>
                  {game.minPlayers === game.maxPlayers
                    ? game.maxPlayers
                    : `${game.minPlayers}–${game.maxPlayers}`}{" "}
                  {game.maxPlayers === 1 ? "player" : "players"}
                </>
              )}
            </span>
            <span
              className={`offline-badge ${game.connection === "online" ? "online-badge" : game.connection === "offline-online" ? "dual-badge" : ""}`}
            >
              <span />{" "}
              {game.local
                ? !game.connection
                  ? "Connection not specified"
                  : game.connection === "offline-online"
                    ? "Offline · Online"
                    : game.connection === "offline"
                      ? "Offline"
                      : "Online"
                : game.connection === "offline-online"
                  ? "Offline · Online"
                  : game.connection === "online"
                    ? "Online"
                    : game.launchRequirement
                      ? "Launch verification needed"
                      : game.runtime === "native"
                        ? available
                          ? "Installed locally"
                          : "Game not found"
                        : available
                          ? "100% offline"
                          : "Integration planned"}
            </span>
          </div>
          {!featured && <p>{game.description}</p>}
          <div className="hero-actions">
            {available ? (
              <button
                className="button play-button"
                onClick={() => send({ type: "startGame", gameId: game.id })}
              >
                <Icon name="play" />
                {game.runtime === "native" ? "Start game" : "Start playing"}
              </button>
            ) : (
              <button className="button play-button planned" disabled>
                <Icon name="clock" />
                {game.launchRequirement?.label ||
                  (game.runtime === "native"
                    ? "Game not found"
                    : "Integration planned")}
              </button>
            )}
            {!featured && (
              <button className="button ghost" onClick={openPair}>
                <Icon name="phone" />
                Connect phones
              </button>
            )}
            {game.local && (
              <>
                <button
                  className="button ghost"
                  onClick={() => onEdit(game.id)}
                >
                  Edit game
                </button>
                <button
                  className="button ghost"
                  onClick={() => onEdit(game.id, true)}
                >
                  Controller Studio
                </button>
              </>
            )}
          </div>
          {!featured && game.launchRequirement && (
            <p className="native-install-help">
              {game.launchRequirement.description}
            </p>
          )}
          {!featured && game.offlineNote && (
            <p className="native-install-help">{game.offlineNote}</p>
          )}
          {!featured && game.runtime === "native" && !available && (
            <p className="native-install-help">
              This PC adapter is unavailable. Check its setup on the host PC.
            </p>
          )}
          {featured && (
            <p className="hero-tagline">
              Your phone is the controller. Your PC is the console.
            </p>
          )}
        </div>
        {!featured && (
          <div className="detail-footer">
            <Icon
              name={
                game.runtime === "native"
                  ? "monitor"
                  : available
                    ? "wifi"
                    : "clock"
              }
            />
            <span>
              {game.launchRequirement
                ? "Installed PC game · Offline launch not verified"
                : game.runtime === "native"
                  ? "Your PC game - trusted local adapter"
                  : available
                    ? "All together. All on your network."
                    : "Integration planned"}
            </span>
          </div>
        )}
      </section>
      <div className="library-content">
        <div className="library-heading">
          <h2>
            <Icon name="grid" />
            {state.libraryView === "favorites"
              ? "Your favorites"
              : state.libraryView === "recent"
                ? "Recently played"
                : "Your local library"}
          </h2>
          <div className="library-tools">
            <button className="library-add-game" onClick={onAdd}>
              ＋ Add game
            </button>
            <div className="view-tabs" aria-label="Library view">
              {(["all", "favorites", "recent"] as const).map((view) => (
                <button
                  key={view}
                  className={state.libraryView === view ? "active" : ""}
                  onClick={() => send({ type: "setView", view })}
                >
                  {view === "all"
                    ? "All"
                    : view === "favorites"
                      ? "Favorites"
                      : "Recent"}
                </button>
              ))}
            </div>
            <label className="search-field">
              <Icon name="search" size={18} />
              <input
                value={state.search}
                onChange={(e) =>
                  send({ type: "setSearch", query: e.target.value })
                }
                placeholder="Find a game"
                aria-label="Find a game"
                maxLength={80}
              />
              {state.search && (
                <button
                  aria-label="Clear search"
                  onClick={() => send({ type: "setSearch", query: "" })}
                >
                  <Icon name="close" size={15} />
                </button>
              )}
            </label>
          </div>
        </div>
        <div className="library-filters" aria-label="Library filters">
          <select
            aria-label="Filter by tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">All tags</option>
            {[...new Set(games.flatMap((g) => g.tags ?? []))]
              .filter(Boolean)
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
          <select
            aria-label="Filter by players"
            value={players}
            onChange={(e) => setPlayers(e.target.value)}
          >
            <option value="">Any players</option>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {p}+ players
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by connection"
            value={connection}
            onChange={(e) => setConnection(e.target.value)}
          >
            <option value="">Any connection</option>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
            <option value="offline-online">Offline & Online</option>
          </select>
          <select
            aria-label="Filter by setup"
            value={setup}
            onChange={(e) => setSetup(e.target.value)}
          >
            <option value="">Any setup status</option>
            <option>Needs setup</option>
            <option>Ready to test</option>
            <option>Tested by you</option>
          </select>
          {(tag || players || connection || setup) && (
            <button
              onClick={() => {
                setTag("");
                setPlayers("");
                setConnection("");
                setSetup("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {list.length ? (
          <GameShelf
            label="Game library"
            selectedId={featured ? undefined : state.selectedGameId}
            itemIds={list.map((g) => g.id).join("|")}
          >
            {list.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                state={state}
                send={send}
                onEdit={onEdit}
                onMenu={openCardMenu}
              />
            ))}
          </GameShelf>
        ) : (
          <div className="library-empty">
            <Icon
              name={state.libraryView === "favorites" ? "heart" : "search"}
              size={30}
            />
            <h3>
              {state.search
                ? "No games found"
                : state.libraryView === "favorites"
                  ? "Your favorites start here"
                  : "A fresh start"}
            </h3>
            <p>
              {state.search
                ? "Try another title."
                : state.libraryView === "favorites"
                  ? "Tap the heart on a game to keep it here."
                  : "Play Controller Lab and it will appear here."}
            </p>
          </div>
        )}
        {state.libraryView === "all" && !state.search && (
          <section className="saved-section">
            <h2>
              <Icon name="heart" />
              Favorites & recently played
            </h2>
            {saved.length ? (
              <GameShelf
                revealOnNavigation={false}
                label="Favorites and recent games"
                selectedId={featured ? undefined : state.selectedGameId}
                itemIds={saved.map((g) => g.id).join("|")}
              >
                {saved.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    state={state}
                    send={send}
                    onEdit={onEdit}
                    onMenu={openCardMenu}
                  />
                ))}
              </GameShelf>
            ) : (
              <p className="saved-empty">
                A place for your go-to games. Play something or tap a heart to
                make it yours.
              </p>
            )}
          </section>
        )}
        {cardMenu && games.some((g) => g.id === cardMenu.gameId) && (
          <LibraryCardMenu
            game={games.find((g) => g.id === cardMenu.gameId)!}
            anchor={cardMenu.anchor}
            onEdit={onEdit}
            onClose={() => setCardMenu(null)}
          />
        )}
        <footer className="home-footer">
          <span>
            <Mark size={18} /> Made for the room you're in.
          </span>
          <span>WaterConsole Core · Local & open source</span>
        </footer>
      </div>
    </main>
  );
}
function Arena({
  players,
  index,
  mode,
}: {
  players: Player[];
  index: number;
  mode: DisplayMode;
}) {
  return (
    <div className="arena">
      <div className="arena-grid" />
      <div className="arena-center">
        <Mark size={54} />
        <span>
          {mode === "shared"
            ? "ONE ROOM. FOUR COLORS."
            : `VIEWPORT ${index + 1}`}
        </span>
      </div>
      <span className="arena-corner">
        {mode === "shared"
          ? "SHARED SCREEN"
          : mode === "split-2"
            ? "SPLIT / 2"
            : "SPLIT / 4"}
      </span>
      {players.map((p) => (
        <div
          key={p.id}
          className={`lab-puck ${p.connected ? "" : "disconnected"}`}
          style={
            {
              left: `${p.position.x * 100}%`,
              top: `${p.position.y * 100}%`,
              "--player": p.color,
            } as CSSProperties
          }
        >
          <span className="puck-eyes">
            <i />
            <i />
          </span>
          <b>P{p.slot}</b>
          <span className="puck-name">{p.name}</span>
        </div>
      ))}
    </div>
  );
}
function Lab({
  state,
  send,
  openPair,
}: {
  state: HostState;
  send: (c: HostCommand) => void;
  openPair: () => void;
}) {
  const count =
    state.displayMode === "shared"
      ? 1
      : state.displayMode === "split-2"
        ? 2
        : 4;
  return (
    <main className="lab">
      <div className="lab-heading">
        <div>
          <span className="eyebrow">TEST ENVIRONMENT</span>
          <h1>
            Controller Lab<span className="mint">.</span>
          </h1>
          <p>
            A little room for every player. Hold a direction and make your move.
          </p>
        </div>
        <button className="button" onClick={() => send({ type: "stopGame" })}>
          <Icon name="back" size={18} />
          Return Home
        </button>
      </div>
      <div className="lab-bar">
        <div className="layout-switch" aria-label="Screen layout">
          {(["shared", "split-2", "split-4"] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={state.displayMode === mode}
              className={state.displayMode === mode ? "active" : ""}
              onClick={() => send({ type: "setLayout", mode })}
            >
              <Icon name={mode === "shared" ? "monitor" : "grid"} size={17} />
              {mode === "shared"
                ? "Shared screen"
                : mode === "split-2"
                  ? "2 viewports"
                  : "4 viewports"}
            </button>
          ))}
        </div>
        <span className="lab-live">
          <span className="status-dot" />
          {state.players.filter((p) => p.connected).length}/4 controllers
          connected
        </span>
      </div>
      <div className={`arenas mode-${state.displayMode}`}>
        {Array.from({ length: count }, (_, index) => (
          <Arena
            key={index}
            index={index}
            mode={state.displayMode}
            players={
              count === 1
                ? state.players
                : state.players.filter((p) => p.slot === index + 1)
            }
          />
        ))}
        {!state.players.length && (
          <div className="arena-empty">
            <Icon name="phone" size={38} />
            <h2>The room is ready.</h2>
            <p>Add a phone to bring your first player in.</p>
            <button className="button primary" onClick={openPair}>
              <Icon name="phone" />
              Connect a phone
            </button>
          </div>
        )}
      </div>
      <div className="input-readouts">
        {[1, 2, 3, 4].map((slot) => {
          const p = state.players.find((p) => p.slot === slot);
          return (
            <div
              className="input-readout"
              key={slot}
              style={{ "--player": COLORS[slot - 1] } as CSSProperties}
            >
              <div className="readout-title">
                <span className="player-number">P{slot}</span>
                <strong>{p?.name || "Waiting for player"}</strong>
                <i className={p?.connected ? "connected" : ""} />
              </div>
              <div className="input-buttons">
                {["↑", "←", "↓", "→", "A", "B", "X", "Y"].map((symbol, i) => (
                  <kbd
                    key={symbol}
                    className={
                      p?.buttons.includes(
                        (
                          [
                            "up",
                            "left",
                            "down",
                            "right",
                            "a",
                            "b",
                            "x",
                            "y",
                          ] as Action[]
                        )[i],
                      )
                        ? "pressed"
                        : ""
                    }
                  >
                    {symbol}
                  </kbd>
                ))}
              </div>
              <small>
                {p
                  ? `${p.pressCount} button presses · ${p.connected ? "Connected" : "Reconnecting"}`
                  : "Scan the QR to take this spot"}
              </small>
            </div>
          );
        })}
      </div>
      <p className="lab-help">
        <Icon name="check" size={15} />
        Try two directions, hold a button, or switch between apps on your phone.
        Every released input should return to neutral.
      </p>
    </main>
  );
}
function NativeGame({
  state,
  send,
  openPair,
}: {
  state: HostState;
  send: (command: HostCommand) => void;
  openPair: () => void;
}) {
  const game = (state.catalog ?? GAMES).find(
    (game) => game.id === (state.native.gameId || state.selectedGameId),
  );
  return (
    <ConfiguredGameScreen
      state={state}
      game={game}
      send={send}
      openPair={openPair}
      artwork={
        <GameArtwork
          gameId={game?.id ?? state.selectedGameId}
          art={game?.banner ?? game?.cover}
          variant="hero"
          alt={game ? game.title + " library artwork" : ""}
        />
      }
    />
  );
}
function HostApp() {
  const [workspace, setWorkspace] = useState<{
    gameId?: string;
    studio?: boolean;
  } | null>(null);
  const [state, setState] = useState<HostState | null>(null),
    [error, setError] = useState(""),
    [panel, setPanel] = useState<Panel>(null),
    [settings, setSettings] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [toast, setToast] = useState("");
  const [boot, setBoot] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardSelection = useRef(0);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  const send = useCallback(
    (command: HostCommand) => {
      return window.waterconsole
        ?.command(command)
        .then((r) => {
          if (!r.ok) notify(r.error || "That action could not be completed.");
        })
        .catch(() => notify("The local server is not responding."));
    },
    [notify],
  );
  const closePanel = useCallback(() => setPanel(null), []);
  useEffect(() => {
    const bridge = window.waterconsole;
    if (!bridge) {
      setError("Open the desktop app");
      setBoot(false);
      return;
    }
    const sounds = new ConsoleSounds();
    let lastSound: number | undefined;
    const soundState = (next: HostState) => {
      sounds.setMuted(next.muted);
      if (
        lastSound !== undefined &&
        next.feedback.sequence !== lastSound &&
        next.feedback.sequence > 0
      )
        sounds.play(next.feedback.sound);
      lastSound = next.feedback.sequence;
    };
    const start = performance.now();
    let active = true;
    bridge
      .getState()
      .then((s) => {
        if (!active) return;
        if (lastSound === undefined) soundState(s);
        setState(s);
        const wait = Math.max(0, 220 - (performance.now() - start));
        setTimeout(() => {
          if (active) setBoot(false);
        }, wait);
      })
      .catch((e) => {
        setError(String(e?.message || "Unable to start the local server"));
        setBoot(false);
      });
    bridge
      .getFullscreen()
      .then(setFullscreen)
      .catch(() => {});
    const off = bridge.onState((next) => {
      soundState(next);
      if (
        next.profile === "menu" &&
        next.players.some(
          (player) => player.canNavigate && player.buttons.length,
        )
      ) {
        document.documentElement.dataset.keyboard = "true";
      }
      setState(next);
    });
    return () => {
      active = false;
      off();
      sounds.dispose();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state?.phase]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        panel ||
        settings ||
        (e.target as HTMLElement).matches("input,textarea,select")
      )
        return;
      if (workspace) return;
      const map: Record<string, Action> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        Enter: "confirm",
        Escape: "back",
      };
      if (map[e.key]) {
        e.preventDefault();
        document.documentElement.dataset.keyboard = "true";
        document.documentElement.dataset.cardKeyboard = "true";
        const selection = ++keyboardSelection.current;
        send({ type: "navigate", action: map[e.key] })?.finally(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (selection === keyboardSelection.current)
                delete document.documentElement.dataset.cardKeyboard;
            });
          });
        });
      }
      if (e.key === "F11") {
        e.preventDefault();
        window.waterconsole?.toggleFullscreen().then(setFullscreen);
      }
    };
    const pointer = () => {
      keyboardSelection.current++;
      delete document.documentElement.dataset.keyboard;
      delete document.documentElement.dataset.cardKeyboard;
    };
    window.addEventListener("keydown", fn);
    window.addEventListener("pointerdown", pointer);
    return () => {
      keyboardSelection.current++;
      delete document.documentElement.dataset.cardKeyboard;
      window.removeEventListener("keydown", fn);
      window.removeEventListener("pointerdown", pointer);
    };
  }, [panel, settings, send, workspace]);
  if (boot)
    return (
      <div className="splash">
        <Brand />
        <span>YOUR ROOM. YOUR CONSOLE.</span>
      </div>
    );
  if (error || !state)
    return (
      <div className="startup-error">
        <Brand />
        <Icon name="monitor" size={60} />
        <h1>{error || "Starting your console…"}</h1>
        <p>
          {!window.waterconsole
            ? "Launch WaterConsole on your PC to manage a local session. On your phone, scan the QR shown in the app."
            : "Check your network connection, then restart WaterConsole."}
        </p>
      </div>
    );
  const toggleFullscreen = () =>
    window.waterconsole
      ?.toggleFullscreen()
      .then(setFullscreen)
      .catch(() => notify("Fullscreen is unavailable."));
  return (
    <>
      <header className="host-header">
        <button
          className="brand-button"
          onClick={() => send({ type: "openHome" })}
          aria-label="WaterConsole Home"
        >
          <Brand />
        </button>
        <div className="header-right">
          <button
            className="header-avatars"
            aria-label="Manage players"
            onClick={() => setPanel("players")}
          >
            {state.players.length ? (
              state.players.map((p) => (
                <Avatar
                  key={p.id}
                  small
                  name={p.name}
                  color={p.color}
                  slot={p.slot}
                />
              ))
            ) : (
              <span className="header-no-players">
                <Icon name="people" size={17} />0 / 4
              </span>
            )}
          </button>
          <button
            className="button add-phones"
            onClick={() => setPanel("pair")}
          >
            <Icon name="phone" />
            <span>Add phones</span>
          </button>
          <button
            className="pair-code-button"
            onClick={() => setPanel("pair")}
            title="Pairing code"
          >
            <span className="mint">
              <Icon name={state.pairingLocked ? "lock" : "wifi"} />
            </span>
            {state.pairing.code}
          </button>
          <IconButton
            name="expand"
            label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={toggleFullscreen}
          />
          <div className="settings-wrap">
            <IconButton
              name="settings"
              label="Session settings"
              onClick={() => setSettings(!settings)}
            />
            {settings && (
              <>
                <button
                  className="dismiss-menu"
                  aria-label="Close session settings"
                  onClick={() => setSettings(false)}
                />
                <div className="settings-menu">
                  <span className="menu-label">YOUR CONSOLE</span>
                  <button
                    onClick={() => {
                      setPanel("players");
                      setSettings(false);
                    }}
                  >
                    <Icon name="people" />
                    Manage players
                  </button>
                  <button
                    onClick={() => {
                      setPanel("network");
                      setSettings(false);
                    }}
                  >
                    <Icon name="wifi" />
                    Network settings
                  </button>
                  <button
                    onClick={() => {
                      send({
                        type: "setPairingLocked",
                        locked: !state.pairingLocked,
                      });
                      setSettings(false);
                    }}
                  >
                    <Icon name={state.pairingLocked ? "unlock" : "lock"} />
                    {state.pairingLocked ? "Unlock pairing" : "Lock pairing"}
                  </button>
                  <button
                    onClick={() => {
                      send({ type: "toggleMute" });
                      setSettings(false);
                    }}
                  >
                    <Icon name={state.muted ? "muted" : "volume"} />
                    {state.muted ? "Unmute console" : "Mute console"}
                  </button>
                  <hr />
                  <button
                    onClick={() => {
                      setPanel("end");
                      setSettings(false);
                    }}
                  >
                    <Icon name="power" />
                    End session
                  </button>
                  <button onClick={() => window.waterconsole?.quit()}>
                    <Icon name="close" />
                    Quit WaterConsole
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {state.network.status !== "online" && (
        <div className="network-alert">
          <Icon name="wifi" size={18} />
          {state.network.error ||
            (state.network.status === "offline"
              ? "This PC only. Select a LAN connection to add phones."
              : "The local server is unavailable. Check Network settings.")}
          <button onClick={() => setPanel("network")}>Network settings</button>
        </div>
      )}
      {state.phase === "lobby" ? (
        <main className="lobby">
          <div className="lobby-art">
            <span className="lobby-tag">
              FROM YOUR POCKET TO THE BIG SCREEN.
            </span>
            <img
              src={asset("lobby-devices")}
              alt="A PC screen and two phones working together as a local console"
            />
            <h2>Phones + screen = good times.</h2>
            <p>No downloads on your phone. No internet needed.</p>
          </div>
          <div className="lobby-right">
            <Pairing state={state} />
            <PlayerSlots state={state} onClick={() => setPanel("players")} />
            <button
              className="continue-button"
              onClick={() => send({ type: "openHome" })}
            >
              Continue to Home
              <Icon name="arrow" size={19} />
            </button>
            <small className="lobby-footnote">
              You can connect more phones whenever you're ready.
            </small>
          </div>
        </main>
      ) : state.phase === "lab" ? (
        <Lab state={state} send={send} openPair={() => setPanel("pair")} />
      ) : state.phase === "native" ? (
        <NativeGame
          state={state}
          send={send}
          openPair={() => setPanel("pair")}
        />
      ) : (
        <Home
          state={state}
          send={send}
          openPair={() => setPanel("pair")}
          onAdd={() => setWorkspace({})}
          onEdit={(gameId, studio) => setWorkspace({ gameId, studio })}
        />
      )}
      {panel === "pair" && (
        <Modal title="Bring everyone in" onClose={closePanel} wide>
          <Pairing state={state} />
          <PlayerSlots state={state} onClick={() => setPanel("players")} />
        </Modal>
      )}
      {panel === "players" && (
        <Modal title="Your players" onClose={closePanel}>
          <p className="modal-description">
            Four spots. One shared screen. The navigator controls Home.
          </p>
          <div className="manage-players">
            {state.players.length ? (
              state.players.map((p) => (
                <div className="manage-player" key={p.id}>
                  <Avatar name={p.name} color={p.color} slot={p.slot} />
                  <div>
                    <h3>{p.name}</h3>
                    <small>
                      {p.connected ? "Connected" : "Reconnecting…"} ·{" "}
                      {p.canNavigate
                        ? "Navigator"
                        : p.ready
                          ? "Ready"
                          : "Not ready"}
                    </small>
                    <div className="manage-actions">
                      <button
                        disabled={p.canNavigate || !p.connected}
                        onClick={() =>
                          send({ type: "assignNavigator", playerId: p.id })
                        }
                      >
                        {p.canNavigate ? "Navigator" : "Give navigation"}
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => send({ type: "kick", playerId: p.id })}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-players">
                <Icon name="people" size={42} />
                <h3>Your room is waiting.</h3>
                <p>Connect a phone to add your first player.</p>
              </div>
            )}
          </div>
          <button
            className="button primary full-width"
            onClick={() => setPanel("pair")}
          >
            <Icon name="phone" />
            Add phones
          </button>
        </Modal>
      )}
      {panel === "network" && (
        <Modal title="Local network" onClose={closePanel}>
          <p className="modal-description">
            Connect every phone to the same Wi-Fi or hotspot as this PC.
          </p>
          <label className="field-label">
            Network interface
            <select
              value={state.network.address}
              onChange={(e) =>
                send({ type: "setNetwork", address: e.target.value })
              }
            >
              {state.network.interfaces.map((n) => (
                <option key={n.address} value={n.address}>
                  {n.name} · {n.address}
                  {n.preferred ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="network-address">
            <span>CONTROLLER ADDRESS</span>
            <strong>
              http://{state.network.address}:{state.network.port}
            </strong>
            <small>
              {state.network.status === "online"
                ? "Server is online"
                : state.network.error || "Server is offline"}
            </small>
          </div>
          <p className="network-note">
            <Icon name="lock" size={18} />
            Use a trusted private network. HTTP traffic is not encrypted.
          </p>
          <div className="help-box">
            <h3>Phone can't connect?</h3>
            <p>
              On a trusted home network, set this PC's Wi-Fi network profile to
              <strong> Private</strong> in Windows Settings, then allow
              WaterConsole on <strong>Private networks</strong> in Windows
              Firewall. A Public profile blocks the app's Private-only rule.
              Guest Wi-Fi may also block connections between devices. Try a PC
              or phone hotspot.
            </p>
          </div>
        </Modal>
      )}
      {panel === "end" && (
        <Modal title="Start a fresh session?" onClose={closePanel}>
          <p className="modal-description">
            All phones will disconnect, pairing codes will change, and you'll
            return to the connection screen. Your favorites and history stay
            saved.
          </p>
          <div className="dialog-actions">
            <button className="button" onClick={closePanel}>
              Keep playing
            </button>
            <button
              className="button danger"
              onClick={() => {
                send({ type: "resetSession" });
                closePanel();
              }}
            >
              End session
            </button>
          </div>
        </Modal>
      )}
      <Pending state={state} send={send} />
      {workspace && (
        <LibraryWorkspace
          gameId={workspace.gameId}
          openStudio={workspace.studio}
          state={state}
          onClose={() => setWorkspace(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="wifi" size={18} />
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<HostApp />);
