import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControllerHaptics,
  nativeHapticsAllowed,
  touchHapticsAllowed,
} from "../src/renderer/haptics";
import type { SessionState } from "../src/shared/types";
let vibrate: ReturnType<typeof vi.fn>;
let clock = 0;
beforeEach(() => {
  vibrate = vi.fn();
  clock = 0;
  vi.stubGlobal("navigator", { vibrate });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("per-phone vibration", () => {
  it("requires activation and respects the saved local off preference", () => {
    const feedback = new ControllerHaptics();
    feedback.attack("a");
    expect(vibrate).not.toHaveBeenCalled();
    clock = 100;
    feedback.activate();
    feedback.attack("a");
    expect(vibrate).toHaveBeenLastCalledWith(20);
    feedback.setEnabled(false);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "waterconsole.vibration",
      "off",
    );
    vibrate.mockClear();
    clock = 200;
    feedback.attack("x");
    feedback.test();
    expect(vibrate).not.toHaveBeenCalled();
    feedback.setEnabled(true);
    clock = 300;
    feedback.attack("x");
    expect(vibrate).toHaveBeenLastCalledWith(20);
  });
  it("bounds pulses, rejects malformed feedback, and limits repeated touches", () => {
    const feedback = new ControllerHaptics();
    feedback.activate();
    feedback.attack("a");
    clock = 20;
    feedback.attack("b");
    expect(vibrate).toHaveBeenCalledTimes(1);
    clock = 100;
    feedback.attack("up");
    expect(vibrate).toHaveBeenCalledTimes(1);
    feedback.rumble(100000);
    expect(vibrate).toHaveBeenLastCalledWith(140);
    clock = 110;
    feedback.rumble(100000);
    expect(vibrate).toHaveBeenCalledTimes(2);
    clock = 300;
    feedback.rumble(-1);
    feedback.rumble(NaN);
    feedback.rumble(1.5);
    expect(vibrate).toHaveBeenCalledTimes(2);
    feedback.rumble(0);
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });
  it("has a short test pulse and stops when disabled or reset", () => {
    const feedback = new ControllerHaptics();
    feedback.test();
    expect(vibrate).toHaveBeenLastCalledWith(50);
    feedback.stop();
    expect(vibrate).toHaveBeenLastCalledWith(0);
    feedback.setEnabled(false);
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });
  it("tolerates absent, denied, or restricted vibration/storage APIs", () => {
    vi.stubGlobal("navigator", {});
    const absent = new ControllerHaptics();
    expect(absent.supported).toBe(false);
    expect(() => {
      absent.test();
      absent.stop();
    }).not.toThrow();
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("denied");
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    const denied = new ControllerHaptics();
    expect(() => {
      denied.test();
      denied.setEnabled(false);
      denied.stop();
    }).not.toThrow();
  });
  it("allows Lab touch cues only for a connected approved player; native rumble needs active game state", () => {
    const s = {
      phase: "lab",
      profile: "lab",
      displayMode: "shared",
      players: [{ id: "one", slot: 1, connected: true }],
      native: {
        available: false,
        status: "unavailable",
        controls: "menu",
        focused: false,
      },
    } as SessionState;
    expect(touchHapticsAllowed(s, "one")).toBe(true);
    expect(nativeHapticsAllowed(s, "one")).toBe(false);
    expect(touchHapticsAllowed(s, "stranger")).toBe(false);
    s.phase = "home";
    s.profile = "menu";
    expect(touchHapticsAllowed(s, "one")).toBe(false);
    s.phase = "native";
    s.profile = "gamepad";
    s.native = {
      available: true,
      games: { "example-native": true },
      gameId: "example-native",
      status: "running",
      controls: "game",
      focused: true,
      maxPlayers: 4,
      displayModes: ["shared"],
    };
    expect(nativeHapticsAllowed(s, "one")).toBe(true);
    s.native.focused = false;
    expect(nativeHapticsAllowed(s, "one")).toBe(false);
    s.native.focused = true;
    s.native.quitting = true;
    expect(nativeHapticsAllowed(s, "one")).toBe(false);
  });
});
