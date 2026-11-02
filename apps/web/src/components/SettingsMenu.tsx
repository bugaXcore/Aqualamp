import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Cog, Settings } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useAsciiSettings } from "@/components/AsciiBackground";
import { THEMES, useTheme } from "@/lib/themes";
import { useKoiControls } from "@/lib/koiControls";
import { useLampMode, type LampMode } from "@/lib/lampMode";

const MODE_INFO: { id: LampMode; title: string; pros: string; cons: string }[] = [
  {
    id: "hardware",
    title: "Hardware",
    pros: "Runs on the lamp itself, so it keeps going with the app closed or the PC off. The graph matches what the lamp does.",
    cons: "Colours change in steps (up to 5), not smooth fades.",
  },
  {
    id: "app",
    title: "App",
    pros: "Smooth fades and curves between keys.",
    cons: "The app must stay open and connected. When it closes, the lamp holds its last colour.",
  },
];

/**
 * Gear button plus its menu. One element, two presentations (see .settings-panel in
 * index.css): an anchored popover from the `sm` breakpoint up, a bottom sheet on phones.
 * Theme is the only option for now; add new rows as sections inside the body.
 */
export function SettingsMenu({
  calibrated,
  onCalibratedChange,
}: {
  calibrated: boolean;
  onCalibratedChange: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const panelId = useId();
  const themeId = useId();
  const koiId = useId();
  const calId = useId();
  const modeId = useId();
  const [lampMode, setLampMode] = useLampMode();
  const activeMode = MODE_INFO.find((m) => m.id === lampMode) ?? MODE_INFO[0]!;
  const [, setKoiControls] = useKoiControls();
  const { settings: ascii, update } = useAsciiSettings();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    selectRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const light = THEMES.filter((t) => t.mode === "light");
  const dark = THEMES.filter((t) => t.mode === "dark");

  return (
    <div className="settings-root">
      <IconButton
        ref={btnRef}
        label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        data-open={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings className="settings-gear" aria-hidden />
      </IconButton>

      <div className="settings-scrim" data-open={open} aria-hidden />
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label="Settings"
        className="settings-panel"
        data-open={open}
        inert={!open}
      >
        <div className="settings-grab" aria-hidden />
        <div className="settings-body">
          <label htmlFor={themeId} className="settings-row">
            <span className="settings-row-text">
              <span className="font-medium">Theme</span>
              <span className="settings-hint">Colours for the whole app</span>
            </span>
            <span className="settings-select-wrap">
              <select
                ref={selectRef}
                id={themeId}
                className="settings-select"
                value={theme.id}
                onChange={(e) => setTheme(e.target.value)}
              >
                <optgroup label="Dark">
                  {dark.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Light">
                  {light.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="settings-chevron" aria-hidden />
            </span>
          </label>
          <label htmlFor={koiId} className="settings-row">
            <span className="settings-row-text">
              <span className="font-medium">Background animation</span>
              <span className="settings-hint">Koi pond drifting behind the app</span>
            </span>
            <span className="flex items-center gap-2">
              {ascii.enabled && (
                <button
                  type="button"
                  aria-label="Tune background animation"
                  title="Tune background animation"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-teal-100/80 transition hover:bg-teal-400/20 hover:text-teal-50"
                  onClick={(e) => {
                    e.preventDefault();
                    setKoiControls(true);
                    close(false);
                  }}
                >
                  <Cog className="h-4 w-4" aria-hidden />
                </button>
              )}
              <input
                id={koiId}
                type="checkbox"
                className="h-4 w-4 accent-teal-300"
                checked={ascii.enabled}
                onChange={(e) => {
                  update({ enabled: e.target.checked });
                  if (!e.target.checked) setKoiControls(false);
                }}
              />
            </span>
          </label>
          <label htmlFor={modeId} className="settings-row">
            <span className="settings-row-text">
              <span className="font-medium">Lamp mode</span>
              <span className="settings-hint">How presets run on the lamp</span>
            </span>
            <span className="settings-select-wrap">
              <select
                id={modeId}
                className="settings-select"
                value={lampMode}
                onChange={(e) => setLampMode(e.target.value as LampMode)}
              >
                <option value="hardware">Hardware</option>
                <option value="app">App</option>
              </select>
              <ChevronDown className="settings-chevron" aria-hidden />
            </span>
          </label>
          <div
            className="settings-hint mb-2 space-y-0.5 px-3"
            aria-label="Lamp mode details"
          >
            <span className="block">+ {activeMode.pros}</span>
            <span className="block">− {activeMode.cons}</span>
          </div>
          <label htmlFor={calId} className="settings-row">
            <span className="settings-row-text">
              <span className="font-medium">Even brightness</span>
              <span className="settings-hint">
                Makes a 50% slider look half as bright. Sent values then differ from the sliders.
              </span>
            </span>
            <input
              id={calId}
              type="checkbox"
              className="h-4 w-4 accent-teal-300"
              checked={calibrated}
              onChange={(e) => onCalibratedChange(e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
