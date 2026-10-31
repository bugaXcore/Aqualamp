import { useEffect, useState } from "react";
import { Link2, Sunrise, Sunset } from "lucide-react";
import type { Channels } from "@/lib/bridge";
import {
  minsToTime,
  timeToMins,
  type DayPreset,
  type RampKind,
} from "@/lib/presets";
import {
  findLinkedRamp,
  RAMP_DURATION_DEFAULT,
  RAMP_DURATION_MAX,
  RAMP_DURATION_MIN,
  type SolarApplyInput,
} from "@/lib/ramps";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  preset: DayPreset;
  onApply: (input: SolarApplyInput) => void;
};

type Draft = {
  kind: RampKind;
  start: string;
  duration: number;
  useAdjacent: boolean;
  from: Channels;
  to: Channels;
};

const EMPTY: Channels = { red: 0, green: 0, blue: 0, uv: 0 };
const DAY: Channels = { red: 70, green: 55, blue: 50, uv: 25 };

function openDraft(preset: DayPreset, kind: RampKind): Draft {
  const linked = findLinkedRamp(preset, kind);
  if (linked) {
    return {
      kind,
      start: minsToTime(linked.start.minutes),
      duration: Math.max(
        RAMP_DURATION_MIN,
        linked.end.minutes - linked.start.minutes,
      ),
      useAdjacent: false,
      from: { ...linked.start.channels },
      to: { ...linked.end.channels },
    };
  }
  return {
    kind,
    start: kind === "sunrise" ? "06:30" : "19:00",
    duration: RAMP_DURATION_DEFAULT,
    useAdjacent: true,
    from: kind === "sunrise" ? { ...EMPTY } : { ...DAY },
    to: kind === "sunrise" ? { ...DAY } : { ...EMPTY },
  };
}

export function SolarAssistStrip({ preset, onApply }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const sunrise = findLinkedRamp(preset, "sunrise");
  const sunset = findLinkedRamp(preset, "sunset");

  useEffect(() => {
    setDraft(null);
  }, [preset.id]);

  return (
    <div className="solar-assist relative mt-1.5 px-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 font-mono text-[9px] tracking-wide text-teal-100/40 uppercase">
          Solar
        </span>
        {(
          [
            {
              kind: "sunrise" as const,
              label: "Sunrise",
              Icon: Sunrise,
              linked: sunrise,
            },
            {
              kind: "sunset" as const,
              label: "Sunset",
              Icon: Sunset,
              linked: sunset,
            },
          ] as const
        ).map(({ kind, label, Icon, linked }) => (
          <button
            key={kind}
            type="button"
            onClick={() => setDraft(openDraft(preset, kind))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-[Figtree] text-[10px] font-semibold tracking-wide transition",
              draft?.kind === kind
                ? "border-amber-300/40 bg-amber-400/15 text-amber-50"
                : linked
                  ? "border-teal-300/25 bg-teal-400/10 text-teal-100/85 hover:border-teal-300/40"
                  : "border-teal-200/15 bg-depth-950/60 text-teal-100/65 hover:border-teal-200/30 hover:text-teal-50",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
            {linked ? (
              <span
                title="Linked ramp"
                className="inline-flex items-center gap-0.5 text-teal-200/70"
              >
                <Link2 className="h-2.5 w-2.5" />
                <span className="font-mono text-[8px] uppercase">
                  {linked.end.minutes - linked.start.minutes}m
                </span>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {draft && (
        <div
          className="absolute top-[calc(100%+0.35rem)] left-0 z-40 w-[min(100%,18.5rem)] rounded-xl border border-teal-300/25 bg-depth-950/96 p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-[Syne] text-xs font-semibold text-teal-50/90">
              {draft.kind === "sunrise" ? "Sunrise ramp" : "Sunset ramp"}
            </div>
            <button
              type="button"
              className="text-[10px] text-teal-100/45 hover:text-teal-100/80"
              onClick={() => setDraft(null)}
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="font-mono text-[8px] tracking-wide text-teal-100/40 uppercase">
                Start
              </span>
              <input
                type="text"
                value={draft.start}
                onChange={(e) =>
                  setDraft({ ...draft, start: e.target.value })
                }
                className="rounded-md border border-teal-200/15 bg-depth-900 px-1.5 py-1 font-mono text-[11px] text-teal-50 outline-none focus:border-teal-400/35"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="font-mono text-[8px] tracking-wide text-teal-100/40 uppercase">
                Duration ({RAMP_DURATION_MIN}–{RAMP_DURATION_MAX}m)
              </span>
              <input
                type="range"
                min={RAMP_DURATION_MIN}
                max={RAMP_DURATION_MAX}
                step={5}
                value={draft.duration}
                onChange={(e) =>
                  setDraft({ ...draft, duration: Number(e.target.value) })
                }
                className="mt-1.5 w-full accent-teal-300"
              />
              <span className="font-mono text-[10px] text-teal-100/70">
                {draft.duration} min →{" "}
                {minsToTime(timeToMins(draft.start) + draft.duration)}
              </span>
            </label>
          </div>

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-teal-100/70">
            <input
              type="checkbox"
              checked={draft.useAdjacent}
              onChange={(e) =>
                setDraft({ ...draft, useAdjacent: e.target.checked })
              }
              className="accent-teal-300"
            />
            Use adjacent / curve levels
          </label>

          {!draft.useAdjacent && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-teal-100/60">
              <div>
                <div className="mb-1 font-mono text-[8px] uppercase tracking-wide text-teal-100/40">
                  From %
                </div>
                {(["red", "green", "blue", "uv"] as const).map((key) => (
                  <label
                    key={key}
                    className="mb-0.5 flex items-center justify-between gap-1"
                  >
                    <span className="uppercase">{key[0]}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.from[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          from: {
                            ...draft.from,
                            [key]: Math.min(
                              100,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          },
                        })
                      }
                      className="w-12 rounded border border-teal-200/15 bg-depth-900 px-1 py-0.5 font-mono text-[10px] text-teal-50"
                    />
                  </label>
                ))}
              </div>
              <div>
                <div className="mb-1 font-mono text-[8px] uppercase tracking-wide text-teal-100/40">
                  To %
                </div>
                {(["red", "green", "blue", "uv"] as const).map((key) => (
                  <label
                    key={key}
                    className="mb-0.5 flex items-center justify-between gap-1"
                  >
                    <span className="uppercase">{key[0]}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.to[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          to: {
                            ...draft.to,
                            [key]: Math.min(
                              100,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          },
                        })
                      }
                      className="w-12 rounded border border-teal-200/15 bg-depth-900 px-1 py-0.5 font-mono text-[10px] text-teal-50"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply({
                  kind: draft.kind,
                  startMins: timeToMins(draft.start),
                  durationMins: draft.duration,
                  useAdjacent: draft.useAdjacent,
                  from: draft.from,
                  to: draft.to,
                });
                setDraft(null);
              }}
            >
              Apply
            </Button>
            <span className="text-[10px] text-teal-100/40">
              Writes linked ramp keys · Save to keep
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
