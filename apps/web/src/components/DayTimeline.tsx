import { useRef, useState } from "react";
import { Activity, Sliders } from "lucide-react";
import type { Channels } from "@/lib/bridge";
import {
  clampMinutes,
  interpolateAt,
  minsToTime,
  type DayPreset,
  type Keyframe,
} from "@/lib/presets";
import { cn } from "@/lib/utils";

export type TimelineWorkspaceMode = "edit" | "live";

const W = 1000;
const H = 140;
const PAD_TOP = 28;
const PAD_BOTTOM = 22;
const Y0 = H - PAD_BOTTOM;
const YSPAN = H - PAD_TOP - PAD_BOTTOM;

const CHANNEL_STROKE: Record<keyof Channels, string> = {
  red: "#f87171",
  green: "#4ade80",
  blue: "#60a5fa",
  uv: "#c084fc",
};

type Props = {
  preset: DayPreset | null;
  selectedKeyframeId: string | null;
  playheadMinutes: number;
  workspaceMode: TimelineWorkspaceMode;
  /** Built-in / locked composition — scrub OK, no keyframe writes */
  compositionLocked?: boolean;
  onWorkspaceModeChange: (mode: TimelineWorkspaceMode) => void;
  onScrub: (minutes: number) => void;
  onSelectKeyframe: (id: string | null) => void;
  onMoveKeyframe: (id: string, minutes: number) => void;
  onAddKeyframe: (minutes: number, channels: Channels) => void;
};

function yFor(value: number): number {
  return Y0 - (Math.min(100, Math.max(0, value)) / 100) * YSPAN;
}

/** Cubic path through nodes, holding edge levels to day bounds. */
function cubicThrough(nodes: { x: number; y: number }[]): string {
  if (nodes.length === 0) return `M 0,${Y0} L ${W},${Y0}`;
  if (nodes.length === 1) {
    const y = nodes[0]!.y;
    return `M 0,${y} L ${W},${y}`;
  }
  let d = `M 0,${nodes[0]!.y} L ${nodes[0]!.x},${nodes[0]!.y}`;
  for (let i = 0; i < nodes.length - 1; i++) {
    const p1 = nodes[i]!;
    const p2 = nodes[i + 1]!;
    const dx = p2.x - p1.x;
    const cp1x = p1.x + dx / 3;
    const cp2x = p2.x - dx / 3;
    d += ` C ${cp1x},${p1.y} ${cp2x},${p2.y} ${p2.x},${p2.y}`;
  }
  const last = nodes[nodes.length - 1]!;
  d += ` L ${W},${last.y}`;
  return d;
}

/** Dense eased samples — fallback / constant-aware fill. */
function sampleCurve(
  preset: DayPreset,
  channel: keyof Channels,
  steps = 72,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mins = Math.round((i / steps) * 1439);
    const ch = interpolateAt(preset, mins);
    out.push({ x: (mins / 1440) * W, y: yFor(ch[channel]) });
  }
  return out;
}

