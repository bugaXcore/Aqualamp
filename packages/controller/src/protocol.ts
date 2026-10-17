import type { Channels } from "./types.js";

/**
 * Protocol readiness gate.
 * Flip to true only after encodeChannels maps 0–100 app channels
 * (R/G/B/UV/Fan/Power — controller currently models R/G/B/W) to real frames.
 * Service/char UUIDs are known from full HCI snoop; channel scaling is not.
 */
export const PROTOCOL_CAPTURES_READY = false;

/**
 * Evidence from Android bugreports + HCI snoops (2026-10-17).
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
  /**
   * Proprietary primary service containing the write characteristic.
   * From full btsnoop Read By Group Type Response (manual-20261017-121500).
   */
  serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
  /** Short form also acceptable to many stacks. */
  serviceUuidShort: "fff0",
  /**
   * Write characteristic UUID (value handle 0x0010, decl 0x000F).
   * From full btsnoop Read By Type Response.
   */
  characteristicUuid: "0000fff2-0000-1000-8000-00805f9b34fb",
  characteristicUuidShort: "fff2",
  /** Notify/read companion on same service (value handle 0x0012). */
  notifyCharacteristicUuidShort: "fff1",
} as const;

/**
 * Week Aqua app channel names (UI). Controller `Channels` still uses
 * red/green/blue/white until UV/Fan/Power mapping is confirmed.
 */
export const APP_CHANNELS = ["R", "G", "B", "UV", "Fan", "Power"] as const;

/**
 * Raw ATT Write Command payloads observed on handle 0x0010.
 * Older truncated btsnooz samples were 3 bytes; full snoop shows 8-byte frames.
 */
export const OBSERVED_WRITE_PAYLOADS: Record<string, string> = {
  // --- CustomMode R/G/B samples (manual-20261017-121500, HCI snoop Enabled) ---
  "custom-mode-red": "fb f9 eb 00 00 00 55 55",
  "custom-mode-green": "fb f9 00 eb 00 00 55 55",
  "custom-mode-blue": "fb f9 00 00 eb 00 55 55",
  "custom-mode-rgb-zero": "fb f9 00 00 00 00 55 55",
  "custom-mode-mixed": "fb f9 79 df 74 eb 55 55",
  // --- Companion / session frames (same capture; intent unclear) ---
  "op-fe-f9-follow": "fe f9 08 06 19 42 00 00",
  "op-fe-f9-alt": "fe f9 00 00 24 00 00 00",
  "op-fd-f1": "fd f1 55 55 55 55 55 55",
  "op-ff-12": "ff 12 14 08 55 55 55 55",
  "op-f9-pad": "f9 55 55 55 55 55 55 55",
  // --- Earlier truncated btsnooz scraps (likely incomplete ACL) ---
  "truncated-ff-10-00": "ff 10 00",
  "truncated-f9-55-55": "f9 55 55",
  "truncated-fd-f2-55": "fd f2 55",
  "truncated-fe-f1-00": "fe f1 00",
  "truncated-fb-f1-00": "fb f1 00",
};

/**
 * Intent-labeled capture table for the channel API.
 * CustomMode extremes recorded; 0–100 linear mapping still unknown.
 */
export const PROTOCOL_CAPTURES: Record<string, string> = {
  "custom-mode-red": "fb f9 eb 00 00 00 55 55",
  "custom-mode-green": "fb f9 00 eb 00 00 55 55",
  "custom-mode-blue": "fb f9 00 00 eb 00 55 55",
  "custom-mode-rgb-zero": "fb f9 00 00 00 00 55 55",
  "red-100": "",
  "blue-100": "",
  "all-off": "",
};

/**
 * CustomMode frame layout (high confidence from R/G/B samples):
 *   fb f9 <R> <G> <B> <X> 55 55
 * Observed “on” channel byte was 0xeb (235), not 100 — scaling unknown.
 * Byte X may relate to UV (unconfirmed). Fan/Power use other opcodes.
 *
 * Until 0–100 mapping exists this still emits a deterministic stub frame.
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

/**
 * Build a CustomMode-style frame from raw 0–255 channel bytes (research helper).
 * Not used by the live controller path; mock remains default.
 */
export function encodeCustomModeFrame(
  red: number,
  green: number,
  blue: number,
  x = 0,
): Buffer {
  return Buffer.from([
    0xfb,
    0xf9,
    red & 0xff,
    green & 0xff,
    blue & 0xff,
    x & 0xff,
    0x55,
    0x55,
  ]);
}

export function assertProtocolReadyForHardware(): void {
  if (!PROTOCOL_CAPTURES_READY) {
    throw new Error(
      "AquaLamp protocol not ready for hardware writes (BLOCKER). " +
        "MAC + GATT UUIDs (fff0/fff2) are known, but 0–100 channel↔frame " +
        "mapping (R/G/B/UV/Fan/Power) is still incomplete. Use AQUALAMP_MOCK=1. " +
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
