import type { CSSProperties, ReactNode } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import "./style.css";

export type IconName =
  | "phone"
  | "expand"
  | "settings"
  | "close"
  | "play"
  | "people"
  | "arrow"
  | "heart"
  | "grid"
  | "search"
  | "volume"
  | "muted"
  | "check"
  | "back"
  | "edit"
  | "wifi"
  | "lock"
  | "unlock"
  | "power"
  | "clock"
  | "chevron"
  | "download"
  | "rotate"
  | "monitor"
  | "copy";
const paths: Record<IconName, ReactNode> = {
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M10 5h4m-3 14h2M12 9v6m-3-3h6" />
    </>
  ),
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  settings: (
    <>
      <path d="m9 3-.6 2.6-2.5 1L3.7 6 2 9l1.9 1.9v2.2L2 15l1.7 3 2.2-.6 2.5 1L9 21h6l.6-2.6 2.5-1 2.2.6 1.7-3-1.9-1.9v-2.2L22 9l-1.7-3-2.2.6-2.5-1L15 3Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  play: <path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none" />,
  people: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-2-4" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  heart: (
    <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </>
  ),
  volume: (
    <>
      <path d="M11 4 6 8H2v8h4l5 4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  muted: (
    <>
      <path d="M11 4 6 8H2v8h4l5 4Zm5 5 6 6m0-6-6 6" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  edit: (
    <>
      <path d="m16 3 5 5-12 12H4v-5ZM13 6l5 5" />
    </>
  ),
  wifi: (
    <>
      <path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0" />
    </>
  ),
  power: (
    <>
      <path d="M12 2v10M6 5a9 9 0 1 0 12 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  rotate: (
    <>
      <path d="m16 2 5 4-5 4M21 6H9a6 6 0 0 0-6 6m5 10-5-4 5-4M3 18h12a6 6 0 0 0 6-6" />
    </>
  ),
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 4V3H3v13h1" />
    </>
  ),
};
export function Icon({
  name,
  size = 22,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Mark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 2C16 10 6 19 6 29a16 16 0 0 0 32 0C38 19 28 10 22 2Z"
        fill="currentColor"
      />
      <path
        d="m12 29 6-7 5 8 5-8 5 7"
        stroke="#08221b"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <Mark />
      {!compact && (
        <span>
          Water<span className="brand-light">Console</span>
        </span>
      )}
    </span>
  );
}
export function Avatar({
  name,
  color,
  slot,
  small = false,
}: {
  name: string;
  color: string;
  slot?: number;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ "--player": color } as CSSProperties}
    >
      {name.trim().slice(0, 1).toUpperCase() || "P"}
      {slot !== undefined && <sup>{slot}</sup>}
    </span>
  );
}
export function IconButton({
  name,
  label,
  onClick,
  disabled = false,
  className = "",
}: {
  name: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} />
    </button>
  );
}
export const asset = (name: string) => `./assets/${name}.svg`;
