export const UUIDS = {
  service: "0000fff0-0000-1000-8000-00805f9b34fb",
  optionalServices: [
    "0000fff0-0000-1000-8000-00805f9b34fb",
    "0000fff1-0000-1000-8000-00805f9b34fb",
    "0000fff2-0000-1000-8000-00805f9b34fb",
    "0000fff3-0000-1000-8000-00805f9b34fb",
    "0000fff4-0000-1000-8000-00805f9b34fb",
    "0000ffe0-0000-1000-8000-00805f9b34fb",
    "0000ffe1-0000-1000-8000-00805f9b34fb",
    "0000ffe2-0000-1000-8000-00805f9b34fb",
    "0000ffe3-0000-1000-8000-00805f9b34fb",
    "0000ffe4-0000-1000-8000-00805f9b34fb",
    "0000ffe5-0000-1000-8000-00805f9b34fb",
    "device_information",
    "battery_service",
    "generic_access",
  ],
};

export const LAMP_WRITE_UUID = "0000fff2-0000-1000-8000-00805f9b34fb";
export const COLOR_CHANNELS = ["R", "G", "B", "UV"];

const characteristicPropertyNames = [
  "broadcast",
  "read",
  "writeWithoutResponse",
  "write",
  "notify",
  "indicate",
  "authenticatedSignedWrites",
  "reliableWrite",
  "writableAuxiliaries",
];

export function getCharacteristicProperties(properties) {
  return characteristicPropertyNames.filter((name) => properties[name] === true);
}

export function buildColorFrame(channel, percent) {
  const index = COLOR_CHANNELS.indexOf(channel);
  if (index < 0) throw new RangeError(`Unknown color channel: ${channel}`);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("Channel level must be between 0 and 100 percent.");
  }
  const channels = [0, 0, 0, 0];
  channels[index] = Math.round(percent * 0xeb / 100);
  return Uint8Array.from([0xfb, 0xf9, ...channels, 0x55, 0x55]);
}

export function buildCombinedColorFrame(percent) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError("Channel level must be between 0 and 100 percent.");
  }
  const level = Math.round(percent * 0xeb / 100);
  return Uint8Array.from([0xfb, 0xf9, level, level, level, level, 0x55, 0x55]);
}

export function buildFanFrame(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError("Fan value must be an integer byte from 0 to 255.");
  }
  return Uint8Array.from([0xfc, value, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55]);
}

function toDecimalDigitsByte(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be an integer from 0 to ${max}.`);
  }
  return Math.floor(value / 10) * 16 + (value % 10);
}

export function buildClockFrame(hours, minutes, seconds) {
  return Uint8Array.from([
    0xff,
    toDecimalDigitsByte(hours, 23, "Hours"),
    toDecimalDigitsByte(minutes, 59, "Minutes"),
    toDecimalDigitsByte(seconds, 59, "Seconds"),
    0x55, 0x55, 0x55, 0x55,
  ]);
}

export function buildTimerFrame(sunrise, sunset, fade = 0) {
  if (!Number.isInteger(fade) || fade < 0 || fade > 0xff) {
    throw new RangeError("Fade must be an integer byte from 0 to 255.");
  }
  return Uint8Array.from([
    0xfe, 0xf9,
    toDecimalDigitsByte(sunrise.hours, 23, "Sunrise hour"),
    toDecimalDigitsByte(sunrise.minutes, 59, "Sunrise minute"),
    toDecimalDigitsByte(sunset.hours, 23, "Sunset hour"),
    toDecimalDigitsByte(sunset.minutes, 59, "Sunset minute"),
    0x00, fade,
  ]);
}

export const PRESET_COLORS = [
  [0x6c, 0xe3, 0x73, 0xeb], [0xa7, 0xb9, 0x74, 0xeb], [0x79, 0xdf, 0x74, 0xeb],
  [0xc1, 0x5e, 0xbc, 0xeb], [0xeb, 0x5e, 0x94, 0xeb], [0xa3, 0xeb, 0x70, 0x00],
  [0x77, 0xeb, 0x77, 0x00], [0x83, 0xeb, 0x85, 0x00], [0x5e, 0xeb, 0x5e, 0x00],
  [0x59, 0xeb, 0x60, 0x00], [0x6e, 0xeb, 0x65, 0x00], [0x7e, 0xeb, 0x69, 0x00],
];

export function buildModeFrame(mode) {
  if (mode !== 1 && mode !== 2) throw new RangeError("Mode must be 1 (Mode Setting) or 2 (Advanced).");
  return Uint8Array.from([0xfd, 0xf0 + mode, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55]);
}

export function buildPresetFrame(index) {
  const colors = PRESET_COLORS[index];
  if (!colors) throw new RangeError(`Preset must be 1 to ${PRESET_COLORS.length}.`);
  return Uint8Array.from([0xfb, 0xf9, ...colors, 0x55, 0x55]);
}

export function buildPowerOffFrame() {
  return Uint8Array.from([0xfb, 0xf9, 0x00, 0x00, 0x00, 0x00, 0x55, 0x55]);
}

// The app's power-on sequence: mode 1, default color, always-on window 00:00–24:00.
export function buildPowerOnFrames() {
  return [
    buildModeFrame(1),
    buildPresetFrame(2),
    Uint8Array.from([0xfe, 0xf9, 0x00, 0x00, 0x24, 0x00, 0x00, 0x00]),
  ];
}

export function bytesToHex(value) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export function describeUuid(uuid) {
  const known = {
    [UUIDS.service]: "Week Aqua service (FFF0)",
    "0000fff1-0000-1000-8000-00805f9b34fb": "Week Aqua characteristic (FFF1)",
    "0000fff2-0000-1000-8000-00805f9b34fb": "Week Aqua write characteristic (FFF2)",
    "0000fff3-0000-1000-8000-00805f9b34fb": "Week Aqua characteristic (FFF3)",
    "0000fff4-0000-1000-8000-00805f9b34fb": "Week Aqua characteristic (FFF4)",
    "0000180a-0000-1000-8000-00805f9b34fb": "Device information",
    "0000180f-0000-1000-8000-00805f9b34fb": "Battery service",
    "00001800-0000-1000-8000-00805f9b34fb": "Generic access",
  };
  return known[uuid.toLowerCase()] ?? uuid;
}
