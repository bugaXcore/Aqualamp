import { useMemo, useState } from "react";
import { compileSchedule } from "@aqualamp/core";
import { Button } from "@/components/ui/button";
import type { LampControlsApi } from "@/lib/bridge";
import { interpolateAt, isFreeManualPreset, type DayPreset } from "@/lib/presets";

const FADES = ["No fade", "30 min", "1 h", "1 h 30", "2 h", "2 h 30"];

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function toTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
}

const fieldClass =
  "h-9 rounded-lg border border-teal-200/25 bg-white/5 px-2 text-sm text-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/70";

export function LampControls({ lamp, preset }: { lamp: LampControlsApi; preset?: DayPreset | null }) {
  const [sunrise, setSunrise] = useState("08:00");
  const [sunset, setSunset] = useState("20:00");
  const [fade, setFade] = useState(0);
  const timerInvalid = toMinutes(sunset) <= toMinutes(sunrise);
  const runnable = Boolean(preset) && !isFreeManualPreset(preset!);
  const windows = useMemo(
    () => (runnable && preset ? compileSchedule((m) => interpolateAt(preset, m)) : []),
    [runnable, preset],
  );

  return (
    <details className="rounded-2xl border border-teal-200/15 bg-white/[0.03] px-4 py-3">
      <summary className="cursor-pointer select-none text-sm font-medium text-teal-50">
        Lamp controls
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-teal-100/90">Power</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => lamp.power(true)}>
              Turn on
            </Button>
            <Button size="sm" variant="outline" onClick={() => lamp.power(false)}>
              Turn off
            </Button>
          </div>
          <p className="text-xs text-teal-100/55">
            Turn on uses the app&apos;s default colour. Colours take about 15 seconds to settle.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-teal-100/90">Lamp program</p>
          <div className="flex gap-2" role="group" aria-label="Lamp program">
            <Button
              size="sm"
              variant={lamp.mode === 1 ? "default" : "outline"}
              aria-pressed={lamp.mode === 1}
              onClick={() => lamp.setMode(1)}
            >
              Daily window
            </Button>
            <Button
              size="sm"
              variant={lamp.mode === 2 ? "default" : "outline"}
              aria-pressed={lamp.mode === 2}
              onClick={() => lamp.setMode(2)}
            >
              Advanced
            </Button>
          </div>
          <p className="text-xs text-teal-100/55">
            Sliders only show in Daily window. Advanced runs the lamp&apos;s own five-slot schedule.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-teal-100/90">Daily window</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-teal-100/70">
              On
              <input
                type="time"
                className={fieldClass}
                value={sunrise}
                onChange={(e) => setSunrise(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-teal-100/70">
              Off
              <input
                type="time"
                className={fieldClass}
                value={sunset}
                onChange={(e) => setSunset(e.target.value)}
              />
            </label>
            <select
              className={fieldClass}
              aria-label="Fade"
              value={fade}
              onChange={(e) => setFade(Number(e.target.value))}
            >
              {FADES.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={timerInvalid}
              onClick={() => lamp.setTimer(toTime(sunrise), toTime(sunset), fade)}
            >
              Save to lamp
            </Button>
            {timerInvalid ? (
              <span className="text-xs text-rose-200/90">Off time must be after on time.</span>
            ) : null}
          </div>
          <p className="text-xs text-teal-100/55">
            The lamp is dark outside this window. Connecting resets it to all day so your colours are visible.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-teal-200/10 pt-4">
        <p className="text-sm font-medium text-teal-100/90">Run a day preset on the lamp</p>
        {runnable && preset ? (
          <>
            <p className="text-xs text-teal-100/70">
              {preset.name}: {windows.map((w) => `${clock(w.startMin)}–${clock(w.endMin)}`).join(", ")}
            </p>
            <div>
              <Button size="sm" variant="outline" onClick={() => lamp.setSchedule(windows)}>
                Send to lamp
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-teal-100/55">Pick a day preset below to send it to the lamp.</p>
        )}
        <p className="text-xs text-teal-100/55">
          The lamp has five schedule slots and holds one colour in each, so a smooth day becomes up to five steps.
          Once sent it runs by itself, even with this app closed.
        </p>
      </div>

      <label className="mt-5 flex items-start gap-2 text-sm text-teal-100/80">
        <input
          type="checkbox"
          className="mt-1"
          checked={lamp.calibrated}
          onChange={(e) => lamp.setCalibrated(e.target.checked)}
        />
        <span>
          Even brightness
          <span className="block text-xs text-teal-100/55">
            Evens out the lamp&apos;s uneven brightness curve so a 50% slider looks half as bright. Slider values then differ from what is sent to the lamp.
          </span>
        </span>
      </label>
    </details>
  );
}
