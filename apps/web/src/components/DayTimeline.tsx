import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { ChannelSlider } from "@/components/ChannelSlider";
import { SolarAssistStrip } from "@/components/SolarAssistStrip";
import type { Channels } from "@/lib/bridge";
import {
  clampMinutes,
  interpolateAt,
  minsToTime,
  timeToMins,
  type DayPreset,
  type Keyframe,
  type RampKind,
} from "@/lib/presets";
import { listLinkedRamps, type SolarApplyInput } from "@/lib/ramps";
import { cn } from "@/lib/utils";

const W = 1000;
const H = 140;
const PAD_TOP = 28;
const PAD_BOTTOM = 22;
const Y0 = H - PAD_BOTTOM;
const YSPAN = H - PAD_TOP - PAD_BOTTOM;

/** Screen-space diamond points, countering preserveAspectRatio=none distortion. */
function diamondPoints(
  cx: number,
  cy: number,
  screenR: number,
  sx: number,
  sy: number,
): string {
  const rx = screenR / Math.max(sx, 0.001);
  const ry = screenR / Math.max(sy, 0.001);
  return `${cx},${cy - ry} ${cx + rx},${cy} ${cx},${cy + ry} ${cx - rx},${cy}`;
}

const CHANNEL_STROKE: Record<keyof Channels, string> = {
  red: "#f87171",
  green: "#4ade80",
  blue: "#60a5fa",
  uv: "#c084fc",
};

const CHANNEL_META: { key: keyof Channels; label: string; accent: string }[] = [
  { key: "red", label: "Red", accent: CHANNEL_STROKE.red },
  { key: "green", label: "Green", accent: CHANNEL_STROKE.green },
  { key: "blue", label: "Blue", accent: CHANNEL_STROKE.blue },
  { key: "uv", label: "UV", accent: CHANNEL_STROKE.uv },
];

