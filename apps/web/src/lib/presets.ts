import type { Channels } from "@/lib/bridge";
import { getLampMode } from "@/lib/lampMode";

export type PresetMode = "constant" | "schedule";
export type SnapMode = "free" | "quarter" | "half" | "hour";
export type Interpolation = "linear";
/** smooth = eased between keys (default); sharp = straight lines. */
export type CurveStyle = "smooth" | "sharp";

export const SNAP_STEP_MIN: Record<SnapMode, number> = {
  free: 1,
  quarter: 15,
  half: 30,
  hour: 60,
};

export type RampKind = "sunrise" | "sunset";
export type RampRole = "start" | "end";

export type Keyframe = {
  id: string;
  /** Minutes from midnight, 0–1439 */
  minutes: number;
  channels: Channels;
  /** Optional display label (e.g. "Sunrise") */
  label?: string;
  /** Linked solar ramp membership (compose assist A/B). */
  ramp?: RampKind;
  rampRole?: RampRole;
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
  /** Curve shape between keys. Missing = smooth. */
  curve?: CurveStyle;
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

/** First list item — live manual mix; top sliders always editable. */
export const FREE_MANUAL_PRESET_ID = "builtin-free-manual";

export const FREE_MANUAL_CHANNELS: Channels = ch(42, 48, 55, 18);

/**
 * Hardcoded built-in library — source of truth in code, never editable,
 * never stored in localStorage. Sliders mode is always first.
 */
export const BUILTIN_PRESETS: DayPreset[] = [
  {
    id: FREE_MANUAL_PRESET_ID,
    name: "Sliders mode",
    description:
      "Drag the top R/G/B/UV sliders anytime. Day presets below drive schedules and locked looks — Duplicate those to compose your own curve.",
    mode: "constant",
    constantChannels: { ...FREE_MANUAL_CHANNELS },
    keyframes: [],
    snap: "free",
    interpolation: "linear",
    builtin: true,
  },
  {
    id: "builtin-bioactive-24-7",
    name: "Daily Driver",
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
    name: "Jewel Canopy",
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
    name: "High Contrast",
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
    name: "Crisp Photo",
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
    name: "Lunar Night",
    description:
      "A very dim, cold blue/UV mix for late-night viewing. It provides just enough illumination to observe nocturnal microfauna activity and cleaners emerging from the substrate, without triggering algae growth or severely disrupting the circadian rhythm of the tank.",
    mode: "constant",
    constantChannels: ch(0, 0, 8, 5),
    keyframes: [],
    snap: "free",
    interpolation: "linear",
    builtin: true,
  },
  {
    id: "builtin-planted-medium",
    name: "Planted Tank",
    description:
      "A 7.5 hour day (6 hour peak) aimed at 40-90 µmol PAR at the substrate. Balanced red and blue for photosynthesis with enough green to look natural, a blue-led dawn and a warm dusk that keeps red longer. UV stays off because plants gain nothing from it. The ramps soften the light/dark boundary that can trigger algae. For a new tank, start at about 50% brightness with a shorter peak and add about 30 minutes and 5% per week. Shift the times to suit when you are home.",
    mode: "schedule",
    constantChannels: { ...ZERO_CHANNELS },
    snap: "free",
    interpolation: "linear",
    builtin: true,
    keyframes: [
      kf("Planted Sunrise", 10, 15, 0, 0, 0, 0),
      kf("Planted First Light", 10, 25, 18, 8, 4, 0),
      kf("Planted Warm Dawn", 10, 35, 45, 35, 30, 0),
      kf("Planted Peak Start", 10, 45, 80, 65, 75, 0),
      kf("Planted Peak End", 16, 45, 80, 65, 75, 0),
      kf("Planted Afternoon Sun", 16, 55, 62, 45, 40, 0),
      kf("Planted Golden Hour", 17, 5, 30, 14, 6, 0),
      kf("Planted Sunset", 17, 15, 0, 0, 0, 0),
    ],
  },
  {
    id: "builtin-reef-mixed",
    name: "Mixed Reef",
    description:
      "A 9.5 hour day (6 hour peak) aimed at 100-200 PAR. Heavily blue with modest UV and a small red/green supplement. In the evening red and green fade first while blue and UV linger, which brings out fluorescence and follows natural twilight. Moonlight runs overnight at the lowest level the lamp can show (the research suggests 0.5-2% scaled to the lunar phase). New lamps or corals should start at about 50% brightness and add about 5% per week. Shift the times to suit when you are home.",
    mode: "schedule",
    constantChannels: { ...ZERO_CHANNELS },
    snap: "free",
    interpolation: "linear",
    builtin: true,
    keyframes: [
      kf("Reef Moon End", 6, 0, 0, 0, 0, 0),
      kf("Reef Sunrise", 11, 0, 0, 0, 0, 0),
      kf("Reef First Light", 11, 10, 8, 4, 20, 8),
      kf("Reef Warm Dawn", 11, 20, 14, 14, 58, 22),
      kf("Reef Peak Start", 11, 30, 20, 25, 100, 35),
      kf("Reef Peak End", 17, 30, 20, 25, 100, 35),
      kf("Reef Golden Hour", 17, 45, 14, 16, 88, 35),
      kf("Reef Sunset", 18, 0, 8, 10, 70, 30),
      kf("Reef Blue Shift", 18, 30, 2, 3, 40, 20),
      kf("Reef Twilight", 19, 0, 0, 0, 22, 12),
      kf("Reef Dusk", 19, 30, 0, 0, 8, 4),
      kf("Reef Moon Start", 20, 0, 0, 0, 1, 0),
      kf("Reef Moon Late", 5, 59, 0, 0, 1, 0),
    ],
  },
  {
    id: "builtin-community-fish",
    name: "Community Fish",
    description:
      "A 7.75 hour day (6.5 hour peak) aimed at 20-40 µmol PAR for fish with undemanding plants such as anubias, java fern and crypts. Fish body clocks follow light/dark changes and respond most to blue-green light, so dusk goes warm with blue and green dropping first, then full darkness. No moonlight. If algae appears, shorten the peak before changing anything else.",
    mode: "schedule",
    constantChannels: { ...ZERO_CHANNELS },
    snap: "free",
    interpolation: "linear",
    builtin: true,
    keyframes: [
      kf("Community Sunrise", 9, 0, 0, 0, 0, 0),
      kf("Community First Light", 9, 10, 14, 8, 4, 0),
      kf("Community Warm Dawn", 9, 20, 30, 24, 22, 0),
      kf("Community Peak Start", 9, 30, 45, 40, 45, 0),
      kf("Community Peak End", 16, 0, 45, 40, 45, 0),
      kf("Community Golden Hour", 16, 10, 40, 26, 16, 0),
      kf("Community Embers", 16, 20, 24, 8, 2, 0),
      kf("Community Sunset", 16, 30, 0, 0, 0, 0),
    ],
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

/** Sliders mode — first preset; top R/G/B/UV stay live. */
export function isFreeManualPreset(preset: DayPreset | string): boolean {
  const id = typeof preset === "string" ? preset : preset.id;
  return id === FREE_MANUAL_PRESET_ID;
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
  const step = SNAP_STEP_MIN[snap];
  if (step > 1) v = Math.round(v / step) * step;
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
      ramp: k.ramp,
      rampRole: k.rampRole,
    })),
    snap: source.snap,
    curve: source.curve,
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
    (a.curve ?? "smooth") === (b.curve ?? "smooth") &&
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

/** The lamp can hold this many lit keys per preset (one per schedule slot). */
export const MAX_LIT_KEYS = 5;

/** An all-zero key switches the lamp off until the next key. It does not use a slot. */
export function isOffKey(k: Keyframe): boolean {
  const c = k.channels;
  return c.red === 0 && c.green === 0 && c.blue === 0 && c.uv === 0;
}

export function litKeyCount(preset: DayPreset): number {
  return preset.mode === "schedule"
    ? preset.keyframes.filter((k) => !isOffKey(k)).length
    : 0;
}

/** True when `next` would pass the key limit by adding lit keys to `preset`. */
export function exceedsKeyLimit(
  preset: DayPreset,
  next: Keyframe[],
): boolean {
  const lit = next.filter((k) => !isOffKey(k)).length;
  return lit > MAX_LIT_KEYS && lit > litKeyCount(preset);
}

/**
 * Drops the lit keys that change the curve least until the preset fits the
 * limit. Off keys are free and always stay.
 */
export function simplifyToLimit(preset: DayPreset): DayPreset {
  if (preset.mode !== "schedule" || litKeyCount(preset) <= MAX_LIT_KEYS) {
    return preset;
  }
  const grid = Array.from({ length: 96 }, (_, i) => i * 15);
  const sample = (p: DayPreset) => grid.map((m) => interpolateAt(p, m));
  const reference = sample(preset);
  let keys = preset.keyframes.map((k) => ({
    ...k,
    channels: { ...k.channels },
    ramp: undefined,
    rampRole: undefined,
  }));
  while (keys.filter((k) => !isOffKey(k)).length > MAX_LIT_KEYS) {
    let worst = Infinity;
    let drop = -1;
    keys.forEach((k, i) => {
      if (isOffKey(k)) return;
      const rest = keys.filter((_, j) => j !== i);
      const got = sample({ ...preset, keyframes: rest });
      let err = 0;
      for (let s = 0; s < grid.length; s++) {
        for (const c of ["red", "green", "blue", "uv"] as const) {
          err += (got[s]![c] - reference[s]![c]) ** 2;
        }
      }
      if (err < worst) {
        worst = err;
        drop = i;
      }
    });
    keys = keys.filter((_, i) => i !== drop);
  }
  return { ...preset, keyframes: keys };
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

  if (isOffKey(p1)) return { ...ZERO_CHANNELS };

  const span = p2Mins - p1Mins;
  if (getLampMode() === "hardware") return { ...p1.channels };
  const linear = span <= 0 ? 0 : (t - p1Mins) / span;
  const progress =
    preset.curve === "sharp" ? linear : linear * linear * (3 - 2 * linear);
  return lerpChannels(p1.channels, p2.channels, progress);
}

type Hsl = { h: number; s: number; l: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Hue/saturation from R, G, B only (UV ignored), then softened into a natural tone. */
function naturalTone(c: Channels): Hsl {
  const max = Math.max(c.red, c.green, c.blue);
  if (max <= 0) return { h: 210, s: 0.2, l: 0.2 };
  const r = (c.red / max) * 255;
  const g = (c.green / max) * 255;
  const b = (c.blue / max) * 255;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const hi = Math.max(rn, gn, bn);
  const lo = Math.min(rn, gn, bn);
  const d = hi - lo;
  let h = 0;
  if (d > 0) {
    if (hi === rn) h = ((gn - bn) / d) % 6;
    else if (hi === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const sat = hi === 0 ? 0 : d / hi;
  const level = Math.min(1, max / 100);
  return {
    h,
    s: Math.min(0.62, sat * 0.72),
    l: 0.2 + 0.34 * Math.sqrt(level),
  };
}

function hslCss(c: Hsl, alpha = 1): string {
  const h = ((c.h % 360) + 360) % 360;
  return `hsl(${h.toFixed(1)} ${(clamp01(c.s) * 100).toFixed(1)}% ${(clamp01(c.l) * 100).toFixed(1)}% / ${clamp01(alpha).toFixed(3)})`;
}

/**
 * Day-orb swatch: a conic gradient of the 24 h curve, midnight at the top and
 * noon at the bottom. Unlit hours render as a dim blue-grey.
 */
export function presetOrbBackground(preset: DayPreset): string {
  const n = 48;
  const stops: string[] = [];
  const base = preset.mode === "constant" ? naturalTone(preset.constantChannels) : null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let color: Hsl;
    if (base) {
      // A fixed mix has no day curve; drift the hue and depth gently around the dial.
      const w = Math.cos(t * Math.PI * 2);
      color = { h: base.h - 12 * (1 - w) / 2, s: base.s, l: base.l - 0.1 * (1 - w) / 2 };
    } else {
      color = naturalTone(interpolateAt(preset, Math.round(t * 1439)));
    }
    stops.push(`${hslCss(color)} ${(t * 360).toFixed(1)}deg`);
  }
  return `conic-gradient(from 180deg, ${stops.join(", ")})`;
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
      ? p.keyframes.map((k) => {
          const ramp =
            k.ramp === "sunrise" || k.ramp === "sunset" ? k.ramp : undefined;
          const rampRole =
            k.rampRole === "start" || k.rampRole === "end"
              ? k.rampRole
              : undefined;
          return {
            id: k.id ?? newId(),
            minutes: clampMinutes(k.minutes ?? 0, "free"),
            channels: normalizeChannels(k.channels),
            label:
              typeof k.label === "string" && k.label.trim()
                ? k.label.trim()
                : undefined,
            ramp,
            rampRole: ramp ? rampRole : undefined,
          };
        })
      : [],
    snap:
      p.snap === "hour" || p.snap === "half" || p.snap === "quarter"
        ? p.snap
        : "free",
    curve: p.curve === "sharp" ? "sharp" : undefined,
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
