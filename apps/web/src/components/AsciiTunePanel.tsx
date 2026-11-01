import { useState } from "react";
import {
  ASCII_COLORS,
  ASCII_RAMPS,
  useAsciiSettings,
  type AsciiBlendId,
  type AsciiClipId,
  type AsciiColorId,
  type AsciiRampId,
  type AsciiSettings,
} from "@/components/AsciiBackground";

const BLENDS: AsciiBlendId[] = ["normal", "soft-light", "overlay", "multiply", "screen", "plus-lighter"];

type NumKey =
  | "opacity"
  | "minAlpha"
  | "gain"
  | "fontSize"
  | "lineHeight"
  | "speed"
  | "fps"
  | "zoom"
  | "focusX"
  | "focusY";

const SLIDERS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: "opacity", label: "Strength", min: 0, max: 1, step: 0.01 },
  { key: "minAlpha", label: "Faint glyphs", min: 0, max: 1, step: 0.01 },
  { key: "gain", label: "Gain", min: 0.1, max: 6, step: 0.05 },
  { key: "fontSize", label: "Cell size", min: 4, max: 64, step: 1 },
  { key: "lineHeight", label: "Line height", min: 0.5, max: 3, step: 0.05 },
  { key: "speed", label: "Speed", min: 0, max: 5, step: 0.05 },
  { key: "fps", label: "Frame rate", min: 2, max: 60, step: 1 },
  { key: "zoom", label: "Zoom", min: 0.3, max: 8, step: 0.05 },
  { key: "focusX", label: "Focus X", min: 0, max: 1, step: 0.01 },
  { key: "focusY", label: "Focus Y", min: 0, max: 1, step: 0.01 },
];

/** Temporary tuning panel, shown with `?tune=1`. */
export function AsciiTunePanel() {
  const { settings, family, update, reset } = useAsciiSettings();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const { enabled: _enabled, ...rest } = settings satisfies AsciiSettings;
    void _enabled;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ [family]: rest }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="ascii-tune" data-open={open}>
      <button type="button" className="ascii-tune-head" onClick={() => setOpen((o) => !o)}>
        Pond tuning · {family} themes {open ? "–" : "+"}
      </button>
      {open ? (
        <div className="ascii-tune-body">
          <label>
            <span>Pond</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
          </label>
          <label>
            <span>Clip</span>
            <select
              value={settings.clip}
              onChange={(e) => update({ clip: e.target.value as AsciiClipId })}
            >
              <option value="koi">Koi wide</option>
              <option value="koi-close">Koi close</option>
            </select>
          </label>
          <label>
            <span>Glyphs</span>
            <select
              value={settings.ramp}
              onChange={(e) => update({ ramp: e.target.value as AsciiRampId })}
            >
              {Object.keys(ASCII_RAMPS).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Colour</span>
            <select
              value={settings.color}
              onChange={(e) => update({ color: e.target.value as AsciiColorId })}
            >
              {(Object.keys(ASCII_COLORS) as AsciiColorId[]).map((k) => (
                <option key={k} value={k}>
                  {ASCII_COLORS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Blend</span>
            <select
              value={settings.blend}
              onChange={(e) => update({ blend: e.target.value as AsciiBlendId })}
            >
              {BLENDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {SLIDERS.map((sl) => (
            <label key={sl.key}>
              <span>{sl.label}</span>
              <input
                type="range"
                min={sl.min}
                max={sl.max}
                step={sl.step}
                value={settings[sl.key]}
                onChange={(e) => update({ [sl.key]: Number(e.target.value) })}
              />
              <output>{settings[sl.key]}</output>
            </label>
          ))}
          <div className="ascii-tune-actions">
            <button type="button" onClick={copy}>
              {copied ? "Copied" : "Copy values"}
            </button>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
