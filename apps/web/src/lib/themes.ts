import { useCallback, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

export type Theme = {
  id: string;
  label: string;
  mode: ThemeMode;
  bg: string;
  panel: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  secondary: string;
  /** Readable accent for small text/outlines (darker than `accent` where needed). */
  accentInk: string;
  /** Text colour on top of a filled accent button. */
  onAccent: string;
};

export const THEMES: Theme[] = [
  {
    id: "charcoal-clay",
    label: "Warm charcoal",
    mode: "dark",
    bg: "#1F1E1D",
    panel: "#262624",
    raised: "#30302E",
    border: "#3D3C39",
    text: "#F0EEE6",
    muted: "#A8A59B",
    accent: "#D97757",
    secondary: "#8FB59A",
    accentInk: "#D97757",
    onAccent: "#1F1E1D",
  },
  {
    id: "espresso-honey",
    label: "Espresso",
    mode: "dark",
    bg: "#1A1613",
    panel: "#231E1A",
    raised: "#2E2722",
    border: "#40372F",
    text: "#F3EBDD",
    muted: "#A89B8A",
    accent: "#E8A94B",
    secondary: "#7FB7A4",
    accentInk: "#E8A94B",
    onAccent: "#1A1613",
  },
  {
    id: "moss-mint",
    label: "Moss ink",
    mode: "dark",
    bg: "#121816",
    panel: "#1A2220",
    raised: "#232E2B",
    border: "#33423E",
    text: "#E8EFE9",
    muted: "#94A59E",
    accent: "#9BD8A8",
    secondary: "#E7B07A",
    accentInk: "#9BD8A8",
    onAccent: "#121816",
  },
  {
    id: "paper-clay",
    label: "Warm paper",
    mode: "light",
    bg: "#FAF9F5",
    panel: "#F2F0E8",
    raised: "#FFFFFF",
    border: "#E2DED2",
    text: "#1F1E1D",
    muted: "#6B675E",
    accent: "#B8532E",
    secondary: "#4F7A5E",
    accentInk: "#B8532E",
    onAccent: "#FFFFFF",
  },
  {
    id: "cream-honey",
    label: "Cream",
    mode: "light",
    bg: "#FBF6EC",
    panel: "#F4ECDC",
    raised: "#FFFDF8",
    border: "#E6DAC3",
    text: "#2A221B",
    muted: "#75685A",
    accent: "#D9962B",
    secondary: "#2F7F6F",
    accentInk: "#9A6410",
    onAccent: "#2A221B",
  },
  {
    id: "mist-forest",
    label: "Mist green",
    mode: "light",
    bg: "#F3F6F2",
    panel: "#E9EEE8",
    raised: "#FFFFFF",
    border: "#D3DCD2",
    text: "#17201C",
    muted: "#5E6E66",
    accent: "#2F7A50",
    secondary: "#B9632C",
    accentInk: "#2F7A50",
    onAccent: "#FFFFFF",
  },
];

const STORAGE_KEY = "aqualamp.theme";
const EVENT = "aqualamp-theme";

const byId = (id: string | null) => THEMES.find((t) => t.id === id);

export function defaultTheme(): Theme {
  const light =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: light)").matches;
  return byId(light ? "mist-forest" : "moss-mint")!;
}

export function storedTheme(): Theme {
  try {
    return byId(localStorage.getItem(STORAGE_KEY)) ?? defaultTheme();
  } catch {
    return defaultTheme();
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.mode;
  const vars: Record<string, string> = {
    "--t-bg": theme.bg,
    "--t-panel": theme.panel,
    "--t-raised": theme.raised,
    "--t-border": theme.border,
    "--t-text": theme.text,
    "--t-muted": theme.muted,
    "--t-accent": theme.accent,
    "--t-secondary": theme.secondary,
    "--t-accent-ink": theme.accentInk,
    "--t-on-accent": theme.onAccent,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.bg);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useTheme() {
  const id = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? "",
  );
  const theme = byId(id) ?? defaultTheme();
  const setTheme = useCallback((next: string) => {
    const t = byId(next);
    if (!t) return;
    applyTheme(t);
    try {
      localStorage.setItem(STORAGE_KEY, t.id);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { theme, setTheme };
}
