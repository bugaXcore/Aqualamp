import { useRef, useState } from "react";
import type { Channels } from "@/lib/bridge";
import {
  clampMinutes,
  interpolateAt,
  minsToTime,
  type DayPreset,
  type Keyframe,
} from "@/lib/presets";
import { cn } from "@/lib/utils";

const W = 1000;
const H = 100;
const Y0 = 90;
const YSPAN = 80;

type Props = {
  preset: DayPreset | null;
  selectedKeyframeId: string | null;
  playheadMinutes: number;
  onScrub: (minutes: number) => void;
  onSelectKeyframe: (id: string | null) => void;
  onMoveKeyframe: (id: string, minutes: number) => void;
  onAddKeyframe: (minutes: number, channels: Channels) => void;
};

function yFor(value: number): number {
  return Y0 - (value / 100) * YSPAN;
}

function buildPath(
  samples: { x: number; y: number }[],
): string {
  if (samples.length === 0) return `M 0,${Y0} L ${W},${Y0}`;
  let d = `M ${samples[0]!.x},${samples[0]!.y}`;
  for (let i = 1; i < samples.length; i++) {
    d += ` L ${samples[i]!.x},${samples[i]!.y}`;
  }
  return d;
}

/** Dense polyline from interpolateAt for smooth curves. */
function sampleCurve(
  preset: DayPreset,
  channel: keyof Channels,
  steps = 96,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mins = Math.round((i / steps) * 1439);
    const ch = interpolateAt(preset, mins);
    out.push({ x: (mins / 1440) * W, y: yFor(ch[channel]) });
  }
  return out;
}

function flatPath(value: number): string {
  const y = yFor(value);
  return `M 0,${y} L ${W},${y}`;
}

