import {
  ACTIONS,
  validGameId,
  type CommandResult,
  type NativeCommand,
  type NativeInputSnapshot,
  type NativeRuntimeState,
  type NativeRumble,
} from "../shared/types";
import {
  REGISTERED_NATIVE_ADAPTERS,
  type NativeAdapter,
  type NativeAdapterDefinition,
} from "./adapters";

export class NativeGame {
  private state: NativeRuntimeState = {
    available: false,
    games: {},
    status: "unavailable",
    controls: "menu",
    focused: false,
  };
  private adapters = new Map<
    string,
    { definition: NativeAdapterDefinition; adapter: NativeAdapter }
  >();
  private active?: {
    definition: NativeAdapterDefinition;
    adapter: NativeAdapter;
  };
  private epoch = -1;
  private lastInput = 0;
  private watchdog?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(
    private helperPath: string,
    private onState: (state: NativeRuntimeState) => void,
    private onActivate: () => void,
    private onReturn: () => void,
    private onRumble: (feedback: NativeRumble) => void = () => {},
    private definitions: readonly NativeAdapterDefinition[] = REGISTERED_NATIVE_ADAPTERS,
  ) {}
  getState() {
    return structuredClone(this.state);
  }
  private publish(patch: Partial<NativeRuntimeState>) {
    this.state = { ...this.state, ...patch };
    this.onState(this.getState());
  }
  async initialize() {
    const games: Record<string, boolean> = {};
    if (
      process.platform === "win32" &&
      process.env.WATERCONSOLE_DISABLE_NATIVE !== "1"
    ) {
      for (const definition of this.definitions) {
        const m = definition.manifest;
        if (
          !validGameId(m.id) ||
          this.adapters.has(m.id) ||
          m.runtime !== "native" ||
          m.controllerProfile !== "gamepad" ||
          !Number.isInteger(m.maxPlayers) ||
          m.maxPlayers < 1 ||
          m.maxPlayers > 4 ||
          !m.displayModes.length ||
          m.displayModes.some(
            (mode) => !["shared", "split-2", "split-4"].includes(mode),
          )
        )
          continue;
        let adapter: NativeAdapter;
        adapter = definition.create({
          helperPath: this.helperPath,
          onState: (state) => {
            if (this.active?.adapter !== adapter) return;
            if (!state.focused || state.status !== "running") this.reset();
            this.publish(state);
          },
          onRumble: (feedback) => {
            if (
              this.active?.adapter === adapter &&
              this.state.focused &&
              this.state.status === "running" &&
              this.state.controls === "game" &&
              !this.state.quitting &&
              feedback.epoch === this.epoch
            )
              this.onRumble(feedback);
          },
        });
        this.adapters.set(m.id, { definition, adapter });
        try {
          games[m.id] = await adapter.available();
        } catch {
          games[m.id] = false;
        }
      }
    }
    const available = Object.values(games).some(Boolean);
    this.publish({
      games,
      available,
      status: available ? "idle" : "unavailable",
      message: available
        ? undefined
        : "No native adapters are registered. Controller Lab is ready to play.",
    });
    return this.getState();
  }
  async command(command: NativeCommand): Promise<CommandResult> {
    if (command.type === "stop") return this.stop();
    if (this.busy)
      return { ok: false, error: "A game action is already in progress." };
    if (command.type === "start") {
      const entry = command.gameId && this.adapters.get(command.gameId);
      if (!entry || this.state.games?.[command.gameId!] !== true)
        return {
          ok: false,
          error: "No available native adapter is registered for this game.",
        };
      if (this.active) {
        const stopped = await this.stop();
        if (!stopped.ok) return stopped;
      }
      this.busy = true;
      this.active = entry;
      this.epoch = -1;
      const manifest = entry.definition.manifest;
      this.publish({
        gameId: manifest.id,
        maxPlayers: manifest.maxPlayers,
        displayModes: [...manifest.displayModes],
        requiresGamepad: entry.definition.manifest.requiresGamepad === true,
        status: "starting",
        controls: "menu",
        focused: false,
        quitting: false,
        gamepad: undefined,
        message: undefined,
      });
      try {
        await entry.adapter.start();
        this.watchdog = setInterval(() => {
          if (Date.now() - this.lastInput > 300) this.reset();
        }, 100);
        this.onActivate();
        return { ok: true };
      } catch {
        this.reset();
        this.publish({
          status: "error",
          focused: false,
          message: "The native adapter could not start. Check the host PC.",
        });
        return { ok: false, error: this.state.message };
      } finally {
        this.busy = false;
      }
    }
    if (!this.active || this.state.quitting)
      return { ok: false, error: "No native game is active." };
    try {
      if (command.type === "controls") {
        if (!["menu", "game"].includes(command.mode))
          return { ok: false, error: "Unknown controller mode." };
        this.reset();
        this.publish({ controls: command.mode });
      } else await this.active.adapter.focus();
      return { ok: true };
    } catch {
      this.reset();
      return {
        ok: false,
        error: "The native adapter could not complete this action.",
      };
    }
  }
  input(snapshot: NativeInputSnapshot) {
    if (
      !this.active ||
      this.state.quitting ||
      this.state.status !== "running" ||
      !this.state.focused
    )
      return this.reset();
    if (
      !Number.isSafeInteger(snapshot.epoch) ||
      snapshot.epoch < this.epoch ||
      snapshot.controls !== this.state.controls ||
      !Array.isArray(snapshot.players) ||
      snapshot.players.length !== this.state.maxPlayers ||
      new Set(snapshot.players.map((p) => p.slot)).size !==
        snapshot.players.length ||
      snapshot.players.some(
        (p) =>
          !Number.isInteger(p.slot) ||
          p.slot < 1 ||
          p.slot > (this.state.maxPlayers ?? 0) ||
          !Array.isArray(p.buttons) ||
          p.buttons.length > ACTIONS.length ||
          p.buttons.some((b) => !ACTIONS.includes(b)),
      )
    )
      return this.reset();
    if (snapshot.epoch !== this.epoch) this.reset();
    this.epoch = snapshot.epoch;
    this.lastInput = Date.now();
    try {
      this.active.adapter.input(structuredClone(snapshot));
    } catch {
      this.reset();
      this.publish({
        status: "error",
        focused: false,
        message: "Native input stopped. Return Home to recover.",
      });
    }
  }
  reset() {
    try {
      this.active?.adapter.reset();
    } catch {}
    this.lastInput = 0;
  }
  async stop(): Promise<CommandResult> {
    if (!this.active) return { ok: true };
    if (this.busy)
      return { ok: false, error: "A game action is already in progress." };
    this.busy = true;
    this.publish({ quitting: true, focused: false, controls: "menu" });
    this.reset();
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = undefined;
    try {
      await this.active.adapter.stop();
      this.active = undefined;
      this.epoch = -1;
      this.publish({
        quitting: false,
        status: "idle",
        focused: false,
        gameId: undefined,
        maxPlayers: undefined,
        displayModes: undefined,
        requiresGamepad: false,
      });
      this.onReturn();
      return { ok: true };
    } catch {
      this.publish({
        quitting: false,
        status: "paused",
        focused: false,
        message:
          "The native game is still open. Close it on the PC before retrying.",
      });
      return { ok: false, error: this.state.message };
    } finally {
      this.busy = false;
    }
  }
}
