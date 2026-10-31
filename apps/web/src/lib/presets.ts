import { channelsToCss, type Channels } from "@/lib/bridge";

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
  /** Hardcoded starter — never persisted; edits blocked in UI */
  builtin?: boolean;
};

export type PresetStore = {
  /** v3: user presets only (builtins live in code). */
  version: 3;
  presets: DayPreset[];
};

/**
 * User-preset storage. Built-ins are NOT written here.
 * Bumped to v3 so old seeded v2 blobs cannot fight the hardcoded library.
 */
export const PRESETS_STORAGE_KEY = "aqualamp.dayPresets.v3";

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
    id: `builtin-${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    minutes: hours * 60 + minutes,
    channels: ch(red, green, blue, uv),
  };
}

/**
 * Hardcoded built-in library — source of truth in code, never editable,
 * never stored in localStorage.
 */
export const BUILTIN_PRESETS: DayPreset[] = [
  {
    id: "builtin-bioactive-24-7",
    name: "The Bioactive 24/7 Cycle (The Daily Driver)",
    description:
      "For deep, nutrient-rich dirted layers topped with sand, managing the photoperiod is critical to prevent algae blooms before the microfauna and plants fully establish. This curve utilizes a long, slow ramp-up to gently wake the tank, a short midday peak for high-energy photosynthesis, and a warm evening fade.",
    mode: "schedule",
    constantChannels: { ...ZERO_CHANNELS },
    snap: "free",
    interpolation: "linear",
    builtin: true,
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
    id: "builtin-jewel-canopy",
    name: "The Jewel Canopy",
    description:
      "This is a low-intensity, high-fluorescence mix designed specifically for the shaded, humid terrestrial zones of a paludarium. Cranking the UV channel while dropping the primary RGB colors dramatically highlights the sparkling, lightning-bolt veins of Macodes petola and other jewel orchids without scorching their delicate leaves.",
    mode: "constant",
    constantChannels: ch(50, 25, 35, 80),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
    builtin: true,
  },
  {
    id: "builtin-high-contrast-scape",
    name: "The High-Contrast Scape",
    description:
      'This preset is engineered to maximize color separation. Pushing the red channel to 100% makes Neocaridina shrimp and red stem plants visually "pop" and look incredibly vibrant, while the moderate blue and green keep epiphytes looking lush. This mix creates a striking, moody contrast against dark, porous hardscapes like Scoria lava rock.',
    mode: "constant",
    constantChannels: ch(100, 45, 55, 30),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
    builtin: true,
  },
  {
    id: "builtin-crisp-photography",
    name: "Crisp Photography",
    description:
      "Most RGB aquarium lights create a slight magenta or warm hue that looks great to the human eye but confuses smartphone cameras. This is a flat, perfectly balanced 6500K daylight equivalent. It provides clean, white illumination so you can take accurate photos of your layout without weird color casting.",
    mode: "constant",
    constantChannels: ch(75, 75, 75, 15),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
    builtin: true,
  },
  {
    id: "builtin-lunar-viewing",
    name: "Lunar Viewing",
    description:
      "A very dim, cold blue/UV mix for late-night viewing. It provides just enough illumination to observe nocturnal microfauna activity and cleaners emerging from the substrate, without triggering algae growth or severely disrupting the circadian rhythm of the tank.",
    mode: "constant",
    constantChannels: ch(0, 0, 8, 5),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
    builtin: true,
  },
];

const BUILTIN_IDS = new Set(BUILTIN_PRESETS.map((p) => p.id));

/** Legacy seed ids from v1/v2 — never treat as user presets. */
const LEGACY_SEED_PREFIXES = ["seed-", "builtin-"];

export function isBuiltinPreset(preset: DayPreset | string): boolean {
  if (typeof preset === "string") {
    return (
      BUILTIN_IDS.has(preset) ||
      preset.startsWith("seed-") ||
      preset.startsWith("builtin-")
    );
  }
  if (preset.builtin) return true;
  return BUILTIN_IDS.has(preset.id);
}

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

/** Empty editable user shell (not yet saved). */
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
    builtin: false,
  };
}

/** Deep-ish clone of a preset as a new editable user copy. */
export function duplicateAsUserPreset(source: DayPreset): DayPreset {
  return {
    id: newId(),
    name: `${source.name} (copy)`,
    description: source.description ?? "",
    mode: source.mode,
    constantChannels: { ...source.constantChannels },
    keyframes: source.keyframes.map((k) => ({
      id: newId(),
      minutes: k.minutes,
      channels: { ...k.channels },
      label: k.label,
    })),
    snap: source.snap,
    interpolation: "linear",
    builtin: false,
  };
}

export function clonePreset(preset: DayPreset): DayPreset {
  return {
    ...preset,
    constantChannels: { ...preset.constantChannels },
    keyframes: preset.keyframes.map((k) => ({
      ...k,
      channels: { ...k.channels },
    })),
  };
}

export function presetsEqual(a: DayPreset, b: DayPreset): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    (a.description ?? "") === (b.description ?? "") &&
    a.mode === b.mode &&
    a.snap === b.snap &&
    a.constantChannels.red === b.constantChannels.red &&
    a.constantChannels.green === b.constantChannels.green &&
    a.constantChannels.blue === b.constantChannels.blue &&
    a.constantChannels.uv === b.constantChannels.uv &&
    JSON.stringify(a.keyframes) === JSON.stringify(b.keyframes)
  );
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
  const progress = linear * linear * (3 - 2 * linear);
  return lerpChannels(p1.channels, p2.channels, progress);
}

/**
 * CSS background summarizing a preset mix for list-row previews.
 * Constant → solid RGB(+UV violet). Schedule → horizontal day strip.
 */
export function presetMixBackground(
  preset: DayPreset,
  samples = 24,
): string {
  if (preset.mode === "constant") {
    return channelsToCss(preset.constantChannels);
  }
  if (preset.keyframes.length === 0) {
    return channelsToCss(ZERO_CHANNELS);
  }
  if (preset.keyframes.length === 1) {
    return channelsToCss(preset.keyframes[0]!.channels);
  }
  const stops: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const mins = Math.round((i / samples) * 1439);
    const pct = ((i / samples) * 100).toFixed(2);
    stops.push(`${channelsToCss(interpolateAt(preset, mins))} ${pct}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Load committed user presets only (never builtins). */
