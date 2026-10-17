import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  accent: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

const CX = 56;
const CY = 56;
const R = 42;
/** pathLength units = percent; keeps dash math in 0–100. */
const PATH_LEN = 100;

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Full-circle mapping: 12 o'clock = 0%, clockwise → 100%. */
function valueFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const angle = Math.atan2(clientY - cy, clientX - cx);
  let deg = (angle * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  if (deg >= 360) deg -= 360;
  return clampPct((deg / 360) * 100);
}

export function ChannelDial({
  label,
  value,
  accent,
  disabled,
  onChange,
}: Props) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const pct = clampPct(value);
  const isFull = pct >= 100;
  // Only stroke-dashoffset animates for 1–99 (stays on the ring).
  // At 100%, omit dash styling so the stroke is a true closed circle.
  const progressDasharray = isFull ? undefined : `${PATH_LEN} ${PATH_LEN}`;
  const progressDashoffset = isFull ? undefined : PATH_LEN - pct;
  const ringTransition = dragging ? "none" : "stroke-dashoffset 120ms linear";

  const applyPointer = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el || disabled) return;
    onChange(valueFromPointer(clientX, clientY, el.getBoundingClientRect()));
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 overflow-visible transition-transform duration-300",
        !disabled && "hover:scale-[1.02]",
        disabled && "opacity-45",
      )}
    >
      {/*
        Glow is a padded radial blob behind the SVG (not filter/drop-shadow),
        so column overflow cannot shear it into flat side edges.
      */}
      <div className="relative overflow-visible p-5">
        {pct > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at center, ${accent}55 0%, ${accent}22 42%, transparent 70%)`,
            }}
          />
        )}
        <svg
          ref={svgRef}
          viewBox="0 0 112 112"
          className="relative z-[1] h-36 w-36 touch-none overflow-visible sm:h-40 sm:w-40"
          style={{ overflow: "visible" }}
          role="slider"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={(e) => {
            if (disabled) return;
            draggingRef.current = true;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            applyPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            applyPointer(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
            setDragging(false);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            setDragging(false);
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              onChange(clampPct(pct + 1));
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              onChange(clampPct(pct - 1));
            }
          }}
        >
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="rgba(148, 210, 220, 0.12)"
            strokeWidth="8"
            pathLength={PATH_LEN}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={accent}
            strokeWidth="8"
            strokeLinecap="round"
            pathLength={isFull ? undefined : PATH_LEN}
            strokeDasharray={progressDasharray}
            strokeDashoffset={progressDashoffset}
            /* Solid full ring: no rotate/dash (avoids 12-o'clock join seam). */
            transform={isFull ? undefined : `rotate(-90 ${CX} ${CY})`}
            opacity={pct <= 0 ? 0 : 1}
            style={{
              transition: isFull ? "none" : ringTransition,
            }}
          />
          <text
            x={CX}
            y={CY - 2}
            textAnchor="middle"
            className="fill-white font-[Figtree] text-[22px] font-semibold"
          >
            {pct}
          </text>
          <text
            x={CX}
            y={CY + 16}
            textAnchor="middle"
            className="fill-teal-100/55 font-[Figtree] text-[10px] tracking-[0.18em]"
          >
            %
          </text>
        </svg>
      </div>
      <div className="flex w-full max-w-[11rem] flex-col items-center gap-2">
        <label
          id={id}
          className="font-[Syne] text-sm font-semibold tracking-wide text-teal-50/90"
        >
          {label}
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          disabled={disabled}
          onChange={(e) => onChange(clampPct(Number(e.target.value)))}
          className="channel-slider w-full"
          style={{ accentColor: accent }}
          aria-label={`${label} slider`}
        />
      </div>
    </div>
  );
}
