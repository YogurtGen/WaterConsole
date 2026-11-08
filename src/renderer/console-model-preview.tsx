import type { Theme } from "../shared/studio-model";
import type { CSSProperties } from "react";
import { StudioDpad } from "./studio-dpad";
export function ConsoleModelPreview({
  model,
  theme,
}: {
  model: string;
  theme: Theme;
}) {
  const primary = model === "primary",
    round = model === "face";
  return (
    <span className="console-model-preview" aria-hidden="true">
      {model === "petals" ? (
        <span
          className="console-model-dpad"
          style={
            {
              "--control-rest": theme.button,
              "--control-active": theme.pressed,
              "--control-bg": theme.background,
              "--control-icon": theme.text,
              "--pad-arrow": theme.text,
              "--pad-hub": theme.background,
            } as CSSProperties
          }
        >
          <StudioDpad x={0} y={0} />
        </span>
      ) : (
        <svg viewBox="0 0 72 56" focusable="false">
          {model === "analog" ? (
            <>
              <circle
                cx="36"
                cy="28"
                r="22"
                fill={theme.button}
                stroke={theme.border}
              />
              <circle
                cx="36"
                cy="28"
                r="17"
                fill="none"
                stroke={theme.border}
              />
              <circle cx="36" cy="28" r="9" fill={theme.accent} />
            </>
          ) : round ? (
            <circle
              cx="36"
              cy="28"
              r="20"
              fill={theme.button}
              stroke={theme.border}
            />
          ) : (
            <rect
              x="5"
              y={model === "shoulder" ? 18 : 13}
              width="62"
              height={model === "shoulder" ? 20 : 30}
              rx={10}
              fill={primary ? theme.accent : theme.button}
              stroke={primary ? theme.accent : theme.border}
            />
          )}
        </svg>
      )}
    </span>
  );
}
