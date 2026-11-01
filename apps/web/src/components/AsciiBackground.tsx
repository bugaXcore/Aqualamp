import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { mountAsciiBg, type AsciiBg, type AsciiClip } from "@/lib/asciiBg";
import { useTheme } from "@/lib/themes";

export type AsciiClipId = "koi" | "koi-close";

export const ASCII_RAMPS = {
  classic: " .:-=+*#%@",
  soft: " .,:;-=+",
  blocks: " ░▒▓█",
} as const;
export type AsciiRampId = keyof typeof ASCII_RAMPS;

export type AsciiColorId = "text" | "accent" | "secondary" | "muted" | "duo" | "tide";
export type AsciiBlendId = "normal" | "soft-light" | "overlay" | "multiply" | "screen" | "plus-lighter";

/** Glyph colours drawn from the active theme tokens, so every theme gets its own pond. */
export const ASCII_COLORS: Record<AsciiColorId, { label: string; css: string }> = {
  text: { label: "Theme text", css: "var(--t-text)" },
  accent: { label: "Accent", css: "var(--t-accent)" },
  secondary: { label: "Secondary", css: "var(--t-secondary)" },
  muted: { label: "Muted", css: "var(--t-muted)" },
  duo: { label: "Accent + secondary", css: "color-mix(in oklab, var(--t-accent) 55%, var(--t-secondary))" },
  tide: { label: "Accent in the background", css: "color-mix(in oklab, var(--t-accent) 70%, var(--t-bg))" },
};

export type AsciiLook = {
  clip: AsciiClipId;
  ramp: AsciiRampId;
  color: AsciiColorId;
  blend: AsciiBlendId;
  fontSize: number;
  lineHeight: number;
  opacity: number;
  minAlpha: number;
  gain: number;
  speed: number;
  fps: number;
  zoom: number;
  focusX: number;
  focusY: number;
};

export type AsciiSettings = AsciiLook & { enabled: boolean };

/** One look per theme family; dark themes glow, light themes print. */
export const ASCII_LOOKS: Record<"dark" | "light", AsciiLook> = {
  dark: {
    clip: "koi-close",
    ramp: "soft",
    color: "muted",
    blend: "plus-lighter",
    fontSize: 6,
    lineHeight: 1.55,
    opacity: 0.35,
    minAlpha: 1,
    gain: 1.65,
    speed: 1.2,
    fps: 25,
    zoom: 1,
    focusX: 0.5,
    focusY: 0.5,
  },
  light: {
    clip: "koi-close",
    ramp: "soft",
    color: "text",
    blend: "normal",
    fontSize: 6,
    lineHeight: 1.25,
    opacity: 0.5,
    minAlpha: 1,
    gain: 2.4,
    speed: 1.2,
    fps: 25,
    zoom: 1,
    focusX: 0.5,
    focusY: 0.5,
  },
};

type Stored = { enabled: boolean; dark: Partial<AsciiLook>; light: Partial<AsciiLook> };

const KEY = "aqualamp.ascii.v2";
const EVENT = "aqualamp:ascii";
let cached: Stored | null = null;

function read(): Stored {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Stored>) : {};
    cached = { enabled: p.enabled ?? true, dark: p.dark ?? {}, light: p.light ?? {} };
  } catch {
    cached = { enabled: true, dark: {}, light: {} };
  }
  return cached;
}

function write(next: Stored) {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: settings still apply for this session */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Settings for the active theme family. Edits are saved per family and layered over its look. */
export function useAsciiSettings() {
  const stored = useSyncExternalStore((cb) => {
    window.addEventListener(EVENT, cb);
    return () => window.removeEventListener(EVENT, cb);
  }, read);
  const { theme } = useTheme();
  const family = theme.mode === "light" ? "light" : "dark";
  const settings = useMemo<AsciiSettings>(
    () => ({ enabled: stored.enabled, ...ASCII_LOOKS[family], ...stored[family] }),
    [stored, family],
  );
  const update = (patch: Partial<AsciiSettings>) => {
    const { enabled, ...look } = patch;
    const s = read();
    write({
      enabled: enabled ?? s.enabled,
      dark: s.dark,
      light: s.light,
      [family]: { ...s[family], ...look },
    });
  };
  const reset = () => {
    const s = read();
    write({ ...s, [family]: {} });
  };
  return { settings, family, update, reset };
}

// Clips are loaded on demand so they stay out of the main bundle.
const loaders: Record<AsciiClipId, () => Promise<{ default: AsciiClip }>> = {
  koi: () => import("@/assets/ascii/koi.json"),
  "koi-close": () => import("@/assets/ascii/koi-close.json"),
};

const FONT = '"Figtree", ui-monospace, Menlo, Consolas, monospace';

/** Fixed, click-through ASCII pond behind the app. Glyph colour follows the theme text colour. */
export function AsciiBackground() {
  const { settings: s } = useAsciiSettings();
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<AsciiBg | null>(null);
  const clipRef = useRef<AsciiClipId | null>(null);
  const [ready, setReady] = useState(false);

  const options = {
    ramp: ASCII_RAMPS[s.ramp],
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    minAlpha: s.minAlpha,
    gain: s.gain,
    speed: s.speed,
    fps: s.fps,
    zoom: s.zoom,
    focusX: s.focusX,
    focusY: s.focusY,
    fontFamily: FONT,
  };
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Mount while enabled; swap the clip in place when it changes.
  useEffect(() => {
    if (!s.enabled) return;
    let cancelled = false;
    (async () => {
      const clip = (await loaders[s.clip]()).default;
      if (cancelled || !canvasRef.current) return;
      if (bgRef.current) {
        if (clipRef.current !== s.clip) await bgRef.current.setClip(clip);
      } else {
        const bg = await mountAsciiBg(canvasRef.current, clip, optionsRef.current);
        if (cancelled) {
          bg.destroy();
          return;
        }
        bgRef.current = bg;
      }
      clipRef.current = s.clip;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [s.enabled, s.clip]);

  useEffect(
    () => () => {
      bgRef.current?.destroy();
      bgRef.current = null;
      clipRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!s.enabled && bgRef.current) {
      bgRef.current.destroy();
      bgRef.current = null;
      clipRef.current = null;
      setReady(false);
    }
  }, [s.enabled]);

  const optionsKey = JSON.stringify(options);
  useEffect(() => {
    void bgRef.current?.set(optionsRef.current);
  }, [optionsKey]);

  // The atlas bakes the CSS colour in, so rebuild it when the theme or colour source changes.
  useEffect(() => {
    void bgRef.current?.refresh();
  }, [theme.id, s.color]);

  if (!s.enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="ascii-bg"
      style={{
        opacity: ready ? s.opacity : 0,
        color: ASCII_COLORS[s.color].css,
        mixBlendMode: s.blend,
      }}
    />
  );
}
