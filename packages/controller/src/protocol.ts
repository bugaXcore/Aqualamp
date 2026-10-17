import type { Channels } from "./types.js";

/**
 * Protocol readiness gate.
 * Flip to true only after service/char UUIDs are known and encodeChannels
 * maps 0–100 channels to real frames (not just raw opcode captures).
 */
export const PROTOCOL_CAPTURES_READY = false;

/**
 * Evidence from Android bugreport + btsnooz (2026-10-17).
 * See docs/phase-0-from-logs.md in the Project store.
 */
export const DEVICE_FROM_LOGS = {
  /** Confirmed via HCI LE connection + dumpsys name correlation. */
  address: "C8:47:80:70:BB:07",
  /** Advertised / remote name from Bluetooth stack. */
  name: "B3.0-S300pro-03",
  /** Android package that held the GATT client. */
  appPackage: "com.weekled.weekaquas",
  /** ATT handle that received all Write Commands in the snoop. */
  writeHandle: 0x0010,
  /** Characteristic properties observed on the write char declaration. */
  writeProperties: "write-without-response (0x04)",
} as const;

/**
 * Raw ATT Write Command payloads observed on handle 0x0010.
 * Intent / channel mapping is NOT yet established — do not treat as RGBW encoder.
 */
export const OBSERVED_WRITE_PAYLOADS: Record<string, string> = {
  "op-ff-10-00": "ff 10 00",
  "op-f9-55-55": "f9 55 55",
  "op-fd-f2-55": "fd f2 55",
  "op-fe-f1-00": "fe f1 00",
  "op-fb-f1-00": "fb f1 00",
};

/**
 * Intent-labeled capture table for the 0–100 channel API.
 * Still empty — observed opcodes above are not yet mapped to channel extremes.
 */
export const PROTOCOL_CAPTURES: Record<string, string> = {
  "red-100": "",
  "blue-100": "",
  "all-off": "",
};

/**
 * Encode 0–100 channel levels into a write buffer.
 * Until channel↔opcode mapping exists this emits a deterministic stub frame.
 * Real BLE path refuses writes while PROTOCOL_CAPTURES_READY is false.
 */
export function encodeChannels(channels: Channels): Buffer {
  // Stub frame layout (not hardware-valid):
  // [0xA1, 0x01, red, green, blue, white, checksum]
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
      "AquaLamp protocol not ready for hardware writes (BLOCKER). " +
        "MAC is known (C8:47:80:70:BB:07) but service/characteristic UUIDs and " +
        "channel↔frame mapping are still missing. Use AQUALAMP_MOCK=1 for local demo. " +
        "See packages/controller/docs/protocol.md.",
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
