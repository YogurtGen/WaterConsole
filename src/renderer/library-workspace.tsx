import { SpotlightGuide, useGuidedHelp, type GuideStep } from "./guided-tour";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  newLocalGame,
  ART_RECOMMENDATIONS,
  type LocalGameRecord,
  type ArtworkSlot,
} from "../shared/studio-model";
import type { HostState } from "../shared/types";
import { validateGame } from "../shared/studio-validation";
import {
  libraryCall,
  Panel,
  trapDialog,
  NumberField,
} from "./builder-primitives";
import { ControllerStudio } from "./controller-studio";
import { CropEditor } from "./crop-editor";
import { StoreGamePicker } from "./store-game-picker";
import { RunningGamePicker } from "./running-game-picker";
import { hostAsset } from "./studio-surface";
export function PhoneSetup({
  state,
  onClose,
}: {
  state: HostState;
  onClose?: () => void;
}) {
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(state.pairing.url, {
      width: 240,
      margin: 2,
      color: { dark: "#10261b", light: "#f2fbef" },
    }).then((url) => {
      if (active) setQr(url);
    });
    return () => {
      active = false;
    };
  }, [state.pairing.url]);
  const send = async (command: any) => {
    const result = await window.waterconsole?.command(command);
    if (!result?.ok) setError(result?.error || "Session action failed.");
  };
  return (
    <section className="builder-phone-setup">
      <header>
        <div>
          <span className="builder-kicker">LOCAL CONNECTION</span>
          <h2>Try it on your phone.</h2>
        </div>
        {onClose && <button onClick={onClose}>Done</button>}
      </header>
      <div className="builder-phone-pair">
        <div>
          {qr && <img src={qr} alt="Scan to request a phone controller" />}
          <strong>{state.pairing.code}</strong>
        </div>
        <div>
          <p>
            Connect to the same private Wi-Fi, scan the QR, then approve the
            matching verification code.
          </p>
          <code>
            http://{state.network.address}:{state.network.port}/controller
          </code>
          <div className="builder-player-slots">
            {[1, 2, 3, 4].map((slot) => {
              const p = state.players.find((p) => p.slot === slot);
              return (
                <span key={slot} style={{ borderColor: p?.color }}>
                  P{slot} ·{" "}
                  {p
                    ? p.name + (p.connected ? " ✓" : " · reconnecting")
                    : "Waiting"}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {state.pending.map((p) => (
        <div className="builder-pair-request" key={p.id}>
          <strong>
            {p.name} · {p.verificationCode}
          </strong>
          <button
            className="builder-primary"
            onClick={() => void send({ type: "approve", requestId: p.id })}
          >
            Approve
          </button>
          <button
            onClick={() => void send({ type: "reject", requestId: p.id })}
          >
            Reject
          </button>
        </div>
      ))}
      {error && <p className="builder-error">{error}</p>}
    </section>
  );
}
export function LibraryWorkspace({
  gameId,
  openStudio = false,
  state,
  onClose,
}: {
  gameId?: string;
  openStudio?: boolean;
  state: HostState;
  onClose: () => void;
}) {
  const [game, setGame] = useState<LocalGameRecord>(() => newLocalGame()),
    [step, setStep] = useState(0),
    [studio, setStudio] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [draft, setDraft] = useState<LocalGameRecord | null>(null),
    [showPhones, setShowPhones] = useState(false),
    [showRunning, setShowRunning] = useState(false),
    [showStores, setShowStores] = useState(false),
    [discard, setDiscard] = useState(false),
    [removeConfirm, setRemoveConfirm] = useState(false),
    [crop, setCrop] = useState<{
      source: string;
      purpose: "cover" | "banner";
      initial?: ArtworkSlot;
    } | null>(null),
    [capabilities, setCapabilities] = useState<any>(null),
    [storage, setStorage] = useState(""),
    [processes, setProcesses] = useState<
      Array<{ pid: number; title: string; window: boolean }>
    >([]);
  const original = useRef("");
  const current = useRef(game);
  current.current = game;
  const changed = original.current !== JSON.stringify(game);
  const steps = ["Game", "Details", "Artwork", "Controller", "Test & save"];
  const guide = useGuidedHelp("game-setup", !loading);
  useEffect(() => {
    if (studio || crop || showPhones) guide.close();
  }, [studio, crop, showPhones, guide.close]);
  const guideSteps: GuideStep[] = [
    {
      target: '[data-guide="game-exe"]',
      title: "Choose your own game",
      description:
        "Scan Steam & Epic to import installed game details, or use Browse .exe / Choose running game. A running window fills its executable automatically. Review the setup and save before connecting.",
      enter: () => setStep(0),
    },
    {
      target: '[data-guide="game-description"]',
      title: "Describe it for your friends",
      description:
        "Give your game a clear title, description and tags. Set only the player count and split-screen modes the original game really supports.",
      enter: () => setStep(1),
    },
    {
      target: ".builder-art-grid",
      title: "Cover and banner are separate",
      description:
        "The cover is a 3:4 library card; the banner is a wide 16:9 preview. Upload each image, then choose Recommended size or your own crop. Re-crop keeps the original.",
      enter: () => setStep(2),
    },
    {
      target: '[data-guide="pc-output"]',
      title: "Gamepad or keyboard? You choose.",
      description:
        "Virtual gamepad sends Xbox/XInput controls to the PC game and needs optional PC controller support. Keyboard bindings send your chosen game keys. Your phone looks like a console controller in both cases.",
      enter: () => setStep(3),
    },
    {
      target: '[data-guide="phone-labels"]',
      title: "Pick the look separately",
      description:
        "Xbox and PlayStation labels change what the phone buttons look like. They do not change the PC output backend or create a virtual PlayStation device.",
      enter: () => setStep(3),
    },
    {
      target: '[data-guide="open-studio"]',
      title: "Shape your controller",
      description:
        "Open Controller Studio to arrange buttons, analogs and D-pads, edit colors and icons, or link actions such as Drift + Throttle. Studio has its own replayable guide.",
      enter: () => setStep(3),
    },
    {
      target: ".builder-check-list",
      title: "Test menus and gameplay",
      description:
        "Approve phones on the PC, save and launch explicitly, and select the matching input device inside your game. Menu movement alone does not prove gameplay works. Mark only checks you have performed.",
      enter: () => setStep(4),
    },
    {
      target: ".builder-footer",
      title: "Save now or come back later",
      description:
        "Save to library keeps the setup locally; Save for later keeps a draft. Edit any saved local entry from its card. Press ? here whenever you want this guide again.",
      enter: () => setStep(4),
    },
  ];

  useEffect(() => {
    let active = true;
    void Promise.all([
      libraryCall({ type: "list" }),
      libraryCall({ type: "load-draft" }),
      libraryCall({ type: "capabilities" }),
      libraryCall({ type: "storage" }),
    ])
      .then(([list, last, ready, folder]) => {
        if (!active) return;
        const found = gameId
          ? list?.games?.find((g) => g.id === gameId)
          : undefined;
        if (gameId && !found)
          throw new Error("The selected local game was not found.");
        const initial = found ?? newLocalGame();
        setGame(initial);
        original.current = JSON.stringify(initial);
        if (last?.game) setDraft(last.game);
        setCapabilities(ready?.config);
        setStorage((folder?.config as any)?.directory || "");
        setStudio(openStudio && !!found);
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [gameId]);
  useEffect(() => {
    if (loading || !changed) return;
    const timer = setTimeout(() => {
      void libraryCall({ type: "save-draft", game })
        .then((result) => {
          if (result) setMessage("Draft saved on this PC");
        })
        .catch(() => {});
    }, 1600);
    return () => clearTimeout(timer);
  }, [game, loading, changed]);
  useEffect(
    () => () => {
      void window.waterconsole?.library?.({ type: "end-preview" });
    },
    [],
  );
  const patch = (update: Partial<LocalGameRecord>) =>
    setGame((g) => ({ ...g, ...update }));
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(close = false) {
    const value = structuredClone(current.current);
    validateGame(value);
    const result = await libraryCall({ type: "save", game: value });
    if (!result?.game) throw new Error("The game could not be saved.");
    setGame(result.game);
    current.current = result.game;
    original.current = JSON.stringify(result.game);
    setMessage("Saved to your local library");
    await window.waterconsole?.command({
      type: "selectGame",
      gameId: result.game.id,
    });
    if (close) onClose();
    return result.game;
  }
  async function test() {
    const saved = await save();
    await window.waterconsole?.library?.({ type: "end-preview" });
    const result = await window.waterconsole?.command({
      type: "startGame",
      gameId: saved.id,
    });
    if (!result?.ok)
      throw new Error(result?.error || "The game could not start.");
    onClose();
  }
  async function chooseExecutable() {
    const result = await libraryCall({ type: "choose-executable" });
    if (!result?.file?.path) return;
    const file = result.file;
    setGame((g) => ({
      ...g,
      title: g.title === "My game" ? file.name.replace(/\.exe$/i, "") : g.title,
      launch: {
        ...g.launch,
        executable: file.path!,
        cwd: "",
        attachPid: undefined,
      },
    }));
  }
  async function chooseArt(purpose: "cover" | "banner") {
    const result = await libraryCall({ type: "choose-image" });
    if (result?.file?.id) setCrop({ source: result.file.id, purpose });
  }
  function close() {
    if (changed) setDiscard(true);
    else onClose();
  }
  if (loading)
    return (
      <div className="builder-overlay">
        <section className="builder-loading">
          Loading your local library…
        </section>
      </div>
    );
  return (
    <div
      className="builder-overlay library-workspace"
      role="dialog"
      aria-modal="true"
      aria-label={gameId ? "Edit local game" : "Add game"}
      onKeyDown={(e) => {
        if (!studio && !crop && !showPhones && !showRunning)
          trapDialog(e, close);
      }}
    >
      {studio ? (
        <ControllerStudio
          game={game}
          onChange={setGame}
          state={state}
          onExit={() => setStudio(false)}
          onSave={async () => {
            await save();
          }}
          onTest={test}
          onConnect={() => setShowPhones(true)}
        />
      ) : (
        <section className="game-builder">
          <header className="builder-header">
            <div>
              <span className="builder-kicker">YOUR LOCAL LIBRARY</span>
              <h1>{gameId ? "Edit game" : "Add a game"}</h1>
              <p>Your installation. Your artwork. Your controller.</p>
            </div>
            <div className="builder-actions">
              <button
                className="guide-help"
                aria-label="Replay game setup guide"
                title="Replay tutorial"
                onClick={guide.show}
              >
                ?
              </button>
              <button onClick={() => setShowPhones(true)}>
                Phones{state.pending.length ? " · " + state.pending.length : ""}
              </button>
              <button onClick={close} disabled={busy}>
                Close
              </button>
            </div>
          </header>
          <div className="builder-content">
            <nav className="builder-steps" aria-label="Game setup steps">
              {steps.map((name, index) => (
                <button
                  key={name}
                  className={step === index ? "selected" : ""}
                  onClick={() => setStep(index)}
                >
                  <span>{index + 1}</span>
                  {name}
                </button>
              ))}
              <div className="builder-storage">
                <strong>Saved on this PC</strong>
                <small>{storage}</small>
                <button
                  onClick={() =>
                    void run(async () => {
                      const result = await libraryCall({
                        type: "choose-storage",
                      });
                      if (result)
                        setStorage(
                          (result.config as any)?.directory || storage,
                        );
                    })
                  }
                >
                  Change data folder
                </button>
              </div>
            </nav>
            <div className="builder-step-body">
              {error && (
                <p className="builder-error" role="alert">
                  {error}
                </p>
              )}
              {draft && (
                <div className="builder-draft">
                  <span>There is a saved draft for “{draft.title}”.</span>
                  <button
                    onClick={() => {
                      setGame(draft);
                      setDraft(null);
                      setMessage("Draft restored");
                    }}
                  >
                    Resume draft
                  </button>
                  <button onClick={() => setDraft(null)}>Dismiss</button>
                </div>
              )}
              {step === 0 && (
                <>
                  <Panel title="Choose your original game">
                    <p>
                      Choose the Windows executable from your existing
                      installation. Selecting it does not launch it.
                    </p>
                    <div className="builder-file">
                      <code>
                        {game.launch.executable || "No executable selected"}
                      </code>
                      <button
                        data-guide="game-exe"
                        className="builder-primary"
                        onClick={() => void run(chooseExecutable)}
                      >
                        Browse .exe
                      </button>
                      <button
                        onClick={() => {
                          guide.close();
                          setShowRunning(true);
                        }}
                      >
                        Choose running game
                      </button>
                      {game.revision === 0 && (
                        <button
                          onClick={() => {
                            guide.close();
                            setShowStores(true);
                          }}
                        >
                          Scan Steam &amp; Epic
                        </button>
                      )}
                    </div>
                    <label className="builder-field">
                      Game title
                      <input
                        autoFocus
                        value={game.title}
                        maxLength={120}
                        onChange={(e) => patch({ title: e.target.value })}
                        placeholder="Name your game"
                      />
                    </label>
                  </Panel>
                  <Panel title="Launch options">
                    <label className="builder-field">
                      Launch method
                      <select
                        aria-label="Launch method"
                        value={game.launch.method ?? "auto"}
                        disabled={game.launch.attachOnly}
                        onChange={(e) =>
                          patch({
                            launch: {
                              ...game.launch,
                              method: e.target.value as "auto" | "direct",
                            },
                          })
                        }
                      >
                        <option value="auto">
                          Auto · original launcher or executable
                        </option>
                        <option value="direct">Direct executable</option>
                      </select>
                      <small>
                        Auto uses Steam or Epic for recognized installations.
                        Custom arguments use Direct. Already open game windows
                        are reused.
                      </small>
                    </label>
                    <label className="builder-check">
                      <input
                        type="checkbox"
                        checked={game.launch.attachOnly}
                        onChange={(e) =>
                          patch({
                            launch: {
                              ...game.launch,
                              attachOnly: e.target.checked,
                              attachPid: undefined,
                            },
                          })
                        }
                      />
                      Only connect to an already running game
                    </label>
                    <small>
                      {game.launch.attachOnly
                        ? "WaterConsole will not launch this game. Turn this off to let Start game open the selected executable."
                        : "Start game opens the selected executable. If the game requires its original launcher, sign in there first."}
                    </small>
                    {game.launch.attachOnly && (
                      <>
                        <button
                          disabled={!game.launch.executable}
                          onClick={() =>
                            void run(async () => {
                              const result = await libraryCall({
                                type: "processes",
                                executable: game.launch.executable,
                              });
                              setProcesses((result?.config as any) || []);
                            })
                          }
                        >
                          Find running windows
                        </button>
                        <select
                          aria-label="Running game window"
                          value={game.launch.attachPid ?? ""}
                          onChange={(e) =>
                            patch({
                              launch: {
                                ...game.launch,
                                attachPid: Number(e.target.value),
                              },
                            })
                          }
                        >
                          <option value="">Select matching game window…</option>
                          {processes.map((p) => (
                            <option key={p.pid} value={p.pid}>
                              {p.title || "Game process"} · PID {p.pid}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <details>
                      <summary>Advanced launch settings</summary>
                      <label className="builder-field">
                        Working directory
                        <input
                          value={game.launch.cwd}
                          placeholder="Defaults to the executable folder"
                          maxLength={2048}
                          onChange={(e) =>
                            patch({
                              launch: { ...game.launch, cwd: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label className="builder-field">
                        Arguments · one argument per line
                        <textarea
                          value={game.launch.args.join("\n")}
                          rows={3}
                          maxLength={32768}
                          onChange={(e) =>
                            patch({
                              launch: {
                                ...game.launch,
                                args: e.target.value
                                  .split("\n")
                                  .filter(Boolean)
                                  .slice(0, 32),
                              },
                            })
                          }
                        />
                      </label>
                      <small>
                        Arguments are passed as separate values, not a shell
                        command.
                      </small>
                    </details>
                  </Panel>
                </>
              )}
              {step === 1 && (
                <>
                  <Panel title="Make it your library">
                    <label className="builder-field">
                      Description
                      <textarea
                        data-guide="game-description"
                        value={game.description}
                        maxLength={2000}
                        rows={5}
                        onChange={(e) => patch({ description: e.target.value })}
                        placeholder="Describe the game and how to reach local multiplayer…"
                      />
                    </label>
                    <label className="builder-field">
                      Tags · comma-separated
                      <input
                        value={game.tags.join(", ")}
                        onChange={(e) =>
                          patch({
                            tags: e.target.value
                              .split(",")
                              .map((x) => x.trimStart().slice(0, 24))
                              .slice(0, 12),
                          })
                        }
                        placeholder="Racing, Party, Couch co-op"
                      />
                    </label>
                    <div className="builder-tag-suggestions">
                      {[
                        "Fighting",
                        "Racing",
                        "Party",
                        "Platformer",
                        "Puzzle",
                        "Sports",
                        "Adventure",
                        "Shooter",
                      ].map((tag) => (
                        <button
                          key={tag}
                          className={game.tags.includes(tag) ? "selected" : ""}
                          onClick={() =>
                            patch({
                              tags: game.tags.includes(tag)
                                ? game.tags.filter((t) => t !== tag)
                                : [...game.tags.filter(Boolean), tag].slice(
                                    0,
                                    12,
                                  ),
                            })
                          }
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </Panel>
                  <Panel title="Players and connection">
                    <div className="builder-two">
                      <NumberField
                        label="Minimum players"
                        value={game.minPlayers}
                        min={1}
                        max={game.maxPlayers}
                        onChange={(n) => patch({ minPlayers: Math.round(n) })}
                      />
                      <NumberField
                        label="Maximum players"
                        value={game.maxPlayers}
                        min={game.minPlayers}
                        max={4}
                        onChange={(n) => patch({ maxPlayers: Math.round(n) })}
                      />
                    </div>
                    <label className="builder-field">
                      Connection label
                      <select
                        value={game.connection}
                        onChange={(e) =>
                          patch({ connection: e.target.value as any })
                        }
                      >
                        <option value="unknown">Not specified</option>
                        <option value="offline">Offline</option>
                        <option value="online">Online</option>
                        <option value="offline-online">Offline & Online</option>
                      </select>
                    </label>
                    <div className="builder-check-list">
                      {(
                        [
                          ["shared", "Shared screen"],
                          ["split-2", "Split into 2"],
                          ["split-4", "Split into 4"],
                        ] as const
                      ).map(([id, label]) => (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={game.displayModes.includes(id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...game.displayModes, id]
                                : game.displayModes.filter((v) => v !== id);
                              if (next.length) patch({ displayModes: next });
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <small>
                      These labels describe your game. They do not add
                      multiplayer or split-screen to it.
                    </small>
                  </Panel>
                </>
              )}
              {step === 2 && (
                <Panel title="Cover and banner">
                  <p>
                    They have different destinations and recommended sizes. Your
                    original files are kept for re-cropping.
                  </p>
                  <div className="builder-art-grid">
                    {(["cover", "banner"] as const).map((purpose) => {
                      const art = game.artwork[purpose],
                        recommended = ART_RECOMMENDATIONS[purpose];
                      return (
                        <section
                          className={"builder-art-slot " + purpose}
                          key={purpose}
                        >
                          <h3>
                            {purpose === "cover"
                              ? "Library cover"
                              : "Detail banner"}
                          </h3>
                          <p>
                            {recommended.width} × {recommended.height}{" "}
                            recommended
                          </p>
                          <div
                            className="builder-art-preview"
                            style={{
                              aspectRatio:
                                recommended.width / recommended.height,
                            }}
                          >
                            {art ? (
                              <img
                                src={hostAsset(art.asset)}
                                alt={purpose + " artwork preview"}
                                style={{ objectFit: art.fit }}
                              />
                            ) : (
                              <span>
                                {purpose === "cover"
                                  ? "Your cover"
                                  : "Your banner"}
                              </span>
                            )}
                          </div>
                          <div className="builder-actions">
                            <button
                              className="builder-primary"
                              onClick={() => void run(() => chooseArt(purpose))}
                            >
                              {art ? "Replace image" : "Upload image"}
                            </button>
                            {art && (
                              <>
                                <button
                                  onClick={() =>
                                    setCrop({
                                      source: art.source,
                                      purpose,
                                      initial: art,
                                    })
                                  }
                                >
                                  Re-crop
                                </button>
                                <button
                                  onClick={() => {
                                    const artwork = { ...game.artwork };
                                    delete artwork[purpose];
                                    patch({ artwork });
                                  }}
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                          {art && (
                            <label className="builder-field">
                              Display
                              <select
                                value={art.fit}
                                onChange={(e) =>
                                  patch({
                                    artwork: {
                                      ...game.artwork,
                                      [purpose]: {
                                        ...art,
                                        fit: e.target.value,
                                      },
                                    },
                                  })
                                }
                              >
                                <option value="contain">
                                  Fit · complete crop
                                </option>
                                <option value="cover">
                                  Fill · cover frame
                                </option>
                              </select>
                            </label>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </Panel>
              )}
              {step === 3 && (
                <>
                  <Panel title="Start with a controller">
                    <div className="builder-two">
                      <label className="builder-field">
                        Output on the PC
                        <select
                          data-guide="pc-output"
                          value={game.inputMethod}
                          onChange={(e) =>
                            patch({ inputMethod: e.target.value as any })
                          }
                        >
                          <option value="gamepad">Virtual gamepad</option>
                          <option value="keyboard">Keyboard bindings</option>
                        </select>
                      </label>
                      <label className="builder-field">
                        Phone button labels
                        <select
                          data-guide="phone-labels"
                          value={game.controller.labels}
                          onChange={(e) =>
                            patch({
                              controller: {
                                ...game.controller,
                                labels: e.target.value as any,
                              },
                            })
                          }
                        >
                          <option value="xbox">Xbox style</option>
                          <option value="playstation">PlayStation style</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                    </div>
                    <p>
                      The phone always looks like a controller. Its labels are
                      separate from the device/input the original game accepts.
                    </p>
                    <div className="builder-preset-cards">
                      {game.controller.modes.map((mode) => (
                        <div key={mode.id}>
                          <strong>{mode.name}</strong>
                          <small>{mode.controls.length} controls</small>
                        </div>
                      ))}
                    </div>
                    <button
                      className="builder-primary"
                      data-guide="open-studio"
                      onClick={() => setStudio(true)}
                    >
                      Open Controller Studio
                    </button>
                    <p className="builder-muted">
                      Move and resize buttons, choose shapes/icons/images,
                      change colors for every player, and map combined actions.
                    </p>
                  </Panel>
                  <Panel title="Input readiness">
                    <div className="builder-readiness">
                      <span className={capabilities?.keyboard ? "ready" : ""}>
                        Keyboard helper{" "}
                        {capabilities?.keyboard ? "ready" : "missing"}
                      </span>
                      <span className={capabilities?.gamepad ? "ready" : ""}>
                        Virtual gamepad{" "}
                        {capabilities?.gamepad
                          ? "available"
                          : "needs optional PC driver"}
                      </span>
                    </div>
                    {capabilities?.message && <p>{capabilities.message}</p>}
                    <small>
                      Controller Lab and phone touch vibration do not need a
                      virtual-controller driver. The optional legacy driver is
                      separately installed and was retired upstream; review its
                      requirements before choosing it.
                    </small>
                    <button
                      onClick={() =>
                        void run(async () => {
                          const result = await libraryCall({
                            type: "capabilities",
                          });
                          setCapabilities(result?.config);
                        })
                      }
                    >
                      Check again
                    </button>
                  </Panel>
                </>
              )}
              {step === 4 && (
                <>
                  <PhoneSetup state={state} />
                  <Panel title="Test menus and gameplay separately">
                    <p>
                      Save this setup, start the game, then choose its
                      gamepad/keyboard input in the game's settings. Menu
                      navigation alone does not prove gameplay works.
                    </p>
                    <div className="builder-check-list">
                      {(
                        [
                          ["launch", "I tested launching this installation"],
                          ["menu", "I tested menu movement / Confirm / Back"],
                          [
                            "gameplay",
                            "I tested gameplay and held combinations",
                          ],
                          [
                            "offline",
                            "I tested a cold launch without internet",
                          ],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={game.tests[key]}
                            onChange={(e) =>
                              patch({
                                tests: {
                                  ...game.tests,
                                  [key]: e.target.checked,
                                  updatedAt: new Date().toISOString(),
                                },
                              })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <NumberField
                      label="Players actually tested"
                      value={game.tests.players}
                      min={1}
                      max={game.maxPlayers}
                      onChange={(v) =>
                        patch({ tests: { ...game.tests, players: v } })
                      }
                    />
                    <label className="builder-field">
                      Compatibility notes
                      <textarea
                        rows={3}
                        value={game.tests.notes}
                        maxLength={2000}
                        onChange={(e) =>
                          patch({
                            tests: { ...game.tests, notes: e.target.value },
                          })
                        }
                        placeholder="Required controller selection, local multiplayer menu, limitations…"
                      />
                    </label>
                    <div className="builder-actions">
                      <button onClick={() => setStudio(true)}>
                        Review controller
                      </button>
                      <button
                        className="builder-primary"
                        disabled={busy || !game.launch.executable}
                        onClick={() => void run(test)}
                      >
                        Save & test in game
                      </button>
                    </div>
                    <small>
                      Checks are your own observations. WaterConsole does not
                      infer compatibility or bypass launchers, authentication or
                      anti-cheat.
                    </small>
                  </Panel>
                </>
              )}
            </div>
            <aside className="builder-library-preview">
              <span className="builder-kicker">LIBRARY PREVIEW</span>
              <div className="builder-preview-cover">
                {game.artwork.cover ? (
                  <img
                    src={hostAsset(game.artwork.cover.asset)}
                    alt="Cover preview"
                    style={{ objectFit: game.artwork.cover.fit }}
                  />
                ) : (
                  <strong>{game.title || "Your game"}</strong>
                )}
              </div>
              <h3>{game.title || "Your game"}</h3>
              <small>
                {game.minPlayers === game.maxPlayers
                  ? game.maxPlayers
                  : game.minPlayers + "–" + game.maxPlayers}{" "}
                players ·{" "}
                {game.connection === "offline-online"
                  ? "Offline & Online"
                  : game.connection === "unknown"
                    ? "Not specified"
                    : game.connection}
              </small>
              <p>
                {game.description ||
                  "Your description will appear in the detail panel."}
              </p>
              <div className="builder-preview-tags">
                {game.tags.filter(Boolean).map((tag, index) => (
                  <span key={tag + index}>{tag}</span>
                ))}
              </div>
              <div className="builder-preview-banner">
                {game.artwork.banner ? (
                  <img
                    src={hostAsset(game.artwork.banner.asset)}
                    alt="Banner preview"
                    style={{ objectFit: game.artwork.banner.fit }}
                  />
                ) : (
                  <span>Separate banner image</span>
                )}
              </div>
              <p className="builder-muted">
                {game.tests.gameplay
                  ? "Tested by you"
                  : game.launch.executable
                    ? "Ready to test"
                    : "Needs setup"}
              </p>
            </aside>
          </div>
          <footer className="builder-footer">
            <span role="status">
              {message || "Private local setup · no account needed"}
            </span>
            {game.revision > 0 && (
              <div className="builder-actions">
                <button
                  onClick={() =>
                    void run(async () => {
                      const result = await libraryCall({
                        type: "duplicate",
                        id: game.id,
                      });
                      if (result?.game) {
                        setGame(result.game);
                        current.current = result.game;
                        original.current = JSON.stringify(result.game);
                        setMessage("Duplicated setup");
                      }
                    })
                  }
                >
                  Duplicate setup
                </button>
                <button onClick={() => setRemoveConfirm(true)}>Remove</button>
              </div>
            )}
            <div className="builder-actions">
              <button
                disabled={step === 0 || busy}
                onClick={() => setStep((x) => x - 1)}
              >
                Back
              </button>
              {step < 4 && (
                <button onClick={() => setStep((x) => x + 1)}>Next</button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await libraryCall({
                      type: "save-draft",
                      game: current.current,
                    });
                    setMessage("Draft saved for later");
                    onClose();
                  })
                }
              >
                Save for later
              </button>
              <button
                className="builder-primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await save(true);
                  })
                }
              >
                {busy ? "Saving…" : "Save to library"}
              </button>
            </div>
          </footer>
        </section>
      )}
      {guide.open && !studio && !crop && !showPhones && (
        <SpotlightGuide
          label="Game setup"
          steps={guideSteps}
          onClose={guide.close}
        />
      )}
      {showStores && (
        <StoreGamePicker
          onClose={() => setShowStores(false)}
          onPick={(imported, notes) => {
            setGame((g) => ({
              ...g,
              title: imported.title,
              description: imported.description,
              tags: imported.tags,
              launch: imported.launch,
              storeRef: imported.storeRef,
              artwork: { ...g.artwork, ...imported.artwork },
            }));
            setMessage(notes.join(" "));
            setShowStores(false);
            setStep(1);
          }}
        />
      )}
      {showRunning && (
        <RunningGamePicker
          onClose={() => setShowRunning(false)}
          onPick={(w) => {
            patch({
              title:
                game.title === "My game"
                  ? (
                      w.title ||
                      w.executable
                        .split(/[\\/]/)
                        .pop()!
                        .replace(/\.exe$/i, "")
                    ).slice(0, 120)
                  : game.title,
              launch: {
                ...game.launch,
                executable: w.executable,
                cwd: w.executable.slice(
                  0,
                  Math.max(
                    w.executable.lastIndexOf("/"),
                    w.executable.lastIndexOf("\\"),
                  ),
                ),
                attachOnly: false,
                attachPid: w.pid,
                method: "auto",
              },
            });
            setMessage(
              "Window selected. Review your setup, then save to connect.",
            );
            setShowRunning(false);
          }}
        />
      )}
      {showPhones && (
        <div
          className="builder-overlay builder-inner-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Connect phones for testing"
          onKeyDown={(e) => trapDialog(e, () => setShowPhones(false))}
        >
          <div className="builder-phone-dialog">
            <PhoneSetup state={state} onClose={() => setShowPhones(false)} />
          </div>
        </div>
      )}
      {crop && (
        <CropEditor
          source={crop.source}
          purpose={crop.purpose}
          initial={crop.initial}
          onClose={() => setCrop(null)}
          onApply={(art) => {
            patch({
              artwork: { ...current.current.artwork, [crop.purpose]: art },
            });
            setCrop(null);
          }}
        />
      )}
      {removeConfirm && (
        <div className="builder-overlay builder-inner-overlay">
          <section
            className="builder-confirm"
            role="alertdialog"
            aria-label="Remove library entry"
          >
            <h2>Remove “{game.title}”?</h2>
            <p>
              This removes its library entry. Your original installation and
              source images remain on the PC.
            </p>
            <div className="builder-actions">
              <button onClick={() => setRemoveConfirm(false)}>Keep game</button>
              <button
                className="builder-primary"
                onClick={() =>
                  void run(async () => {
                    await libraryCall({ type: "remove", id: game.id });
                    onClose();
                  })
                }
              >
                Remove from library
              </button>
            </div>
            {error && <p className="builder-error">{error}</p>}
          </section>
        </div>
      )}
      {discard && (
        <div className="builder-overlay builder-inner-overlay">
          <section
            className="builder-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label="Unsaved changes"
          >
            <h2>Keep your changes?</h2>
            <p>
              You can keep editing or leave this workspace. Your previously
              saved library entry stays unchanged.
            </p>
            <div className="builder-actions">
              <button onClick={() => setDiscard(false)}>Keep editing</button>
              <button className="builder-primary" onClick={onClose}>
                Leave editor
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
