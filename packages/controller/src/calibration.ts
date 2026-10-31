import type { Channels } from "./types.js";

/**
 * Measured light output per channel at slider percentages (webcam wall sum,
 * dark level removed, 0–1 of the 100% reading). Source: docs/research/PROTOCOL.md,
 * "Hardware tests from the PC". The camera cannot see UV, so UV stays linear.
 * Rough: refine with tools/hwtest/suite.py.
 */
export type CurvePoint = { pct: number; out: number };
export type CalibrationCurves = Record<keyof Channels, CurvePoint[] | null>;

function normalise(points: Array<[number, number]>): CurvePoint[] {
  const full = points[points.length - 1][1];
  return [{ pct: 0, out: 0 }, ...points.map(([pct, v]) => ({ pct, out: v / full }))];
}

export const MEASURED_CURVES: CalibrationCurves = {
  // sums 20/58/106/136/158 minus a dark level of 8
  red: normalise([[10, 12], [25, 50], [50, 98], [75, 128], [100, 150]]),
  green: normalise([[10, 4], [25, 22], [50, 55], [75, 84], [100, 109]]),
  blue: normalise([[10, 8], [25, 33], [50, 70], [75, 94], [100, 115]]),
  uv: null,
};

/** Slider percent that should be sent so the light output is `percent` of full. */
export function linearise(percent: number, curve: CurvePoint[] | null): number {
  if (!curve || percent <= 0) return Math.max(0, percent);
  const target = Math.min(100, percent) / 100;
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    if (target <= b.out) {
      if (b.out === a.out) return b.pct;
      return a.pct + ((target - a.out) / (b.out - a.out)) * (b.pct - a.pct);
    }
  }
  return 100;
}

export function calibrateChannels(channels: Channels, curves: CalibrationCurves): Channels {
  return {
    red: Math.round(linearise(channels.red, curves.red)),
    green: Math.round(linearise(channels.green, curves.green)),
    blue: Math.round(linearise(channels.blue, curves.blue)),
    uv: Math.round(linearise(channels.uv, curves.uv)),
  };
}
