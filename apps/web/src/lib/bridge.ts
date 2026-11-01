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
  mode?: 1 | 2;
  calibrated?: boolean;
};

export type BridgeState = {
  type: "state";
  state: ConnectionState;
  mock: boolean;
  mode?: 1 | 2;
  calibrated?: boolean;
};

/** Lamp-side controls exposed by both transports (bridge and Web Bluetooth). */
export type LampTime = { hours: number; minutes: number };
/** One window of the lamp's own schedule (minutes from midnight; 1440 = 24:00). */
export type ScheduleWindow = { startMin: number; endMin: number; channels: Channels };
export type LampControlsApi = {
  mode: 1 | 2;
  calibrated: boolean;
  power: (on: boolean) => void;
  setMode: (mode: 1 | 2) => void;
  setTimer: (sunrise: LampTime, sunset: LampTime, fade: number) => void;
  setCalibrated: (on: boolean) => void;
  setSchedule: (windows: ScheduleWindow[]) => void;
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
  const { r, g, b } = mixRgb(channels);
  return `rgb(${r}, ${g}, ${b})`;
}

/** 0–1 perceived mix brightness for wash intensity. */
export function mixLuma(channels: Channels): number {
  const { r, g, b } = mixRgb(channels);
  return Math.min(1, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
}

function mixRgb(channels: Channels): { r: number; g: number; b: number } {
  const r = Math.round((channels.red / 100) * 255);
  const g = Math.round((channels.green / 100) * 255);
  const b = Math.round((channels.blue / 100) * 255);
  const u = channels.uv / 100;
  // UV leans violet/purple (not white).
  return {
    r: Math.round(r * (1 - u * 0.35) + 168 * u),
    g: Math.round(g * (1 - u * 0.35) + 85 * u),
    b: Math.round(b * (1 - u * 0.25) + 247 * u),
  };
}
