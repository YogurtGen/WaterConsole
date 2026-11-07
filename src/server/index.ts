import {ASSET_ID,type ControllerDefinition,type StudioInput} from "../shared/studio-model";
import {validateController,validStudioInput,controllerAssets} from "../shared/studio-validation";
import Fastify, { type FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer } from "ws";
import { randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { readFile, mkdir, rename, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  ACTIONS,
  COLORS,
  GAMES,
  PROFILES,
  PROTOCOL_VERSION,
  nativeAvailable,
  validGameId,
  nativeSlotAllowed,
  nativeSlotCount,
  type NativeGameId,
  type GameManifest,
  type ProfileId,
  type Action,
  type CommandResult,
  type HostCommand,
  type HostState,
  type InputFrame,
  type NetworkAddress,
  type NativeCommand,
  type NativeInputSnapshot,
  type NativeRuntimeState,
  type PairStatus,
  type PairTicket,
  type Player,
  type Preferences,
  type ServerMessage,
  type SessionState,
} from "../shared/types";

const PAIR_TTL = 120_000;
const RECONNECT_TTL = 30_000;
const INPUT_TIMEOUT = 300;
const MAX_MESSAGE = 8192;
const MAX_PENDING = 16;
const noop = () => {};
const token = () => randomBytes(32).toString("hex");
const cleanName = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 32)
    : "";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).every((key) => expected.includes(key));
const safeEqual = (a: string, b: string) => {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};

export function discoverNetworkAddresses(): NetworkAddress[] {
  const result: NetworkAddress[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const item of entries ?? []) {
      if (
        item.family !== "IPv4" ||
        item.internal ||
        !isPrivateAddress(item.address)
      )
        continue;
      const preferred =
        !/vpn|virtual|vbox|vmware|hyper-v|vethernet|wsl|tailscale|wireguard|tunnel|docker|zerotier/i.test(
          name,
        );
      result.push({ name, address: item.address, preferred });
    }
  }
  result.sort(
    (a, b) =>
      Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name),
  );
  result.push({
    name: "This PC only",
    address: "127.0.0.1",
    preferred: !result.some((item) => item.preferred),
  });
  return result;
}

function isPrivateAddress(address: string) {
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31))
  );
}

export interface ServerOptions {
  address?: string;
  port?: number;
  publicDir: string;
  dataDir: string;
  onState?: (state: HostState) => void;
  catalog?: readonly GameManifest[];
  controllerDefinitions?:Record<string,ControllerDefinition>;
  libraryAssetsDir?:string;
  initialNativeState?: NativeRuntimeState;
  onNativeCommand?: (command: NativeCommand) => Promise<CommandResult>;
  onNativeInput?: (snapshot: NativeInputSnapshot) => void;
}

interface Device {
  player: Player;
  token: string;
  socket?: WebSocket;
  lastInput: number;
  lastSeq: number;
  disconnectedAt?: number;
}
interface PairRecord extends PairTicket {
  name: string;
  requestedAt: number;
  status: PairStatus;
}

