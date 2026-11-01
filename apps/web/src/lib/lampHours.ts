import { useSyncExternalStore } from "react";

const KEY = "aqualamp.lampHours";
const EVENT = "aqualamp:lamp-hours";

/** Minutes from midnight. `from` is before `to`; outside that span the lamp stays dark. */
export type LampHours = { enabled: boolean; from: number; to: number };

const DEFAULT: LampHours = { enabled: false, from: 8 * 60, to: 20 * 60 };

let cache: { raw: string | null; value: LampHours } | null = null;

function read(): LampHours {
  const raw = localStorage.getItem(KEY);
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULT;
  try {
    const p = raw ? (JSON.parse(raw) as Partial<LampHours>) : null;
    if (
      p &&
      typeof p.from === "number" &&
      typeof p.to === "number" &&
      p.from >= 0 &&
      p.to <= 1440 &&
      p.from < p.to
    ) {
      value = { enabled: Boolean(p.enabled), from: p.from, to: p.to };
    }
  } catch {
    // Fall back to the default.
  }
  cache = { raw, value };
  return value;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useLampHours(): [LampHours, (next: LampHours) => void] {
  const hours = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const set = (next: LampHours) => {
    if (!(next.from >= 0 && next.to <= 1440 && next.from < next.to)) return;
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  };
  return [hours, set];
}

export function withinHours(hours: LampHours, minutes: number): boolean {
  return !hours.enabled || (minutes >= hours.from && minutes < hours.to);
}

/** Cuts schedule windows to the lamp hours. Never adds windows, so the five-slot limit holds. */
export function clipWindows<T extends { startMin: number; endMin: number }>(
  windows: T[],
  hours: LampHours,
): T[] {
  if (!hours.enabled) return windows;
  return windows
    .map((w) => ({
      ...w,
      startMin: Math.max(w.startMin, hours.from),
      endMin: Math.min(w.endMin, hours.to),
    }))
    .filter((w) => w.startMin < w.endMin);
}
