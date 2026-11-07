import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { WebSocket } from "ws";
import { createWaterConsoleServer } from "../src/server/index";
import type {
  PairStatus,
  PairTicket,
  ServerMessage,
  SessionState,
  CommandResult,
  NativeCommand,
  NativeInputSnapshot,
  NativeRuntimeState,
  GameManifest,
} from "../src/shared/types";

type Server = Awaited<ReturnType<typeof createWaterConsoleServer>>;
let root: string;
let server: Server;
const liveSockets: WebSocket[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("Condition did not become true");
};
const url = (route = "") => `http://${server.address}:${server.port}${route}`;
const headers = () => ({ Origin: url(), "Content-Type": "application/json" });

async function requestPair(name = "Player") {
  const nonce = new URL(server.getState().pairing.url).hash.slice(
    "#nonce=".length,
  );
  const response = await fetch(url("/api/pair"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name, nonce }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as PairTicket;
}
async function approve(name = "Player") {
  const ticket = await requestPair(name);
  expect(
    await server.command({ type: "approve", requestId: ticket.id }),
  ).toEqual({ ok: true });
  const response = await fetch(url(`/api/pair/${ticket.id}`), {
    headers: { Authorization: `Bearer ${ticket.secret}` },
  });
  const status = (await response.json()) as PairStatus;
  if (status.status !== "approved") throw new Error("Approval missing");
  return { ...status, ticket };
}
function openSocket(origin = url()) {
  const socket = new WebSocket(url("/ws").replace("http:", "ws:"), { origin });
  liveSockets.push(socket);
  socket.on("error", () => {});
  return socket;
}
function receive(socket: WebSocket, type: ServerMessage["type"]) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", listener);
      reject(new Error(`Missing ${type}`));
    }, 2000);
    const listener = (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.type === type) {
        clearTimeout(timeout);
        socket.off("message", listener);
        resolve(message);
      }
    };
    socket.on("message", listener);
  });
}
function closed(socket: WebSocket) {
  return new Promise<number>((resolve) =>
    socket.once("close", (code) => resolve(code)),
  );
}
async function connect(token: string) {
  const socket = openSocket();
  await new Promise<void>((resolve) => socket.once("open", resolve));
  const response = receive(socket, "authenticated");
  socket.send(JSON.stringify({ type: "auth", version: 1, token }));
  const message = await response;
  if (message.type !== "authenticated")
    throw new Error("Authentication missing");
  return { socket, state: message.state };
}
function input(
  socket: WebSocket,
  epoch: number,
  seq: number,
  buttons: string[] = [],
  axes = { x: 0, y: 0 },
) {
  socket.send(
    JSON.stringify({ type: "input", version: 1, epoch, seq, buttons, axes }),
  );
}
async function rawGet(route: string, host?: string) {
  return await new Promise<number>((resolve) => {
    const request = http.get(
      {
        hostname: server.address,
        port: server.port,
        path: route,
        headers: { Host: host ?? `${server.address}:${server.port}` },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    request.on("error", () => resolve(0));
  });
}
async function portOpen(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

beforeEach(async () => {
  const testRoot = path.join(process.cwd(), ".local", "tests");
  await mkdir(testRoot, { recursive: true });
  root = await mkdtemp(path.join(testRoot, "server-"));
  await mkdir(path.join(root, "public", "assets"), { recursive: true });
  await writeFile(
    path.join(root, "public", "controller.html"),
    "<!doctype html><title>Controller</title>",
  );
  await writeFile(path.join(root, "public", "host.html"), "PRIVATE HOST");
  await writeFile(
    path.join(root, "public", "assets", "app.js"),
    'console.log("offline")',
  );
  server = await createWaterConsoleServer({
    address: "127.0.0.1",
    port: 0,
    publicDir: path.join(root, "public"),
    dataDir: path.join(root, "data"),
  });
});

afterEach(async () => {
  for (const socket of liveSockets.splice(0)) socket.terminate();
  await server.close();
  vi.restoreAllMocks();
  if (
    !path
      .resolve(root)
      .startsWith(path.resolve(process.cwd(), ".local", "tests") + path.sep)
  ) {
    throw new Error("Test cleanup escaped its scratch directory");
  }
  await rm(root, { recursive: true, force: true });
});

describe("console sound feedback", () => {
  it("emits host cues for accepted selection and confirmation only", async () => {
    await server.command({ type: "openHome" });
    await server.command({ type: "selectGame", gameId: "controller-lab" });
    expect(server.getState().feedback).toEqual({ sequence: 1, sound: "move" });
    await server.command({ type: "toggleFavorite", gameId: "controller-lab" });
    expect(
      (await server.command({ type: "startGame", gameId: "missing-game" })).ok,
    ).toBe(false);
    expect(server.getState().feedback.sequence).toBe(1);
    const player = await approve();
    const client = await connect(player.token);
    expect(client.state).not.toHaveProperty("feedback");
    input(client.socket, client.state.epoch, 1, ["confirm"]);
    await waitUntil(() => server.getState().phase === "lab");
    expect(server.getState().feedback).toEqual({
      sequence: 2,
      sound: "confirm",
    });
    await server.command({ type: "toggleMute" });
    expect(server.getState().feedback.sequence).toBe(2);
  });
});

describe("LAN boundary and pairing", () => {
  it("serves only controller assets and public metadata, with CSP and no private state", async () => {
    const response = await fetch(url("/controller"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await response.text()).toContain("Controller");
    expect((await fetch(url("/assets/app.js"))).status).toBe(200);
    expect((await fetch(url("/host.html"))).status).toBe(404);
    expect((await fetch(url("/api/state"))).status).toBe(404);
    expect(
      (await fetch(url("/api/public"))).headers.get(
        "access-control-allow-origin",
      ),
    ).toBeNull();
    const metadata = await (await fetch(url("/api/public"))).json();
    expect(metadata).toEqual({
      version: 1,
      name: "WaterConsole",
      capacity: 4,
      pairingLocked: false,
    });
    expect(await rawGet("/assets/%2e%2e/host.html")).toBe(400);
    expect(await rawGet("/api/public", "attacker.example:8787")).toBe(403);
  });

  it("requires matching Origin for pairing and WebSocket upgrades", async () => {
    const rejected = await fetch(url("/api/pair"), {
      method: "POST",
      headers: { ...headers(), Origin: "https://attacker.example" },
      body: JSON.stringify({
        name: "Intruder",
        code: server.getState().pairing.code,
      }),
    });
    expect(rejected.status).toBe(403);
    const socket = openSocket("https://attacker.example");
    const status = await new Promise<number>((resolve) =>
      socket.once("unexpected-response", (_request, response) => {
        response.resume();
        socket.terminate();
        resolve(response.statusCode!);
      }),
    );
    expect(status).toBe(403);
  });

  it("requires PC approval and a secret ticket before issuing a device token", async () => {
    const ticket = await requestPair("Green player");
    expect(server.getState().players).toHaveLength(0);
    expect(server.getState().pending[0].verificationCode).toBe(
      ticket.verificationCode,
    );
    expect((await fetch(url(`/api/pair/${ticket.id}`))).status).toBe(404);
    const pending = await (
      await fetch(url(`/api/pair/${ticket.id}`), {
        headers: { Authorization: `Bearer ${ticket.secret}` },
      })
    ).json();
    expect(pending).toEqual({ status: "pending" });
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const end = closed(socket);
    socket.send(
      JSON.stringify({ type: "auth", version: 1, token: ticket.secret }),
    );
    expect(await end).toBe(1008);
  });

  it("rejects non-ASCII secrets without throwing or terminating the server", async () => {
    await approve();
    const response = await fetch(url("/api/pair"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "Unicode", nonce: "é".repeat(32) }),
    });
    expect(response.status).toBe(403);
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const end = closed(socket);
    socket.send(
      JSON.stringify({ type: "auth", version: 1, token: "é".repeat(64) }),
    );
    expect(await end).toBe(1008);
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });

  it("allocates unique slots to four approved devices and rejects a fifth", async () => {
    for (let i = 1; i <= 4; i++) await approve(`Player ${i}`);
    expect(server.getState().players.map((player) => player.slot)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      server.getState().players.filter((player) => player.canNavigate),
    ).toHaveLength(1);
    const response = await fetch(url("/api/pair"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        name: "Fifth",
        code: server.getState().pairing.code,
      }),
    });
    expect(response.status).toBe(409);
  });

  it("expires pairing codes and tickets, rejects requests, and honors pairing lock", async () => {
    const ticket = await requestPair();
    await server.command({ type: "reject", requestId: ticket.id });
    expect(
      await (
        await fetch(url(`/api/pair/${ticket.id}`), {
          headers: { Authorization: `Bearer ${ticket.secret}` },
        })
      ).json(),
    ).toMatchObject({ status: "rejected" });
    await server.command({ type: "setPairingLocked", locked: true });
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            name: "Locked",
            code: server.getState().pairing.code,
          }),
        })
      ).status,
    ).toBe(423);
    await server.command({ type: "setPairingLocked", locked: false });
    const oldCode = server.getState().pairing.code;
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 121_000);
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ name: "Expired", code: oldCode }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await server.command({ type: "approve", requestId: ticket.id })).ok,
    ).toBe(false);
  });

  it("limits pairing guesses and rejects oversized requests", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await fetch(url("/api/pair"), {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ name: "Guess", code: "bad" }),
          })
        ).status,
      ).toBe(403);
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ name: "Guess", code: "bad" }),
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await fetch(url("/api/pair"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ name: "x".repeat(10_000), code: "bad" }),
        })
      ).status,
    ).toBe(413);
  });
});

