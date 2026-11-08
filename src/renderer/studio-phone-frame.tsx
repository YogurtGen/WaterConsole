import type { CSSProperties, ReactNode } from "react";
import type { StudioMode, Theme } from "../shared/studio-model";
import { Brand, Icon } from "./ui";
export function StudioPhoneFrame({
  title,
  name = "Player",
  slot = 1,
  navigator = true,
  connected = true,
  rtt = null,
  modes,
  modeId,
  onMode,
  onSettings,
  onFullscreen,
  onHome,
  preview = false,
  toolsReadOnly = false,
  status,
  theme,
  extra,
  children,
}: {
  title: string;
  name?: string;
  slot?: number;
  navigator?: boolean;
  connected?: boolean;
  rtt?: number | null;
  modes: Pick<StudioMode, "id" | "name">[];
  modeId: string;
  onMode?: (id: string) => void;
  onSettings?: () => void;
  onFullscreen?: () => void;
  onHome?: () => void;
  preview?: boolean;
  toolsReadOnly?: boolean;
  status?: string;
  theme: Theme;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const style = {
    background: theme.background,
    color: theme.text,
    "--phone-panel": theme.panel,
    "--phone-button": theme.button,
    "--phone-accent": theme.accent,
    "--phone-border": theme.border,
  } as CSSProperties;
  return (
    <div
      className={
        "studio-phone phone-console-frame" +
        (toolsReadOnly ? " studio-phone-preview" : "")
      }
      style={style}
    >
      <header className="phone-console-header">
        <span className="phone-console-brand">
          <Brand compact />
        </span>
        <div className="phone-console-identity">
          <small title={title}>{title}</small>
          <strong>
            <i className={connected ? "online-dot" : ""} />P{slot} · {name}
          </strong>
        </div>
        <span className="phone-console-latency">
          <i className={connected ? "online-dot" : ""} />
          {preview && toolsReadOnly
            ? "Phone preview"
            : `P${slot} · ${rtt === null ? (connected ? "Connected" : "Reconnecting") : rtt + " ms"}`}
        </span>
        <div className="phone-console-actions">
          <button
            className="phone-console-home"
            disabled={!navigator}
            aria-label={preview ? "Return Home" : "Stop & return Home"}
            aria-disabled={toolsReadOnly || !navigator}
            tabIndex={toolsReadOnly ? -1 : 0}
            onClick={toolsReadOnly ? undefined : onHome}
          >
            <Icon name="back" size={18} />
            <span>{preview ? "Home" : "Stop & return Home"}</span>
          </button>
          <button
            className="phone-console-icon"
            aria-label="Controller settings"
            aria-disabled={toolsReadOnly}
            tabIndex={toolsReadOnly ? -1 : 0}
            onClick={toolsReadOnly ? undefined : onSettings}
          >
            <Icon name="settings" size={22} />
          </button>
          <button
            className="phone-console-icon"
            aria-label="Toggle fullscreen"
            aria-disabled={toolsReadOnly}
            tabIndex={toolsReadOnly ? -1 : 0}
            onClick={toolsReadOnly ? undefined : onFullscreen}
          >
            <Icon name="expand" size={22} />
          </button>
        </div>
      </header>
      <div className="phone-console-modebar">
        <nav className="studio-phone-modes" aria-label="Controller modes">
          {modes.map((m) => (
            <button
              key={m.id}
              className={m.id === modeId ? "selected" : ""}
              aria-pressed={m.id === modeId}
              disabled={!navigator}
              onClick={() => onMode?.(m.id)}
            >
              {m.name}
            </button>
          ))}
        </nav>
        {extra}
        <span
          className="phone-console-status"
          role="status"
          title={
            status ||
            (preview ? "Safe preview · no real game input" : "Game in focus")
          }
        >
          <i className={connected ? "online-dot" : ""} />
          {status || (preview ? "Safe preview" : "Game in focus")}
        </span>
      </div>
      {children}
    </div>
  );
}
export function StudioDeviceFrame({
  active,
  title,
  modes,
  modeId,
  onMode,
  theme,
  slot,
  children,
}: {
  active: boolean;
  title: string;
  modes: StudioMode[];
  modeId: string;
  onMode: (id: string) => void;
  theme: Theme;
  slot: number;
  children: ReactNode;
}) {
  return active ? (
    <StudioPhoneFrame
      title={title}
      modes={modes}
      modeId={modeId}
      onMode={onMode}
      theme={theme}
      slot={slot}
      preview
      toolsReadOnly
    >
      <div className="studio-phone-canvas">{children}</div>
    </StudioPhoneFrame>
  ) : (
    <>{children}</>
  );
}
