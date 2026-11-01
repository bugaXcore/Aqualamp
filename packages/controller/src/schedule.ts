import type { Channels } from "./types.js";

/** One window of the lamp's own schedule: minutes from midnight, end exclusive, 1440 = 24:00. */
export type ScheduleWindow = { startMin: number; endMin: number; channels: Channels };

export const MAX_SLOTS = 5;
const GRID = 15;
const CELLS = 1440 / GRID;

const KEYS = ["red", "green", "blue", "uv"] as const;

function mean(samples: Channels[]): Channels {
  const out = { red: 0, green: 0, blue: 0, uv: 0 };
  for (const s of samples) for (const k of KEYS) out[k] += s[k];
  for (const k of KEYS) out[k] = Math.round(out[k] / samples.length);
  return out;
}

function windowCost(samples: Channels[], from: number, to: number): number {
  const m = mean(samples.slice(from, to));
  let cost = 0;
  for (let i = from; i < to; i += 1) for (const k of KEYS) cost += (samples[i][k] - m[k]) ** 2;
  return cost;
}

/**
 * Fits a 24 h colour curve into the lamp's few schedule slots. The lamp holds one
 * colour per slot, so the curve becomes steps: the day is cut into at most
 * `maxSlots` windows (15 min grid) that minimise the squared colour error.
 */
export function compileSchedule(
  sample: (minutes: number) => Channels,
  maxSlots = MAX_SLOTS,
): ScheduleWindow[] {
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > MAX_SLOTS) {
    throw new RangeError(`Slots must be an integer from 1 to ${MAX_SLOTS}.`);
  }
  const samples = Array.from({ length: CELLS }, (_, i) => sample(i * GRID + GRID / 2));

  // best[k][i] = lowest cost of covering cells [0, i) with k windows
  const best = Array.from({ length: maxSlots + 1 }, () => new Array<number>(CELLS + 1).fill(Infinity));
  const cut = Array.from({ length: maxSlots + 1 }, () => new Array<number>(CELLS + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= maxSlots; k += 1) {
    for (let i = k; i <= CELLS; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        const cost = best[k - 1][j] + windowCost(samples, j, i);
        if (cost < best[k][i]) {
          best[k][i] = cost;
          cut[k][i] = j;
        }
      }
    }
  }

  const windows: ScheduleWindow[] = [];
  for (let k = maxSlots, i = CELLS; k >= 1; k -= 1) {
    const j = cut[k][i];
    windows.unshift({ startMin: j * GRID, endMin: i * GRID, channels: mean(samples.slice(j, i)) });
    i = j;
  }

  // Neighbours that ended up with the same colour are one window.
  const merged: ScheduleWindow[] = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev && KEYS.every((k) => prev.channels[k] === w.channels[k])) prev.endMin = w.endMin;
    else merged.push({ ...w });
  }
  return merged;
}
