import type { Channels } from "@/lib/bridge";
import {
  clampMinutes,
  interpolateAt,
  minsToTime,
  newId,
  ZERO_CHANNELS,
  type DayPreset,
  type Keyframe,
  type RampKind,
} from "@/lib/presets";

export const RAMP_DURATION_MIN = 30;
export const RAMP_DURATION_MAX = 120;
export const RAMP_DURATION_DEFAULT = 60;

export type LinkedRamp = {
  kind: RampKind;
  start: Keyframe;
  end: Keyframe;
};

export type SolarApplyInput = {
  kind: RampKind;
  startMins: number;
  durationMins: number;
  /** When true, sample channels from neighbors / curve at endpoints. */
  useAdjacent: boolean;
  from?: Channels;
  to?: Channels;
};

const DAY_DEFAULT: Channels = { red: 70, green: 55, blue: 50, uv: 25 };

export function findLinkedRamp(
  preset: DayPreset,
  kind: RampKind,
): LinkedRamp | null {
  const start = preset.keyframes.find(
    (k) => k.ramp === kind && k.rampRole === "start",
  );
  const end = preset.keyframes.find(
    (k) => k.ramp === kind && k.rampRole === "end",
  );
  if (!start || !end) return null;
  return { kind, start, end };
}

export function listLinkedRamps(preset: DayPreset): LinkedRamp[] {
  return (["sunrise", "sunset"] as RampKind[])
    .map((kind) => findLinkedRamp(preset, kind))
    .filter((r): r is LinkedRamp => Boolean(r));
}

function clampDuration(mins: number): number {
  return Math.min(
    RAMP_DURATION_MAX,
    Math.max(RAMP_DURATION_MIN, Math.round(mins)),
  );
}

function defaultEndpoints(
  kind: RampKind,
  useAdjacent: boolean,
  preset: DayPreset,
  startMins: number,
  endMins: number,
  from?: Channels,
  to?: Channels,
): { fromCh: Channels; toCh: Channels } {
  if (!useAdjacent && from && to) {
    return { fromCh: { ...from }, toCh: { ...to } };
  }
  if (kind === "sunrise") {
    const fromCh = from
      ? { ...from }
      : useAdjacent
        ? { ...interpolateAt(preset, Math.max(0, startMins - 1)) }
        : { ...ZERO_CHANNELS };
    const toCh = to
      ? { ...to }
      : useAdjacent
        ? { ...interpolateAt(preset, Math.min(1439, endMins + 1)) }
        : { ...DAY_DEFAULT };
    return { fromCh, toCh };
  }
  const fromCh = from
    ? { ...from }
    : useAdjacent
      ? { ...interpolateAt(preset, Math.max(0, startMins - 1)) }
      : { ...DAY_DEFAULT };
  const toCh = to
    ? { ...to }
    : useAdjacent
      ? { ...interpolateAt(preset, Math.min(1439, endMins + 1)) }
      : { ...ZERO_CHANNELS };
  return { fromCh, toCh };
}

/** Write / replace a linked sunrise or sunset ramp key pair. */
export function applySolarRamp(
  preset: DayPreset,
  input: SolarApplyInput,
): DayPreset {
  const duration = clampDuration(input.durationMins);
  const startMins = clampMinutes(input.startMins, preset.snap);
  let endMins = clampMinutes(startMins + duration, preset.snap);
  if (endMins <= startMins) {
    endMins = clampMinutes(startMins + RAMP_DURATION_MIN, "free");
  }
  const { fromCh, toCh } = defaultEndpoints(
    input.kind,
    input.useAdjacent,
    preset,
    startMins,
    endMins,
    input.from,
    input.to,
  );

  const labelStart =
    input.kind === "sunrise" ? "Sunrise start" : "Sunset start";
  const labelEnd = input.kind === "sunrise" ? "Sunrise end" : "Sunset end";

  const existing = findLinkedRamp(preset, input.kind);
  const startId = existing?.start.id ?? newId();
  const endId = existing?.end.id ?? newId();

  const without = preset.keyframes.filter((k) => k.ramp !== input.kind);
  const startKf: Keyframe = {
    id: startId,
    minutes: startMins,
    channels: fromCh,
    label: labelStart,
    ramp: input.kind,
    rampRole: "start",
  };
  const endKf: Keyframe = {
    id: endId,
    minutes: endMins,
    channels: toCh,
    label: labelEnd,
    ramp: input.kind,
    rampRole: "end",
  };

  return {
    ...preset,
    keyframes: [...without, startKf, endKf].sort(
      (a, b) => a.minutes - b.minutes,
    ),
  };
}

/**
 * Drag a ramp edge: move start or end while keeping duration ≥ min.
 * Channels unchanged.
 */
export function moveRampEdge(
  preset: DayPreset,
  kind: RampKind,
  edge: "start" | "end",
  minutes: number,
): DayPreset {
  const ramp = findLinkedRamp(preset, kind);
  if (!ramp) return preset;
  const snapped = clampMinutes(minutes, preset.snap);
  let start = ramp.start.minutes;
  let end = ramp.end.minutes;

  if (edge === "start") {
    start = snapped;
    if (end - start < RAMP_DURATION_MIN) {
      end = clampMinutes(start + RAMP_DURATION_MIN, "free");
    }
    if (end - start > RAMP_DURATION_MAX) {
      end = clampMinutes(start + RAMP_DURATION_MAX, "free");
    }
  } else {
    end = snapped;
    if (end - start < RAMP_DURATION_MIN) {
      start = clampMinutes(end - RAMP_DURATION_MIN, "free");
    }
    if (end - start > RAMP_DURATION_MAX) {
      start = clampMinutes(end - RAMP_DURATION_MAX, "free");
    }
  }

  return {
    ...preset,
    keyframes: preset.keyframes
      .map((k) => {
        if (k.id === ramp.start.id) return { ...k, minutes: start };
        if (k.id === ramp.end.id) return { ...k, minutes: end };
        return k;
      })
      .sort((a, b) => a.minutes - b.minutes),
  };
}

/** Lightweight status copy for “Next · …”. */
export function describeNextEvent(
  preset: DayPreset | null,
  nowMins: number,
): string | null {
  if (!preset || preset.mode !== "schedule" || preset.keyframes.length === 0) {
    return null;
  }
  const sorted = [...preset.keyframes].sort((a, b) => a.minutes - b.minutes);
  const t = ((Math.round(nowMins) % 1440) + 1440) % 1440;
  const next =
    sorted.find((k) => k.minutes > t) ??
    sorted[0]!;
  const label = next.label?.trim() || minsToTime(next.minutes);
  if (next.ramp === "sunrise" && next.rampRole === "start") {
    return `Next · Sunrise ${minsToTime(next.minutes)}`;
  }
  if (next.ramp === "sunset" && next.rampRole === "start") {
    return `Next · Sunset ${minsToTime(next.minutes)}`;
  }
  if (next.rampRole === "end" && next.ramp) {
    const name = next.ramp === "sunrise" ? "Sunrise done" : "Sunset done";
    return `Next · ${name} ${minsToTime(next.minutes)}`;
  }
  return `Next · ${label}`;
}