function smoothPolyline(samples: { x: number; y: number }[]): string {
  if (samples.length === 0) return `M 0,${Y0} L ${W},${Y0}`;
  if (samples.length < 3) {
    return samples
      .map((s, i) => `${i === 0 ? "M" : "L"} ${s.x},${s.y}`)
      .join(" ");
  }
  // Catmull-Rom → cubic for gentle sampled paths
  let d = `M ${samples[0]!.x},${samples[0]!.y}`;
  for (let i = 0; i < samples.length - 1; i++) {
    const p0 = samples[Math.max(0, i - 1)]!;
    const p1 = samples[i]!;
    const p2 = samples[i + 1]!;
    const p3 = samples[Math.min(samples.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function pathForChannel(preset: DayPreset, channel: keyof Channels): string {
  if (preset.mode === "constant") {
    const y = yFor(preset.constantChannels[channel]);
    return `M 0,${y} L ${W},${y}`;
  }
  const sorted = [...preset.keyframes].sort((a, b) => a.minutes - b.minutes);
  if (sorted.length >= 2) {
    return cubicThrough(
      sorted.map((k) => ({
        x: (k.minutes / 1440) * W,
        y: yFor(k.channels[channel]),
      })),
    );
  }
  return smoothPolyline(sampleCurve(preset, channel));
}

export function DayTimeline({
  preset,
  selectedKeyframeId,
  playheadMinutes,
  workspaceMode,
  compositionLocked = false,
  onWorkspaceModeChange,
  onScrub,
  onSelectKeyframe,
  onMoveKeyframe,
  onAddKeyframe,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);

  const isEdit = workspaceMode === "edit";
  const isLive = workspaceMode === "live";
  const canCompose = isEdit && !compositionLocked;

  const minsFromEvent = (clientX: number, snap: boolean): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = rect.width <= 0 ? 0 : x / rect.width;
    const raw = pct * 1440;
    if (!snap) {
      return Math.min(1439, Math.max(0, Math.round(raw)));
    }
    return clampMinutes(raw, preset?.snap ?? "free");
  };

  const sorted: Keyframe[] = preset
    ? [...preset.keyframes].sort((a, b) => a.minutes - b.minutes)
    : [];

  const paths = preset
    ? {
        red: pathForChannel(preset, "red"),
        green: pathForChannel(preset, "green"),
        blue: pathForChannel(preset, "blue"),
        uv: pathForChannel(preset, "uv"),
      }
    : null;

  const ctiX = (playheadMinutes / 1440) * W;
  const schedule = preset?.mode === "schedule";

  const hint = !preset
    ? "Select a preset to compose or play back the day."
    : isLive
      ? "LIVE — clock-synced playback · dials are telemetry"
      : compositionLocked
        ? "EDIT — built-in read-only · scrub to preview · Duplicate to edit"
        : preset.mode === "constant"
          ? "EDIT — constant levels · Save to keep changes"
          : "EDIT — scrub CTI · dials write a keyframe · Save to keep";

  return (
    <div className="timeline-panel">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="font-[Syne] text-sm font-semibold tracking-wide text-teal-50/90">
            24-hour timeline
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-teal-100/50">{hint}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div
            className="timeline-mode-switch"
            role="group"
            aria-label="Timeline workspace mode"
          >
            <button
              type="button"
              aria-pressed={isEdit}
              onClick={() => onWorkspaceModeChange("edit")}
              className={cn("timeline-mode-btn", isEdit && "is-active")}
            >
              <Sliders className="h-3 w-3" />
              EDIT
            </button>
            <button
              type="button"
              aria-pressed={isLive}
              onClick={() => onWorkspaceModeChange("live")}
              className={cn("timeline-mode-btn", isLive && "is-active is-live")}
            >
              <Activity className={cn("h-3 w-3", isLive && "animate-pulse")} />
              LIVE
            </button>
          </div>
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums tracking-wide",
              isLive ? "text-teal-300/90" : "text-teal-200/70",
            )}
          >
            {minsToTime(playheadMinutes)}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "timeline-canvas relative mt-3 overflow-hidden rounded-2xl border",
          isLive
            ? "border-teal-400/25 timeline-canvas-live"
            : "border-teal-200/10",
          !preset && "opacity-55",
        )}
      >
        {isLive && (
          <div className="pointer-events-none absolute top-2.5 left-3 z-[1] flex items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-950/50 px-2 py-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />
            <span className="font-[Figtree] text-[10px] font-semibold tracking-[0.14em] text-teal-200/80 uppercase">
              Locked · telemetry
            </span>
          </div>
        )}

        <svg
          ref={svgRef}
          className={cn(
            "h-48 w-full touch-none select-none sm:h-56",
            !preset
              ? "cursor-default"
              : isLive
                ? "cursor-not-allowed"
                : "cursor-ew-resize",
          )}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerDown={(e) => {
            if (!preset || !isEdit) return;
            if ((e.target as Element).closest("[data-kf]")) return;
            const mins = minsFromEvent(e.clientX, false);
            setDraggingPlayhead(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            onSelectKeyframe(null);
            onScrub(mins);
          }}
          onPointerMove={(e) => {
            if (!preset || !isEdit) return;
            if (draggingNode && canCompose) {
              onMoveKeyframe(draggingNode, minsFromEvent(e.clientX, true));
              return;
            }
            if (!draggingPlayhead) return;
            onScrub(minsFromEvent(e.clientX, false));
          }}
          onPointerUp={(e) => {
            setDraggingPlayhead(false);
            setDraggingNode(null);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onDoubleClick={(e) => {
            if (!preset || !canCompose || preset.mode !== "schedule") return;
            if ((e.target as Element).closest("[data-kf]")) return;
            const mins = minsFromEvent(e.clientX, true);
            onAddKeyframe(mins, interpolateAt(preset, mins));
          }}
        >
          <defs>
            <linearGradient id="tl-depth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(45, 212, 191, 0.06)" />
              <stop offset="100%" stopColor="rgba(6, 16, 24, 0)" />
            </linearGradient>
            <filter id="cti-glow" x="-50%" y="-20%" width="200%" height="140%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x={0} y={0} width={W} height={H} fill="url(#tl-depth)" />

          {/* Soft horizontal grid */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const y = yFor(pct);
            return (
              <line
                key={pct}
                x1={0}
                y1={y}
                x2={W}
                y2={y}
                stroke="rgba(148, 210, 220, 0.07)"
                strokeWidth={1}
              />
            );
          })}

          {/* Hour ticks */}
          {Array.from({ length: 25 }, (_, hour) => {
            const x = (hour / 24) * W;
            const major = hour % 4 === 0;
            return (
              <line
                key={hour}
                x1={x}
                y1={Y0}
                x2={x}
                y2={Y0 + (major ? 8 : 4)}
                stroke={
                  major
                    ? "rgba(148, 210, 220, 0.28)"
                    : "rgba(148, 210, 220, 0.12)"
                }
                strokeWidth={1}
              />
            );
          })}
          {/* Soft vertical hour guides */}
          {[0, 4, 8, 12, 16, 20, 24].map((hour) => (
            <line
              key={`g-${hour}`}
              x1={(hour / 24) * W}
              y1={PAD_TOP}
              x2={(hour / 24) * W}
              y2={Y0}
              stroke="rgba(148, 210, 220, 0.05)"
              strokeWidth={1}
            />
          ))}

          <line
            x1={0}
            y1={Y0}
            x2={W}
            y2={Y0}
            stroke="rgba(148, 210, 220, 0.18)"
            strokeWidth={1.25}
          />

          {paths && (
            <g className="timeline-curves" opacity={isLive ? 0.92 : 1}>
              {(
                [
                  ["uv", paths.uv],
                  ["blue", paths.blue],
                  ["green", paths.green],
                  ["red", paths.red],
                ] as const
              ).map(([key, d]) => (
                <path
                  key={key}
                  d={d}
                  fill="none"
                  stroke={CHANNEL_STROKE[key]}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.88}
                />
              ))}
            </g>
          )}

          {schedule &&
            canCompose &&
            sorted.map((kf) => {
              const x = (kf.minutes / 1440) * W;
              const active = selectedKeyframeId === kf.id;
              const r = active ? 5.5 : 4;
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
                    svgRef.current?.setPointerCapture(e.pointerId);
                  }}
                >
                  {kf.label ? <title>{kf.label}</title> : null}
                  <rect
                    x={x - 16}
                    y={PAD_TOP}
                    width={32}
                    height={YSPAN + 8}
                    fill="transparent"
                  />
                  <line
                    x1={x}
                    y1={PAD_TOP + 2}
                    x2={x}
                    y2={Y0}
                    stroke={
                      active
                        ? "rgba(94, 234, 212, 0.55)"
                        : "rgba(148, 210, 220, 0.18)"
                    }
                    strokeWidth={active ? 1.5 : 1}
                    strokeDasharray={active ? undefined : "2 5"}
                  />
                  {(
                    [
                      ["red", kf.channels.red],
                      ["green", kf.channels.green],
                      ["blue", kf.channels.blue],
                      ["uv", kf.channels.uv],
                    ] as const
                  ).map(([ch, val]) => (
                    <polygon
                      key={ch}
                      points={diamond(yFor(val))}
                      fill={CHANNEL_STROKE[ch]}
                      stroke="#061018"
                      strokeWidth={1.15}
                      opacity={0.95}
                    />
                  ))}
                  <rect
                    x={x - 20}
                    y={6}
                    width={40}
                    height={14}
                    rx={4}
                    fill={
                      active
                        ? "rgba(45, 212, 191, 0.9)"
                        : "rgba(8, 24, 36, 0.92)"
                    }
                    stroke={
                      active
                        ? "rgba(94, 234, 212, 0.5)"
                        : "rgba(148, 210, 220, 0.12)"
                    }
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={16}
                    textAnchor="middle"
                    fill={active ? "#061018" : "rgba(186, 230, 228, 0.8)"}
                    fontSize={9}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={700}
                  >
                    {minsToTime(kf.minutes)}
                  </text>
                </g>
              );
            })}

          {/* Dim keyframe markers when locked (LIVE or built-in) */}
          {schedule &&
            !canCompose &&
            sorted.map((kf) => {
              const x = (kf.minutes / 1440) * W;
              return (
                <g key={`live-${kf.id}`} opacity={0.45} pointerEvents="none">
                  <line
                    x1={x}
                    y1={PAD_TOP + 4}
                    x2={x}
                    y2={Y0}
                    stroke="rgba(148, 210, 220, 0.2)"
                    strokeWidth={1}
                    strokeDasharray="2 4"
                  />
                  {(
                    [
                      ["red", kf.channels.red],
                      ["green", kf.channels.green],
                      ["blue", kf.channels.blue],
                      ["uv", kf.channels.uv],
                    ] as const
                  ).map(([ch, val]) => {
                    const cy = yFor(val);
                    const r = 3;
                    return (
                      <circle
                        key={ch}
                        cx={x}
                        cy={cy}
                        r={r}
                        fill={CHANNEL_STROKE[ch]}
                        stroke="#061018"
                        strokeWidth={1}
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* CTI / playhead */}
          <g
            filter="url(#cti-glow)"
            style={{ pointerEvents: isEdit ? "auto" : "none" }}
            className={isEdit ? "cursor-ew-resize" : undefined}
            onPointerDown={(e) => {
              if (!preset || !isEdit) return;
              e.stopPropagation();
              setDraggingPlayhead(true);
              svgRef.current?.setPointerCapture(e.pointerId);
              onSelectKeyframe(null);
              onScrub(minsFromEvent(e.clientX, false));
            }}
          >
            <line
              x1={ctiX}
              y1={4}
              x2={ctiX}
              y2={Y0}
              stroke="#5eead4"
              strokeWidth={2}
              opacity={0.95}
            />
            <polygon
              points={`${ctiX - 7},2 ${ctiX + 7},2 ${ctiX + 7},8 ${ctiX},16 ${ctiX - 7},8`}
              fill="#5eead4"
              stroke="#061018"
              strokeWidth={1}
            />
            <rect
              x={ctiX - 22}
              y={Y0 + 2}
              width={44}
              height={14}
              rx={4}
              fill="rgba(45, 212, 191, 0.18)"
              stroke="rgba(94, 234, 212, 0.35)"
              strokeWidth={1}
            />
            <text
              x={ctiX}
              y={Y0 + 12}
              textAnchor="middle"
              fill="#99f6e4"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
              fontWeight={700}
            >
              {minsToTime(playheadMinutes)}
            </text>
          </g>
        </svg>

        <div className="flex justify-between px-3 pb-2.5 font-mono text-[10px] text-teal-100/40">
          <span>00:00</span>
          <span>04:00</span>
          <span>08:00</span>
          <span>12:00</span>
          <span>16:00</span>
          <span>20:00</span>
          <span>24:00</span>
        </div>
      </div>
    </div>
  );
}