export function loadUserPresets(): DayPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PresetStore;
    if (parsed?.version !== 3 || !Array.isArray(parsed.presets)) return [];
    return parsed.presets
      .map(normalizeUserPreset)
      .filter((p) => !isBuiltinPreset(p) && !isLegacySeedId(p.id));
  } catch {
    return [];
  }
}

function isLegacySeedId(id: string): boolean {
  return LEGACY_SEED_PREFIXES.some((p) => id.startsWith(p));
}

/** Persist committed user presets only. */
export function saveUserPresets(presets: DayPreset[]): void {
  const users = presets
    .filter((p) => !isBuiltinPreset(p))
    .map((p) => ({ ...normalizeUserPreset(p), builtin: false }));
  const store: PresetStore = { version: 3, presets: users };
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(store));
}

export function clearPresetStorage(): void {
  localStorage.removeItem(PRESETS_STORAGE_KEY);
}

/** Built-ins first, then committed user presets (apply draft overlays elsewhere). */
export function mergePresetLibrary(userPresets: DayPreset[]): DayPreset[] {
  return [...BUILTIN_PRESETS.map(clonePreset), ...userPresets.map(clonePreset)];
}

function normalizeUserPreset(p: Partial<DayPreset>): DayPreset {
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
    builtin: false,
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

/** @deprecated use BUILTIN_PRESETS */
export const STARTER_PRESETS = BUILTIN_PRESETS;