describe("controller state and recovery", () => {
  it("neutralizes stale input after 300ms, ignores old epochs and duplicate sequence frames", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "controller-lab" });
    const epoch = server.getState().epoch;
    input(socket, epoch - 1, 1, ["right"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual([]);
    input(socket, epoch, 2, ["right", "a"]);
    await waitUntil(() => server.getState().players[0].buttons.length === 2);
    input(socket, epoch, 1, ["left"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual(["right", "a"]);
    expect(server.getState().players[0].pressCount).toBe(2);
    await waitUntil(() => server.getState().players[0].buttons.length === 0);
    expect(server.getState().players[0].position.x).toBeGreaterThan(0.5);
  });

  it("reconnects the same slot with neutral input and invalidates old tokens on session reset", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "controller-lab" });
    input(socket, server.getState().epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.length === 1);
    socket.close();
    await waitUntil(() => !server.getState().players[0].connected);
    expect(server.getState().players[0].buttons).toEqual([]);
    const reconnect = await connect(device.token);
    expect(reconnect.state.players[0]).toMatchObject({
      id: device.playerId,
      slot: 1,
      buttons: [],
    });
    await server.command({ type: "resetSession" });
    const old = openSocket();
    await new Promise<void>((resolve) => old.once("open", resolve));
    const end = closed(old);
    old.send(JSON.stringify({ type: "auth", version: 1, token: device.token }));
    expect(await end).toBe(1008);
  });

  it("ignores in-flight lab actions after returning Home but rejects a wrong protocol version", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    await server.command({ type: "startGame", gameId: "controller-lab" });
    const labEpoch = server.getState().epoch;
    input(socket, labEpoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("a"));
    await server.command({ type: "stopGame" });
    input(socket, labEpoch, 2, ["a", "x"]);
    await sleep(50);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(server.getState().players[0]).toMatchObject({
      connected: true,
      buttons: [],
    });
    const end = closed(socket);
    socket.send(
      JSON.stringify({
        type: "input",
        version: 2,
        epoch: server.getState().epoch,
        seq: 3,
        buttons: [],
        axes: { x: 0, y: 0 },
      }),
    );
    expect(await end).toBe(1008);
  });

  it("releases a disconnected slot after 30 seconds", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    socket.close();
    await waitUntil(() => !server.getState().players[0].connected);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 30_100);
    await waitUntil(() => server.getState().players.length === 0);
  });

  it("rejects forbidden actions, raw keycodes and non-finite axes", async () => {
    const device = await approve();
    const { socket } = await connect(device.token);
    const end = closed(socket);
    socket.send(
      JSON.stringify({
        type: "input",
        version: 1,
        epoch: server.getState().epoch,
        seq: 1,
        buttons: ["a"],
        axes: { x: 0, y: 0 },
        keycode: 65,
      }),
    );
    expect(await end).toBe(1008);
    const reconnect = await connect(device.token);
    const invalid = closed(reconnect.socket);
    reconnect.socket.send(
      JSON.stringify({
        type: "input",
        version: 1,
        epoch: server.getState().epoch,
        seq: 1,
        buttons: [],
        axes: { x: null, y: 0 },
      }),
    );
    expect(await invalid).toBe(1008);
  });

  it("rejects simultaneous connections for the same player and floods", async () => {
    const device = await approve();
    const first = await connect(device.token);
    const duplicate = openSocket();
    await new Promise<void>((resolve) => duplicate.once("open", resolve));
    const endDuplicate = closed(duplicate);
    duplicate.send(
      JSON.stringify({ type: "auth", version: 1, token: device.token }),
    );
    expect(await endDuplicate).toBe(1008);
    const endFlood = closed(first.socket);
    for (let i = 0; i < 185; i++)
      first.socket.send(JSON.stringify({ type: "ping", id: i, at: 0 }));
    expect(await endFlood).toBe(1008);
  });

  it("rejects malformed JSON and oversized WebSocket frames without stopping the server", async () => {
    const malformed = openSocket();
    await new Promise<void>((resolve) => malformed.once("open", resolve));
    const malformedEnd = closed(malformed);
    malformed.send("{broken");
    expect(await malformedEnd).toBe(1008);
    const oversized = openSocket();
    await new Promise<void>((resolve) => oversized.once("open", resolve));
    const oversizedEnd = closed(oversized);
    oversized.send("x".repeat(9000));
    expect(await oversizedEnd).toBe(1009);
    expect((await fetch(url("/api/public"))).status).toBe(200);
    expect(server.getState().players).toHaveLength(0);
  });

  it("closes an unauthenticated socket after its authentication deadline", async () => {
    const socket = openSocket();
    await new Promise<void>((resolve) => socket.once("open", resolve));
    const started = Date.now();
    expect(await closed(socket)).toBe(1008);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
    expect(server.getState().players).toHaveLength(0);
  });

  it("does not expose unsupported asset file types", async () => {
    await writeFile(
      path.join(root, "public", "assets", "notes.txt"),
      "PRIVATE NOTES",
    );
    const response = await fetch(url("/assets/notes.txt"));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("PRIVATE NOTES");
  });

  it("recovers from damaged preferences with safe defaults", async () => {
    await server.close();
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", "preferences.json"), "{broken");
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
    });
    expect(server.getState().favorites).toEqual([]);
    expect(server.getState().recent).toEqual([]);
    expect(server.getState().muted).toBe(false);
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });

  it("lets only the assigned navigator operate Home and switches controller epochs", async () => {
    const one = await approve("One");
    const two = await approve("Two");
    const first = await connect(one.token);
    const second = await connect(two.token);
    await server.command({ type: "openHome" });
    const epoch = server.getState().epoch;
    input(second.socket, epoch, 1, ["confirm"]);
    await sleep(40);
    expect(server.getState().phase).toBe("home");
    await server.command({ type: "assignNavigator", playerId: two.playerId });
    input(first.socket, epoch, 1, ["confirm"]);
    await sleep(40);
    expect(server.getState().phase).toBe("home");
    input(second.socket, server.getState().epoch, 2, []);
    input(second.socket, server.getState().epoch, 3, ["confirm"]);
    await waitUntil(() => server.getState().heroMode === "detail");
    input(second.socket, server.getState().epoch, 4, []);
    input(second.socket, server.getState().epoch, 5, ["confirm"]);
    await waitUntil(() => server.getState().phase === "lab");
    expect(server.getState().epoch).toBeGreaterThan(epoch);
    expect(
      server.getState().players.every((player) => player.buttons.length === 0),
    ).toBe(true);
    await server.command({ type: "setLayout", mode: "split-4" });
    expect(server.getState().displayMode).toBe("split-4");
    const labEpoch = server.getState().epoch;
    second.socket.send(JSON.stringify({ type: "nav", action: "library" }));
    await waitUntil(() => server.getState().phase === "home");
    expect(server.getState().profile).toBe("menu");
    expect(server.getState().epoch).toBeGreaterThan(labEpoch);
  });
});

