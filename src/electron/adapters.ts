import type {
  GameManifest,
  NativeInputSnapshot,
  NativeRumble,
  NativeRuntimeState,
} from "../shared/types";

export type AdapterState = Pick<
  NativeRuntimeState,
  "status" | "focused" | "gamepad" | "message"
>;
export interface NativeAdapterContext {
  helperPath: string;
  onState(state: AdapterState): void;
  onRumble(feedback: NativeRumble): void;
}
export interface NativeAdapter {
  available(): Promise<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  focus(): Promise<void>;
  input(snapshot: NativeInputSnapshot): void;
  reset(): void;
}
export interface NativeAdapterDefinition {
  manifest: GameManifest;
  create(context: NativeAdapterContext): NativeAdapter;
}
// Register reviewed PC adapters here. Core deliberately ships no native games.
export const REGISTERED_NATIVE_ADAPTERS: readonly NativeAdapterDefinition[] =
  [];