export async function createWaterConsoleServer(options: ServerOptions) {
  let catalog = options.catalog ?? GAMES;
  let definitions = options.controllerDefinitions ?? {};
  let preferences: Preferences = { favorites: [], recent: [], muted: false };
  const preferencesFile = path.join(options.dataDir, "preferences.json");
  try {
    const stored = JSON.parse(
      await readFile(preferencesFile, "utf8"),
    ) as Record<string, unknown>;
    preferences = {
      favorites: Array.isArray(stored.favorites)
        ? stored.favorites.filter(
            (id): id is string =>
              typeof id === "string" && catalog.some((game) => game.id === id),
          )
        : [],
      recent: Array.isArray(stored.recent)
        ? stored.recent.filter(
            (id): id is string =>
              typeof id === "string" && catalog.some((game) => game.id === id),
          )
        : [],
      muted: stored.muted === true,
      networkAddress:
        typeof stored.networkAddress === "string"
          ? stored.networkAddress
          : undefined,
    };
  } catch {
    /* Missing or damaged preferences restore safe defaults. */
  }

  let persistChain: Promise<void> = Promise.resolve();
  const persist = () => {
    const serialized = JSON.stringify(preferences, null, 2);
    const operation = persistChain.catch(noop).then(async () => {
      await mkdir(options.dataDir, { recursive: true });
      const temporary = `${preferencesFile}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temporary, serialized, { mode: 0o600 });
      await rename(temporary, preferencesFile);
    });
    persistChain = operation;
    return operation;
  };

  let interfaces = discoverNetworkAddresses();
  let networkError: string | undefined;
  let address =
    options.address ??
    interfaces.find((item) => item.address === preferences.networkAddress)
      ?.address ??
    interfaces.find((item) => item.preferred)!.address;
  if (!interfaces.some((item) => item.address === address))
    throw new Error(
      "The selected network address is not available on this PC.",
    );
  let port = options.port ?? 8787;
  let app: FastifyInstance;
  let sockets: WebSocketServer;
  let listening = false;
  const devices = new Map<string, Device>();
  const tickets = new Map<string, PairRecord>();
  const rates = new Map<string, { count: number; resetAt: number }>();
  let nonce = "";
  let pairCode = "";
  let pairExpiresAt = 0;
  let closed = false;
  let closing = false;
  let commandChain: Promise<void> = Promise.resolve();
  let closePromise: Promise<void> | undefined;
  let lastTick = Date.now();
  let lastPublish = 0;
  let needsPublish = false;
  let lastNativeRelay = 0;
  let nativeStopping = false;
  let feedback: HostState["feedback"] = { sequence: 0, sound: "move" };
  function cue(sound: HostState["feedback"]["sound"]) {
    feedback = { sequence: feedback.sequence + 1, sound };
  }
  const state: SessionState = {
    version: PROTOCOL_VERSION,
    epoch: Date.now(),
    phase: "lobby",
    players: [],
    selectedGameId: catalog[0].id,
    heroMode: "featured",
    displayMode: "shared",
    profile: "menu",
    native: normalizeNativeState(options.initialNativeState),
    pairingLocked: false,
    search: "",
    libraryView: "all",
    favorites: [...preferences.favorites],
    recent: [...preferences.recent],
    muted: preferences.muted,
    serverTime: Date.now(),
  };

  const refreshPairing = () => {
    nonce = randomBytes(16).toString("hex");
    pairCode = randomInt(0, 1_000_000).toString().padStart(6, "0");
    pairExpiresAt = Date.now() + PAIR_TTL;
  };
  refreshPairing();

  function publicSession(): SessionState {
    return structuredClone({
      ...state,
      catalog:[...structuredClone(catalog)],
      studio:state.studio?{...state.studio,definition:{...state.studio.definition,modes:state.studio.definition.modes.map(m=>({...m,controls:m.id===state.studio!.modeId?m.controls:[]}))}}:undefined,
      players: [...devices.values()].map((device) => device.player),
      serverTime: Date.now(),
    });
  }
  function getState(): HostState {
    const now = Date.now();
    return {
      ...publicSession(),
      feedback: { ...feedback },
      pending: [...tickets.values()]
        .filter(
          (item) => item.status.status === "pending" && item.expiresAt > now,
        )
        .map(({ id, name, verificationCode, requestedAt }) => ({
          id,
          name,
          verificationCode,
          requestedAt,
        })),
      pairing: {
        url: `http://${address}:${port}/controller#nonce=${nonce}`,
        code: pairCode,
        expiresAt: pairExpiresAt,
      },
      network: {
        address,
        port,
        interfaces: structuredClone(interfaces),
        status: networkError
          ? "error"
          : address === "127.0.0.1"
            ? "offline"
            : "online",
        ...(networkError ? { error: networkError } : {}),
      },
    };
  }
  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 64 * 1024) {
      socket.close(1013, "Connection too slow");
      return;
    }
    socket.send(JSON.stringify(message));
  }
  function publish() {
    if (closed) return;
    lastPublish = Date.now();
    needsPublish = false;
    const snapshot = publicSession();
    for (const device of devices.values())
      if (device.socket)
        send(device.socket, { type: "state", state: snapshot });
    options.onState?.(getState());
  }
  const lastRumble = new Map<number, number>();
  function relayNativeRumble(value: unknown) {
    if (
      !object(value) ||
      typeof value.slot !== "number" ||
      ![1, 2, 3, 4].includes(value.slot) ||
      !Number.isSafeInteger(value.epoch) ||
      value.epoch !== state.epoch ||
      ![value.largeMotor, value.smallMotor].every(
        (motor) =>
          typeof motor === "number" &&
          Number.isInteger(motor) &&
          motor >= 0 &&
          motor <= 255,
      ) ||
      state.phase !== "native" ||
      state.profile !== "gamepad" ||
      state.native.controls !== "game" ||
      !state.native.focused ||
      state.native.status !== "running" ||
      nativeStopping ||
      state.native.quitting === true ||
      !nativeSlotAllowed(state.native, state.displayMode, value.slot)
    )
      return;
    const slot = Number(value.slot);
    const device = [...devices.values()].find(
      (item) => item.player.slot === slot,
    );
    if (!device?.player.connected || !device.socket) return;
    const durationMs =
      value.largeMotor === 0 && value.smallMotor === 0
        ? 0
        : Math.min(
            140,
            Math.max(
              15,
              Math.round(
                (Number(value.largeMotor) / 255) * 110 +
                  (Number(value.smallMotor) / 255) * 30,
              ),
            ),
          );
    const now = Date.now();
    if (durationMs && now - (lastRumble.get(slot) ?? 0) < 80) return;
    lastRumble.set(slot, durationMs ? now : 0);
    send(device.socket, { type: "haptics", epoch: state.epoch, durationMs });
  }
  function neutral(device: Device) {
    device.player.studio = undefined;
    device.player.buttons = [];
    device.player.axes = { x: 0, y: 0 };
  }
  function relayNativeInput(force = false) {
    if (!options.onNativeInput || (state.phase !== "native" && !force)) return;
    const live =
      !nativeStopping &&
      !state.native.quitting &&
      state.phase === "native" &&
      state.native.status === "running" &&
      state.native.focused;
    const now = Date.now();
    const snapshot: NativeInputSnapshot = {
      epoch: state.epoch,
      controls: state.native.controls,
      players: Array.from(
        { length: nativeSlotCount(state.native) },
        (_, index) => index + 1,
      ).map((slot) => {
        const device = [...devices.values()].find(
          (item) => item.player.slot === slot,
        );
        return {
          slot,
          studio:live && device?.player.connected && now-device.lastInput<INPUT_TIMEOUT && nativeSlotAllowed(state.native,state.displayMode,slot)?device?.player.studio:undefined,
          buttons:
            live &&
            nativeSlotAllowed(state.native, state.displayMode, slot) &&
            device?.player.connected &&
            now - device.lastInput < INPUT_TIMEOUT
              ? [...device.player.buttons]
              : [],
        };
      }),
    };
    lastNativeRelay = now;
    try {
      options.onNativeInput(snapshot);
    } catch {
      for (const device of devices.values()) neutral(device);
      state.native = {
        ...state.native,
        status: "error",
        focused: false,
        message:
          "The native input connection failed. Return Home and try again.",
      };
      state.phase = "home";
      state.profile = "menu";
      state.epoch++;
      needsPublish = true;
    }
  }
  function changeEpoch() {
    state.epoch++;
    for (const device of devices.values()) {
      neutral(device);
      device.lastSeq = -1;
    }
    relayNativeInput();
  }
  async function invokeNative(command: NativeCommand): Promise<CommandResult> {
    if (!options.onNativeCommand)
      return {
        ok: false,
        error: "The native game adapter is unavailable on this PC.",
      };
    try {
      const result = await options.onNativeCommand(command);
      return result.ok
        ? { ok: true }
        : {
            ok: false,
            error:
              nativeMessage(result.error) ?? "The native game action failed.",
          };
    } catch {
      return {
        ok: false,
        error:
          "The native game action failed. Check the host PC and try again.",
      };
    }
  }
  function updateNativeState(next: NativeRuntimeState) {
    const previous = state.native;
    state.native = normalizeNativeState({
      ...next,
      games: next.games ?? previous.games,
      gameId: next.gameId ?? previous.gameId,
      gamepad: next.gamepad ?? previous.gamepad,
    });
    if (state.phase === "native") {
      const ended = ["idle", "unavailable", "error"].includes(
        state.native.status,
      );
      if (
        ended ||
        previous.controls !== state.native.controls ||
        !!previous.quitting !== !!state.native.quitting ||
        previous.gamepad?.available !== state.native.gamepad?.available ||
        previous.focused !== state.native.focused ||
        (previous.status !== state.native.status &&
          state.native.status !== "running")
      )
        changeEpoch();
      if (ended) {
        state.studio = undefined;
        state.phase = "home";
        state.profile = "menu";
        relayNativeInput(true);
      } else relayNativeInput();
    }
    publish();
  }
  async function stopNativeGame(): Promise<CommandResult> {
    if (
      state.phase !== "native" &&
      !["starting", "running", "paused"].includes(state.native.status)
    )
      return { ok: true };
    nativeStopping = true;
    state.native = {
      ...state.native,
      status: "paused",
      focused: false,
      quitting: true,
      controls: "menu",
    };
    for (const device of devices.values()) neutral(device);
    changeEpoch();
    relayNativeInput(true);
    publish();
    const result = await invokeNative({ type: "stop" });
    if (!result.ok) {
      nativeStopping = false;
      state.native = {
        ...state.native,
        quitting: false,
        status: state.native.focused ? "running" : "paused",
        message: result.error,
      };
      changeEpoch();
      publish();
      return result;
    }
    state.native = {
      ...state.native,
      quitting: false,
      status: result.ok
        ? state.native.available
          ? "idle"
          : "unavailable"
        : "error",
      focused: false,
      ...(result.ok ? { message: undefined } : { message: result.error }),
    };
    state.phase = "home";
    state.profile = "menu";
    state.studio = undefined;
    nativeStopping = false;
    return result;
  }
  function removeDevice(id: string, reason: string) {
    const device = devices.get(id);
    if (!device) return;
    devices.delete(id);
    neutral(device);
    if (device.socket) {
      send(device.socket, { type: "ended", message: reason });
      device.socket.close(1000, reason);
    }
    for (const ticket of tickets.values()) {
      if (ticket.status.status === "approved" && ticket.status.playerId === id)
        ticket.status = { status: "rejected", message: reason };
    }
    if (device.player.canNavigate) {
      const next = [...devices.values()].sort(
        (a, b) => a.player.slot - b.player.slot,
      )[0];
      if (next) next.player.canNavigate = true;
    }
    relayNativeInput();
  }
  async function resetSession(): Promise<CommandResult> {
    const stopped = await stopNativeGame();
    if (!stopped.ok) return stopped;
    for (const id of [...devices.keys()])
      removeDevice(id, "The host ended this session.");
    tickets.clear();
    state.phase = "lobby";
    state.profile = "menu";
    state.heroMode = "featured";
    state.pairingLocked = false;
    state.displayMode = "shared";
    state.search = "";
    state.libraryView = "all";
    changeEpoch();
    refreshPairing();
    return { ok: true };
  }
  function visibleGames() {
    return catalog.filter(
      (game) =>
        (state.libraryView !== "favorites" ||
          state.favorites.includes(game.id)) &&
        (state.libraryView !== "recent" || state.recent.includes(game.id)) &&
        `${game.title} ${game.subtitle} ${game.description} ${(game.tags??[]).join(" ")}`
          .toLowerCase()
          .includes(state.search.toLowerCase()),
    );
  }
  function selectVisible() {
    const games = visibleGames();
    if (!games.some((game) => game.id === state.selectedGameId) && games[0])
      state.selectedGameId = games[0].id;
  }
  async function startGame(gameId: string): Promise<CommandResult> {
    const game = catalog.find((item) => item.id === gameId);
    if (!game || game.availability !== "available")
      return {
        ok: false,
        error:
          game?.launchRequirement?.description ??
          "This game integration is planned for the next stage.",
      };
    if (game.runtime === "native") {
      if (!nativeAvailable(state.native, game.id) || !options.onNativeCommand)
        return {
          ok: false,
          error:
            state.native.message ??
            `${game.title} is not available on this PC. Check the installed game on the host.`,
        };
      if (
        state.phase === "native" &&
        ["starting", "running", "paused"].includes(state.native.status)
      )
        if (state.native.gameId === game.id) return { ok: true };
        else {
          const stopped = await stopNativeGame();
          if (!stopped.ok) return stopped;
        }
    } else if (state.phase === "native") {
      const stopped = await stopNativeGame();
      if (!stopped.ok) return stopped;
    }
    state.selectedGameId = game.id;
    state.studio = definitions[game.id]?{definition:definitions[game.id],modeId:"menu",preview:false}:undefined;
    state.phase = game.runtime === "native" ? "native" : "lab";
    state.profile = game.controllerProfile;
    state.displayMode = game.displayModes[0] ?? "shared";
    if (game.runtime === "native")
      state.native = {
        ...state.native,
        gameId: game.id as NativeGameId,
        requiresGamepad: game.requiresGamepad === true,
        maxPlayers: game.maxPlayers,
        displayModes: [...game.displayModes],
        status: "starting",
        controls: "menu",
        focused: false,
        message: undefined,
      };
    changeEpoch();
    cue("confirm");
    publish();
    if (game.runtime === "native") {
      const result = await invokeNative({
        type: "start",
        gameId: game.id as NativeGameId,
      });
      if (!result.ok) {
        updateNativeState({
          ...state.native,
          status: "error",
          focused: false,
          message: result.error,
        });
        return result;
      }
      if (state.phase !== "native")
        return {
          ok: false,
          error:
            state.native.message ?? "The game closed before launch completed.",
        };
    }
    for (const device of devices.values()) {
      device.player.position = { x: 0.5, y: 0.5 };
      device.player.pressCount = 0;
    }
    preferences.recent = [
      game.id,
      ...preferences.recent.filter((id) => id !== game.id),
    ].slice(0, 20);
    state.recent = [...preferences.recent];
    return { ok: true };
  }
  async function navigate(action: Action) {
    if (state.phase === "native") return;
    if (state.phase === "lab") {
      if (action === "back") {
        state.phase = "home";
        state.profile = "menu";
        changeEpoch();
      }
      return;
    }
    if (state.phase === "lobby") {
      if (action === "confirm") state.phase = "home";
      return;
    }
    if (action === "back") {
      state.heroMode = "featured";
      return;
    }
    const games = visibleGames();
    if (!games.length) return;
    const index = Math.max(
      0,
      games.findIndex((game) => game.id === state.selectedGameId),
    );
    if (["left", "right", "up", "down"].includes(action)) {
      const direction = action === "left" || action === "up" ? -1 : 1;
      state.selectedGameId =
        games[(index + direction + games.length) % games.length].id;
      state.heroMode = "detail";
      if (games.length > 1) cue("move");
    } else if (action === "confirm") {
      if (state.heroMode === "featured") {
        state.heroMode = "detail";
        cue("confirm");
      } else return await startGame(state.selectedGameId);
    }
  }
  function useRate(key: string, limit: number, interval: number) {
    const now = Date.now();
    let bucket = rates.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + interval };
      rates.set(key, bucket);
    }
    return ++bucket.count <= limit;
  }
  const origin = () => `http://${address}:${port}`;
  const expectedHost = () => `${address}:${port}`;
  const acceptedOrigin = (value: string | undefined) => value === origin();

  async function bind(bindAddress: string, requestedPort: number) {
    address = bindAddress;
    app = Fastify({
      logger: false,
      bodyLimit: MAX_MESSAGE,
      connectionTimeout: 10_000,
      requestTimeout: 10_000,
      keepAliveTimeout: 5_000,
    });
    app.server.maxConnections = 64;
    app.server.maxRequestsPerSocket = 1000;
    sockets = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_MESSAGE,
      perMessageDeflate: false,
    });
    app.addHook("onRequest", async (request, reply) => {
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("X-Frame-Options", "DENY");
      reply.header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      reply.header(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws://${address}:${port}; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
      );
      reply.header("Cache-Control", "no-store");
      if (request.headers.host !== expectedHost())
        return reply.code(403).send({ error: "Unrecognized host." });
      if (request.headers.origin && !acceptedOrigin(request.headers.origin))
        return reply.code(403).send({ error: "Unrecognized origin." });
      let decoded: string;
      try {
        decoded = decodeURIComponent(request.raw.url ?? "");
      } catch {
        return reply.code(400).send({ error: "Malformed URL." });
      }
      if (
        decoded.includes("\\") ||
        decoded.split(/[/?]/).includes("..") ||
        decoded.includes("\0")
      )
        return reply.code(400).send({ error: "Invalid path." });
    });
    app.setErrorHandler((error, _request, reply) => {
      const status = (error as { statusCode?: number }).statusCode;
      reply.code(status && status >= 400 && status < 500 ? status : 500).send({
        error:
          status && status < 500
            ? "Invalid request."
            : "The local server could not complete this request.",
      });
    });
    app.get("/", async (_request, reply) => reply.redirect("/controller"));
    app.get("/controller/", async (_request, reply) =>
      reply.redirect("/controller"),
    );
    app.get("/controller", async (_request, reply) => {
      try {
        return reply
          .type("text/html; charset=utf-8")
          .send(
            await readFile(path.join(options.publicDir, "controller.html")),
          );
      } catch {
        return reply
          .code(503)
          .send(
            "The controller is not built. Run npm run build on the host PC.",
          );
      }
    });
    app.get("/assets/*", async (request, reply) => {
      try {
        const root = await realpath(path.join(options.publicDir, "assets"));
        const relative = (request.params as { "*": string })["*"];
        const filename = await realpath(path.join(root, relative));
        if (!filename.startsWith(`${root}${path.sep}`))
          return reply.code(404).send();
        const contentTypes: Record<string, string> = {
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".ico": "image/x-icon",
          ".woff2": "font/woff2",
          ".woff": "font/woff",
        };
        const contentType = contentTypes[path.extname(filename).toLowerCase()];
        if (!contentType) return reply.code(404).send();
        return reply
          .type(contentType)
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(await readFile(filename));
      } catch {
        return reply.code(404).send();
      }
    });
    app.get("/api/controller-assets/:id",async(request,reply)=>{
      const id=(request.params as {id:string}).id;const credential=request.headers.authorization?.replace(/^Bearer /,"");
      const device=credential?[...devices.values()].find(d=>d.player.connected&&safeEqual(credential,d.token)):undefined;
      if(!device||!state.studio||!ASSET_ID.test(id)||!controllerAssets(state.studio.definition).includes(id)||!options.libraryAssetsDir)return reply.code(404).send();
      if(!useRate("asset:"+device.player.id,120,60000))return reply.code(429).send();
      try{const root=await realpath(options.libraryAssetsDir),file=await realpath(path.join(root,id+".png"));if(!file.startsWith(root+path.sep))return reply.code(404).send();const bytes=await readFile(file);if(bytes.length>32*1024*1024||createHash("sha256").update(bytes).digest("hex")!==id)return reply.code(404).send();return reply.header("Cache-Control","private, max-age=3600").type("image/png").send(bytes);}catch{return reply.code(404).send();}
    });
    app.get("/api/public", async () => ({
      version: PROTOCOL_VERSION,
      name: "WaterConsole",
      capacity: 4,
      pairingLocked: state.pairingLocked,
    }));
    app.post("/api/pair", async (request, reply) => {
      if (!acceptedOrigin(request.headers.origin))
        return reply
          .code(403)
          .send({ error: "Pair from the controller page on this PC." });
      if (
        !useRate(`pair:${request.ip}`, 10, 60_000) ||
        !useRate("pair:all", 60, 60_000)
      )
        return reply
          .code(429)
          .send({ error: "Too many pairing attempts. Wait one minute." });
      const body = request.body;
      if (
        !object(body) ||
        !keys(body, ["name", "nonce", "code"]) ||
        !cleanName(body.name) ||
        (typeof body.nonce !== "string" && typeof body.code !== "string")
      )
        return reply
          .code(400)
          .send({ error: "Enter your name and a pairing code." });
      if (state.pairingLocked)
        return reply.code(423).send({ error: "The host has locked pairing." });
      if (devices.size >= 4)
        return reply
          .code(409)
          .send({ error: "All four player slots are occupied." });
      if (
        Date.now() >= pairExpiresAt ||
        !(
          (typeof body.nonce === "string" && safeEqual(body.nonce, nonce)) ||
          (typeof body.code === "string" && safeEqual(body.code, pairCode))
        )
      )
        return reply.code(403).send({
          error: "Pairing code expired or incorrect. Scan the current QR.",
        });
      if (
        [...tickets.values()].filter((item) => item.status.status === "pending")
          .length >= MAX_PENDING
      )
        return reply
          .code(429)
          .send({ error: "The host has too many pending requests." });
      const ticket: PairRecord = {
        id: randomBytes(16).toString("hex"),
        secret: token(),
        verificationCode: randomInt(0, 10_000).toString().padStart(4, "0"),
        expiresAt: Date.now() + PAIR_TTL,
        name: cleanName(body.name),
        requestedAt: Date.now(),
        status: { status: "pending" },
      };
      tickets.set(ticket.id, ticket);
      publish();
      const { id, secret, verificationCode, expiresAt } = ticket;
      return reply.code(201).send({ id, secret, verificationCode, expiresAt });
    });
    app.get("/api/pair/:id", async (request, reply) => {
      if (!useRate(`poll:${request.ip}`, 240, 60_000))
        return reply.code(429).send({ error: "Too many requests." });
      const record = tickets.get((request.params as { id: string }).id);
      const secret = request.headers.authorization?.replace(/^Bearer /, "");
      if (!record || !secret || !safeEqual(secret, record.secret))
        return reply.code(404).send({ error: "Pairing request not found." });
      if (record.expiresAt <= Date.now())
        return reply
          .code(410)
          .send({ error: "Pairing request expired. Scan the current QR." });
      return record.status;
    });
    app.server.on("upgrade", (request, socket, head) => {
      if (
        request.url !== "/ws" ||
        request.headers.host !== expectedHost() ||
        !acceptedOrigin(request.headers.origin) ||
        sockets.clients.size >= 12 ||
        !useRate(`ws:${request.socket.remoteAddress}`, 30, 60_000)
      ) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      sockets.handleUpgrade(request, socket, head, (connection) =>
        sockets.emit("connection", connection),
      );
    });
    sockets.on("connection", (socket) => {
      let authenticated: Device | undefined;
      let messageCount = 0;
      let rateStart = Date.now();
      const authDeadline = setTimeout(
        () => socket.close(1008, "Authentication required"),
        5000,
      );
      socket.on("error", noop);
      socket.on("message", (raw) => {
        const now = Date.now();
        if (now - rateStart >= 1000) {
          messageCount = 0;
          rateStart = now;
        }
        if (++messageCount > 180) {
          socket.close(1008, "Input rate exceeded");
          return;
        }
        let message: unknown;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          socket.close(1008, "Invalid message");
          return;
        }
        if (!object(message) || typeof message.type !== "string") {
          socket.close(1008, "Invalid message");
          return;
        }
        if (!authenticated) {
          if (
            message.type !== "auth" ||
            !keys(message, ["type", "version", "token"]) ||
            message.version !== PROTOCOL_VERSION ||
            typeof message.token !== "string" ||
            !/^[a-f0-9]{64}$/.test(message.token)
          ) {
            socket.close(1008, "Authentication required");
            return;
          }
          const device = [...devices.values()].find((item) =>
            safeEqual(message.token as string, item.token),
          );
          if (
            !device ||
            (device.disconnectedAt !== undefined &&
              now - device.disconnectedAt >= RECONNECT_TTL)
          ) {
            socket.close(1008, "Session expired");
            return;
          }
          if (device.socket?.readyState === WebSocket.OPEN) {
            socket.close(1008, "This player is already connected");
            return;
          }
          clearTimeout(authDeadline);
          authenticated = device;
          device.socket = socket;
          device.player.connected = true;
          device.disconnectedAt = undefined;
          device.lastSeq = -1;
          device.lastInput = now;
          neutral(device);
          if (state.phase === "lobby") {
            state.phase = "home";
            state.profile = "menu";
            changeEpoch();
          }
          send(socket, {
            type: "authenticated",
            playerId: device.player.id,
            state: publicSession(),
          });
          publish();
          return;
        }
        const device = authenticated;
        if (device.socket !== socket || !devices.has(device.player.id)) {
          socket.close(1008, "Session ended");
          return;
        }
        if(message.type==="studio-input") {
          if(!keys(message,["type","version","epoch","seq","input"])||message.version!==1||!Number.isSafeInteger(message.seq)||Number(message.seq)<0||!Number.isSafeInteger(message.epoch)) {socket.close(1008,"Invalid controller frame");return;}
          if(message.epoch!==state.epoch||Number(message.seq)<=device.lastSeq)return;
          const session=state.studio;
          if(!session||!validStudioInput(message.input,session.definition,session.modeId)){socket.close(1008,"Controller changed; reload the current layout");return;}
          device.lastSeq=Number(message.seq);device.lastInput=now;
          if(!session.preview&&(state.phase!=="native"||nativeStopping||state.native.quitting||!state.native.focused||state.native.status!=="running"||!nativeSlotAllowed(state.native,state.displayMode,device.player.slot))){neutral(device);relayNativeInput();return;}
          device.player.studio=structuredClone(message.input);needsPublish=true;relayNativeInput();
        } else if(message.type==="studio-mode"&&keys(message,["type","modeId"])&&typeof message.modeId==="string") {
          if(!device.player.canNavigate||!state.studio){send(socket,{type:"error",code:"not_navigator",message:"Only the navigator can switch game modes."});return;}
          void command({type:"studioMode",modeId:message.modeId});
        } else if (message.type === "input") {
          if (!validInputEnvelope(message)) {
            socket.close(1008, "Invalid input frame");
            return;
          }
          if (
            message.epoch !== state.epoch ||
            Number(message.seq) <= device.lastSeq
          )
            return;
          if (!validInput(message, state.profile)) {
            socket.close(1008, "Invalid input frame");
            return;
          }
          if(state.studio){neutral(device);return;}
          const frame = message as unknown as InputFrame;
          device.lastSeq = frame.seq;
          device.lastInput = now;
          const before = device.player.buttons;
          if (
            state.phase === "native" &&
            (nativeStopping ||
              state.native.quitting === true ||
              !nativeSlotAllowed(
                state.native,
                state.displayMode,
                device.player.slot,
              ) ||
              !state.native.focused ||
              state.native.status !== "running")
          ) {
            neutral(device);
            needsPublish ||= before.length > 0;
            relayNativeInput();
            return;
          }
          const changed =
            before.length !== frame.buttons.length ||
            frame.buttons.some((button) => !before.includes(button)) ||
            device.player.axes.x !== frame.axes.x ||
            device.player.axes.y !== frame.axes.y;
          device.player.pressCount += frame.buttons.filter(
            (button) => !before.includes(button),
          ).length;
          device.player.buttons = [...frame.buttons];
          device.player.axes = { ...frame.axes };
          needsPublish ||= changed;
          if (state.phase === "native" && changed) relayNativeInput();
          if (device.player.canNavigate && state.profile === "menu") {
            const pressed = frame.buttons.filter(
              (button) => !before.includes(button),
            );
            for (const action of pressed)
              void command({ type: "navigate", action }).then((result) => {
                if (!result.ok)
                  send(socket, {
                    type: "error",
                    code: "game_action",
                    message: result.error ?? "This game action failed.",
                  });
              });
          }
        } else if (
          message.type === "native-controls" &&
          keys(message, ["type", "mode"]) &&
          ["menu", "game"].includes(String(message.mode))
        ) {
          if (!device.player.canNavigate || state.phase !== "native") {
            send(socket, {
              type: "error",
              code: "not_navigator",
              message:
                "Only the native game's menu navigator can switch controls.",
            });
            return;
          }
          void command({
            type: "nativeControls",
            mode: message.mode as "menu" | "game",
          }).then((result) => {
            if (!result.ok)
              send(socket, {
                type: "error",
                code: "native_controls",
                message: result.error ?? "Controls could not change.",
              });
          });
        } else if (
          message.type === "native-layout" &&
          keys(message, ["type", "mode"]) &&
          ["shared", "split-2", "split-4"].includes(String(message.mode))
        ) {
          if (!device.player.canNavigate || state.phase !== "native") {
            send(socket, {
              type: "error",
              code: "not_navigator",
              message: "Only the navigator can select the display mode.",
            });
            return;
          }
          void command({
            type: "setLayout",
            mode: message.mode as "shared" | "split-2" | "split-4",
          }).then((result) => {
            if (!result.ok)
              send(socket, {
                type: "error",
                code: "native_layout",
                message: result.error ?? "Display mode could not change.",
              });
          });
        } else if (
          message.type === "rename" &&
          keys(message, ["type", "name"]) &&
          cleanName(message.name)
        ) {
          device.player.name = cleanName(message.name);
          publish();
        } else if (
          message.type === "ready" &&
          keys(message, ["type", "ready"]) &&
          typeof message.ready === "boolean"
        ) {
          device.player.ready = message.ready;
          publish();
        } else if (
          message.type === "nav" &&
          keys(message, ["type", "action", "query"]) &&
          ["library", "favorites", "recent", "search", "mute"].includes(
            String(message.action),
          )
        ) {
          if (
            !device.player.canNavigate ||
            ((state.phase === "lab" || state.phase === "native") &&
              message.action !== "library")
          ) {
            send(socket, {
              type: "error",
              code: "not_navigator",
              message: "Only the menu navigator can use this action.",
            });
            return;
          }
          if (state.phase === "lab" || state.phase === "native") {
            void command({ type: "openHome" }).then((result) => {
              if (!result.ok) {
                send(socket, {
                  type: "error",
                  code: "native_stop",
                  message: result.error || "The game is still open.",
                });
                return;
              }
              state.libraryView = "all";
              state.search = "";
              selectVisible();
              publish();
            });
            return;
          }
          state.phase = "home";
          if (message.action === "mute") {
            preferences.muted = !preferences.muted;
            state.muted = preferences.muted;
          } else if (message.action === "search") {
            if (
              typeof message.query !== "string" ||
              message.query.length > 80
            ) {
              socket.close(1008, "Invalid search");
              return;
            }
            state.search = message.query.trim();
          } else {
            state.libraryView =
              message.action === "library"
                ? "all"
                : (message.action as "favorites" | "recent");
            state.search = "";
          }
          selectVisible();
          persist().catch(noop);
          publish();
        } else if (
          message.type === "ping" &&
          keys(message, ["type", "id", "at"]) &&
          Number.isSafeInteger(message.id) &&
          typeof message.at === "number" &&
          Number.isFinite(message.at)
        ) {
          send(socket, {
            type: "pong",
            id: message.id as number,
            at: message.at,
          });
        } else {
          socket.close(1008, "Invalid message");
        }
      });
      socket.on("close", () => {
        clearTimeout(authDeadline);
        if (authenticated?.socket === socket) {
          authenticated.socket = undefined;
          authenticated.player.connected = false;
          authenticated.disconnectedAt = Date.now();
          neutral(authenticated);
          relayNativeInput();
          publish();
        }
      });
    });
    try {
      try {
        await app.listen({ host: address, port: requestedPort });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
        await app.listen({ host: address, port: 0 });
      }
      const bound = app.server.address();
      if (!bound || typeof bound === "string")
        throw new Error("No local network port was assigned.");
      port = bound.port;
      listening = true;
    } catch (error) {
      listening = false;
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await app.close().catch(noop);
      throw error;
    }
  }

  async function stopListener() {
    listening = false;
    for (const socket of sockets.clients) socket.terminate();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
    await app.close();
  }

  async function commandInternal(cmd: HostCommand): Promise<CommandResult> {
    if (closed) return { ok: false, error: "The local server is closed." };
    if (!object(cmd) || typeof cmd.type !== "string")
      return { ok: false, error: "Invalid host command." };
    try {
      switch (cmd.type) {
        case "approve": {
          const record = tickets.get(cmd.requestId);
          if (
            !record ||
            record.status.status !== "pending" ||
            record.expiresAt <= Date.now()
          )
            return { ok: false, error: "This request expired." };
          if (state.pairingLocked)
            return {
              ok: false,
              error: "Unlock pairing before approving a device.",
            };
          if (devices.size >= 4)
            return { ok: false, error: "All four player slots are occupied." };
          const slot = [1, 2, 3, 4].find(
            (candidate) =>
              ![...devices.values()].some(
                (device) => device.player.slot === candidate,
              ),
          )!;
          const id = randomBytes(16).toString("hex");
          const device: Device = {
            player: {
              id,
              slot,
              name: record.name,
              color: COLORS[slot - 1],
              connected: false,
              ready: false,
              canNavigate: devices.size === 0,
              buttons: [],
              axes: { x: 0, y: 0 },
              position: { x: 0.5, y: 0.5 },
              pressCount: 0,
            },
            token: token(),
            lastInput: Date.now(),
            lastSeq: -1,
            disconnectedAt: Date.now(),
          };
          devices.set(id, device);
          record.status = {
            status: "approved",
            token: device.token,
            playerId: id,
          };
          break;
        }
        case "reject": {
          const record = tickets.get(cmd.requestId);
          if (!record || record.status.status !== "pending")
            return { ok: false, error: "This request is no longer pending." };
          record.status = {
            status: "rejected",
            message: "The host declined this request.",
          };
          break;
        }
        case "kick":
          removeDevice(cmd.playerId, "The host removed this controller.");
          break;
        case "assignNavigator":
          if (!devices.has(cmd.playerId))
            return { ok: false, error: "Player not found." };
          for (const device of devices.values())
            device.player.canNavigate = device.player.id === cmd.playerId;
          changeEpoch();
          break;
        case "openHome": {
          endPreview();
          const stopped = await stopNativeGame();
          if (!stopped.ok) return stopped;
          state.phase = "home";
          state.profile = "menu";
          changeEpoch();
          break;
        }
        case "showLobby": {
          const stopped = await stopNativeGame();
          if (!stopped.ok) return stopped;
          state.phase = "lobby";
          state.profile = "menu";
          changeEpoch();
          break;
        }
        case "selectGame":
          if (!catalog.some((game) => game.id === cmd.gameId))
            return { ok: false, error: "Game not found." };
          state.selectedGameId = cmd.gameId;
          state.heroMode = "detail";
          cue("move");
          break;
        case "startGame": {
          const result = await startGame(cmd.gameId);
          if (!result.ok) return result;
          await persist();
          break;
        }
        case "stopGame": {
          const stopped = await stopNativeGame();
          if (!stopped.ok) return stopped;
          state.phase = "home";
          state.profile = "menu";
          changeEpoch();
          break;
        }
        case "setLayout": {
          if (!["shared", "split-2", "split-4"].includes(cmd.mode))
            return { ok: false, error: "Invalid display mode." };
          if (state.phase === "native") {
            const game = catalog.find(
              (game) => game.id === state.native.gameId,
            );
            if (!game?.displayModes.includes(cmd.mode))
              return {
                ok: false,
                error: "The selected game does not support this display mode.",
              };
            if (
              state.native.requiresGamepad === true &&
              state.native.gamepad?.available !== true
            )
              return {
                ok: false,
                error:
                  state.native.gamepad?.message ??
                  "The adapter requires optional PC gamepad support.",
              };
          }
          if (state.displayMode === cmd.mode) return { ok: true };
          state.displayMode = cmd.mode;
          changeEpoch();
          break;
        }
        case "setPairingLocked":
          state.pairingLocked = cmd.locked === true;
          refreshPairing();
          break;
        case "resetSession":
          {
            const result = await resetSession();
            if (!result.ok) return result;
          }
          break;
        case "nativeFocus": {
          if (state.phase !== "native")
            return {
              ok: false,
              error: "Start the native game before focusing it.",
            };
          const result = await invokeNative({ type: "focus" });
          if (!result.ok) {
            state.native.message = result.error;
            publish();
          }
          return result;
        }
        case "studioMode": {
          const studio=state.studio;
          const mode=studio?.definition.modes.find(m=>m.id===cmd.modeId);
          if(!studio||!mode)return {ok:false,error:"Controller mode not found."};
          studio.modeId=mode.id;changeEpoch();publish();
          if(!studio.preview){const result=await invokeNative({type:"controls",mode:mode.purpose==="menu"?"menu":"game"});if(!result.ok)return result;}
          break;
        }
        case "nativeControls": {
          if (state.phase !== "native" || !["menu", "game"].includes(cmd.mode))
            return { ok: false, error: "Native controls are not active." };
          if (state.native.controls === cmd.mode) return { ok: true };
          const previous = state.native.controls;
          state.native.controls = cmd.mode;
          changeEpoch();
          publish();
          const result = await invokeNative({
            type: "controls",
            mode: cmd.mode,
          });
          if (!result.ok) {
            state.native.controls = previous;
            state.native.message = result.error;
            changeEpoch();
          }
          publish();
          return result;
        }
        case "setSearch":
          state.search = String(cmd.query).slice(0, 80).trim();
          selectVisible();
          break;
        case "setView":
          if (!["all", "favorites", "recent"].includes(cmd.view))
            return { ok: false, error: "Invalid library view." };
          state.libraryView = cmd.view;
          state.search = "";
          selectVisible();
          break;
        case "toggleFavorite":
          if (!catalog.some((game) => game.id === cmd.gameId))
            return { ok: false, error: "Game not found." };
          preferences.favorites = preferences.favorites.includes(cmd.gameId)
            ? preferences.favorites.filter((id) => id !== cmd.gameId)
            : [...preferences.favorites, cmd.gameId];
          state.favorites = [...preferences.favorites];
          await persist();
          break;
        case "toggleMute":
          preferences.muted = !preferences.muted;
          state.muted = preferences.muted;
          await persist();
          break;
        case "navigate":
          if (!ACTIONS.includes(cmd.action))
            return { ok: false, error: "Invalid navigation action." };
          const navigation = await navigate(cmd.action);
          if (navigation && !navigation.ok) return navigation;
          await persist();
          break;
        case "setNetwork": {
          if (
            !discoverNetworkAddresses().some(
              (item) => item.address === cmd.address,
            )
          )
            return {
              ok: false,
              error: "This network address is no longer available.",
            };
          const previous = address;
          interfaces = discoverNetworkAddresses();
          const reset = await resetSession();
          if (!reset.ok) return reset;
          await stopListener();
          try {
            await bind(cmd.address, options.port ?? 8787);
          } catch {
            try {
              await bind(previous, options.port ?? 8787);
            } catch {
              networkError =
                "The local server could not bind to this network or recover the previous address. Choose an available network and try again.";
              publish();
              return { ok: false, error: networkError };
            }
            networkError = undefined;
            publish();
            return {
              ok: false,
              error:
                "The selected network could not start. The previous network was restored.",
            };
          }
          networkError = undefined;
          preferences.networkAddress = address;
          await persist();
          break;
        }
        default:
          return { ok: false, error: "Unknown host command." };
      }
      publish();
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: "The local server could not save or apply this change.",
      };
    }
  }

  function command(cmd: HostCommand): Promise<CommandResult> {
    if (closing || closed)
      return Promise.resolve({
        ok: false,
        error: "The local server is closed.",
      });
    const result = commandChain.then(() => commandInternal(cmd));
    commandChain = result.then(noop, noop);
    return result;
  }

  await bind(address, port);
  const tick = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    let changed = false;
    if (pairExpiresAt <= now) {
      refreshPairing();
      changed = true;
    }
    for (const [id, record] of tickets)
      if (record.expiresAt <= now) {
        tickets.delete(id);
        changed = true;
      }
    for (const [key, bucket] of rates)
      if (bucket.resetAt <= now) rates.delete(key);
    for (const [id, device] of devices) {
      if (
        device.disconnectedAt !== undefined &&
        now - device.disconnectedAt >= RECONNECT_TTL
      ) {
        removeDevice(id, "Reconnect window expired. Pair again.");
        changed = true;
        continue;
      }
      if (
        now - device.lastInput >= INPUT_TIMEOUT &&
        (device.player.buttons.length ||
          device.player.axes.x ||
          device.player.axes.y || device.player.studio)
      ) {
        neutral(device);
        relayNativeInput();
        changed = true;
      }
      if (state.phase !== "lab") continue;
      const { buttons, axes, position } = device.player;
      let x =
        axes.x +
        Number(buttons.includes("right")) -
        Number(buttons.includes("left"));
      let y =
        axes.y +
        Number(buttons.includes("down")) -
        Number(buttons.includes("up"));
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      if (x || y) {
        position.x = Math.min(
          0.94,
          Math.max(0.06, position.x + x * elapsed * 0.35),
        );
        position.y = Math.min(
          0.91,
          Math.max(0.09, position.y + y * elapsed * 0.35),
        );
        changed = true;
      }
    }
    if (changed) needsPublish = true;
    if (state.phase === "native" && now - lastNativeRelay >= 95)
      relayNativeInput();
    if (needsPublish || state.phase === "lab") {
      if (now - lastPublish >= (state.phase === "lab" ? 30 : 95)) publish();
    }
  }, 32);
  tick.unref();
  const networkMonitor = setInterval(() => {
    const current = discoverNetworkAddresses();
    const changed = JSON.stringify(current) !== JSON.stringify(interfaces);
    interfaces = current;
    if (!listening) {
      if (changed) publish();
      return;
    }
    if (!interfaces.some((item) => item.address === address)) {
      if (!networkError) {
        networkError =
          "The selected network disconnected or its IP changed. Choose an available network in Settings and pair phones again.";
        for (const device of devices.values()) neutral(device);
        relayNativeInput();
        void command({ type: "resetSession" });
        publish();
      }
    } else if (networkError) {
      networkError = undefined;
      refreshPairing();
      publish();
    } else if (changed) publish();
  }, 5000);
  networkMonitor.unref();
  publish();
  async function updateCatalog(next:GameManifest[],controllers:Record<string,ControllerDefinition>,assetsDirectory?:string) {
    if(state.phase==="native")return {ok:false,error:"Stop the game before applying library edits."};
    if(!Array.isArray(next)||!next.length||next.length>201||next.some(g=>!validGameId(g.id))||new Set(next.map(g=>g.id)).size!==next.length)return {ok:false,error:"Invalid local catalog."};
    for(const def of Object.values(controllers))validateController(def);
    if(assetsDirectory)options.libraryAssetsDir=assetsDirectory;
    catalog=structuredClone(next);definitions=structuredClone(controllers);state.studio=undefined;state.profile="menu";
    if(!catalog.some(g=>g.id===state.selectedGameId))state.selectedGameId=catalog[0].id;
    preferences.favorites=preferences.favorites.filter(id=>catalog.some(g=>g.id===id));preferences.recent=preferences.recent.filter(id=>catalog.some(g=>g.id===id));state.favorites=[...preferences.favorites];state.recent=[...preferences.recent];changeEpoch();await persist();publish();return {ok:true};
  }
  function previewController(gameId:string,definition:ControllerDefinition,modeId:string){
    if(state.phase==="native")return {ok:false,error:"Stop the game before opening a safe preview."};validateController(definition);
    if(!validGameId(gameId)||!definition.modes.some(m=>m.id===modeId))return {ok:false,error:"Preview entry or mode not found."};
    state.phase="home";state.profile="gamepad";state.studio={definition:structuredClone(definition),modeId,preview:true};changeEpoch();publish();return {ok:true};
  }
  function endPreview(){if(state.studio?.preview){state.studio=undefined;state.profile="menu";changeEpoch();publish();}return {ok:true};}
  return {
    updateCatalog,previewController,endPreview,
    getState,
    command,
    updateNativeState,
    relayNativeRumble,
    get address() {
      return address;
    },
    get port() {
      return port;
    },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        await commandChain;
        await stopNativeGame();
        closed = true;
        clearInterval(tick);
        clearInterval(networkMonitor);
        for (const device of devices.values())
          if (device.socket)
            send(device.socket, {
              type: "ended",
              message: "WaterConsole closed.",
            });
        await stopListener();
        await persistChain.catch(noop);
      })();
      return closePromise;
    },
  };
}

