import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  accent: string;
  disabled?: boolean;
  /** Denser layout for CTI HUD. */
  compact?: boolean;
  onChange: (value: number) => void;
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function ChannelSlider({
  label,
  value,
  accent,
  disabled,
  compact,
  onChange,
}: Props) {
  const id = useId();
  const pct = clampPct(value);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        compact ? "gap-1" : "gap-1.5",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <label
          id={id}
          htmlFor={`${id}-range`}
          className={cn(
            "font-[Syne] font-semibold tracking-wide text-teal-50/90",
            compact ? "text-[11px]" : "text-sm",
          )}
        >
          {label}
        </label>
        <span
          className={cn(
            "font-mono font-semibold tabular-nums tracking-tight text-white/90",
            compact ? "text-[11px]" : "text-sm",
          )}
          aria-hidden
        >
          {pct}%
        </span>
      </div>
      <div
        className="channel-slider-wrap"
        style={{
          ["--accent" as string]: accent,
          ["--pct" as string]: `${pct}%`,
        }}
      >
        <div className="channel-slider-track" aria-hidden>
          <div className="channel-slider-fill" />
        </div>
        {/* Custom thumb — native pseudo thumbs still bloom in Chromium */}
        <div className="channel-slider-thumb" aria-hidden />
        <input
          id={`${id}-range`}
          type="range"
          min={0}
          max={100}
          value={pct}
          disabled={disabled}
          onChange={(e) => onChange(clampPct(Number(e.target.value)))}
          className="channel-slider"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        />
      </div>
    </div>
  );
}
