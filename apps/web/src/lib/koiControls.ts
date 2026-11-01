import { useSyncExternalStore } from "react";

const KEY = "aqualamp.koiControls";
const EVENT = "aqualamp:koi-controls";

const read = () => localStorage.getItem(KEY) === "1";

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** Whether the koi pond tuning panel is shown. Off by default. */
export function useKoiControls(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = (next: boolean) => {
    localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  };
  return [on, set];
}
