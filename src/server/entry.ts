import { createWaterConsoleServer, type ServerOptions } from "./index";
import type {
  CommandResult,
  HostCommand,
  NativeCommand,
  NativeRuntimeState,
} from "../shared/types";

interface ParentPort {
  postMessage(message: unknown): void;
  on(event: "message", listener: (event: { data: unknown }) => void): void;
}
const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort })
  .parentPort;
const configIndex = process.argv.indexOf("--config");
let server: Awaited<ReturnType<typeof createWaterConsoleServer>> | undefined;
let shuttingDown = false;
let nextNativeId = 0;
const nativeRequests = new Map<
  string,
  {
    resolve: (result: CommandResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function nativeCommand(command: NativeCommand): Promise<CommandResult> {
  if (!parentPort)
    return Promise.resolve({
      ok: false,
      error: "The desktop native adapter is unavailable.",
    });
  const id = `native-${++nextNativeId}`;
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => {
        nativeRequests.delete(id);
        resolve({
          ok: false,
          error:
            "The native game action timed out. Check the game window on the host PC.",
        });
      },
      command.type === "start" ? 70_000 : 20_000,
    );
    timer.unref();
    nativeRequests.set(id, { resolve, timer });
    try {
      parentPort.postMessage({ type: "native-command", id, command });
    } catch {
      clearTimeout(timer);
      nativeRequests.delete(id);
      resolve({ ok: false, error: "The desktop native adapter disconnected." });
    }
  });
}
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await server?.close();
  for (const pending of nativeRequests.values()) {
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, error: "WaterConsole is closing." });
  }
  nativeRequests.clear();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("disconnect", () => void shutdown());

async function main() {
  try {
    if (configIndex < 0 || !process.argv[configIndex + 1])
      throw new Error("Server configuration is missing.");
    const config = JSON.parse(process.argv[configIndex + 1]) as ServerOptions;
    if (!config.publicDir || !config.dataDir)
      throw new Error("Controller and data directories are required.");
    server = await createWaterConsoleServer({
      ...config,
      onState: (state) => parentPort?.postMessage({ type: "state", state }),
      onNativeCommand: parentPort ? nativeCommand : undefined,
      onNativeInput: (snapshot) =>
        parentPort?.postMessage({ type: "native-input", snapshot }),
    });
    parentPort?.on("message", (event) => {
      const message = event.data as {
        type?: string;
        id?: string | number;
        command?: HostCommand;
        state?: NativeRuntimeState;
        feedback?: unknown;
        result?: CommandResult;
      };
      if (message.type === "native-result" && typeof message.id === "string") {
        const pending = nativeRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          nativeRequests.delete(message.id);
          pending.resolve(
            message.result?.ok === true
              ? { ok: true }
              : {
                  ok: false,
                  error: message.result?.error ?? "Native game action failed.",
                },
          );
        }
        return;
      }
      if (message.type === "native-rumble") {
        server!.relayNativeRumble(message.feedback);
        return;
      }
      if (message.type === "native-state" && message.state) {
        server!.updateNativeState(message.state);
        return;
      }
      if (message.type === "shutdown") {
        void shutdown();
        return;
      }
      if (message.type !== "request" || message.id === undefined) return;
      const result = message.command
        ? server!.command(message.command)
        : Promise.resolve(server!.getState());
      result
        .then((value) =>
          parentPort.postMessage({
            type: "response",
            id: message.id,
            result: value,
          }),
        )
        .catch(() =>
          parentPort.postMessage({
            type: "response",
            id: message.id,
            result: { ok: false, error: "Server request failed." },
          }),
        );
    });
    parentPort?.postMessage({ type: "ready", state: server.getState() });
    if (!parentPort)
      process.stdout.write(
        `WaterConsole local server: http://${server.address}:${server.port}/controller\n`,
      );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The local server could not start.";
    parentPort?.postMessage({ type: "fatal", message });
    if (!parentPort) process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
void main();
