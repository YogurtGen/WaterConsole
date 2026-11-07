import { SpotlightGuide, useGuidedHelp, type GuideStep } from "./guided-tour";
import { trapDialog } from "./builder-primitives";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as PE,
} from "react";
import {
  ART_RECOMMENDATIONS,
  clamp,
  type ArtworkSlot,
  type CropSpec,
} from "../shared/studio-model";
import { hostAsset } from "./studio-surface";
export function CropEditor({
  source,
  purpose,
  initial,
  onApply,
  onClose,
}: {
  source: string;
  purpose: "cover" | "banner" | "button";
  initial?: ArtworkSlot;
  onApply: (slot: ArtworkSlot) => void;
  onClose: () => void;
}) {
  const target = ART_RECOMMENDATIONS[purpose];
  const [crop, setCrop] = useState<CropSpec>(
    initial?.crop ?? {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      rotation: 0,
      ratio: "recommended",
    },
  );
  const [fit, setFit] = useState<"contain" | "cover">(
    initial?.fit ?? "contain",
  );
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [rendered, setRendered] = useState("");
  const [sample, setSample] = useState("");
  const guide = useGuidedHelp("artwork-crop", !!rendered);
  const guideSteps: GuideStep[] = [
    {
      target: '[aria-label="Crop ratio"]',
      title: "Choose the right crop",
      description: `Recommended size exports this ${purpose} at ${target.width} × ${target.height}. Cover and banner have different recommendations. You can also choose a manual ratio or Free crop.`,
    },
    {
      target: ".crop-selection",
      title: "Frame the part you want",
      description:
        "Drag inside the bright rectangle to move it. Drag a corner to resize, rotate if needed, or enter exact percentages below. The normalized original stays available for Re-crop.",
    },
    {
      target: ".crop-result",
      title: "Check the destination frame",
      description:
        "Fit keeps the complete crop; Fill covers the destination and may hide edges. This preview shows how it will appear, even if you choose a different crop ratio.",
    },
    {
      target: '[data-guide="crop-apply"]',
      title: "Keep this crop",
      description:
        "Use this crop saves the artwork into this game's library setup. It does not overwrite your source file. Press ? whenever you want to replay these steps.",
    },
  ];

  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const initialized = useRef(false);
  const raw = useRef<HTMLImageElement | null>(null),
    oriented = useRef<HTMLCanvasElement | null>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    role: string;
    x: number;
    y: number;
    crop: CropSpec;
  } | null>(null);
  const [available, setAvailable] = useState(720);
  const renderSize = useMemo(() => {
    const scale = Math.min(available / size.w, 350 / size.h);
    return { w: size.w * scale, h: size.h * scale };
  }, [available, size]);
  function ratioValue(key: string) {
    if (key === "recommended") return target.ratio;
    if (key === "original") return size.w / size.h;
    if (key === "free") return 0;
    const [w, h] = key.split(":").map(Number);
    return w / h;
  }
  function selectRatio(key: string) {
    const ratio = ratioValue(key);
    if (!ratio) {
      setCrop((c) => ({ ...c, ratio: key }));
      return;
    }
    const n = (ratio * size.h) / size.w;
    const w = Math.min(1, n),
      h = w / n;
    setCrop((c) => ({
      ...c,
      ratio: key,
      w,
      h,
      x: clamp(c.x + c.w / 2 - w / 2, 0, 1 - w),
      y: clamp(c.y + c.h / 2 - h / 2, 0, 1 - h),
    }));
  }
  useEffect(() => {
    const image = new Image();
    let active = true;
    image.onload = () => {
      if (!active) return;
      raw.current = image;
      rotateImage(crop.rotation);
    };
    image.onerror = () => setError("The original image could not be loaded.");
    image.src = hostAsset(source)!;
    return () => {
      active = false;
    };
  }, [source]);
  function rotateImage(rotation: CropSpec["rotation"]) {
    const image = raw.current;
    if (!image) return;
    const swap = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swap ? image.height : image.width;
    canvas.height = swap ? image.width : image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    oriented.current = canvas;
    setRendered(canvas.toDataURL("image/png"));
    setSize({ w: canvas.width, h: canvas.height });
  }
  useEffect(() => {
    if (!canvasBox.current) return;
    const observer = new ResizeObserver((entries) =>
      setAvailable(Math.max(140, entries[0].contentRect.width)),
    );
    observer.observe(canvasBox.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!oriented.current) return;
    const frame = requestAnimationFrame(() => {
      const image = oriented.current!;
      const canvas = document.createElement("canvas");
      const w = Math.max(1, crop.w * image.width),
        h = Math.max(1, crop.h * image.height),
        scale = Math.min(256 / w, 256 / h);
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas
        .getContext("2d")!
        .drawImage(
          image,
          crop.x * image.width,
          crop.y * image.height,
          w,
          h,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      setSample(canvas.toDataURL());
    });
    return () => cancelAnimationFrame(frame);
  }, [crop, size]);
  useEffect(() => {
    if (!initialized.current && size.w > 1) {
      initialized.current = true;
      if (!initial) selectRatio("recommended");
    }
  }, [size.w, size.h]);
  function start(e: PE<HTMLDivElement>, role: string) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { role, x: e.clientX, y: e.clientY, crop: { ...crop } };
  }
  function move(e: PE<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = (e.clientX - g.x) / renderSize.w,
      dy = (e.clientY - g.y) / renderSize.h;
    if (g.role === "move") {
      setCrop({
        ...g.crop,
        x: clamp(g.crop.x + dx, 0, 1 - g.crop.w),
        y: clamp(g.crop.y + dy, 0, 1 - g.crop.h),
      });
      return;
    }
    const left = g.role.includes("w"),
      top = g.role.includes("n");
    const ax = left ? g.crop.x + g.crop.w : g.crop.x,
      ay = top ? g.crop.y + g.crop.h : g.crop.y;
    let w = Math.max(0.02, g.crop.w + (left ? -dx : dx)),
      h = Math.max(0.02, g.crop.h + (top ? -dy : dy));
    const ratio = ratioValue(g.crop.ratio);
    if (ratio) {
      const n = (ratio * size.h) / size.w;
      if (Math.abs(dy) > Math.abs(dx)) w = h * n;
      const maxW = Math.min(left ? ax : 1 - ax, (top ? ay : 1 - ay) * n);
      w = Math.min(w, maxW);
      h = w / n;
    } else {
      w = Math.min(w, left ? ax : 1 - ax);
      h = Math.min(h, top ? ay : 1 - ay);
    }
    setCrop({ ...g.crop, x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
  }
  async function apply() {
    if (!window.waterconsole?.library) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.waterconsole.library({
        type: "crop",
        source,
        crop,
        purpose: crop.ratio === "recommended" ? purpose : undefined,
      });
      if (!result.ok || !result.file?.id)
        throw new Error(result.error || "Artwork could not be saved.");
      onApply({ source, asset: result.file.id, crop, fit });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Crop failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="builder-overlay crop-overlay">
      <section
        className="crop-editor"
        onKeyDown={(e) => trapDialog(e, onClose)}
        role="dialog"
        aria-modal="true"
        aria-label={"Crop " + purpose}
      >
        <header>
          <div>
            <span className="builder-kicker">
              ARTWORK / {purpose.toUpperCase()}
            </span>
            <h2>Make it fit your {purpose}.</h2>
          </div>
          <button
            className="guide-help"
            aria-label="Replay crop guide"
            title="Replay tutorial"
            onClick={guide.show}
          >
            ?
          </button>
          <button className="builder-quiet" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>
        <div className="crop-tools">
          <label>
            Crop ratio
            <select
              aria-label="Crop ratio"
              value={crop.ratio}
              onChange={(e) => selectRatio(e.target.value)}
            >
              <option value="recommended">
                Recommended size · {target.width} × {target.height}
              </option>
              {[
                "original",
                "1:1",
                "1:3",
                "3:4",
                "2:3",
                "16:9",
                "3:1",
                "free",
              ].map((v) => (
                <option key={v} value={v}>
                  {v === "free"
                    ? "Free crop"
                    : v === "original"
                      ? "Original ratio"
                      : v === "1:3"
                        ? "1:3 · Tall"
                        : v}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              const rotation = ((crop.rotation + 90) %
                360) as CropSpec["rotation"];
              setCrop({
                ...crop,
                rotation,
                x: 0,
                y: 0,
                w: 1,
                h: 1,
                ratio: "free",
              });
              rotateImage(rotation);
            }}
          >
            Rotate 90°
          </button>
          <button
            onClick={() => {
              setCrop({ x: 0, y: 0, w: 1, h: 1, rotation: 0, ratio: "free" });
              rotateImage(0);
            }}
          >
            Reset
          </button>
        </div>
        <div className="crop-main">
          <div ref={canvasBox} className="crop-stage-area">
            <div
              className="crop-stage"
              style={{ width: renderSize.w, height: renderSize.h }}
            >
              {rendered && (
                <img draggable={false} src={rendered} alt="Original artwork" />
              )}
              <div
                className="crop-selection"
                style={{
                  left: crop.x * renderSize.w,
                  top: crop.y * renderSize.h,
                  width: crop.w * renderSize.w,
                  height: crop.h * renderSize.h,
                }}
                onPointerDown={(e) => start(e, "move")}
                onPointerMove={move}
                onPointerUp={() => {
                  gesture.current = null;
                }}
                onPointerCancel={() => {
                  gesture.current = null;
                }}
                tabIndex={0}
                aria-label="Move crop with arrow keys"
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 10 : 1;
                  let x = crop.x,
                    y = crop.y;
                  if (e.key === "ArrowLeft") x -= step / size.w;
                  else if (e.key === "ArrowRight") x += step / size.w;
                  else if (e.key === "ArrowUp") y -= step / size.h;
                  else if (e.key === "ArrowDown") y += step / size.h;
                  else return;
                  e.preventDefault();
                  setCrop({
                    ...crop,
                    x: clamp(x, 0, 1 - crop.w),
                    y: clamp(y, 0, 1 - crop.h),
                  });
                }}
              >
                {["nw", "ne", "sw", "se"].map((role) => (
                  <div
                    key={role}
                    className={"crop-handle " + role}
                    onPointerDown={(e) => start(e, role)}
                    onPointerMove={move}
                    onPointerUp={() => {
                      gesture.current = null;
                    }}
                    onPointerCancel={() => {
                      gesture.current = null;
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <aside className="crop-result">
            <h3>{target.label}</h3>
            <p>Preview in the destination frame</p>
            <div
              className={"crop-result-frame purpose-" + purpose}
              style={{ aspectRatio: target.width / target.height }}
            >
              {sample && (
                <img
                  src={sample}
                  alt="Destination crop preview"
                  style={{ objectFit: fit }}
                />
              )}
            </div>
            <label>
              Display in frame
              <select
                aria-label="Artwork fit"
                value={fit}
                onChange={(e) => setFit(e.target.value as any)}
              >
                <option value="contain">Fit · keep the complete crop</option>
                <option value="cover">Fill · cover the frame</option>
              </select>
            </label>
            <small>
              {crop.ratio === "recommended"
                ? `Export: ${target.width} × ${target.height} pixels`
                : `Export: ${Math.round(crop.w * size.w)} × ${Math.round(crop.h * size.h)} pixels`}
            </small>
            {size.w * crop.w < target.width && (
              <small>
                The source is smaller than the recommended export. Enlarging it
                may reduce sharpness.
              </small>
            )}
          </aside>
        </div>
        <div className="crop-numbers">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k}>
              {{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]} %
              <input
                type="number"
                min={k === "x" || k === "y" ? 0 : 1}
                max={100}
                step={0.1}
                value={Math.round(crop[k] * 1000) / 10}
                onChange={(e) => {
                  const n = clamp(
                    Number(e.target.value) / 100,
                    k === "w" || k === "h" ? 0.01 : 0,
                    k === "x" ? 1 - crop.w : k === "y" ? 1 - crop.h : 1,
                  );
                  const next = { ...crop, [k]: n, ratio: "free" };
                  next.w = Math.min(next.w, 1 - next.x);
                  next.h = Math.min(next.h, 1 - next.y);
                  setCrop(next);
                }}
              />
            </label>
          ))}
        </div>
        {error && (
          <p className="builder-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>Original artwork is kept for future edits.</span>
          <button
            className="builder-primary"
            data-guide="crop-apply"
            onClick={apply}
            disabled={busy || !rendered}
          >
            {busy ? "Saving crop…" : "Use this crop"}
          </button>
        </footer>
      </section>
      {guide.open && (
        <SpotlightGuide
          label="Artwork crop"
          steps={guideSteps}
          onClose={guide.close}
        />
      )}
    </div>
  );
}
