import type { CSSProperties, ReactNode } from "react";
import type { GameManifest, HostCommand, HostState } from "../shared/types";
import { Avatar, Icon } from "./ui";

export function ConfiguredGameScreen({
  state,
  game,
  artwork,
  send,
  openPair,
}: {
  state: HostState;
  game?: GameManifest;
  artwork: ReactNode;
  send: (command: HostCommand) => void;
  openPair: () => void;
}) {
  const native = state.native;
  const active =
    native.status === "running" && native.focused && !native.quitting;
  const starting = native.status === "starting" && !native.quitting;
  const failed = native.status === "error" && !native.quitting;
  const connection =
    game?.connection === "offline-online"
      ? "OFFLINE · ONLINE"
      : game?.connection?.toUpperCase();
  const playerCount = Math.max(
    1,
    Math.min(4, native.maxPlayers ?? game?.maxPlayers ?? 1),
  );
  const modes = state.studio?.definition.modes.map((mode) => ({
    id: mode.id,
    name: mode.name,
  })) ?? [
    { id: "menu", name: "Menu controls" },
    { id: "game", name: "Game controls" },
  ];
  const selectedMode = state.studio?.modeId ?? native.controls;
  const status = native.quitting
    ? "CLOSING"
    : starting
      ? "STARTING"
      : failed
        ? "NEEDS ATTENTION"
        : active
          ? "GAME IN FOCUS"
          : "INPUT PAUSED";
  const title = native.quitting
    ? "Closing your game…"
    : starting
      ? "Launching your game…"
      : failed
        ? "The game needs attention."
        : active
          ? "Your controllers are ready."
          : "Input is paused.";
  const description =
    native.message ||
    (native.quitting
      ? "Releasing phone input and waiting for the game to close."
      : starting
        ? "Opening your installed game. Your phones stay connected. Complete any launcher sign-in or update on the PC."
        : active
          ? "Use your phone to play. Select the matching input device in the game, then choose the phone layout you need below."
          : "Phone input is released whenever the game loses focus. Bring the game forward to resume.");
  const needsGamepad = native.requiresGamepad ?? game?.requiresGamepad;
  return (
    <main className="native-screen configured-game-screen">
      <div className="native-heading">
        <div>
          <span className="eyebrow">
            NOW PLAYING{connection ? " · " + connection : ""}
          </span>
          <h1>
            {game?.title ?? "Your PC game"}
            <span className="mint">.</span>
          </h1>
        </div>
        <button
          className="button"
          disabled={native.quitting}
          onClick={() => send({ type: "stopGame" })}
        >
          <Icon name="back" size={18} />
          {native.quitting ? "Closing game…" : "Stop & return Home"}
        </button>
      </div>
      <div className="native-stage">
        <div className="native-art">
          {artwork}
          <span>YOUR GAME OPENS IN ITS OWN WINDOW</span>
        </div>
        <section className="native-session" aria-label="Game session">
          <span
            className={"native-status" + (active ? " is-active" : "")}
            role="status"
          >
            <span className="status-dot" />
            {status}
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
          <button
            className="button primary"
            disabled={native.quitting || starting || !native.available}
            onClick={() => send({ type: "nativeFocus" })}
          >
            <Icon name="monitor" size={19} />
            Focus game
          </button>
          <div className="native-mode-picker">
            <span className="eyebrow">CONTROLLER MODE</span>
            <div
              className="native-mode-buttons"
              role="group"
              aria-label="Native controller mode"
            >
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  className={selectedMode === mode.id ? "active" : ""}
                  aria-pressed={selectedMode === mode.id}
                  disabled={native.quitting}
                  onClick={() =>
                    state.studio
                      ? send({ type: "studioMode", modeId: mode.id })
                      : send({
                          type: "nativeControls",
                          mode: mode.id === "menu" ? "menu" : "game",
                        })
                  }
                >
                  {mode.name}
                </button>
              ))}
            </div>
            <small>
              Choose the phone layout for the current screen. This does not
              switch screens inside the game.
            </small>
          </div>
          {needsGamepad && (
            <p className="native-gamepad-status" role="status">
              <Icon
                name={native.gamepad?.available ? "check" : "monitor"}
                size={14}
              />
              <span>
                {native.gamepad?.available
                  ? "PC controller support is ready. Select the matching device inside your game."
                  : native.gamepad?.message ||
                    "PC controller support is required. Check controller setup on this PC."}
              </span>
            </p>
          )}
        </section>
      </div>
      <section
        className="native-players configured-game-players"
        style={{ "--native-player-count": playerCount } as CSSProperties}
        aria-label="Native game players"
      >
        {Array.from({ length: playerCount }, (_, i) => i + 1).map((slot) => {
          const player = state.players.find((p) => p.slot === slot);
          return (
            <div key={slot} className="native-player">
              <span className="native-player-slot">P{slot}</span>
              {player ? (
                <>
                  <Avatar name={player.name} color={player.color} small />
                  <div>
                    <strong>{player.name}</strong>
                    <small>
                      {!player.connected
                        ? "Reconnecting…"
                        : needsGamepad && !native.gamepad?.available
                          ? "Controller setup needed on PC"
                          : active
                            ? "Controller ready"
                            : "Connected · input paused"}
                    </small>
                  </div>
                </>
              ) : (
                <>
                  <Icon name="phone" size={25} />
                  <div>
                    <strong>Waiting for a player</strong>
                    <button onClick={openPair}>Connect a phone</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </section>
      <p className="native-footnote">
        <Icon name="lock" size={15} />
        {game?.offlineNote ||
          game?.launchRequirement?.description ||
          "Phone input is released when the game loses focus or a controller disconnects."}
      </p>
    </main>
  );
}
