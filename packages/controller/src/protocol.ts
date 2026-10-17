import type { Channels } from "./types.js";

/**
 * Protocol readiness gate.
 * Flip to true only after real Wireshark (or equivalent) captures are pasted
 * and encodeChannels is updated to match hardware frames.
 */
export const PROTOCOL_CAPTURES_READY = false;

/**
 * Placeholder capture table — BLOCKER until real hex is provided.
 * Documented intents for Phase 0 / Phase 4 fill-in.
 */
export const PROTOCOL_CAPTURES: Record<string, string> = {
  "red-100": "",
  "blue-100": "",
  "all-off": "",
};

/**
 * Encode 0–100 channel levels into a write buffer.
 * Until captures exist this emits a deterministic stub frame for tests/mock.
 * Real BLE path refuses writes while PROTOCOL_CAPTURES_READY is false.
 */
export function encodeChannels(channels: Channels): Buffer {
  // Stub frame layout (not hardware-valid):
  // [0xAL, 0x01, red, green, blue, white, checksum]
  const body = Buffer.from([
    0xa1,
    0x01,
    channels.red & 0xff,
    channels.green & 0xff,
    channels.blue & 0xff,
    channels.white & 0xff,
  ]);
  let sum = 0;
  for (const b of body) sum = (sum + b) & 0xff;
  return Buffer.concat([body, Buffer.from([sum])]);
}

export function assertProtocolReadyForHardware(): void {
  if (!PROTOCOL_CAPTURES_READY) {
    throw new Error(
      "AquaLamp protocol captures are empty (BLOCKER). " +
        "Fill LIGHT_ADDRESS / SERVICE_UUID / CHARACTERISTIC_UUID and paste hex " +
        "captures into packages/controller/src/protocol.ts, then set " +
        "PROTOCOL_CAPTURES_READY = true. Use AQUALAMP_MOCK=1 for local demo.",
    );
  }
}

export function isPlaceholderId(value: string): boolean {
  const v = value.trim().toUpperCase();
  return (
    v.length === 0 ||
    v.includes("X") ||
    v === "XXXX" ||
    v === "YYYY" ||
    v === "XX:XX:XX:XX:XX:XX"
  );
}
