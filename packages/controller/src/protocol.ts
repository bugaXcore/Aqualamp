import type { Channels } from "./types.js";

/**
 * Protocol readiness gate.
 * UUIDs (FFF0/FFF2), CustomMode `fb f9 R G B UV 55 55`, scale 0–100→0–235,
 * and Power `fc` are confirmed from Captures #1–#3.
 * Everyday runs still default to mock via `AQUALAMP_MOCK=1`.
 */
export const PROTOCOL_CAPTURES_READY = true;

/**
 * App percent 0–100 → wire byte 0–235 (`0xeb` = 100%).
 * Confirmed on Red in Capture #3 (`20261017-125735`) and UV/Power in #2.
 */
export const CHANNEL_WIRE_MAX = 235;

/**
 * Exact Red-only CustomMode wire bytes at checklist percents (Capture #3).
 * Matches `percentToWire(p)` for each key.
 */
export const RED_PERCENT_WIRE = {
  0: 0x00,
  25: 0x3b, // 59
  50: 0x76, // 118
  75: 0xb0, // 176
  100: 0xeb, // 235
} as const;

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
  /** Wire max for channel / power bytes (Capture #2 + #3). */
  channelWireMax: CHANNEL_WIRE_MAX,
  /** Capture folder that confirmed Red 0/25/50/75/100 ladder. */
  redLadderCapture: "20261017-125735",
} as const;

/**
 * Week Aqua app channel names (UI).
 * Controller `Channels.white` is treated as **UV** on the wire until types are renamed.
 */
export const APP_CHANNELS = ["R", "G", "B", "UV", "Fan", "Power"] as const;

/**
 * Raw ATT Write Command payloads observed on handle 0x0010.
 */
export const OBSERVED_WRITE_PAYLOADS: Record<string, string> = {
  // --- Red ladder (Capture #3, G=B=UV=0) — exact checklist stops ---
  "red-0": "fb f9 00 00 00 00 55 55",
  "red-25": "fb f9 3b 00 00 00 55 55",
  "red-50": "fb f9 76 00 00 00 55 55",
  "red-75": "fb f9 b0 00 00 00 55 55",
  "red-100": "fb f9 eb 00 00 00 55 55",
  // --- CustomMode R/G/B (Capture #1) ---
  "custom-mode-red": "fb f9 eb 00 00 00 55 55",
  "custom-mode-green": "fb f9 00 eb 00 00 55 55",
  "custom-mode-blue": "fb f9 00 00 eb 00 55 55",
  "custom-mode-rgb-zero": "fb f9 00 00 00 00 55 55",
  "custom-mode-mixed": "fb f9 79 df 74 eb 55 55",
  // --- UV ladder samples (Capture #2, R=G=B=0) ---
  "uv-near-25": "fb f9 00 00 00 3b 55 55",
  "uv-near-50": "fb f9 00 00 00 78 55 55",
  "uv-near-75": "fb f9 00 00 00 b3 55 55",
  "uv-100": "fb f9 00 00 00 eb 55 55",
  // --- Power sweep (Capture #2) ---
  "power-near-25": "fc 3b 55 55 55 55 55 55",
  "power-near-50": "fc 7a 55 55 55 55 55 55",
  "power-0": "fc 00 55 55 55 55 55 55",
  // --- Companion / session frames ---
  "op-fe-f9-follow": "fe f9 08 06 19 42 00 00",
  "op-fe-f9-alt": "fe f9 00 00 24 00 00 00",
  "op-fd-f1": "fd f1 55 55 55 55 55 55",
  "op-ff-12": "ff 12 14 08 55 55 55 55",
  "op-f9-pad": "f9 55 55 55 55 55 55 55",
};

/**
 * Intent-labeled capture table (encoder targets).
 */
export const PROTOCOL_CAPTURES: Record<string, string> = {
  "red-0": "fb f9 00 00 00 00 55 55",
  "red-25": "fb f9 3b 00 00 00 55 55",
  "red-50": "fb f9 76 00 00 00 55 55",
  "red-75": "fb f9 b0 00 00 00 55 55",
  "red-100": "fb f9 eb 00 00 00 55 55",
  "custom-mode-green": "fb f9 00 eb 00 00 55 55",
  "custom-mode-blue": "fb f9 00 00 eb 00 55 55",
  "uv-100": "fb f9 00 00 00 eb 55 55",
  "power-0": "fc 00 55 55 55 55 55 55",
  "blue-100": "fb f9 00 00 eb 00 55 55",
  "all-off": "fb f9 00 00 00 00 55 55",
};

/**
 * Convert app 0–100 percent to wire byte (0–235).
 * Capture #3 Red ladder: 0→0, 25→59, 50→118, 75→176, 100→235.
 */
export function percentToWire(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  const p = Math.max(0, Math.min(100, percent));
  return Math.round((p * CHANNEL_WIRE_MAX) / 100);
}

/** Convert wire byte (0–235) back to nearest app percent. */
export function wireToPercent(wire: number): number {
  if (!Number.isFinite(wire)) return 0;
  const w = Math.max(0, Math.min(CHANNEL_WIRE_MAX, wire));
  return Math.round((w * 100) / CHANNEL_WIRE_MAX);
}

/**
 * CustomMode channel frame:
 *   fb f9 <R> <G> <B> <UV> 55 55
 * `Channels.white` is encoded as UV (interim API).
 */
export function encodeChannels(channels: Channels): Buffer {
  return encodeCustomModeFrame(
    percentToWire(channels.red),
    percentToWire(channels.green),
    percentToWire(channels.blue),
    percentToWire(channels.white),
  );
}

/**
 * Build a CustomMode frame from raw wire bytes (0–235).
 */
export function encodeCustomModeFrame(
  red: number,
  green: number,
  blue: number,
  uv = 0,
): Buffer {
  return Buffer.from([
    0xfb,
    0xf9,
    red & 0xff,
    green & 0xff,
    blue & 0xff,
    uv & 0xff,
    0x55,
    0x55,
  ]);
}

/**
 * Power (global intensity) frame from Capture #2:
 *   fc <level> 55 55 55 55 55 55
 * Same 0–100 → 0–235 scale. Independent of the CustomMode RGB/UV frame.
 */
export function encodePowerFrame(percent: number): Buffer {
  return Buffer.from([
    0xfc,
    percentToWire(percent) & 0xff,
    0x55,
    0x55,
    0x55,
    0x55,
    0x55,
    0x55,
  ]);
}

export function assertProtocolReadyForHardware(): void {
  const force =
    process.env.AQUALAMP_ALLOW_HARDWARE === "1" ||
    process.env.AQUALAMP_ALLOW_HARDWARE?.toLowerCase() === "true";
  if (!PROTOCOL_CAPTURES_READY && !force) {
    throw new Error(
      "AquaLamp protocol gate is closed (BLOCKER). " +
        "Set PROTOCOL_CAPTURES_READY or AQUALAMP_ALLOW_HARDWARE=1 for live writes, " +
        "or use AQUALAMP_MOCK=1. UUIDs (FFF0/FFF2) and CustomMode/Power frames " +
        "are already known — this is not a missing-UUID error. " +
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