describe("lifecycle and preferences", () => {
  it("persists favorites, history and mute across a clean restart", async () => {
    await server.command({ type: "toggleFavorite", gameId: "controller-lab" });
    await server.command({ type: "toggleMute" });
    await server.command({ type: "startGame", gameId: "controller-lab" });
    await server.close();
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
    });
    expect(server.getState()).toMatchObject({
      favorites: ["controller-lab"],
      recent: ["controller-lab"],
      muted: true,
      phase: "lobby",
      players: [],
    });
    await server.command({ type: "setView", view: "favorites" });
    await server.command({ type: "setSearch", query: "Lab" });
    expect(server.getState().search).toBe("Lab");
  });

  it("selects a free port when the preferred port is occupied", async () => {
    const occupied = net.createServer();
    await new Promise<void>((resolve) =>
      occupied.listen(0, "127.0.0.1", resolve),
    );
    const busyPort = (occupied.address() as net.AddressInfo).port;
    await server.close();
    try {
      server = await createWaterConsoleServer({
        address: "127.0.0.1",
        port: busyPort,
        publicDir: path.join(root, "public"),
        dataDir: path.join(root, "data"),
      });
      expect(server.port).not.toBe(busyPort);
      expect(server.getState().pairing.url).toContain(
        `:${server.port}/controller`,
      );
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it("rebinds without preserving old session credentials and keeps preferences", async () => {
    const device = await approve();
    await server.command({ type: "toggleFavorite", gameId: "controller-lab" });
    const result = await server.command({
      type: "setNetwork",
      address: "127.0.0.1",
    });
    expect(result).toEqual({ ok: true });
    expect(server.getState().players).toEqual([]);
    expect(server.getState().favorites).toEqual(["controller-lab"]);
    const old = openSocket();
    await new Promise<void>((resolve) => old.once("open", resolve));
    const end = closed(old);
    old.send(JSON.stringify({ type: "auth", version: 1, token: device.token }));
    expect(await end).toBe(1008);
  });

  it("reports failed network binding and permits a later recovery attempt", async () => {
    const originalListen = net.Server.prototype.listen;
    let failures = 2;
    const listener = vi
      .spyOn(net.Server.prototype, "listen")
      .mockImplementation(function (
        this: net.Server,
        ...args: Parameters<net.Server["listen"]>
      ) {
        if (failures-- > 0) {
          queueMicrotask(() =>
            this.emit(
              "error",
              Object.assign(new Error("Address unavailable"), {
                code: "EADDRNOTAVAIL",
              }),
            ),
          );
          return this;
        }
        return originalListen.apply(this, args);
      });
    expect(
      (await server.command({ type: "setNetwork", address: "127.0.0.1" })).ok,
    ).toBe(false);
    expect(server.getState().network).toMatchObject({
      status: "error",
      error: expect.stringContaining("could not bind"),
    });
    listener.mockRestore();
    expect(
      (await server.command({ type: "setNetwork", address: "127.0.0.1" })).ok,
    ).toBe(true);
    expect(server.getState().network.status).toBe("offline");
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });

  it("serializes concurrent network changes and closes every previous listener", async () => {
    await server.close();
    const ports = new Set<number>();
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
      onState: (state) => ports.add(state.network.port),
    });
    const results = await Promise.all([
      server.command({ type: "setNetwork", address: "127.0.0.1" }),
      server.command({ type: "setNetwork", address: "127.0.0.1" }),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect((await fetch(url("/api/public"))).status).toBe(200);
    for (const oldPort of ports)
      expect(await portOpen(oldPort)).toBe(oldPort === server.port);
    const change = server.command({ type: "setNetwork", address: "127.0.0.1" });
    await server.close();
    expect(await change).toEqual({ ok: true });
    for (const oldPort of ports) expect(await portOpen(oldPort)).toBe(false);
    expect((await server.command({ type: "openHome" })).ok).toBe(false);
  });

  it("publishes the recovered pairing URL and neutral session after a failed requested bind", async () => {
    await server.close();
    const snapshots: ReturnType<Server["getState"]>[] = [];
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
      onState: (state) => snapshots.push(state),
    });
    await approve();
    const oldUrl = server.getState().pairing.url;
    const originalListen = net.Server.prototype.listen;
    let fail = true;
    const listener = vi
      .spyOn(net.Server.prototype, "listen")
      .mockImplementation(function (
        this: net.Server,
        ...args: Parameters<net.Server["listen"]>
      ) {
        if (fail) {
          fail = false;
          queueMicrotask(() =>
            this.emit(
              "error",
              Object.assign(new Error("Address unavailable"), {
                code: "EADDRNOTAVAIL",
              }),
            ),
          );
          return this;
        }
        return originalListen.apply(this, args);
      });
    expect(
      (await server.command({ type: "setNetwork", address: "127.0.0.1" })).ok,
    ).toBe(false);
    listener.mockRestore();
    const published = snapshots.at(-1)!;
    expect(published.players).toEqual([]);
    expect(published.pairing.url).not.toBe(oldUrl);
    expect(published.pairing.url).toBe(server.getState().pairing.url);
    expect(published.network.port).toBe(server.port);
    expect((await fetch(url("/api/public"))).status).toBe(200);
  });
});

