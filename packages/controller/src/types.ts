/** Standardized channel levels: integers 0–100 inclusive. */
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

export type ControllerOptions = {
  address: string;
  serviceUuid: string;
  characteristicUuid: string;
  /** Simulate BLE without hardware / noble. Default: env AQUALAMP_MOCK=1 */
  mock?: boolean;
  /** Optional auto-reconnect with backoff. Default off. */
  autoReconnect?: boolean;
  /** Scan / GATT discovery / write timeout in ms. Default 45000. */
  timeoutMs?: number;
  /**
   * Per-attempt GATT connect timeout in ms (noble connectAsync).
   * Default: env AQUALAMP_CONNECT_TIMEOUT_MS or 12000.
   * Kept shorter than scan so the CLI cannot sit on "connecting" forever.
   */
  connectTimeoutMs?: number;
};

export type ControllerEvents = {
  state: (state: ConnectionState) => void;
  error: (error: Error) => void;
  channels: (channels: Channels) => void;
};

export const DEFAULT_CHANNELS: Channels = {
  red: 0,
  green: 0,
  blue: 0,
  white: 0,
};

export function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeChannels(
  partial: Partial<Channels>,
  base: Channels = DEFAULT_CHANNELS,
): Channels {
  return {
    red: partial.red !== undefined ? clampChannel(partial.red) : base.red,
    green: partial.green !== undefined ? clampChannel(partial.green) : base.green,
    blue: partial.blue !== undefined ? clampChannel(partial.blue) : base.blue,
    white: partial.white !== undefined ? clampChannel(partial.white) : base.white,
  };
}
