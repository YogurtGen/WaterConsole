import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientMessage, Player, SessionState } from "../shared/types";
import { nativeSlotAllowed } from "../shared/types";
import { controllerAssets } from "../shared/studio-validation";
import { StudioSurface } from "./studio-surface";
import { ControllerHaptics } from "./haptics";
import { Brand, Icon } from "./ui";
export function StudioPhone({
  state,
  player,
  token,
  connection,
  send,
  nextSequence,
  haptics,
  onFullscreen,
  error,
}: {
  state: SessionState;
  player: Player;
  token: string;
  connection: string;
  send: (m: ClientMessage) => void;
  nextSequence: () => number;
  haptics: ControllerHaptics;
  onFullscreen: () => void;
  error: string;
}) {
  const session = state.studio!;
  const definition = useMemo(
    () => session.definition,
    [
      session.definition.revision,
      session.modeId,
      state.epoch,
      state.selectedGameId,
    ],
  );
  const mode =
    definition.modes.find((m) => m.id === session.modeId) ??
    definition.modes[0];
  const [settings, setSettings] = useState(false),
    [vibration, setVibration] = useState(haptics.enabled),
    [mirror, setMirror] = useState(false);
  const [variant, setVariant] = useState<"classic" | "assisted">(() => {
    try {
      return localStorage.getItem(
        "waterconsole.variant." + state.selectedGameId,
      ) === "classic"
        ? "classic"
        : "assisted";
    } catch {
      return "assisted";
    }
  });
  const [images, setImages] = useState<Record<string, string>>({});
  const current = useRef(state);
  current.current = state;
  const slotAllowed =
    session.preview ||
    nativeSlotAllowed(state.native, state.displayMode, player.slot);
  useEffect(() => {
    const urls: string[] = [];
    let active = true;
    const abort = new AbortController();
    const ids = controllerAssets(definition);
    void Promise.all(
      ids.map(async (id) => {
        try {
          const response = await fetch("/api/controller-assets/" + id, {
            headers: { Authorization: "Bearer " + token },
            signal: abort.signal,
          });
          if (!response.ok) return;
          const url = URL.createObjectURL(await response.blob());
          urls.push(url);
          if (active) setImages((old) => ({ ...old, [id]: url }));
        } catch {}
      }),
    );
    return () => {
      active = false;
      abort.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      setImages({});
    };
  }, [definition, token]);
  useEffect(() => {
    haptics.stop();
    haptics.suspended = settings || connection !== "connected" || !slotAllowed;
    return () => {
      haptics.suspended = false;
    };
  }, [state.epoch, session.modeId, variant, connection, settings, slotAllowed]);
  const enabled =
    connection === "connected" &&
    !settings &&
    slotAllowed &&
    (session.preview ||
      (state.phase === "native" &&
        state.native.focused &&
        state.native.status === "running" &&
        !state.native.quitting));
  const updateVariant = (value: "classic" | "assisted") => {
    setVariant(value);
    try {
      localStorage.setItem(
        "waterconsole.variant." + state.selectedGameId,
        value,
      );
    } catch {}
  };
  return (
    <main
      className="studio-phone"
      style={{ background: definition.theme.background }}
    >
      <header className="studio-phone-toolbar">
        <Brand compact />
        <span>
          <i className={connection === "connected" ? "online-dot" : ""} />P
          {player.slot} · {player.name}
          <small>{player.canNavigate ? "Navigator" : "Player"}</small>
        </span>
        <div>
          <button
            aria-label="Controller settings"
            onClick={() => setSettings(!settings)}
          >
            <Icon name="settings" />
          </button>
          <button aria-label="Toggle fullscreen" onClick={onFullscreen}>
            <Icon name="expand" />
          </button>
          {player.canNavigate && (
            <button onClick={() => send({ type: "nav", action: "library" })}>
              {session.preview ? "Home" : "Stop & Home"}
            </button>
          )}
        </div>
      </header>
      <nav className="studio-phone-modes" aria-label="Controller modes">
        {definition.modes.map((m) => (
          <button
            key={m.id}
            className={m.id === mode.id ? "selected" : ""}
            disabled={!player.canNavigate}
            onClick={() => send({ type: "studio-mode", modeId: m.id })}
          >
            {m.name}
          </button>
        ))}
        {definition.allowPersonal &&
          mode.controls.some((c) => c.variant !== "all") && (
            <select
              aria-label="Control style"
              value={variant}
              onChange={(e) => updateVariant(e.target.value as any)}
            >
              <option value="assisted">Assisted · Drift + gas</option>
              <option value="classic">Classic · Separate controls</option>
            </select>
          )}
      </nav>
      {(session.preview || !enabled || error) && (
        <div className="studio-phone-notice" role="status">
          {settings
            ? "Controls paused while settings are open."
            : session.preview
              ? "Safe preview · your inputs do not control a game."
              : !slotAllowed
                ? `Spectating · this game uses the first ${state.native.maxPlayers ?? 0} player slots.`
                : error ||
                  state.native.message ||
                  "Focus the game window on your PC to enable controls."}
        </div>
      )}
      <div className="studio-phone-canvas">
        <StudioSurface
          definition={definition}
          modeId={mode.id}
          slot={player.slot}
          navigator={player.canNavigate}
          variant={variant}
          mirror={mirror}
          epoch={state.epoch}
          enabled={enabled}
          asset={(id) => images[id]}
          onInput={(input) => {
            const s = current.current;
            if (
              s.studio &&
              s.studio.definition.revision === input.revision &&
              s.studio.modeId === input.modeId &&
              connection === "connected"
            )
              send({
                type: "studio-input",
                version: 1,
                epoch: s.epoch,
                seq: nextSequence(),
                input,
              });
          }}
          onPress={(duration) => {
            if (enabled && !document.hidden && document.hasFocus()) {
              haptics.activate();
              haptics.cue(duration);
            }
          }}
        />
      </div>
      {settings && (
        <section
          className="studio-phone-settings"
          aria-label="Controller settings"
        >
          <div>
            <h2>Your controller</h2>
            <button onClick={() => setSettings(false)}>Done</button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={vibration}
              disabled={!haptics.supported}
              onChange={(e) => {
                setVibration(e.target.checked);
                haptics.setEnabled(e.target.checked);
              }}
            />
            Vibration
          </label>
          <button
            disabled={!haptics.supported || !vibration}
            onClick={() => haptics.test()}
          >
            Test vibration
          </button>
          {!haptics.supported && (
            <p>This browser does not support vibration.</p>
          )}
          <label>
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => setMirror(e.target.checked)}
            />
            Left-handed layout
          </label>
          <p>
            Your host edits colors, buttons and bindings in Controller Studio.
          </p>
        </section>
      )}
    </main>
  );
}
