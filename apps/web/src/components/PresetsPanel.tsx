import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { DayPreset, PresetMode, SnapMode } from "@/lib/presets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  presets: DayPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onModeChange: (id: string, mode: PresetMode) => void;
  onSnapChange: (id: string, snap: SnapMode) => void;
  onDescriptionChange?: (id: string, description: string) => void;
};

export function PresetsPanel({
  presets,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onModeChange,
  onSnapChange,
  onDescriptionChange,
}: Props) {
  const selected = presets.find((p) => p.id === selectedId) ?? null;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startRename = (preset: DayPreset) => {
    setRenamingId(preset.id);
    setDraftName(preset.name);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = draftName.trim();
    if (trimmed) onRename(renamingId, trimmed);
    setRenamingId(null);
  };

  return (
    <div className="presets-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-[Syne] text-sm font-semibold tracking-wide text-teal-50/90">
            Day presets
          </h3>
          <p className="mt-1 text-xs text-teal-100/50">
            Named day programs — constant levels or a keyframe schedule.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {presets.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-teal-200/15 bg-depth-900/40 px-4 py-8 text-center">
          <p className="font-[Syne] text-sm text-teal-50/80">No presets yet</p>
          <p className="mt-2 text-xs text-teal-100/45">
            Create an empty shell, then set constant levels or place keyframes on
            the timeline. Or clear localStorage and reload to restore starters.
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
          {presets.map((preset) => {
            const active = preset.id === selectedId;
            return (
              <li key={preset.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(preset.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(preset.id);
                    }
                  }}
                  className={cn(
                    "group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                    active
                      ? "border-teal-400/35 bg-teal-400/10"
                      : "border-teal-200/10 bg-depth-900/50 hover:border-teal-200/20",
                  )}
                >
                  {renamingId === preset.id ? (
                    <form
                      className="flex flex-1"
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename();
                      }}
                    >
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        className="w-full rounded-md border border-teal-400/30 bg-depth-950 px-2 py-1 font-[Figtree] text-sm text-teal-50 outline-none"
                      />
                    </form>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="font-[Syne] text-sm font-semibold leading-snug text-teal-50/90">
                        {preset.name}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] tracking-wide text-teal-100/45 uppercase">
                        {preset.mode}
                        {preset.mode === "schedule"
                          ? ` · ${preset.keyframes.length} keyframe${preset.keyframes.length === 1 ? "" : "s"}`
                          : ""}
                      </div>
                      {preset.description?.trim() ? (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-teal-100/60">
                          {preset.description}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                    <button
                      type="button"
                      title="Rename"
                      className="rounded-md p-1.5 text-teal-100/40 opacity-0 transition hover:bg-teal-400/10 hover:text-teal-100 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(preset);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      className="rounded-md p-1.5 text-teal-100/40 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(preset.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-teal-200/10 bg-depth-900/40 p-3">
          <div>
            <div className="font-[Syne] text-sm font-semibold text-teal-50/90">
              {selected.name}
            </div>
            {onDescriptionChange ? (
              <textarea
                value={selected.description ?? ""}
                onChange={(e) =>
                  onDescriptionChange(selected.id, e.target.value)
                }
                rows={4}
                placeholder="Add a description…"
                className="mt-2 w-full resize-y rounded-lg border border-teal-200/15 bg-depth-950/70 px-2.5 py-2 font-[Figtree] text-[12px] leading-relaxed text-teal-50/85 outline-none placeholder:text-teal-100/30 focus:border-teal-400/35"
              />
            ) : selected.description?.trim() ? (
              <p className="mt-2 text-[12px] leading-relaxed text-teal-100/65">
                {selected.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] tracking-wide text-teal-100/45 uppercase">
              Mode
            </span>
            <div className="flex rounded-lg border border-teal-200/10 bg-depth-950/60 p-0.5">
              {(["constant", "schedule"] as PresetMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onModeChange(selected.id, mode)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide capitalize transition",
                    selected.mode === mode
                      ? "bg-teal-400/20 text-teal-100"
                      : "text-teal-100/45 hover:text-teal-100/75",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {selected.mode === "schedule" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] tracking-wide text-teal-100/45 uppercase">
                Snap
              </span>
              <div className="flex rounded-lg border border-teal-200/10 bg-depth-950/60 p-0.5">
                {(["free", "hour"] as SnapMode[]).map((snap) => (
                  <button
                    key={snap}
                    type="button"
                    onClick={() => onSnapChange(selected.id, snap)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wide capitalize transition",
                      selected.snap === snap
                        ? "bg-teal-400/20 text-teal-100"
                        : "text-teal-100/45 hover:text-teal-100/75",
                    )}
                  >
                    {snap === "free" ? "Free / min" : "Hours"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
