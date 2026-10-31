export { WeekAquaController } from "./WeekAquaController.js";
export {
  encodeChannels,
  encodeCustomModeFrame,
  encodePowerFrame,
  percentToWire,
  wireToPercent,
  CHANNEL_WIRE_MAX,
  RED_PERCENT_WIRE,
  PROTOCOL_CAPTURES,
  PROTOCOL_CAPTURES_READY,
  DEVICE_FROM_LOGS,
  OBSERVED_WRITE_PAYLOADS,
  APP_CHANNELS,
  assertProtocolReadyForHardware,
  isPlaceholderId,
} from "./protocol.js";
export * as frames from "./frames.js";
export {
  DEFAULT_CHANNELS,
  clampChannel,
  normalizeChannels,
  type Channels,
  type ConnectionState,
  type ControllerOptions,
  type ControllerEvents,
} from "./types.js";
export { loadEnvFile } from "./loadEnv.js";

export function loadControllerConfigFromEnv(): {
  address: string;
  serviceUuid: string;
  characteristicUuid: string;
  mock: boolean;
  autoReconnect: boolean;
  connectTimeoutMs: number;
} {
  const flag = (name: string, fallback: boolean) => {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
  };
  const intEnv = (name: string, fallback: number) => {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };

  return {
    address: process.env.LIGHT_ADDRESS ?? "XX:XX:XX:XX:XX:XX",
    serviceUuid: process.env.SERVICE_UUID ?? "XXXX",
    characteristicUuid: process.env.CHARACTERISTIC_UUID ?? "YYYY",
    mock: flag("AQUALAMP_MOCK", true),
    autoReconnect: flag("AQUALAMP_AUTO_RECONNECT", false),
    connectTimeoutMs: intEnv("AQUALAMP_CONNECT_TIMEOUT_MS", 12_000),
  };
}
