/**
 * Browser-safe frame builders for the Week Aqua S300 Pro (no Node APIs).
 * Every frame is 8 bytes written to FFF2, padded with 0x55.
 * Sources: docs/research/PROTOCOL.md (hardware-verified unless noted).
 */

export type Frame = Uint8Array;
export type ClockTime = { hours: number; minutes: number };

export const FRAME_LENGTH = 8;
export const WIRE_MAX = 0xeb;
const PAD = 0x55;

/** Presets of the official app (index 0–11); R, G, B, UV wire bytes. */
export const PRESET_COLORS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0x6c, 0xe3, 0x73, 0xeb], [0xa7, 0xb9, 0x74, 0xeb], [0x79, 0xdf, 0x74, 0xeb],
  [0xc1, 0x5e, 0xbc, 0xeb], [0xeb, 0x5e, 0x94, 0xeb], [0xa3, 0xeb, 0x70, 0x00],
  [0x77, 0xeb, 0x77, 0x00], [0x83, 0xeb, 0x85, 0x00], [0x5e, 0xeb, 0x5e, 0x00],
  [0x59, 0xeb, 0x60, 0x00], [0x6e, 0xeb, 0x65, 0x00], [0x7e, 0xeb, 0x69, 0x00],
];

function frame(...bytes: number[]): Frame {
  const out = new Uint8Array(FRAME_LENGTH).fill(PAD);
  out.set(bytes);
  return out;
}

function intInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

/** Decimal digits written as hex, e.g. 18 → 0x18. */
function decimalByte(value: number, max: number, label: string): number {
  intInRange(value, 0, max, label);
  return Math.floor(value / 10) * 16 + (value % 10);
}

export function percentToWire(percent: number): number {
  if (!Number.isFinite(percent)) throw new RangeError("Level must be a finite number.");
  return Math.round((Math.max(0, Math.min(100, percent)) * WIRE_MAX) / 100);
}

/** Colour frame from percentages: FB F9 R G B UV. */
export function colorFrame(r: number, g: number, b: number, uv = 0): Frame {
  return frame(0xfb, 0xf9, percentToWire(r), percentToWire(g), percentToWire(b), percentToWire(uv));
}

/** Colour frame from raw wire bytes (0–235). */
export function colorFrameRaw(r: number, g: number, b: number, uv = 0): Frame {
  for (const v of [r, g, b, uv]) intInRange(v, 0, WIRE_MAX, "Wire level");
  return frame(0xfb, 0xf9, r, g, b, uv);
}

export function presetFrame(index: number): Frame {
  const colors = PRESET_COLORS[index];
  if (!colors) throw new RangeError(`Preset index must be 0 to ${PRESET_COLORS.length - 1}.`);
  return colorFrameRaw(...colors);
}

export function clockFrame(hours: number, minutes: number, seconds: number): Frame {
  return frame(
    0xff,
    decimalByte(hours, 23, "Hours"),
    decimalByte(minutes, 59, "Minutes"),
    decimalByte(seconds, 59, "Seconds"),
  );
}

/** Mode 1 = sunrise/sunset window plus colour; mode 2 = advanced 5-slot schedule. */
export function modeFrame(mode: 1 | 2): Frame {
  if (mode !== 1 && mode !== 2) throw new RangeError("Mode must be 1 or 2.");
  return frame(0xfd, 0xf0 + mode);
}

/**
 * Mode 1 timer window. `fade` 0–5 is the sunrise/sunset ramp (up to 2.5 h);
 * the lamp is dark outside the window and sunset must be later than sunrise.
 */
export function timerFrame(sunrise: ClockTime, sunset: ClockTime, fade = 0): Frame {
  intInRange(fade, 0, 5, "Fade");
  return frame(
    0xfe, 0xf9,
    decimalByte(sunrise.hours, 24, "Sunrise hour"),
    decimalByte(sunrise.minutes, 59, "Sunrise minute"),
    decimalByte(sunset.hours, 24, "Sunset hour"),
    decimalByte(sunset.minutes, 59, "Sunset minute"),
    0x00,
    fade,
  );
}

/** Window 00:00–24:00 so host-driven colours are visible at any time of day. */
export function alwaysOnTimerFrame(): Frame {
  return timerFrame({ hours: 0, minutes: 0 }, { hours: 24, minutes: 0 });
}

/** Advanced slot n (1–5): window and colour frames. Only slot 1 is hardware-verified. */
export function slotFrames(
  slot: number,
  start: ClockTime,
  end: ClockTime,
  rgbuv: readonly [number, number, number, number],
): [Frame, Frame] {
  intInRange(slot, 1, 5, "Slot");
  return [
    frame(
      0xfe, 0xf0 + slot,
      decimalByte(start.hours, 24, "Start hour"),
      decimalByte(start.minutes, 59, "Start minute"),
      decimalByte(end.hours, 24, "End hour"),
      decimalByte(end.minutes, 59, "End minute"),
    ),
    frame(0xfb, 0xf0 + slot, ...rgbuv.map((v) => intInRange(v, 0, WIRE_MAX, "Wire level"))),
  ];
}

export function powerOffFrame(): Frame {
  return colorFrameRaw(0, 0, 0, 0);
}

/** The official app's power-on sequence. */
export function powerOnFrames(): Frame[] {
  return [modeFrame(1), presetFrame(2), alwaysOnTimerFrame()];
}

/**
 * Frames to send after every connect: the official app overwrites the clock
 * and timer, and the lamp stays dark outside the timer window in mode 1.
 */
export function sessionSetupFrames(now: Date): Frame[] {
  return [
    clockFrame(now.getHours(), now.getMinutes(), now.getSeconds()),
    modeFrame(1),
    alwaysOnTimerFrame(),
  ];
}

/**
 * Only known-safe opcodes may reach the lamp: FB colour, FC fan/unverified,
 * FD mode, FE timer/slots, FF clock. Others (rename, firmware) are refused.
 */
const ALLOWED_OPCODES = new Set([0xfb, 0xfc, 0xfd, 0xfe, 0xff]);

export function isAllowedFrame(data: Uint8Array): boolean {
  return data.length === FRAME_LENGTH && ALLOWED_OPCODES.has(data[0]);
}

export function assertAllowedFrame(data: Uint8Array): void {
  if (!isAllowedFrame(data)) {
    throw new Error(`Refusing to send frame: ${bytesToHex(data)}`);
  }
}

export function bytesToHex(data: Uint8Array): string {
  return Array.from(data, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
