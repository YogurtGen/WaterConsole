import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameManifest } from "../shared/types";
import { libraryCall, trapDialog } from "./builder-primitives";
export interface CardMenuAnchor {
  x: number;
  y: number;
  trigger: HTMLElement;
}
export function LibraryCardMenu({
  game,
  anchor,
  onEdit,
  onClose,
}: {
  game: GameManifest;
  anchor: CardMenuAnchor;
  onEdit: (id: string, studio?: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: anchor.x, y: anchor.y }),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = (restore = true) => {
    onClose();
    if (restore)
      requestAnimationFrame(() => {
        if (anchor.trigger.isConnected)
          anchor.trigger.focus({ preventScroll: true });
        else
          document
            .querySelector<HTMLButtonElement>(".library-add-game")
            ?.focus();
      });
  };
  useLayoutEffect(() => {
    const e = ref.current;
    if (!e) return;
    const r = e.getBoundingClientRect();
    setPosition({
      x: Math.max(12, Math.min(anchor.x, innerWidth - r.width - 12)),
      y: Math.max(12, Math.min(anchor.y, innerHeight - r.height - 12)),
    });
    (e.querySelector<HTMLElement>("button") ?? e).focus({
      preventScroll: true,
    });
  }, [anchor, confirm]);
  useEffect(() => {
    if (confirm) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close(false);
    };
    const resize = () => close();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", resize);
    };
  }, [confirm]);
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await libraryCall({ type: "remove", id: game.id });
      if (result) close();
      else {
        setError("The entry was not removed. Please try again.");
        setBusy(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (confirm)
    return createPortal(
      <div className="library-delete-backdrop">
        <section
          className="library-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-entry-title"
          aria-describedby="delete-entry-detail"
          onKeyDown={(e) => {
            e.stopPropagation();
            trapDialog(e, busy ? undefined : () => close());
          }}
        >
          <div ref={ref}>
            <small>LIBRARY ENTRY</small>
            <h2 id="delete-entry-title">
              Delete “{game.title}” from WaterConsole?
            </h2>
            <p id="delete-entry-detail">
              Only this library entry and its WaterConsole controller setup will
              be removed. Your game installation and original images stay on
              your PC.
            </p>
            <div className="library-delete-actions">
              <button disabled={busy} onClick={() => close()}>
                Keep game
              </button>
              <button
                disabled={busy}
                className="danger"
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete from library"}
              </button>
            </div>
            {error && (
              <p className="library-delete-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </div>,
      document.body,
    );
  return createPortal(
    <div
      ref={ref}
      className="library-card-menu"
      tabIndex={-1}
      role="menu"
      aria-label={game.title + " options"}
      style={{ left: position.x, top: position.y }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const list = [
            ...e.currentTarget.querySelectorAll<HTMLElement>(
              '[role="menuitem"]',
            ),
          ];
          const index = list.indexOf(document.activeElement as HTMLElement);
          list[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? list.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + list.length) %
                  list.length
          ]?.focus();
        } else if (e.key === "Tab") {
          e.preventDefault();
          close();
        }
      }}
    >
      <span className="library-menu-title">{game.title}</span>
      {game.local ? (
        <>
          <button
            role="menuitem"
            onClick={() => {
              onClose();
              onEdit(game.id);
            }}
          >
            Edit game<small>Details, artwork and controller</small>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onClose();
              onEdit(game.id, true);
            }}
          >
            Controller Studio<small>Layout, bindings and colors</small>
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={() => setConfirm(true)}
          >
            Delete from library…<small>Keeps your installed game files</small>
          </button>
        </>
      ) : (
        <p>
          This entry is built into WaterConsole or managed by its source
          adapter. Add Game entries can be edited or deleted here.
        </p>
      )}
    </div>,
    document.body,
  );
}
