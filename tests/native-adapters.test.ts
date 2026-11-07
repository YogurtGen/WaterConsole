import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeGame } from "../src/electron/native-game";
import {
  REGISTERED_NATIVE_ADAPTERS,
  type NativeAdapterContext,
  type NativeAdapterDefinition,
} from "../src/electron/adapters";
import type {
  NativeInputSnapshot,
  NativeRuntimeState,
} from "../src/shared/types";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("empty native registry", () => {
  it("does not include native games, discover executable paths, or activate the PC", async () => {
    const activate = vi.fn();
    const game = new NativeGame("unused-bridge", vi.fn(), activate, vi.fn());
    expect(REGISTERED_NATIVE_ADAPTERS).toEqual([]);
    expect(await game.initialize()).toMatchObject({
      available: false,
      games: {},
      status: "unavailable",
    });
    expect(
      (await game.command({ type: "start", gameId: "unregistered" })).ok,
    ).toBe(false);
    expect(activate).not.toHaveBeenCalled();
    expect(await game.stop()).toEqual({ ok: true });
  });
});
describe.skipIf(process.platform !== "win32")(
  "registered mock PC adapter",
  () => {
    async function fixture() {
      vi.stubEnv("WATERCONSOLE_DISABLE_NATIVE", "");
      let context!: NativeAdapterContext;
      const input = vi.fn(),
        reset = vi.fn(),
        stop = vi.fn(async () => {});
      const definition: NativeAdapterDefinition = {
        manifest: {
          id: "example-native",
          title: "Example",
          subtitle: "Mock",
          description: "No native game included.",
          runtime: "native",
          minPlayers: 1,
          maxPlayers: 2,
          controllerProfile: "gamepad",
          availability: "available",
          displayModes: ["shared"],
        },
        create: (c) => {
          context = c;
          return {
            available: async () => true,
            start: async () => c.onState({ status: "running", focused: true }),
            focus: async () => c.onState({ status: "running", focused: true }),
            input,
            reset,
            stop,
          };
        },
      };
      const states: NativeRuntimeState[] = [];
      const rumble = vi.fn();
      const game = new NativeGame(
        "unused-bridge",
        (s) => states.push(s),
        vi.fn(),
        vi.fn(),
        rumble,
        [definition],
      );
      await game.initialize();
      await game.command({ type: "start", gameId: "example-native" });
      const frame = (epoch = 1): NativeInputSnapshot => ({
        epoch,
        controls: "menu",
        players: [
          { slot: 1, buttons: ["a"] },
          { slot: 2, buttons: [] },
        ],
      });
      return { game, input, reset, stop, context, states, frame, rumble };
    }
    it("neutralizes complete input on stale epoch, malformed snapshot, focus loss and watchdog", async () => {
      vi.useFakeTimers();
      const f = await fixture();
      try {
        f.game.input(f.frame(5));
        expect(f.input).toHaveBeenCalledTimes(1);
        f.game.input(f.frame(4));
        expect(f.input).toHaveBeenCalledTimes(1);
        expect(f.reset).toHaveBeenCalled();
        f.game.input({ ...f.frame(6), players: [] });
        expect(f.input).toHaveBeenCalledTimes(1);
        f.game.input(f.frame(6));
        const before = f.reset.mock.calls.length;
        await vi.advanceTimersByTimeAsync(450);
        expect(f.reset.mock.calls.length).toBeGreaterThan(before);
        f.context.onState({ status: "paused", focused: false });
        f.game.input(f.frame(7));
        expect(f.input).toHaveBeenCalledTimes(2);
        expect(f.game.getState().focused).toBe(false);
      } finally {
        await f.game.stop();
      }
    });
    it("changes semantic modes with neutral state and only forwards current-epoch active game rumble", async () => {
      const f = await fixture();
      try {
        f.game.input(f.frame(10));
        f.context.onRumble({
          slot: 1,
          epoch: 10,
          largeMotor: 255,
          smallMotor: 0,
        });
        expect(f.rumble).not.toHaveBeenCalled();
        await f.game.command({ type: "controls", mode: "game" });
        f.game.input({ ...f.frame(11), controls: "game" });
        f.context.onRumble({
          slot: 1,
          epoch: 10,
          largeMotor: 255,
          smallMotor: 0,
        });
        expect(f.rumble).not.toHaveBeenCalled();
        f.context.onRumble({
          slot: 1,
          epoch: 11,
          largeMotor: 255,
          smallMotor: 0,
        });
        expect(f.rumble).toHaveBeenCalledTimes(1);
        await f.game.stop();
        expect(f.stop).toHaveBeenCalledTimes(1);
        expect(f.game.getState()).toMatchObject({
          status: "idle",
          focused: false,
        });
      } finally {
        await f.game.stop();
      }
    });
  },
);
