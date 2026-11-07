import type { ArtworkSlot, ControllerDefinition, StudioInput, StudioSession, LibraryCommand, LibraryResult } from "./studio-model";
export const PROTOCOL_VERSION = 1 as const;
export const COLORS = ["#32e49e", "#55a5ff", "#ffb95e", "#cf88ff"] as const;
export const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "back",
  "a",
  "b",
  "x",
  "y",
  "start",
  "l",
  "r",
  "lt",
  "rt",
  "select",
] as const;
export type Action = (typeof ACTIONS)[number];
export type DisplayMode = "shared" | "split-2" | "split-4";
export type Phase = "lobby" | "home" | "lab" | "native";
export type LibraryView = "all" | "favorites" | "recent";
export type NativeGameId = string;
export type NativeControls = "menu" | "game";
export type ProfileId = "menu" | "lab" | "gamepad";
export interface GameManifest {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  runtime: "web" | "native";
  displayModes: DisplayMode[];
  controllerProfile: ProfileId;
  availability: "available" | "planned";
  launchRequirement?: { label: string; description: string };
  offlineNote?: string;
  requiresGamepad?: boolean;
  connection?: "offline" | "online" | "offline-online";
  local?: boolean; tags?: string[]; cover?:ArtworkSlot; banner?:ArtworkSlot; setup?:string;
}
export const GAMES: GameManifest[] = [
  {
    id: "controller-lab",
    title: "Controller Lab",
    subtitle: "A little room for every player.",
    description:
      "Connect your phones, find your color, and put every button to the test. One screen. Up to four controllers. All on your own network.",
    minPlayers: 1,
    maxPlayers: 4,
    runtime: "web",
    displayModes: ["shared", "split-2", "split-4"],
    controllerProfile: "lab",
    availability: "available",
  },
];
export interface ControllerProfile {
  id: ProfileId;
  orientation: "portrait" | "landscape";
  actions: Action[];
}
export const PROFILES: Record<ProfileId, ControllerProfile> = {
  menu: {
    id: "menu",
    orientation: "portrait",
    actions: ["up", "down", "left", "right", "confirm", "back"],
  },
  lab: { id: "lab", orientation: "landscape", actions: [...ACTIONS] },
  gamepad: { id: "gamepad", orientation: "landscape", actions: [...ACTIONS] },
};
export interface NativeRuntimeState {
  quitting?: boolean;
  gamepad?: { available: boolean; message?: string };
  available: boolean;
  games?: Record<string, boolean>;
  gameId?: NativeGameId;
  maxPlayers?: number;
  displayModes?: DisplayMode[];
  requiresGamepad?: boolean;
  status: "unavailable" | "idle" | "starting" | "running" | "paused" | "error";
  controls: NativeControls;
  focused: boolean;
  message?: string;
}
export const validGameId = (id: unknown): id is string =>
  typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
export function nativeAvailable(state: NativeRuntimeState, gameId: string) {
  return validGameId(gameId) && state.games?.[gameId] === true;
}
export function nativeSlotCount(native: NativeRuntimeState) {
  return Number.isInteger(native.maxPlayers) &&
    native.maxPlayers! >= 1 &&
    native.maxPlayers! <= 4
    ? native.maxPlayers!
    : 0;
}
export function nativeSlotAllowed(
  native: NativeRuntimeState,
  mode: DisplayMode,
  slot: number,
) {
  return (
    nativeAvailable(native, native.gameId ?? "") &&
    Number.isInteger(slot) &&
    slot >= 1 &&
    slot <= nativeSlotCount(native) &&
    (native.displayModes ?? []).includes(mode) &&
    (!native.requiresGamepad || native.gamepad?.available === true)
  );
}
export type NativeCommand =
  | { type: "start"; gameId?: NativeGameId }
  | { type: "stop" }
  | { type: "focus" }
  | { type: "controls"; mode: NativeControls };
