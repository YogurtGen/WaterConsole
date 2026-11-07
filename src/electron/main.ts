import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { CommandResult, HostCommand, HostState } from "../shared/types";
import type { NativeCommand, NativeInputSnapshot } from "../shared/types";
import { NativeGame } from "./native-game";
import { loadLocalGameArtwork } from "./game-art";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "waterconsole",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
{
  const dataDirectory = process.env.WATERCONSOLE_DATA_DIR
    ? path.resolve(process.env.WATERCONSOLE_DATA_DIR)
    : path.join(app.getPath("appData"), "waterconsole-core");
  mkdirSync(dataDirectory, { recursive: true });
  app.setPath("userData", dataDirectory);
}
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
let window: BrowserWindow | null = null;
let service: UtilityProcess | null = null;
let snapshot: HostState | null = null;
let quitting = false;
let requestId = 0;
let startPromise: Promise<void> | null = null;
let nativeGame: NativeGame | null = null;
const requests = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function broadcast() {
  if (snapshot && window && !window.isDestroyed())
    window.webContents.send("wc:state", snapshot);
}
function rejectRequests(message: string) {
  for (const request of requests.values()) {
    clearTimeout(request.timer);
    request.reject(new Error(message));
  }
  requests.clear();
}
function serviceFailed(message: string) {
  nativeGame?.reset();
  rejectRequests(message);
  if (snapshot) {
    snapshot = {
      ...snapshot,
      pending: [],
      players: snapshot.players.map((p) => ({
        ...p,
        connected: false,
        buttons: [],
        axes: { x: 0, y: 0 },
      })),
      network: { ...snapshot.network, status: "error", error: message },
    };
    broadcast();
  }
}

async function startService() {
  if (startPromise) return startPromise;
  startPromise = new Promise<void>((resolve, reject) => {
    let ready = false;
    const deadline = setTimeout(() => {
      service?.kill();
      reject(
        new Error(
          "The local server did not start in time. Restart WaterConsole.",
        ),
      );
    }, 20000);
    const config = {
      address: process.env.WATERCONSOLE_ADDRESS || undefined,
      port: 8787,
      publicDir: path.join(app.getAppPath(), "build", "renderer"),
      dataDir: process.env.WATERCONSOLE_DATA_DIR || app.getPath("userData"),
      initialNativeState: nativeGame?.getState(),
    };
    const child = utilityProcess.fork(
      path.join(app.getAppPath(), "build", "server", "entry.cjs"),
      ["--config", JSON.stringify(config)],
      { stdio: "pipe", serviceName: "WaterConsole LAN server" },
    );
    service = child;
    child.on(
      "message",
      (message: {
        type: string;
        state?: HostState;
        id?: number | string;
        result?: unknown;
        message?: string;
        command?: NativeCommand;
        snapshot?: NativeInputSnapshot;
      }) => {
        if (
          message.type === "native-command" &&
          message.id !== undefined &&
          message.command
        ) {
          void (
            nativeGame?.command(message.command) ||
            Promise.resolve({
              ok: false,
              error: "Native games are unavailable.",
            })
          )
            .then((result) => {
              if (service === child)
                child.postMessage({
                  type: "native-result",
                  id: message.id,
                  result,
                });
            })
            .catch(() => {
              if (service === child)
                child.postMessage({
                  type: "native-result",
                  id: message.id,
                  result: { ok: false, error: "Native game command failed." },
                });
            });
          return;
        }
        if (message.type === "native-input" && message.snapshot) {
          nativeGame?.input(message.snapshot);
          return;
        }
        if (
          (message.type === "ready" || message.type === "state") &&
          message.state
        ) {
          snapshot = message.state;
          broadcast();
        }
        if (message.type === "ready") {
          ready = true;
          clearTimeout(deadline);
          resolve();
        }
        if (message.type === "response" && typeof message.id === "number") {
          const pending = requests.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            requests.delete(message.id);
            pending.resolve(message.result);
          }
        }
        if (message.type === "fatal") {
          const error = new Error(message.message || "Local server failed.");
          clearTimeout(deadline);
          serviceFailed(error.message);
          if (!ready) reject(error);
        }
      },
    );
    child.on("exit", () => {
      void nativeGame?.stop();
      clearTimeout(deadline);
      if (service === child) {
        service = null;
        startPromise = null;
      }
      if (!quitting) {
        serviceFailed(
          "The local server stopped. Choose your network again in Settings to restart it.",
        );
        if (!ready)
          reject(new Error("The local server exited during startup."));
      }
    });
  });
  try {
    await startPromise;
  } catch (error) {
    startPromise = null;
    throw error;
  }
}

async function request(command?: HostCommand): Promise<unknown> {
  if (!service) throw new Error("The local server is unavailable.");
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        requests.delete(id);
        reject(new Error("The local server took too long to respond."));
      },
      command?.type === "startGame" ? 75_000 : 25000,
    );
    requests.set(id, { resolve, reject, timer });
    service!.postMessage({
      type: "request",
      id,
      ...(command ? { command } : {}),
    });
  });
}

