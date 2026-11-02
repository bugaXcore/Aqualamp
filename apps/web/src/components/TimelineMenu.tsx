import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus, Settings } from "lucide-react";
import {
  minsToTime,
  SNAP_STEP_MIN,
  type CurveStyle,
  type SnapMode,
} from "@/lib/presets";
import { cn } from "@/lib/utils";

export type MenuChannel = { key: string; label: string; color: string };

type Props = {
  snap: SnapMode;
  curve: CurveStyle;
  showCurve?: boolean;
  /** Net shift applied to this draft, in minutes (wrapped to -720..720). */
  shiftMinutes: number;
  keyCount: number;
  /** A saved version exists and the draft differs from it. */
  canReset: boolean;
  channels: MenuChannel[];
  visible: Record<string, boolean>;
  onShiftAll: (deltaMinutes: number) => void;
  onReset: () => void;
  onCurveChange: (curve: CurveStyle) => void;
  onToggleChannel: (key: string) => void;
  onClearKeys: () => void;
};

export function formatShift(mins: number): string {
  if (mins === 0) return "0 min";
  const sign = mins > 0 ? "+" : "−";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-md border border-teal-200/10 bg-depth-900/70 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wide transition",
            value === o.value
              ? "bg-teal-400/20 text-teal-100"
              : "text-teal-100/45 hover:text-teal-100/75",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Heading = ({ children }: { children: string }) => (
  <span className="font-mono text-[8px] tracking-wide text-teal-100/40 uppercase">
    {children}
  </span>
);

/** Cog + popover with global timeline options. Styled like the key editor. */
export function TimelineMenu({
  snap,
  curve,
  showCurve = true,
  shiftMinutes,
  keyCount,
  canReset,
  channels,
  visible,
  onShiftAll,
  onReset,
  onCurveChange,
  onToggleChannel,
  onClearKeys,
}: Props) {
  const [open, setOpen] = useState(false);
  const [armClear, setArmClear] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const step = SNAP_STEP_MIN[snap];
  const fineStep = snap === "free" ? 15 : step < 60 ? step : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!armClear) return;
    const id = window.setTimeout(() => setArmClear(false), 3000);
    return () => window.clearTimeout(id);
  }, [armClear]);

  const nudge = (label: string, delta: number) => (
    <button
      type="button"
      aria-label={`Shift ${delta > 0 ? "later" : "earlier"} by ${label}`}
      onClick={() => onShiftAll(delta)}
      className="flex h-6 min-w-[2.1rem] items-center justify-center gap-0.5 rounded border border-teal-200/15 bg-depth-900/90 px-1 font-mono text-[10px] text-teal-50 transition hover:border-teal-400/35 hover:bg-teal-400/10"
    >
      {delta < 0 ? (
        <Minus className="h-2.5 w-2.5" aria-hidden />
      ) : (
        <Plus className="h-2.5 w-2.5" aria-hidden />
      )}
      {label}
    </button>
  );

  const rowBtn =
    "flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[11px] transition";

  return (
    <div
      className="relative z-50"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        title="Timeline options"
        aria-label="Timeline options"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md border bg-depth-950/70 text-teal-100/60 backdrop-blur-sm transition hover:text-teal-50",
          open ? "border-teal-400/40 text-teal-50" : "border-teal-200/15",
        )}
      >
        <Settings className="h-3 w-3" aria-hidden />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Timeline options"
          className="absolute top-8 right-0 w-[14.5rem] rounded-lg border border-teal-300/20 bg-depth-950/92 px-2 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.5)] backdrop-blur-md"
        >
          <div className="mb-1 flex items-center justify-between">
            <Heading>Offset all keys</Heading>
            <span
              className={cn(
                "font-mono text-[9px] tabular-nums",
                shiftMinutes === 0 ? "text-teal-100/35" : "text-amber-200/85",
              )}
            >
              {formatShift(shiftMinutes)}
              {shiftMinutes !== 0 ? " · unsaved" : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <div className="flex gap-1">
              {nudge("1h", -60)}
              {fineStep > 0 && nudge(`${fineStep}m`, -fineStep)}
            </div>
            <div className="flex gap-1">
              {fineStep > 0 && nudge(`${fineStep}m`, fineStep)}
              {nudge("1h", 60)}
            </div>
          </div>
          <p className="mt-1 font-mono text-[8px] leading-snug text-teal-100/35">
            Wraps past {minsToTime(0)} · Cancel undoes it
          </p>

          <div className="my-1.5 border-t border-teal-200/10" />

          {showCurve && (
            <>
              <div className="mb-1">
                <Heading>Curve</Heading>
              </div>
              <Segmented<CurveStyle>
                label="Curve shape"
                value={curve}
                onChange={onCurveChange}
                options={[
                  { value: "smooth", label: "Smooth" },
                  { value: "sharp", label: "Sharp" },
                ]}
              />
            </>
          )}
          <div className="mt-1.5 mb-1">
            <Heading>Show curves</Heading>
          </div>
          <div className="flex gap-1">
            {channels.map((c) => {
              const on = visible[c.key] !== false;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleChannel(c.key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded border px-1 py-0.5 font-mono text-[9px] transition",
                    on
                      ? "border-teal-200/20 text-teal-50"
                      : "border-teal-200/10 text-teal-100/35",
                  )}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: c.color,
                      opacity: on ? 1 : 0.3,
                    }}
                  />
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="my-1.5 border-t border-teal-200/10" />

          <button
            type="button"
            disabled={!canReset}
            onClick={onReset}
            className={cn(
              rowBtn,
              canReset
                ? "text-teal-100/80 hover:bg-teal-400/10 hover:text-teal-50"
                : "cursor-not-allowed text-teal-100/30",
            )}
          >
            <span>Reset to saved</span>
            {!canReset && (
              <span className="font-mono text-[8px] tracking-wide uppercase">
                Nothing to undo
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={keyCount === 0}
            onClick={() => {
              if (!armClear) {
                setArmClear(true);
                return;
              }
              setArmClear(false);
              onClearKeys();
            }}
            className={cn(
              rowBtn,
              keyCount === 0
                ? "cursor-not-allowed text-teal-100/30"
                : armClear
                  ? "bg-rose-400/15 text-rose-100"
                  : "text-rose-200/80 hover:bg-rose-400/10 hover:text-rose-100",
            )}
          >
            <span>{armClear ? "Click again to clear" : "Clear all keys"}</span>
            <span className="font-mono text-[8px] tracking-wide uppercase">
              {keyCount} {keyCount === 1 ? "key" : "keys"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
