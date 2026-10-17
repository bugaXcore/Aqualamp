export type Channels = {
  red: number;
  green: number;
  blue: number;
  white: number;
};

export type ConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "error";

export type BridgeHello = {
  type: "hello";
  state: ConnectionState;
  channels: Channels;
  mock: boolean;
};

export type BridgeState = {
  type: "state";
  state: ConnectionState;
  mock: boolean;
};

export type BridgeChannels = {
  type: "channels";
  channels: Channels;
};

export type BridgeError = {
  type: "error";
  message: string;
};

export type ServerMessage =
  | BridgeHello
  | BridgeState
  | BridgeChannels
  | BridgeError;

export function defaultBridgeUrl(): string {
  const fromEnv = import.meta.env.VITE_BRIDGE_WS as string | undefined;
  if (fromEnv) return fromEnv;
  return "ws://127.0.0.1:8787";
}

export function channelsToCss(channels: Channels): string {
  const r = Math.round((channels.red / 100) * 255);
  const g = Math.round((channels.green / 100) * 255);
  const b = Math.round((channels.blue / 100) * 255);
  const w = channels.white / 100;
  const wr = Math.round(r * (1 - w * 0.35) + 255 * w * 0.55);
  const wg = Math.round(g * (1 - w * 0.35) + 255 * w * 0.55);
  const wb = Math.round(b * (1 - w * 0.35) + 255 * w * 0.45);
  return `rgb(${wr}, ${wg}, ${wb})`;
}
