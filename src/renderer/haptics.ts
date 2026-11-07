import {
  nativeSlotAllowed,
  type Action,
  type SessionState,
} from "../shared/types";

const PREFERENCE_KEY = "waterconsole.vibration";
const MAX_RUMBLE_MS = 140;
const ATTACK_MS: Partial<Record<Action, number>> = {
  a: 20,
  b: 20,
  x: 20,
  y: 20,
  l: 35,
  r: 35,
  lt: 35,
  rt: 35,
};

function savedPreference() {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function touchHapticsAllowed(
  state: SessionState | null,
  playerId: string,
) {
  const player = state?.players.find((p) => p.id === playerId && p.connected);
  if (!state || !player) return false;
  if (state.phase === "lab" && state.profile === "lab") return true;
  return nativeHapticsAllowed(state, playerId);
}
export function nativeHapticsAllowed(
  state: SessionState | null,
  playerId: string,
) {
  if (
    !state ||
    state.phase !== "native" ||
    state.profile !== "gamepad" ||
    state.native.controls !== "game" ||
    state.native.status !== "running" ||
    !state.native.focused ||
    state.native.quitting
  )
    return false;
  const player = state.players.find((p) => p.id === playerId && p.connected);
  return (
    !!player && nativeSlotAllowed(state.native, state.displayMode, player.slot)
  );
}

export class ControllerHaptics {
  readonly supported = typeof navigator.vibrate === "function";
  enabled = savedPreference();
  suspended = false;
  private activated = false;
  private lastRumble = -Infinity;
  private lastAttack = -Infinity;

  activate() {
    this.activated = true;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try {
      localStorage.setItem(PREFERENCE_KEY, enabled ? "on" : "off");
    } catch {
      // A storage restriction should not prevent changing feedback for this visit.
    }
    if (!enabled) this.stop();
  }

  private play(durationMs: number) {
    if (!this.supported || !this.enabled || !this.activated || this.suspended) return;
    try {
      navigator.vibrate(durationMs);
    } catch {
      // Browsers may expose the API while declining vibration.
    }
  }

  attack(action: Action) {
    const duration = ATTACK_MS[action];
    if (!duration) return;
    const now = performance.now();
    if (now - this.lastAttack < 60) return;
    this.lastAttack = now;
    this.play(duration);
  }

  rumble(durationMs: number) {
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) return;
    if (durationMs === 0) {
      this.stop();
      return;
    }
    const now = performance.now();
    if (now - this.lastRumble < 70 || now - this.lastAttack < 60) return;
    this.lastRumble = now;
    this.play(Math.min(durationMs, MAX_RUMBLE_MS));
  }

  cue(durationMs:number) {
    if(!Number.isFinite(durationMs)||durationMs<=0)return;
    const now=performance.now();if(now-this.lastAttack<60)return;this.lastAttack=now;this.play(Math.min(100,Math.round(durationMs)));
  }

  test() {
    this.activate();
    const suspended=this.suspended;
    this.suspended=false;
    this.play(50);
    this.suspended=suspended;
  }

  stop() {
    if (!this.supported || !this.activated) return;
    try {
      navigator.vibrate(0);
    } catch {
      // Stopping an unsupported/denied vibration remains a no-op.
    }
    this.lastRumble = -Infinity;
    this.lastAttack = -Infinity;
  }
}