export function DayTimeline({
  preset,
  selectedKeyframeId,
  playheadMinutes,
  onScrub,
  onSelectKeyframe,
  onMoveKeyframe,
  onAddKeyframe,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);

  const minsFromEvent = (clientX: number): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = rect.width <= 0 ? 0 : x / rect.width;
    const raw = pct * 1440;
    return clampMinutes(raw, preset?.snap ?? "free");
  };

  const sorted: Keyframe[] = preset
    ? [...preset.keyframes].sort((a, b) => a.minutes - b.minutes)
    : [];

  const paths =
    preset == null
      ? null
      : preset.mode === "constant"
        ? {
            red: flatPath(preset.constantChannels.red),
            green: flatPath(preset.constantChannels.green),
            blue: flatPath(preset.constantChannels.blue),
            uv: flatPath(preset.constantChannels.uv),
          }
        : {
            red: buildPath(sampleCurve(preset, "red")),
            green: buildPath(sampleCurve(preset, "green")),
            blue: buildPath(sampleCurve(preset, "blue")),
            uv: buildPath(sampleCurve(preset, "uv")),
          };

  const ctiX = (playheadMinutes / 1440) * W;
  const schedule = preset?.mode === "schedule";

  return (
    <div className="timeline-panel">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h3 className="font-[Syne] text-sm font-semibold tracking-wide text-teal-50/90">
            24-hour timeline
          </h3>
          <p className="mt-1 text-xs text-teal-100/50">
            {!preset
              ? "Select or create a preset to edit the day."
              : preset.mode === "constant"
                ? "Constant mode — flat channels for the whole day."
                : "Click the graph to place a keyframe · drag nodes · scrub the playhead."}
          </p>
        </div>
        <span className="font-mono text-[11px] text-teal-200/70">
          {minsToTime(playheadMinutes)}
        </span>
      </div>

      <div
        className={cn(
          "timeline-canvas relative mt-3 overflow-hidden rounded-2xl border border-teal-200/10",
          !preset && "opacity-60",
        )}
      >
        <svg
          ref={svgRef}
          className={cn(
            "h-44 w-full touch-none select-none sm:h-52",
            schedule ? "cursor-crosshair" : "cursor-ew-resize",
          )}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={(e) => {
            if (!preset) return;
            if ((e.target as Element).closest("[data-kf]")) return;
            const mins = minsFromEvent(e.clientX);
            setDraggingPlayhead(true);
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            onSelectKeyframe(null);
            onScrub(mins);
          }}
          onPointerMove={(e) => {
            if (!preset) return;
            if (draggingNode) {
              onMoveKeyframe(draggingNode, minsFromEvent(e.clientX));
              return;
            }
            if (!draggingPlayhead) return;
            onScrub(minsFromEvent(e.clientX));
          }}
          onPointerUp={(e) => {
            setDraggingPlayhead(false);
            setDraggingNode(null);
            try {
              (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onDoubleClick={(e) => {
            if (!preset || preset.mode !== "schedule") return;
            if ((e.target as Element).closest("[data-kf]")) return;
            const mins = minsFromEvent(e.clientX);
            const channels = interpolateAt(preset, mins);
            onAddKeyframe(mins, channels);
          }}
        >
          {/* Hour guides */}
          {Array.from({ length: 7 }, (_, i) => {
            const x = (i / 6) * W;
            return (
              <line
                key={i}
                x1={x}
                y1={12}
                x2={x}
                y2={Y0}
                stroke="rgba(148, 210, 220, 0.08)"
                strokeWidth={1}
              />
            );
          })}
          <line
            x1={0}
            y1={50}
            x2={W}
            y2={50}
            stroke="rgba(148, 210, 220, 0.1)"
            strokeWidth={1}
            strokeDasharray="4 6"
          />
          <line
            x1={0}
            y1={Y0}
            x2={W}
            y2={Y0}
            stroke="rgba(148, 210, 220, 0.14)"
            strokeWidth={1}
          />

          {paths && (
            <>
              <path d={paths.uv} fill="none" stroke="#c084fc" strokeWidth={2.2} opacity={0.85} />
              <path d={paths.blue} fill="none" stroke="#60a5fa" strokeWidth={2.2} opacity={0.85} />
              <path d={paths.green} fill="none" stroke="#4ade80" strokeWidth={2.2} opacity={0.85} />
              <path d={paths.red} fill="none" stroke="#f87171" strokeWidth={2.2} opacity={0.85} />
            </>
          )}

          {schedule &&
            sorted.map((kf) => {
              const x = (kf.minutes / 1440) * W;
              const active = selectedKeyframeId === kf.id;
              const r = active ? 5 : 3.5;
              const diamond = (cy: number) =>
                `${x},${cy - r} ${x + r},${cy} ${x},${cy + r} ${x - r},${cy}`;
              return (
                <g
                  key={kf.id}
                  data-kf={kf.id}
                  className="cursor-grab"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingNode(kf.id);
                    onSelectKeyframe(kf.id);
                    onScrub(kf.minutes);
                    (svgRef.current as Element | null)?.setPointerCapture?.(
                      e.pointerId,
                    );
                  }}
                >
                  <rect x={x - 18} y={0} width={36} height={H} fill="transparent" />
                  <line
                    x1={x}
                    y1={14}
                    x2={x}
                    y2={Y0}
                    stroke={active ? "rgba(94, 234, 212, 0.9)" : "rgba(148, 210, 220, 0.25)"}
                    strokeWidth={active ? 2 : 1}
                    strokeDasharray={active ? undefined : "3 4"}
                  />
                  <polygon points={diamond(yFor(kf.channels.red))} fill="#f87171" stroke="#061018" strokeWidth={1.2} />
                  <polygon points={diamond(yFor(kf.channels.green))} fill="#4ade80" stroke="#061018" strokeWidth={1.2} />
                  <polygon points={diamond(yFor(kf.channels.blue))} fill="#60a5fa" stroke="#061018" strokeWidth={1.2} />
                  <polygon points={diamond(yFor(kf.channels.uv))} fill="#c084fc" stroke="#061018" strokeWidth={1.2} />
                  <rect
                    x={x - 22}
                    y={2}
                    width={44}
                    height={12}
                    rx={3}
                    fill={active ? "rgba(45, 212, 191, 0.85)" : "rgba(13, 33, 55, 0.95)"}
                  />
                  <text
                    x={x}
                    y={11}
                    textAnchor="middle"
                    fill={active ? "#061018" : "rgba(148, 210, 220, 0.75)"}
                    fontSize={9}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={700}
                  >
                    {minsToTime(kf.minutes)}
                  </text>
                </g>
              );
            })}

          {/* Playhead */}
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={ctiX}
              y1={0}
              x2={ctiX}
              y2={H}
              stroke="#5eead4"
              strokeWidth={2}
              opacity={0.9}
            />
            <polygon
              points={`${ctiX - 6},0 ${ctiX + 6},0 ${ctiX + 6},6 ${ctiX},12 ${ctiX - 6},6`}
              fill="#5eead4"
              stroke="#061018"
              strokeWidth={1}
            />
          </g>
        </svg>

        <div className="flex justify-between px-3 pb-2 font-mono text-[10px] text-teal-100/40">
          <span>00:00</span>
          <span>04:00</span>
          <span>08:00</span>
          <span>12:00</span>
          <span>16:00</span>
          <span>20:00</span>
          <span>24:00</span>
        </div>
      </div>

      {schedule && (
        <p className="mt-2 text-[11px] text-teal-100/40">
          Double-click to add a keyframe at the playhead · dials edit the selected node
        </p>
      )}
    </div>
  );
}