type Props = {
  preset: DayPreset | null;
  selectedKeyframeId: string | null;
  playheadMinutes: number;
  /** Compose = free CTI + HUD; playback = clock CTI, no compose chrome */
  composing: boolean;
  /** Built-in / locked composition — scrub OK, no keyframe writes */
  compositionLocked?: boolean;
  /** When true (compose + user preset), description is an editable textarea. */
  descriptionEditable?: boolean;
  onScrub: (minutes: number) => void;
  onSelectKeyframe: (id: string | null) => void;
  onMoveKeyframe: (id: string, minutes: number) => void;
  onAddKeyframe: (minutes: number, channels: Channels) => void;
  onDeleteKeyframe: (id: string) => void;
  onKeyframeChannelChange: (id: string, key: keyof Channels, value: number) => void;
  onApplySolarRamp?: (input: SolarApplyInput) => void;
  onMoveRampEdge?: (
    kind: RampKind,
    edge: "start" | "end",
    minutes: number,
  ) => void;
  onDescriptionChange?: (description: string) => void;
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
  composing,
  compositionLocked = false,
  descriptionEditable = false,
  onScrub,
  onSelectKeyframe,
  onMoveKeyframe,
  onAddKeyframe,
  onDeleteKeyframe,
  onKeyframeChannelChange,
  onApplySolarRamp,
  onMoveRampEdge,
  onDescriptionChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [draggingRamp, setDraggingRamp] = useState<{
    kind: RampKind;
    edge: "start" | "end";
  } | null>(null);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  /** Client px size — used so diamonds/chips stay undistorted under none-aspect SVG. */
  const [svgPx, setSvgPx] = useState({ w: W, h: H });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSvgPx({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sx = svgPx.w / W;
  const sy = svgPx.h / H;

  const isPlayback = !composing;
  const canCompose = composing && !compositionLocked;
  const schedule = preset?.mode === "schedule";
  const showCtiChrome = Boolean(canCompose && schedule && preset);

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

  const sorted: Keyframe[] = useMemo(
    () =>
      preset
        ? [...preset.keyframes].sort((a, b) => a.minutes - b.minutes)
        : [],
    [preset],
  );

  const snappedPlayhead = clampMinutes(
    playheadMinutes,
    preset?.snap ?? "free",
  );

  /** Selected key, or key exactly at snapped CTI. */
  const activeKeyframe: Keyframe | null = useMemo(() => {
    if (!preset || !schedule) return null;
    if (selectedKeyframeId) {
      return sorted.find((k) => k.id === selectedKeyframeId) ?? null;
    }
    return sorted.find((k) => k.minutes === snappedPlayhead) ?? null;
  }, [preset, schedule, selectedKeyframeId, sorted, snappedPlayhead]);

  const showHud = showCtiChrome && Boolean(activeKeyframe);
  const linkedRamps = useMemo(
    () => (preset && schedule ? listLinkedRamps(preset) : []),
    [preset, schedule],
  );

  const paths = preset
    ? {
        red: pathForChannel(preset, "red"),
        green: pathForChannel(preset, "green"),
        blue: pathForChannel(preset, "blue"),
        uv: pathForChannel(preset, "uv"),
      }
    : null;

  const ctiPct = (playheadMinutes / 1440) * 100;
  const hudAlign =
    ctiPct < 28 ? "left" : ctiPct > 72 ? "right" : "center";

  const hint = !preset
    ? "Select a preset · Duplicate or New to compose."
    : isPlayback
      ? compositionLocked
        ? "Playing · read-only builtin · Duplicate to compose"
        : "Playing · clock CTI · New / Duplicate / Edit to compose"
      : compositionLocked
        ? "Built-in read-only · Duplicate to compose"
        : preset.mode === "constant"
          ? "Composing · constant levels · Save to keep"
          : "Composing · CTI + / trash · HUD edits the key · Save to keep";

  const description = preset?.description?.trim() ?? "";
  const showDescriptionBlock =
    Boolean(preset) && (descriptionEditable || description.length > 0);

  const handleAddAtCti = () => {
    if (!preset || !showCtiChrome) return;
    const mins = snappedPlayhead;
    onAddKeyframe(mins, interpolateAt(preset, mins));
  };

  const handleDeleteAtCti = () => {
    if (!activeKeyframe) return;
    onDeleteKeyframe(activeKeyframe.id);
  };

  const commitTimeDraft = () => {
    if (!activeKeyframe || timeDraft === null) return;
    const next = clampMinutes(timeToMins(timeDraft), preset?.snap ?? "free");
    setTimeDraft(null);
    if (next !== activeKeyframe.minutes) {
      onMoveKeyframe(activeKeyframe.id, next);
      onScrub(next);
    }
  };

  return (
    <div className="timeline-panel">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h3 className="font-[Syne] text-sm font-semibold tracking-wide text-teal-50/90">
            24-hour timeline
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-teal-100/50">{hint}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {composing ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-950/35 px-2 py-0.5 font-mono text-[9px] tracking-wide text-amber-100/85 uppercase">
              Composing
            </span>
          ) : (
            <span className="rounded-full border border-teal-300/20 bg-teal-950/40 px-2 py-0.5 font-mono text-[9px] tracking-wide text-teal-200/75 uppercase">
              Playing
            </span>
          )}
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums tracking-wide",
              isPlayback ? "text-teal-300/90" : "text-teal-200/70",
            )}
          >
            {minsToTime(playheadMinutes)}
          </span>
        </div>
      </div>

      <div className="relative mt-3">
        <div className="relative">
        <div
          className={cn(
            "timeline-canvas relative overflow-hidden rounded-2xl border",
            isPlayback
              ? "border-teal-400/25 timeline-canvas-live"
              : "border-teal-200/10",
            !preset && "opacity-55",
          )}
        >
          {isPlayback && (
            <div className="pointer-events-none absolute top-2.5 left-3 z-[1] flex items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-950/50 px-2 py-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />
              <span className="font-[Figtree] text-[10px] font-semibold tracking-[0.14em] text-teal-200/80 uppercase">
                Playback · telemetry
              </span>
            </div>
          )}

          <div className="timeline-plot relative">
          <svg
            ref={svgRef}
            className={cn(
              "h-48 w-full touch-none select-none sm:h-56",
              !preset
                ? "cursor-default"
                : isPlayback
                  ? "cursor-not-allowed"
                  : "cursor-ew-resize",
            )}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onPointerDown={(e) => {
              if (!preset || !canCompose) return;
              if ((e.target as Element).closest("[data-kf]")) return;
              const mins = minsFromEvent(e.clientX, false);
              setDraggingPlayhead(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              onSelectKeyframe(null);
              setTimeDraft(null);
              onScrub(mins);
            }}
            onPointerMove={(e) => {
              if (!preset || !canCompose) return;
              if (draggingRamp && canCompose && onMoveRampEdge) {
                onMoveRampEdge(
                  draggingRamp.kind,
                  draggingRamp.edge,
                  minsFromEvent(e.clientX, true),
                );
                return;
              }
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
              setDraggingRamp(null);
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
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

            {/* A — dawn/dusk ramp bands */}
            {canCompose &&
              linkedRamps.map((ramp) => {
                const x1 = (ramp.start.minutes / 1440) * W;
                const x2 = (ramp.end.minutes / 1440) * W;
                const fill =
                  ramp.kind === "sunrise"
                    ? "rgba(251, 191, 36, 0.12)"
                    : "rgba(129, 140, 248, 0.12)";
                const stroke =
                  ramp.kind === "sunrise"
                    ? "rgba(251, 191, 36, 0.45)"
                    : "rgba(129, 140, 248, 0.45)";
                return (
                  <g key={`band-${ramp.kind}`} pointerEvents="none">
                    <rect
                      x={x1}
                      y={PAD_TOP}
                      width={Math.max(2, x2 - x1)}
                      height={YSPAN}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1}
                      strokeDasharray="3 4"
                      rx={3}
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={PAD_TOP + 11}
                      textAnchor="middle"
                      fill={
                        ramp.kind === "sunrise"
                          ? "rgba(253, 230, 138, 0.85)"
                          : "rgba(199, 210, 254, 0.85)"
                      }
                      fontSize={8}
                      fontFamily="ui-monospace, monospace"
                      fontWeight={700}
                    >
                      {ramp.kind === "sunrise" ? "DAWN" : "DUSK"} · linked
                    </text>
                  </g>
                );
              })}

            {paths && (
              <g className="timeline-curves" opacity={isPlayback ? 0.92 : 1}>
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
                const active = activeKeyframe?.id === kf.id;
                /** Screen px half-diagonal — tiny but readable diamonds. */
                const screenR = active ? 7 : 5.75;
                return (
                  <g
                    key={kf.id}
                    data-kf={kf.id}
                    className="cursor-grab"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDraggingNode(kf.id);
                      setTimeDraft(null);
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
                      vectorEffect="non-scaling-stroke"
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
                        points={diamondPoints(
                          x,
                          yFor(val),
                          screenR,
                          sx,
                          sy,
                        )}
                        fill={CHANNEL_STROKE[ch]}
                        stroke="#061018"
                        strokeWidth={1.25}
                        vectorEffect="non-scaling-stroke"
                        opacity={0.97}
                      />
                    ))}
                  </g>
                );
              })}

            {schedule &&
              !canCompose &&
              sorted.map((kf) => {
                const x = (kf.minutes / 1440) * W;
                return (
                  <g key={`live-${kf.id}`} opacity={0.5} pointerEvents="none">
                    <line
                      x1={x}
                      y1={PAD_TOP + 4}
                      x2={x}
                      y2={Y0}
                      stroke="rgba(148, 210, 220, 0.2)"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      vectorEffect="non-scaling-stroke"
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
                        points={diamondPoints(x, yFor(val), 4.5, sx, sy)}
                        fill={CHANNEL_STROKE[ch]}
                        stroke="#061018"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </g>
                );
              })}

            {/* CTI / playhead */}
            <g
              filter="url(#cti-glow)"
              style={{ pointerEvents: canCompose ? "auto" : "none" }}
              className={canCompose ? "cursor-ew-resize" : undefined}
              onPointerDown={(e) => {
                if (!preset || !canCompose) return;
                e.stopPropagation();
                setDraggingPlayhead(true);
                setTimeDraft(null);
                svgRef.current?.setPointerCapture(e.pointerId);
                onSelectKeyframe(null);
                onScrub(minsFromEvent(e.clientX, false));
              }}
            >
              <line
                x1={(playheadMinutes / 1440) * W}
                y1={4}
                x2={(playheadMinutes / 1440) * W}
                y2={Y0}
                stroke="#5eead4"
                strokeWidth={2}
                opacity={0.95}
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={diamondPoints(
                  (playheadMinutes / 1440) * W,
                  10,
                  6,
                  sx,
                  sy,
                )}
                fill="#5eead4"
                stroke="#061018"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>

          {/* HTML chips — avoid SVG none-aspect text squash */}
          {schedule && canCompose
            ? sorted.map((kf) => {
                const active = activeKeyframe?.id === kf.id;
                return (
                  <div
                    key={`chip-${kf.id}`}
                    className={cn(
                      "timeline-kf-chip pointer-events-none absolute top-1.5 z-[2] -translate-x-1/2",
                      active && "is-active",
                    )}
                    style={{ left: `${(kf.minutes / 1440) * 100}%` }}
                  >
                    {minsToTime(kf.minutes)}
                  </div>
                );
              })
            : null}

          <div
            className="timeline-cti-chip pointer-events-none absolute bottom-1.5 z-[2] -translate-x-1/2"
            style={{ left: `${(playheadMinutes / 1440) * 100}%` }}
          >
            {minsToTime(playheadMinutes)}
          </div>
          </div>

          <div className="flex justify-between px-3 pb-1 font-mono text-[10px] text-teal-100/40">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* A — drag handles on ramp edges (over timeline) */}
        {canCompose &&
          onMoveRampEdge &&
          linkedRamps.map((ramp) => {
            const startPct = (ramp.start.minutes / 1440) * 100;
            const endPct = (ramp.end.minutes / 1440) * 100;
            const tone =
              ramp.kind === "sunrise"
                ? "border-amber-300/50 bg-amber-200/90"
                : "border-indigo-300/50 bg-indigo-200/90";
            return (
              <div key={`handles-${ramp.kind}`}>
                {(["start", "end"] as const).map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    title={`${ramp.kind} ${edge}`}
                    aria-label={`${ramp.kind} ramp ${edge}`}
                    className={cn(
                      "absolute top-[38%] z-20 h-9 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border shadow-[0_0_0_1px_rgba(6,16,24,0.55)]",
                      tone,
                    )}
                    style={{
                      left: `${edge === "start" ? startPct : endPct}%`,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDraggingRamp({ kind: ramp.kind, edge });
                      svgRef.current?.setPointerCapture(e.pointerId);
                    }}
                  />
                ))}
                <div
                  className="pointer-events-none absolute top-2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-teal-200/15 bg-depth-950/80 px-1.5 py-0.5"
                  style={{ left: `${(startPct + endPct) / 2}%` }}
                >
                  <Link2 className="h-2.5 w-2.5 text-teal-200/60" />
                  <span className="font-mono text-[8px] tracking-wide text-teal-100/55 uppercase">
                    linked
                  </span>
                </div>
              </div>
            );
          })}

        {showCtiChrome && (
          <div
            className="cti-chrome pointer-events-none absolute top-1.5 z-30"
            style={{ left: `${ctiPct}%` }}
          >
            <div className="pointer-events-auto flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-teal-300/30 bg-depth-950/95 p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md">
              <button
                type="button"
                title="Add keyframe at CTI"
                aria-label="Add keyframe at CTI"
                className="flex h-7 w-7 items-center justify-center rounded-full text-teal-100/80 transition hover:bg-teal-400/20 hover:text-teal-50"
                onClick={handleAddAtCti}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                title="Delete keyframe at CTI"
                aria-label="Delete keyframe at CTI"
                disabled={!activeKeyframe}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition",
                  activeKeyframe
                    ? "text-rose-200/80 hover:bg-rose-400/15 hover:text-rose-100"
                    : "cursor-not-allowed text-teal-100/25",
                )}
                onClick={handleDeleteAtCti}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {showHud && activeKeyframe && (
          <div
            className="cti-hud pointer-events-none absolute z-40 w-[min(calc(100%-0.75rem),12.75rem)]"
            style={{
              top: "2.65rem",
              left:
                hudAlign === "right"
                  ? "auto"
                  : hudAlign === "left"
                    ? `max(0.35rem, calc(${ctiPct}% + 0.55rem))`
                    : `max(0.35rem, min(calc(100% - 13rem), calc(${ctiPct}% + 0.55rem)))`,
              right:
                hudAlign === "right"
                  ? `max(0.35rem, calc(${100 - ctiPct}% + 0.55rem))`
                  : "auto",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-auto rounded-lg border border-teal-300/20 bg-depth-950/92 px-2 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.5)] backdrop-blur-md">
              <div className="mb-1.5 flex items-center justify-between gap-1.5">
                <label className="flex min-w-0 items-center gap-1">
                  <span className="font-mono text-[8px] tracking-wide text-teal-100/40 uppercase">
                    Time
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={timeDraft ?? minsToTime(activeKeyframe.minutes)}
                    onChange={(e) => setTimeDraft(e.target.value)}
                    onBlur={commitTimeDraft}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="w-[3.4rem] rounded border border-teal-200/15 bg-depth-900/90 px-1 py-0.5 font-mono text-[11px] tabular-nums text-teal-50 outline-none focus:border-teal-400/35"
                    aria-label="Keyframe time"
                  />
                </label>
                <span className="truncate font-mono text-[8px] tracking-wide text-teal-100/40 uppercase">
                  {activeKeyframe.label ?? "Key"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
                {CHANNEL_META.map((ch) => (
                  <ChannelSlider
                    key={ch.key}
                    compact
                    label={ch.label}
                    value={activeKeyframe.channels[ch.key]}
                    accent={ch.accent}
                    onChange={(v) =>
                      onKeyframeChannelChange(activeKeyframe.id, ch.key, v)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        </div>

        {showCtiChrome && onApplySolarRamp && preset && (
          <SolarAssistStrip preset={preset} onApply={onApplySolarRamp} />
        )}
      </div>

      {showDescriptionBlock && (
        <div className="mt-3 px-1">
          {descriptionEditable && onDescriptionChange ? (
            <textarea
              value={preset?.description ?? ""}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={3}
              placeholder="Add a description…"
              className="w-full resize-y rounded-xl border border-teal-200/15 bg-depth-900/50 px-3 py-2 font-[Figtree] text-[12px] leading-relaxed text-teal-50/85 outline-none placeholder:text-teal-100/30 focus:border-teal-400/35"
            />
          ) : (
            <p className="text-[12px] leading-relaxed text-teal-100/65">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