export interface NativeRumble {
  slot: number;
  epoch: number;
  largeMotor: number;
  smallMotor: number;
}
export interface NativeInputSnapshot {
  epoch: number;
  controls: NativeControls;
  players: Array<{ slot: number; buttons: Action[]; studio?:StudioInput }>;
}
export interface InputFrame {
  type: "input";
  version: 1;
  epoch: number;
  seq: number;
  buttons: Action[];
  axes: { x: number; y: number };
}
export interface Player {
  studio?:StudioInput;
  id: string;
  slot: number;
  name: string;
  color: string;
  connected: boolean;
  ready: boolean;
  canNavigate: boolean;
  buttons: Action[];
  axes: { x: number; y: number };
  position: { x: number; y: number };
  pressCount: number;
}
export interface Preferences {
  favorites: string[];
  recent: string[];
  muted: boolean;
  networkAddress?: string;
}
export interface SessionState {
  catalog?: GameManifest[]; studio?:StudioSession;
  version: 1;
  epoch: number;
  phase: Phase;
  players: Player[];
  selectedGameId: string;
  heroMode: "featured" | "detail";
  displayMode: DisplayMode;
  profile: ProfileId;
  native: NativeRuntimeState;
  pairingLocked: boolean;
  search: string;
  libraryView: LibraryView;
  favorites: string[];
  recent: string[];
  muted: boolean;
  serverTime: number;
}
export interface PendingDevice {
  id: string;
  name: string;
  verificationCode: string;
  requestedAt: number;
}
export interface NetworkAddress {
  address: string;
  name: string;
  preferred: boolean;
}
export interface HostState extends SessionState {
  feedback: { sequence: number; sound: "move" | "confirm" };
  pending: PendingDevice[];
  pairing: { url: string; code: string; expiresAt: number };
  network: {
    address: string;
    port: number;
    interfaces: NetworkAddress[];
    status: "online" | "offline" | "error";
    error?: string;
  };
}
export type ToolbarAction =
  "library" | "favorites" | "recent" | "search" | "mute";
export type HostCommand =
  | { type: "approve"; requestId: string }
  | { type: "reject"; requestId: string }
  | { type: "kick"; playerId: string }
  | { type: "assignNavigator"; playerId: string }
  | { type: "openHome" }
  | { type: "showLobby" }
  | { type: "selectGame"; gameId: string }
  | { type: "startGame"; gameId: string }
  | { type: "stopGame" }
  | { type: "nativeFocus" }
  | { type: "nativeControls"; mode: NativeControls }
  | { type: "setLayout"; mode: DisplayMode }
  | { type: "setPairingLocked"; locked: boolean }
  | { type: "resetSession" }
  | { type: "setSearch"; query: string }
  | { type: "setView"; view: LibraryView }
  | { type: "toggleFavorite"; gameId: string }
  | { type: "toggleMute" }
  | { type: "setNetwork"; address: string }
  | { type: "navigate"; action: Action }
  | { type:"studioMode"; modeId:string };
export interface CommandResult {
  ok: boolean;
  error?: string;
}
export interface HostBridge {
  getState(): Promise<HostState>;
  command(command: HostCommand): Promise<CommandResult>;
  library?(command:LibraryCommand):Promise<LibraryResult>;
  onState(listener: (state: HostState) => void): () => void;
  toggleFullscreen(): Promise<boolean>;
  getFullscreen(): Promise<boolean>;
  minimize(): void;
  quit(): void;
}
export type ClientMessage =
  | { type: "auth"; version: 1; token: string }
  | InputFrame
  | {type:"studio-input";version:1;epoch:number;seq:number;input:StudioInput}
  | {type:"studio-mode";modeId:string}
  | { type: "rename"; name: string }
  | { type: "ready"; ready: boolean }
  | { type: "nav"; action: ToolbarAction; query?: string }
  | { type: "native-controls"; mode: NativeControls }
  | { type: "native-layout"; mode: "shared" | "split-2" | "split-4" }
  | { type: "ping"; id: number; at: number };
export type ServerMessage =
  | { type: "haptics"; epoch: number; durationMs: number }
  | { type: "authenticated"; playerId: string; state: SessionState }
  | { type: "state"; state: SessionState }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; id: number; at: number }
  | { type: "ended"; message: string };
export interface PairRequest {
  name: string;
  nonce?: string;
  code?: string;
}
export interface PairTicket {
  id: string;
  secret: string;
  verificationCode: string;
  expiresAt: number;
}
export type PairStatus =
  | { status: "pending" }
  | { status: "approved"; token: string; playerId: string }
  | { status: "rejected"; message: string };
export interface GameAdapter {
  manifest: GameManifest;
  available(): boolean;
  start(): void;
  stop(): void;
  input(playerId: string, frame: InputFrame): void;
  reset(playerId?: string): void;
}
declare global {
  interface Window {
    waterconsole?: HostBridge;
  }
}
