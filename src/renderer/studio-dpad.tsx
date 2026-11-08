import { Mark } from "./ui";
export function StudioDpad({
  model = "petals",
  x,
  y,
}: {
  model?: "cross" | "petals" | "disc";
  x: number;
  y: number;
}) {
  const active = [y > 0.3, x > 0.3, y < -0.3, x < -0.3];
  return (
    <span className={"studio-pad-model model-" + model} aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        {model === "disc" && (
          <circle cx="50" cy="50" r="48" className="pad-disc-base" />
        )}
        {model === "cross" && (
          <path
            className="pad-cross-base"
            d="M38 4H62Q66 4 66 8V34H92Q96 34 96 38V62Q96 66 92 66H66V92Q66 96 62 96H38Q34 96 34 92V66H8Q4 66 4 62V38Q4 34 8 34H34V8Q34 4 38 4Z"
          />
        )}
        {[0, 90, 180, 270].map((angle, i) => (
          <g
            key={angle}
            transform={`rotate(${angle} 50 50)`}
            className={active[i] ? "direction-active" : ""}
          >
            {model === "petals" ? (
              <path
                className="pad-leaf"
                d="M50 2C61.6 2 71 11.4 71 23V29L50 43L29 29V23C29 11.4 38.4 2 50 2Z"
              />
            ) : (
              <path
                className="pad-direction-fill"
                d="M36 7H64V34L50 46L36 34Z"
              />
            )}
            <path className="pad-arrow" d="M50 16L45.5 24.5H54.5Z" />
          </g>
        ))}
        {model === "petals" ? (
          <circle className="pad-hub" cx="50" cy="50" r="17" />
        ) : (
          <circle className="pad-pivot" cx="50" cy="50" r="3" />
        )}
      </svg>
      {model === "petals" && (
        <span className="pad-hub-mark">
          <Mark size={24} />
        </span>
      )}
    </span>
  );
}
