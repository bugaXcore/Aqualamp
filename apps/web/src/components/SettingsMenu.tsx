import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { THEMES, useTheme } from "@/lib/themes";
import { useKoiControls } from "@/lib/koiControls";

/**
 * Gear button plus its menu. One element, two presentations (see .settings-panel in
 * index.css): an anchored popover from the `sm` breakpoint up, a bottom sheet on phones.
 * Theme is the only option for now; add new rows as sections inside the body.
 */
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const panelId = useId();
  const themeId = useId();
  const koiId = useId();
  const [koiControls, setKoiControls] = useKoiControls();

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
              <span className="font-medium">Koi controls</span>
              <span className="settings-hint">Show the pond tuning panel</span>
            </span>
            <input
              id={koiId}
              type="checkbox"
              className="h-4 w-4 accent-teal-300"
              checked={koiControls}
              onChange={(e) => setKoiControls(e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
