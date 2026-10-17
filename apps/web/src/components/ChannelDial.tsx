import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  accent: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function valueFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const angle = Math.atan2(clientY - cy, clientX - cx);
  // Map from bottom-left sweep (-135deg .. +135deg) → 0..100
  let deg = (angle * 180) / Math.PI;
  deg = deg + 135;
  if (deg < 0) deg = 0;
  if (deg > 270) deg = 270;
  return Math.round((deg / 270) * 100);
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
  const dragging = useRef(false);

  const start = -135;
  const sweep = (value / 100) * 270;
  const r = 42;
  const c = 56;
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const arc = (from: number, to: number) => {
    const a0 = toRad(from);
    const a1 = toRad(to);
    const x0 = c + r * Math.cos(a0);
    const y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1);
    const y1 = c + r * Math.sin(a1);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };

  const applyPointer = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el || disabled) return;
    const next = valueFromPointer(clientX, clientY, el.getBoundingClientRect());
    onChange(next);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 transition-transform duration-300",
        !disabled && "hover:scale-[1.02]",
        disabled && "opacity-45",
      )}
    >
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox="0 0 112 112"
          className="h-36 w-36 touch-none sm:h-40 sm:w-40"
          role="slider"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={(e) => {
            if (disabled) return;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            applyPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            applyPointer(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              onChange(Math.min(100, value + 1));
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              onChange(Math.max(0, value - 1));
            }
          }}
        >
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="rgba(148, 210, 220, 0.12)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(270 / 360) * 2 * Math.PI * r} 999`}
            transform={`rotate(-135 ${c} ${c})`}
          />
          <path
            d={arc(start, start + Math.max(sweep, 0.01))}
            fill="none"
            stroke={accent}
            strokeWidth="8"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 10px ${accent}88)`,
              transition: dragging.current ? "none" : "d 120ms ease-out",
            }}
          />
          <text
            x={c}
            y={c - 2}
            textAnchor="middle"
            className="fill-white font-[Figtree] text-[22px] font-semibold"
          >
            {value}
          </text>
          <text
            x={c}
            y={c + 16}
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
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="channel-slider w-full"
          style={{ accentColor: accent }}
          aria-label={`${label} slider`}
        />
      </div>
    </div>
  );
}