function validInputEnvelope(message: Record<string, unknown>): boolean {
  return (
    keys(message, ["type", "version", "epoch", "seq", "buttons", "axes"]) &&
    message.version === PROTOCOL_VERSION &&
    Number.isSafeInteger(message.epoch) &&
    Number.isSafeInteger(message.seq) &&
    Number(message.seq) >= 0
  );
}

function nativeMessage(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  if (/[a-z]:[\\/]|\\\\/i.test(value))
    return "The native game action failed. Check the host PC for details.";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 240);
}

function normalizeNativeState(value?: NativeRuntimeState): NativeRuntimeState {
  const statuses = [
    "unavailable",
    "idle",
    "starting",
    "running",
    "paused",
    "error",
  ];
  return {
    quitting: value?.quitting === true,
    available: value?.available === true,
    ...(value?.gamepad
      ? {
          gamepad: {
            available: value.gamepad.available === true,
            ...(nativeMessage(value.gamepad.message)
              ? { message: nativeMessage(value.gamepad.message) }
              : {}),
          },
        }
      : {}),
    games: Object.fromEntries(
      Object.entries(value?.games ?? {})
        .filter(([id]) => validGameId(id))
        .map(([id, available]) => [id, available === true]),
    ),
    ...(validGameId(value?.gameId) ? { gameId: value.gameId } : {}),
    maxPlayers:
      Number.isInteger(value?.maxPlayers) &&
      value!.maxPlayers! >= 1 &&
      value!.maxPlayers! <= 4
        ? value!.maxPlayers
        : 0,
    displayModes: [
      ...new Set(
        (value?.displayModes ?? []).filter((mode) =>
          ["shared", "split-2", "split-4"].includes(mode),
        ),
      ),
    ],
    requiresGamepad: value?.requiresGamepad === true,
    status:
      value && statuses.includes(value.status) ? value.status : "unavailable",
    controls: value?.controls === "game" ? "game" : "menu",
    focused: value?.focused === true,
    ...(nativeMessage(value?.message)
      ? { message: nativeMessage(value?.message) }
      : {}),
  };
}

function validInput(
  message: Record<string, unknown>,
  profile: ProfileId,
): boolean {
  return (
    Array.isArray(message.buttons) &&
    message.buttons.length <= ACTIONS.length &&
    new Set(message.buttons).size === message.buttons.length &&
    message.buttons.every(
      (button) =>
        typeof button === "string" &&
        PROFILES[profile].actions.includes(button as Action),
    ) &&
    object(message.axes) &&
    keys(message.axes, ["x", "y"]) &&
    typeof message.axes.x === "number" &&
    Number.isFinite(message.axes.x) &&
    Math.abs(message.axes.x) <= 1 &&
    typeof message.axes.y === "number" &&
    Number.isFinite(message.axes.y) &&
    Math.abs(message.axes.y) <= 1
  );
}
