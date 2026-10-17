export type Channels = {
  red: number;
  green: number;
  blue: number;
  uv: number;
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

/** Normalize bridge payloads that may still send legacy `white`. */
export function normalizeBridgeChannels(
  raw: Partial<Channels> & { white?: number },
): Channels {
  const uv =
    raw.uv !== undefined
      ? raw.uv
      : raw.white !== undefined
        ? raw.white
        : 0;
  return {
    red: raw.red ?? 0,
    green: raw.green ?? 0,
    blue: raw.blue ?? 0,
    uv,
  };
}

/** Live-mix preview: RGB plus a violet UV contribution. */
export function channelsToCss(channels: Channels): string {
  const r = Math.round((channels.red / 100) * 255);
  const g = Math.round((channels.green / 100) * 255);
  const b = Math.round((channels.blue / 100) * 255);
  const u = channels.uv / 100;
  // UV leans violet/purple in the tank preview (not white).
  const wr = Math.round(r * (1 - u * 0.35) + 168 * u);
  const wg = Math.round(g * (1 - u * 0.35) + 85 * u);
  const wb = Math.round(b * (1 - u * 0.25) + 247 * u);
  return `rgb(${wr}, ${wg}, ${wb})`;
}
