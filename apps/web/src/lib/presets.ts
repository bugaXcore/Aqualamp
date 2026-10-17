import type { Channels } from "@/lib/bridge";

export type PresetMode = "constant" | "schedule";
export type SnapMode = "free" | "hour";
export type Interpolation = "linear";

export type Keyframe = {
  id: string;
  /** Minutes from midnight, 0–1439 */
  minutes: number;
  channels: Channels;
};

export type DayPreset = {
  id: string;
  name: string;
  mode: PresetMode;
  constantChannels: Channels;
  keyframes: Keyframe[];
  snap: SnapMode;
  interpolation: Interpolation;
};

export type PresetStore = {
  version: 1;
  presets: DayPreset[];
};

const STORAGE_KEY = "aqualamp.dayPresets.v1";

export const ZERO_CHANNELS: Channels = {
  red: 0,
  green: 0,
  blue: 0,
  uv: 0,
};

export function minsToTime(mins: number): string {
  const clamped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const m = (clamped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function timeToMins(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.min(1439, Math.max(0, h * 60 + m));
}

export function clampMinutes(mins: number, snap: SnapMode): number {
  let v = Math.round(mins);
  v = ((v % 1440) + 1440) % 1440;
  if (snap === "hour") v = Math.round(v / 60) * 60;
  if (v >= 1440) v = 1439;
  return v;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Empty editable shell — no sample daylight curve. */
export function createEmptyPreset(name = "New preset"): DayPreset {
  return {
    id: newId(),
    name,
    mode: "constant",
    constantChannels: { ...ZERO_CHANNELS },
    keyframes: [],
    snap: "free",
    interpolation: "linear",
  };
}

function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

function lerpChannels(a: Channels, b: Channels, t: number): Channels {
  return {
    red: Math.round(lerp(a.red, b.red, t)),
    green: Math.round(lerp(a.green, b.green, t)),
    blue: Math.round(lerp(a.blue, b.blue, t)),
    uv: Math.round(lerp(a.uv, b.uv, t)),
  };
}

/** Interpolate schedule keyframes at playhead (wraps midnight). */
export function interpolateAt(
  preset: DayPreset,
  timeMins: number,
): Channels {
  if (preset.mode === "constant") {
    return { ...preset.constantChannels };
  }

  const sorted = [...preset.keyframes].sort((a, b) => a.minutes - b.minutes);
  if (sorted.length === 0) return { ...ZERO_CHANNELS };
  if (sorted.length === 1) return { ...sorted[0].channels };

  const t = ((Math.round(timeMins) % 1440) + 1440) % 1440;

  let p1 = sorted[sorted.length - 1]!;
  let p2 = sorted[0]!;
  let p1Mins = p1.minutes - 1440;
  let p2Mins = p2.minutes;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (t >= a.minutes && t < b.minutes) {
      p1 = a;
      p2 = b;
      p1Mins = a.minutes;
      p2Mins = b.minutes;
      break;
    }
  }

  if (t >= sorted[sorted.length - 1]!.minutes) {
    p1 = sorted[sorted.length - 1]!;
    p2 = sorted[0]!;
    p1Mins = p1.minutes;
    p2Mins = p2.minutes + 1440;
  }

  const span = p2Mins - p1Mins;
  const progress = span <= 0 ? 0 : (t - p1Mins) / span;
  return lerpChannels(p1.channels, p2.channels, progress);
}

export function loadPresets(): DayPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PresetStore;
    if (parsed?.version !== 1 || !Array.isArray(parsed.presets)) return [];
    return parsed.presets.map(normalizePreset);
  } catch {
    return [];
  }
}

export function savePresets(presets: DayPreset[]): void {
  const store: PresetStore = { version: 1, presets };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function normalizePreset(p: Partial<DayPreset>): DayPreset {
  return {
    id: p.id ?? newId(),
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Untitled",
    mode: p.mode === "schedule" ? "schedule" : "constant",
    constantChannels: normalizeChannels(p.constantChannels),
    keyframes: Array.isArray(p.keyframes)
      ? p.keyframes.map((k) => ({
          id: k.id ?? newId(),
          minutes: clampMinutes(k.minutes ?? 0, "free"),
          channels: normalizeChannels(k.channels),
        }))
      : [],
    snap: p.snap === "hour" ? "hour" : "free",
    interpolation: "linear",
  };
}

function normalizeChannels(c?: Partial<Channels>): Channels {
  return {
    red: clampPct(c?.red),
    green: clampPct(c?.green),
    blue: clampPct(c?.blue),
    uv: clampPct(c?.uv),
  };
}

function clampPct(v: unknown): number {
  const n = typeof v === "number" ? v : 0;
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
