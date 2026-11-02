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

function darkCost(samples: Channels[], from: number, to: number): number {
  let cost = 0;
  for (let i = from; i < to; i += 1) for (const k of KEYS) cost += samples[i][k] ** 2;
  return cost;
}

/**
 * Fits a 24 h colour curve into the lamp's few schedule slots. The lamp holds one
 * colour per slot, so the curve becomes steps: the day is cut into at most
 * `maxSlots` lit windows (15 min grid) that minimise the squared colour error.
 * Dark stretches need no slot because the lamp is off between slots, so they are
 * left out of the result.
 */
export function compileSchedule(
  sample: (minutes: number) => Channels,
  maxSlots = MAX_SLOTS,
): ScheduleWindow[] {
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > MAX_SLOTS) {
    throw new RangeError(`Slots must be an integer from 1 to ${MAX_SLOTS}.`);
  }
  const samples = Array.from({ length: CELLS }, (_, i) => sample(i * GRID + GRID / 2));

  // best[k][i] = lowest cost of covering cells [0, i) with k lit windows plus any dark stretches
  const best = Array.from({ length: maxSlots + 1 }, () => new Array<number>(CELLS + 1).fill(Infinity));
  const cut = Array.from({ length: maxSlots + 1 }, () => new Array<number>(CELLS + 1).fill(0));
  const dark = Array.from({ length: maxSlots + 1 }, () => new Array<boolean>(CELLS + 1).fill(false));
  best[0][0] = 0;
  for (let i = 1; i <= CELLS; i += 1) {
    for (let k = 0; k <= maxSlots; k += 1) {
      for (let j = 0; j < i; j += 1) {
        const lit = k > 0 && j >= k - 1 ? best[k - 1][j] + windowCost(samples, j, i) : Infinity;
        const off = best[k][j] + darkCost(samples, j, i);
        if (lit < best[k][i]) {
          best[k][i] = lit;
          cut[k][i] = j;
          dark[k][i] = false;
        }
        if (off < best[k][i]) {
          best[k][i] = off;
          cut[k][i] = j;
          dark[k][i] = true;
        }
      }
    }
  }

  let bestK = 0;
  for (let k = 1; k <= maxSlots; k += 1) if (best[k][CELLS] < best[bestK][CELLS]) bestK = k;
  const windows: ScheduleWindow[] = [];
  for (let k = bestK, i = CELLS; i > 0; ) {
    const j = cut[k][i];
    if (dark[k][i]) {
      i = j;
      continue;
    }
    windows.unshift({ startMin: j * GRID, endMin: i * GRID, channels: mean(samples.slice(j, i)) });
    i = j;
    k -= 1;
  }

  // Neighbours that ended up with the same colour are one window.
  const merged: ScheduleWindow[] = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.endMin === w.startMin && KEYS.every((k) => prev.channels[k] === w.channels[k])) {
      prev.endMin = w.endMin;
    } else merged.push({ ...w });
  }
  return merged.filter((w) => KEYS.some((k) => w.channels[k] > 0));
}
