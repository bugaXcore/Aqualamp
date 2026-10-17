import type { Channels } from "@/lib/bridge";

export type PresetMode = "constant" | "schedule";
export type SnapMode = "free" | "hour";
export type Interpolation = "linear";

export type Keyframe = {
  id: string;
  /** Minutes from midnight, 0–1439 */
  minutes: number;
  channels: Channels;
  /** Optional display label (e.g. "Sunrise") */
  label?: string;
};

export type DayPreset = {
  id: string;
  name: string;
  /** Optional long-form blurb shown in the presets UI */
  description?: string;
  mode: PresetMode;
  constantChannels: Channels;
  keyframes: Keyframe[];
  snap: SnapMode;
  interpolation: Interpolation;
};

export type PresetStore = {
  /** Bump when starter library / schema must re-seed for existing browsers. */
  version: 2;
  presets: DayPreset[];
};

/**
 * localStorage key. v2 forces a fresh seed for anyone who still has a
 * custom empty shell under v1 — hard-refresh is enough (no DevTools).
 * Clear this key to re-seed starters again.
 */
export const PRESETS_STORAGE_KEY = "aqualamp.dayPresets.v2";

export const ZERO_CHANNELS: Channels = {
  red: 0,
  green: 0,
  blue: 0,
  uv: 0,
};

function ch(
  red: number,
  green: number,
  blue: number,
  uv: number,
): Channels {
  return { red, green, blue, uv };
}

function kf(
  label: string,
  hours: number,
  minutes: number,
  red: number,
  green: number,
  blue: number,
  uv: number,
): Keyframe {
  return {
    id: `seed-${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    minutes: hours * 60 + minutes,
    channels: ch(red, green, blue, uv),
  };
}

/**
 * Built-in starter library. Seeded into `aqualamp.dayPresets.v2` when that
 * key is missing/empty. Clear `PRESETS_STORAGE_KEY` (or bump the key) to reset.
 */
export const STARTER_PRESETS: DayPreset[] = [
  {
    id: "seed-bioactive-24-7",
    name: "The Bioactive 24/7 Cycle (The Daily Driver)",
    description:
      "For deep, nutrient-rich dirted layers topped with sand, managing the photoperiod is critical to prevent algae blooms before the microfauna and plants fully establish. This curve utilizes a long, slow ramp-up to gently wake the tank, a short midday peak for high-energy photosynthesis, and a warm evening fade.",
    mode: "schedule",
    constantChannels: { ...ZERO_CHANNELS },
    snap: "free",
    interpolation: "linear",
    keyframes: [
      kf("Sunrise", 8, 30, 10, 5, 0, 0),
      kf("Morning Climb", 10, 30, 50, 40, 30, 10),
      kf("Midday Peak", 13, 30, 85, 65, 60, 40),
      kf("Afternoon Ease", 17, 30, 60, 45, 40, 20),
      kf("Evening Chill", 20, 0, 40, 10, 0, 0),
      kf("Total Dark", 22, 30, 0, 0, 0, 0),
    ],
  },
  {
    id: "seed-jewel-canopy",
    name: "The Jewel Canopy",
    description:
      "This is a low-intensity, high-fluorescence mix designed specifically for the shaded, humid terrestrial zones of a paludarium. Cranking the UV channel while dropping the primary RGB colors dramatically highlights the sparkling, lightning-bolt veins of Macodes petola and other jewel orchids without scorching their delicate leaves.",
    mode: "constant",
    constantChannels: ch(50, 25, 35, 80),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
  },
  {
    id: "seed-high-contrast-scape",
    name: "The High-Contrast Scape",
    description:
      'This preset is engineered to maximize color separation. Pushing the red channel to 100% makes Neocaridina shrimp and red stem plants visually "pop" and look incredibly vibrant, while the moderate blue and green keep epiphytes looking lush. This mix creates a striking, moody contrast against dark, porous hardscapes like Scoria lava rock.',
    mode: "constant",
    constantChannels: ch(100, 45, 55, 30),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
  },
  {
    id: "seed-crisp-photography",
    name: "Crisp Photography",
    description:
      "Most RGB aquarium lights create a slight magenta or warm hue that looks great to the human eye but confuses smartphone cameras. This is a flat, perfectly balanced 6500K daylight equivalent. It provides clean, white illumination so you can take accurate photos of your layout without weird color casting.",
    mode: "constant",
    constantChannels: ch(75, 75, 75, 15),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
  },
  {
    id: "seed-lunar-viewing",
    name: "Lunar Viewing",
    description:
      "A very dim, cold blue/UV mix for late-night viewing. It provides just enough illumination to observe nocturnal microfauna activity and cleaners emerging from the substrate, without triggering algae growth or severely disrupting the circadian rhythm of the tank.",
    mode: "constant",
    constantChannels: ch(0, 0, 8, 5),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
  },
];

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

/** Empty editable shell. */
export function createEmptyPreset(name = "New preset"): DayPreset {
  return {
    id: newId(),
    name,
    description: "",
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
  if (sorted.length === 1) return { ...sorted[0]!.channels };

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
  const linear = span <= 0 ? 0 : (t - p1Mins) / span;
  // Gentle ease between keyframes (smoothstep) — matches softened timeline curves
  const progress = linear * linear * (3 - 2 * linear);
  return lerpChannels(p1.channels, p2.channels, progress);
}

/**
 * Load presets from localStorage (`aqualamp.dayPresets.v2`).
 * Missing / wrong version / empty → seed STARTER_PRESETS.
 * v1 keys are ignored so prior empty shells do not block starters.
 */
export function loadPresets(): DayPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) {
      return seedStarters();
    }
    const parsed = JSON.parse(raw) as PresetStore;
    if (parsed?.version !== 2 || !Array.isArray(parsed.presets)) {
      return seedStarters();
    }
    if (parsed.presets.length === 0) {
      return seedStarters();
    }
    return parsed.presets.map(normalizePreset);
  } catch {
    return seedStarters();
  }
}

function seedStarters(): DayPreset[] {
  const seeded = STARTER_PRESETS.map(normalizePreset);
  savePresets(seeded);
  return seeded;
}

export function savePresets(presets: DayPreset[]): void {
  const store: PresetStore = { version: 2, presets };
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(store));
}

/** Clear stored presets (next loadPresets / page reload re-seeds starters). */
export function clearPresetStorage(): void {
  localStorage.removeItem(PRESETS_STORAGE_KEY);
}

function normalizePreset(p: Partial<DayPreset>): DayPreset {
  return {
    id: p.id ?? newId(),
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Untitled",
    description:
      typeof p.description === "string" ? p.description : undefined,
    mode: p.mode === "schedule" ? "schedule" : "constant",
    constantChannels: normalizeChannels(p.constantChannels),
    keyframes: Array.isArray(p.keyframes)
      ? p.keyframes.map((k) => ({
          id: k.id ?? newId(),
          minutes: clampMinutes(k.minutes ?? 0, "free"),
          channels: normalizeChannels(k.channels),
          label:
            typeof k.label === "string" && k.label.trim()
              ? k.label.trim()
              : undefined,
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
