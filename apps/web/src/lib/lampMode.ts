import { useSyncExternalStore } from "react";

export type LampMode = "hardware" | "app";

const KEY = "aqualamp.lampMode";
const EVENT = "aqualamp:lamp-mode";

/** Hardware: every key holds its colour until the next one, the way the lamp's own steps do. */
export function getLampMode(): LampMode {
  return localStorage.getItem(KEY) === "app" ? "app" : "hardware";
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useLampMode(): [LampMode, (mode: LampMode) => void] {
  const mode = useSyncExternalStore(subscribe, getLampMode, () => "hardware" as const);
  const set = (next: LampMode) => {
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [mode, set];
}
