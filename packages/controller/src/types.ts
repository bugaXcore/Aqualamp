/** Standardized channel levels: integers 0–100 inclusive. S300 Pro: R/G/B/UV. */
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

export const DEFAULT_CHANNELS: Channels = {
  red: 0,
  green: 0,
  blue: 0,
  uv: 0,
};

export function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Accepts `uv`, plus legacy `white` alias from older clients. */
export function normalizeChannels(
  partial: Partial<Channels> & { white?: number },
  base: Channels = DEFAULT_CHANNELS,
): Channels {
  const uvRaw =
    partial.uv !== undefined
      ? partial.uv
      : partial.white !== undefined
        ? partial.white
        : undefined;
  return {
    red: partial.red !== undefined ? clampChannel(partial.red) : base.red,
    green: partial.green !== undefined ? clampChannel(partial.green) : base.green,
    blue: partial.blue !== undefined ? clampChannel(partial.blue) : base.blue,
    uv: uvRaw !== undefined ? clampChannel(uvRaw) : base.uv,
  };
}
