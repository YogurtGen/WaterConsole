import {
  spawn,
  execFile,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import type {
  CommandResult,
  NativeCommand,
  NativeInputSnapshot,
  NativeRuntimeState,
  NativeRumble,
} from "../shared/types";
import { resolveBindings, type DeviceOutput } from "../shared/studio-engine";
import type { LocalGameRecord } from "../shared/studio-model";
import { LibraryStore } from "./library-store";
import {
  detectSteamApp,
  detectEpicApp,
  selectGameProcess,
  waitForGameWindow,
} from "./game-launch";
import type { RunningGameWindow } from "../shared/studio-model";
const run = promisify(execFile);
interface LegacyRuntime {
  initialize(): Promise<NativeRuntimeState>;
  getState(): NativeRuntimeState;
  command(c: NativeCommand): Promise<CommandResult>;
  input(s: NativeInputSnapshot): void;
  reset(): void;
}
const empty = (slot: number) => ({
  slot,
  buttons: [],
  keys: [],
  axes: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 },
});
export class NativeRouter {
  private legacySnapshot: NativeRuntimeState;
  private userSnapshot: NativeRuntimeState = {
    available: false,
    games: {},
    status: "idle",
    controls: "menu",
    focused: false,
  };
  private availability: Record<string, boolean> = {};
  private active: "legacy" | "user" | null = null;
  private record?: LocalGameRecord;
  private helper?: ChildProcessWithoutNullStreams;
  private owned = false;
  private pid = 0;
  private busy = false;
  private sequence = 0;
  private epoch = 1;
  private lastFocus = false;
  private latest?: NativeInputSnapshot;
  private gameExited = false;
  private outputTimer?: ReturnType<typeof setInterval>;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private attachedResolve?: () => void;
  private attachedReject?: (e: Error) => void;
  private exitResolve?: () => void;
  constructor(
    private legacy: LegacyRuntime,
    private store: LibraryStore,
    private helperPath: string,
    private onState: (s: NativeRuntimeState) => void,
    private onActivate: () => void,
    private onReturn: () => void,
    private onRumble: (r: NativeRumble) => void,
    private openSteam?: (appId: string) => Promise<void>,
    private openEpic?: (route: string) => Promise<void>,
  ) {
    this.legacySnapshot = legacy.getState();
  }
  legacyState(state: NativeRuntimeState) {
    this.legacySnapshot = state;
    if (this.active !== "user") this.publish();
  }
  legacyRumble(feedback: NativeRumble) {
    if (this.active !== "user") this.onRumble(feedback);
  }
  getState() {
    const base =
      this.active === "user" ? this.userSnapshot : this.legacySnapshot;
    const games = { ...this.legacySnapshot.games, ...this.availability };
    return structuredClone({
      ...base,
      games,
      available: Object.values(games).some(Boolean),
    });
  }
  private publish(patch?: Partial<NativeRuntimeState>) {
    if (patch) this.userSnapshot = { ...this.userSnapshot, ...patch };
    this.onState(this.getState());
  }
  async initialize() {
    await this.legacy.initialize();
    await this.refresh();
    return this.getState();
  }
  setStore(store: LibraryStore) {
    this.store = store;
  }
  async refresh() {
    const availability: Record<string, boolean> = {};
    for (const game of this.store.list()) {
      try {
        await this.store.validateExecutable(game.launch.executable);
        await access(this.helperPath);
        availability[game.id] = !!game.launch.executable;
      } catch {
        availability[game.id] = false;
      }
    }
    this.availability = availability;
    this.publish();
  }
  isActive() {
    return (
      this.busy ||
      ["starting", "running", "paused"].includes(this.getState().status)
    );
  }
  async probe() {
    try {
      const { stdout } = await run(this.helperPath, ["--probe"], {
        windowsHide: true,
        timeout: 8000,
      });
      return JSON.parse(stdout.trim());
    } catch {
      return {
        keyboard: false,
        gamepad: false,
        message:
          "The native input helper is missing. Reinstall WaterConsole or rebuild the native toolkit.",
      };
    }
  }
  async processes(executable: string) {
    await this.store.validateExecutable(executable);
    const { stdout } = await run(this.helperPath, ["--find", executable], {
      windowsHide: true,
      timeout: 8000,
    });
    return JSON.parse(stdout.trim()).processes as Array<{
      pid: number;
      title: string;
      window: boolean;
    }>;
  }
  async windows(): Promise<RunningGameWindow[]> {
    const { stdout } = await run(this.helperPath, ["--windows"], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    const raw = JSON.parse(stdout).windows;
    if (!Array.isArray(raw) || raw.length > 512)
      throw new Error("Unable to list application windows.");
    const windows: RunningGameWindow[] = [];
    for (const item of raw) {
      if (
        !Number.isSafeInteger(item.pid) ||
        item.pid <= 0 ||
        typeof item.executable !== "string" ||
        item.executable.length > 2048 ||
        typeof item.title !== "string"
      )
        continue;
      try {
        const executable = await this.store.validateExecutable(item.executable);
        if (executable)
          windows.push({
            pid: item.pid,
            title: item.title.slice(0, 180),
            executable,
          });
      } catch {}
    }
    return windows.sort((a, b) => a.title.localeCompare(b.title));
  }
  async command(c: NativeCommand): Promise<CommandResult> {
    if (c.type === "start" && c.gameId?.startsWith("local-"))
      return this.start(c.gameId);
    if (this.active === "user") {
      if (c.type === "stop") return this.stop();
      if (c.type === "focus") {
        this.write({ type: "focus" });
        return { ok: true };
      }
      if (c.type === "controls") {
        this.reset();
        this.publish({ controls: c.mode });
        return { ok: true };
      }
      return {
        ok: false,
        error: "Stop the current game before starting another.",
      };
    }
    this.active = "legacy";
    return this.legacy.command(c);
  }
  private write(value: unknown) {
    if (
      this.helper &&
      !this.helper.stdin.destroyed &&
      this.helper.stdin.writableLength < 65536
    )
      this.helper.stdin.write(JSON.stringify(value) + "\n");
  }
  private handle(message: any) {
    if (message.type === "ready") {
      this.userSnapshot.gamepad = {
        available: this.record?.inputMethod === "gamepad",
        message: message.slots
          ?.map((s: any) => `P${s.slot} → Gamepad ${s.xinputIndex + 1}`)
          .join(" · "),
      };
      this.readyResolve?.();
    } else if (message.type === "attached") {
      this.attachedResolve?.();
    } else if (message.type === "focus") {
      this.lastFocus = message.focused === true;
      if (!this.lastFocus) this.reset();
      this.publish({
        focused: this.lastFocus,
        status: this.gameExited ? "idle" : "running",
        message: this.lastFocus
          ? undefined
          : "Focus the game window to enable phone input.",
      });
    } else if (
      message.type === "rumble" &&
      this.active === "user" &&
      this.lastFocus &&
      !this.userSnapshot.quitting &&
      message.epoch === this.epoch
    )
      this.onRumble(message);
    else if (message.type === "exited") {
      this.gameExited = true;
      this.exitResolve?.();
      this.cleanupHelper();
      this.publish({ status: "idle", focused: false, quitting: false });
      this.active = null;
      this.onReturn();
    } else if (message.type === "error") {
      this.readyReject?.(
        new Error(message.message || "The native input helper stopped."),
      );
      this.attachedReject?.(
        new Error(message.message || "Unable to attach to the game."),
      );
      this.publish({
        status: "paused",
        focused: false,
        message:
          message.message ||
          "Input paused. Close the game normally and return Home.",
      });
    }
  }
  private waitFor(which: "ready" | "attached" | "exit", timeout: number) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clear();
        reject(
          new Error(
            which === "exit"
              ? "The game is still open. Confirm its close dialog or close it normally on the PC."
              : "The game input helper did not become ready.",
          ),
        );
      }, timeout);
      const clear = () => {
        clearTimeout(timer);
        if (which === "ready") {
          this.readyResolve = undefined;
          this.readyReject = undefined;
        }
        if (which === "attached") {
          this.attachedResolve = undefined;
          this.attachedReject = undefined;
        }
        if (which === "exit") this.exitResolve = undefined;
      };
      const done = () => {
        clear();
        resolve();
      };
      if (which === "ready") {
        this.readyResolve = done;
        this.readyReject = (e) => {
          clear();
          reject(e);
        };
      }
      if (which === "attached") {
        this.attachedResolve = done;
        this.attachedReject = (e) => {
          clear();
          reject(e);
        };
      }
      if (which === "exit") this.exitResolve = done;
    });
  }
  private async start(id: string): Promise<CommandResult> {
    if (this.busy)
      return { ok: false, error: "A game action is already in progress." };
    if (this.isActive()) {
      const result = await this.stop();
      if (!result.ok) return result;
    }
    const record = this.store.get(id);
    if (!record) return { ok: false, error: "Game not found." };
    this.busy = true;
    this.active = "user";
    this.record = record;
    this.gameExited = false;
    this.owned = false;
    this.pid = 0;
    this.sequence = 0;
    this.epoch = 1;
    this.latest = undefined;
    this.userSnapshot = {
      available: true,
      games: this.availability,
      gameId: id,
      maxPlayers: record.maxPlayers,
      displayModes: record.displayModes,
      requiresGamepad: record.inputMethod === "gamepad",
      status: "starting",
      controls: "menu",
      focused: false,
    };
    this.publish();
    try {
      await this.store.validateExecutable(record.launch.executable);
      const capabilities = await this.probe();
      if (!capabilities.keyboard) throw new Error(capabilities.message);
      if (record.inputMethod === "gamepad" && !capabilities.gamepad)
        throw new Error(
          "Gamepad input needs the optional PC virtual-controller driver. Choose Keyboard if your game supports it, or review Controller Setup.",
        );
      const ready = this.waitFor("ready", 15000);
      this.helper = spawn(
        this.helperPath,
        [
          "--pid",
          "0",
          "--exe",
          record.launch.executable,
          "--players",
          String(record.maxPlayers),
          "--backend",
          record.inputMethod,
        ],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      let buffer = "";
      this.helper.stdout.setEncoding("utf8");
      this.helper.stdout.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.length > 65536) {
          this.helper?.stdin.end();
          return;
        }
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          try {
            this.handle(JSON.parse(line));
          } catch {
            this.readyReject?.(new Error("Invalid input helper response."));
          }
        }
      });
      this.helper.on("error", (error) =>
        this.readyReject?.(new Error("The native helper could not start.")),
      );
      this.helper.on("exit", () => {
        this.helper = undefined;
        if (!this.gameExited && this.active === "user")
          this.publish({
            status: "paused",
            focused: false,
            message:
              "Input helper stopped. Close the game normally or reconnect its controller setup.",
          });
      });
      await ready;
      const existing = selectGameProcess(
        await this.processes(record.launch.executable),
        record.launch.attachPid,
      );
      if (existing) {
        this.pid = existing.pid;
      } else {
        if (record.launch.attachOnly)
          throw new Error(
            "No matching game window is open. Open it through its launcher, or turn off Only connect to an already running game in Edit game.",
          );
        const steamId =
          record.launch.method !== "direct" && record.launch.args.length === 0
            ? await detectSteamApp(record.launch.executable)
            : undefined;
        const epic =
          !steamId &&
          record.launch.method !== "direct" &&
          record.launch.args.length === 0
            ? await detectEpicApp(record.launch.executable)
            : undefined;
        if (steamId) {
          if (!this.openSteam)
            throw new Error(
              "Steam launch is unavailable. Use Direct executable or open the game through Steam first.",
            );
          this.publish({
            message:
              "Opening the game through Steam. Complete any launcher sign-in or update on the PC.",
          });
          await this.openSteam(steamId);
        } else if (epic) {
          if (!this.openEpic)
            throw new Error(
              "Epic launch is unavailable. Open the game through Epic first.",
            );
          this.publish({
            message:
              "Opening the game through Epic Games. Complete any launcher sign-in or update on the PC.",
          });
          await this.openEpic(epic);
        } else {
          const child = spawn(record.launch.executable, record.launch.args, {
            cwd: record.launch.cwd || undefined,
            stdio: "ignore",
            windowsHide: false,
          });
          await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", () =>
              reject(
                new Error(
                  "The game could not start. Check its original launcher and installation.",
                ),
              ),
            );
          });
          child.unref();
        }
        const window = await waitForGameWindow(() =>
          this.processes(record.launch.executable),
        );
        this.pid = window.pid;
        this.owned = true;
      }
      const attached = this.waitFor("attached", 8000);
      this.write({ type: "attach", pid: this.pid });
      await attached;
      this.publish({ status: "running", focused: false });
      this.outputTimer = setInterval(() => this.flush(), 50);
      this.onActivate();
      this.write({ type: "focus" });
      return { ok: true };
    } catch (error) {
      this.cleanupHelper();
      this.publish({
        status: "error",
        focused: false,
        message:
          error instanceof Error ? error.message : "The game could not start.",
      });
      this.active = null;
      this.onReturn();
      return { ok: false, error: this.userSnapshot.message };
    } finally {
      this.busy = false;
    }
  }
  private lastInputAt = 0;
  private lastFlush = 0;
  private pendingFlush?: ReturnType<typeof setTimeout>;
  input(snapshot: NativeInputSnapshot) {
    if (this.active !== "user") {
      this.legacy.input(snapshot);
      return;
    }
    if (
      !this.record ||
      this.userSnapshot.quitting ||
      snapshot.players.some((p) => p.slot < 1 || p.slot > 4)
    )
      return this.reset();
    this.latest = structuredClone(snapshot);
    this.lastInputAt = Date.now();
    this.epoch = snapshot.epoch;
    const delay = Math.max(0, 8 - (Date.now() - this.lastFlush));
    if (!delay) this.flush();
    else if (!this.pendingFlush)
      this.pendingFlush = setTimeout(() => this.flush(), delay);
  }
  private flush() {
    if (this.pendingFlush) clearTimeout(this.pendingFlush);
    this.pendingFlush = undefined;
    this.lastFlush = Date.now();
    if (this.active !== "user" || !this.record) return;
    const live =
      this.lastFocus &&
      !this.userSnapshot.quitting &&
      Date.now() - this.lastInputAt <= 250;
    const players = Array.from({ length: this.record.maxPlayers }, (_, i) => {
      const slot = i + 1;
      const frame = live
        ? this.latest?.players.find((p) => p.slot === slot)?.studio
        : undefined;
      return frame && frame.revision === this.record!.controller.revision
        ? {
            slot,
            ...resolveBindings(
              this.record!.controller,
              this.record!.bindings,
              this.record!.inputMethod,
              slot,
              frame,
            ),
          }
        : empty(slot);
    });
    this.write({
      type: "output",
      version: 2,
      epoch: this.epoch,
      seq: this.sequence++,
      players,
    });
  }
  reset() {
    if (this.active !== "user") {
      this.legacy.reset();
      return;
    }
    this.latest = undefined;
    this.lastInputAt = 0;
    this.flush();
  }
  private cleanupHelper() {
    if (this.pendingFlush) clearTimeout(this.pendingFlush);
    this.pendingFlush = undefined;
    if (this.outputTimer) clearInterval(this.outputTimer);
    this.outputTimer = undefined;
    this.latest = undefined;
    const helper = this.helper;
    this.helper = undefined;
    helper?.stdin.end();
  }
  async stop(): Promise<CommandResult> {
    if (this.active !== "user") return this.legacy.command({ type: "stop" });
    if (this.busy)
      return { ok: false, error: "A game action is already in progress." };
    this.busy = true;
    this.reset();
    this.publish({ quitting: true, controls: "menu" });
    try {
      if (this.owned && !this.gameExited) {
        if (!this.helper) {
          const running = await this.processes(this.record!.launch.executable);
          if (running.some((p) => p.pid === this.pid))
            throw new Error(
              "Close the game normally on the PC, then return Home.",
            );
          this.gameExited = true;
        } else {
          const exited = this.waitFor("exit", 12000);
          this.write({ type: "close" });
          await exited;
        }
      }
      this.cleanupHelper();
      this.publish({ quitting: false, status: "idle", focused: false });
      this.active = null;
      this.record = undefined;
      this.onReturn();
      return { ok: true };
    } catch (error) {
      this.publish({
        quitting: false,
        status: this.lastFocus ? "running" : "paused",
        focused: this.lastFocus,
        message:
          error instanceof Error ? error.message : "The game is still open.",
      });
      return { ok: false, error: this.userSnapshot.message };
    } finally {
      this.busy = false;
    }
  }
}