function validSender(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame?.url !== "waterconsole://app/host.html"
  )
    throw new Error("Untrusted IPC sender.");
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    fullscreen: process.env.WATERCONSOLE_WINDOWED !== "1",
    show: false,
    backgroundColor: "#090a0b",
    title: "WaterConsole",
    icon: path.join(app.getAppPath(), "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(app.getAppPath(), "build", "electron", "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      offscreen: process.env.WATERCONSOLE_TEST === "1",
      backgroundThrottling: process.env.WATERCONSOLE_TEST !== "1",
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== "waterconsole://app/host.html") event.preventDefault();
  });
  window.on("closed", () => {
    window = null;
  });
  window.once("ready-to-show", () => {
    if (process.env.WATERCONSOLE_TEST !== "1") window?.show();
  });
  await window.loadURL("waterconsole://app/host.html");
}

app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
});
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const child = service;
  void Promise.allSettled([
    nativeGame?.stop(),
    new Promise<void>((resolve) => {
      if (!child) return resolve();
      const deadline = setTimeout(() => {
        child.kill();
        resolve();
      }, 1800);
      child.once("exit", () => {
        clearTimeout(deadline);
        resolve();
      });
      child.postMessage({ type: "shutdown" });
    }),
  ]).then(() => app.quit());
});
app.on("will-quit", () => {
  service?.kill();
  rejectRequests("WaterConsole is closing.");
});
app.on("window-all-closed", () => app.quit());

if (singleInstance)
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const helperPath = app.isPackaged
      ? path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "native",
          "WaterConsole.InputBridge.exe",
        )
      : path.join(
          app.getAppPath(),
          "build",
          "native",
          "WaterConsole.InputBridge.exe",
        );
    nativeGame = new NativeGame(
      helperPath,
      (state) => service?.postMessage({ type: "native-state", state }),
      () => {
        if (!quitting && process.env.WATERCONSOLE_TEST !== "1")
          window?.minimize();
      },
      () => {
        if (!quitting && window && process.env.WATERCONSOLE_TEST !== "1") {
          window.restore();
          window.show();
          window.focus();
        }
      },
      (feedback) => service?.postMessage({ type: "native-rumble", feedback }),
    );
    await nativeGame.initialize();
    const rendererRoot = path.join(app.getAppPath(), "build", "renderer");
    const gameArtwork = await loadLocalGameArtwork(
      process.env.WATERCONSOLE_ART_DIRECTORY ||
        path.join(app.getPath("userData"), "library-art"),
    );
    protocol.handle("waterconsole", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.hostname !== "app" || request.method !== "GET")
          return new Response("Not found", { status: 404 });
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        if (relative.startsWith("library-art/")) {
          const bytes = gameArtwork.get(relative);
          return bytes
            ? new Response(new Uint8Array(bytes), {
                headers: {
                  "Content-Type": "image/jpeg",
                  "X-Content-Type-Options": "nosniff",
                  "Content-Security-Policy": csp,
                },
              })
            : new Response("Not found", { status: 404 });
        }
        const filename = path.resolve(rendererRoot, relative);
        const inside = path.relative(rendererRoot, filename);
        if (
          !inside ||
          inside.startsWith("..") ||
          path.isAbsolute(inside) ||
          relative.includes("\\")
        )
          return new Response("Not found", { status: 404 });
        const bytes = await readFile(filename);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type":
              mime[path.extname(filename)] || "application/octet-stream",
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel:
          !details.url.startsWith("waterconsole://app/") &&
          !details.url.startsWith("devtools://"),
      }),
    );
    ipcMain.handle("wc:get-state", async (event) => {
      validSender(event);
      if (!snapshot) await startService();
      return snapshot;
    });
    ipcMain.handle(
      "wc:command",
      async (event, command: HostCommand): Promise<CommandResult> => {
        validSender(event);
        try {
          if (
            !service &&
            command &&
            (command.type === "setNetwork" || command.type === "resetSession")
          )
            await startService();
          return (await request(command)) as CommandResult;
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Command failed.",
          };
        }
      },
    );
    ipcMain.handle("wc:fullscreen", (event) => {
      validSender(event);
      if (!window) return false;
      window.setFullScreen(!window.isFullScreen());
      return window.isFullScreen();
    });
    ipcMain.handle("wc:get-fullscreen", (event) => {
      validSender(event);
      return window?.isFullScreen() ?? false;
    });
    ipcMain.on("wc:minimize", (event) => {
      validSender(event);
      window?.minimize();
    });
    ipcMain.on("wc:quit", (event) => {
      validSender(event);
      app.quit();
    });
    try {
      await startService();
      await createWindow();
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "WaterConsole could not start",
        message:
          error instanceof Error
            ? error.message
            : "The local server could not be started.",
        detail:
          "Check that your network is available, then open WaterConsole again.",
      });
      app.quit();
    }
  });