describe("generic native extension boundary", () => {
  async function fixture(
    hook?: (command: NativeCommand) => Promise<CommandResult>,
  ) {
    await server.close();
    const snapshots: NativeInputSnapshot[] = [];
    const commands: NativeCommand[] = [];
    const manifest: GameManifest = {
      id: "example-native",
      title: "Example adapter",
      subtitle: "Test fixture",
      description: "No game is included.",
      minPlayers: 1,
      maxPlayers: 4,
      runtime: "native",
      controllerProfile: "gamepad",
      displayModes: ["shared", "split-2", "split-4"],
      availability: "available",
    };
    const initial: NativeRuntimeState = {
      available: true,
      games: { "example-native": true },
      status: "idle",
      controls: "menu",
      focused: false,
      maxPlayers: 4,
      displayModes: manifest.displayModes,
    };
    server = await createWaterConsoleServer({
      address: "127.0.0.1",
      port: 0,
      publicDir: path.join(root, "public"),
      dataDir: path.join(root, "data"),
      catalog: [manifest],
      initialNativeState: initial,
      onNativeInput: (s) => snapshots.push(structuredClone(s)),
      onNativeCommand: async (command) => {
        commands.push(command);
        if (hook) return hook(command);
        if (command.type === "start")
          server.updateNativeState({
            ...initial,
            gameId: manifest.id,
            status: "running",
            focused: true,
          });
        if (command.type === "stop")
          server.updateNativeState({ ...initial, status: "idle" });
        return { ok: true };
      },
    });
    return { snapshots, commands };
  }
  it("ships no native catalog entries or implicit adapter availability", async () => {
    expect(server.getState().native.available).toBe(false);
    expect(
      (await server.command({ type: "startGame", gameId: "example-native" }))
        .ok,
    ).toBe(false);
    expect(server.getState().phase).toBe("lobby");
  });
  it("relays four independent semantic snapshots and releases stale, unfocused and disconnected input", async () => {
    const { snapshots } = await fixture();
    const clients = [];
    for (let i = 1; i <= 4; i++) {
      const p = await approve(`Player ${i}`);
      clients.push(await connect(p.token));
    }
    await server.command({ type: "startGame", gameId: "example-native" });
    await server.command({ type: "nativeControls", mode: "game" });
    const epoch = server.getState().epoch;
    clients.forEach((c, i) =>
      input(c.socket, epoch, 1, [(["a", "b", "x", "y"] as const)[i]]),
    );
    await waitUntil(
      () =>
        snapshots.at(-1)?.players.every((p) => p.buttons.length === 1) === true,
    );
    expect(snapshots.at(-1)?.players.map((p) => p.buttons)).toEqual([
      ["a"],
      ["b"],
      ["x"],
      ["y"],
    ]);
    input(clients[3].socket, epoch - 1, 9, ["a"]);
    input(clients[3].socket, epoch, 1, ["a"]);
    await sleep(30);
    expect(server.getState().players[3].buttons).toEqual(["y"]);
    await sleep(360);
    expect(snapshots.at(-1)?.players.every((p) => !p.buttons.length)).toBe(
      true,
    );
    input(clients[0].socket, epoch, 2, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.includes("a"));
    server.updateNativeState({ ...server.getState().native, focused: false });
    expect(snapshots.at(-1)?.players.every((p) => !p.buttons.length)).toBe(
      true,
    );
    clients[0].socket.close();
    await waitUntil(() => !server.getState().players[0].connected);
    expect(server.getState().players[0].buttons).toEqual([]);
  });
  it("routes bounded PC rumble to only its approved slot and current active epoch", async () => {
    await fixture();
    const one = await approve("One"),
      two = await approve("Two");
    const c1 = await connect(one.token),
      c2 = await connect(two.token);
    const received: ServerMessage[] = [];
    c1.socket.on("message", (data) =>
      received.push(JSON.parse(data.toString())),
    );
    await server.command({ type: "startGame", gameId: "example-native" });
    await server.command({ type: "nativeControls", mode: "game" });
    const epoch = server.getState().epoch;
    const pulse = receive(c2.socket, "haptics");
    server.relayNativeRumble({
      slot: 2,
      epoch,
      largeMotor: 255,
      smallMotor: 255,
    });
    expect(await pulse).toEqual({ type: "haptics", epoch, durationMs: 140 });
    server.relayNativeRumble({
      slot: 2,
      epoch: epoch - 1,
      largeMotor: 255,
      smallMotor: 0,
    });
    server.relayNativeRumble({
      slot: 1,
      epoch,
      largeMotor: 999,
      smallMotor: 0,
    });
    await sleep(40);
    expect(received.filter((m) => m.type === "haptics")).toEqual([]);
    const zero = receive(c2.socket, "haptics");
    server.relayNativeRumble({ slot: 2, epoch, largeMotor: 0, smallMotor: 0 });
    expect(await zero).toEqual({ type: "haptics", epoch, durationMs: 0 });
    await server.command({ type: "nativeControls", mode: "menu" });
    const ignored: ServerMessage[] = [];
    c2.socket.on("message", (d) => ignored.push(JSON.parse(d.toString())));
    server.relayNativeRumble({
      slot: 2,
      epoch: server.getState().epoch,
      largeMotor: 255,
      smallMotor: 255,
    });
    await sleep(90);
    expect(ignored.filter((m) => m.type === "haptics")).toEqual([]);
  });
  it("requires navigator authority for mode changes and neutralizes pending Stop", async () => {
    let finish: ((r: CommandResult) => void) | undefined;
    const { snapshots } = await fixture(async (c) => {
      if (c.type === "start")
        server.updateNativeState({
          ...server.getState().native,
          gameId: "example-native",
          status: "running",
          focused: true,
        });
      if (c.type === "stop")
        return new Promise((r) => {
          finish = r;
        });
      return { ok: true };
    });
    const one = await approve("One"),
      two = await approve("Two");
    const c1 = await connect(one.token),
      c2 = await connect(two.token);
    await server.command({ type: "startGame", gameId: "example-native" });
    const denied = receive(c2.socket, "error");
    c2.socket.send(JSON.stringify({ type: "native-controls", mode: "game" }));
    expect((await denied).type).toBe("error");
    c1.socket.send(JSON.stringify({ type: "native-controls", mode: "game" }));
    await waitUntil(() => server.getState().native.controls === "game");
    input(c1.socket, server.getState().epoch, 1, ["a"]);
    await waitUntil(() => server.getState().players[0].buttons.length === 1);
    const stopping = server.command({ type: "stopGame" });
    await waitUntil(() => !!finish);
    expect(server.getState().phase).toBe("native");
    expect(snapshots.at(-1)?.players.every((p) => !p.buttons.length)).toBe(
      true,
    );
    input(c1.socket, server.getState().epoch, 2, ["x"]);
    await sleep(30);
    expect(server.getState().players[0].buttons).toEqual([]);
    finish!({ ok: true });
    await stopping;
    expect(server.getState().phase).toBe("home");
  });
});
