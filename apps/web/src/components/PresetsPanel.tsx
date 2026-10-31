import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  isBuiltinPreset,
  type DayPreset,
  type PresetMode,
  type SnapMode,
} from "@/lib/presets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  presets: DayPreset[];
  selectedId: string | null;
  dirty: boolean;
  /** Selected preset exists in committed storage (false = never saved). */
  selectedIsCommitted: boolean;
  /** When false (LIVE), list stays selectable but all edit chrome is hidden. */
  editEnabled?: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onModeChange: (id: string, mode: PresetMode) => void;
  onSnapChange: (id: string, snap: SnapMode) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDuplicate: (id: string) => void;
  /** Ids that have unsaved draft changes (for list badges). */
  dirtyIds?: Set<string>;
};

function typeLabel(preset: DayPreset): string {
  if (isBuiltinPreset(preset)) return "Built-in";
  return preset.mode;
}

export function PresetsPanel({
  presets,
  selectedId,
  dirty: selectedDirty,
  selectedIsCommitted,
  editEnabled = true,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onModeChange,
  onSnapChange,
  onSave,
  onDiscard,
  onDuplicate,
  dirtyIds,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startRename = (preset: DayPreset) => {
    if (!editEnabled || isBuiltinPreset(preset)) return;
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
            {editEnabled
              ? "Built-ins are read-only · user presets save explicitly."
              : "Select a preset to play · switch to EDIT to compose."}
          </p>
        </div>
        {editEnabled && (
          <Button type="button" size="sm" variant="outline" onClick={onCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>

      <ul className="mt-3 flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
        {presets.map((preset) => {
          const active = preset.id === selectedId;
          const builtin = isBuiltinPreset(preset);
          const rowDirty = editEnabled && (dirtyIds?.has(preset.id) ?? false);
          const showUserChrome =
            editEnabled && active && !builtin && renamingId !== preset.id;

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
                  "group rounded-lg border px-2.5 py-1.5 transition-colors",
                  active
                    ? "border-teal-400/35 bg-teal-400/10"
                    : "border-teal-200/10 bg-depth-900/50 hover:border-teal-200/20",
                )}
              >
                <div className="flex items-center gap-2">
                  {editEnabled && renamingId === preset.id ? (
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
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="min-w-0 truncate font-[Syne] text-sm font-semibold leading-snug text-teal-50/90">
                        {preset.name}
                      </div>
                      <span className="shrink-0 rounded-full border border-teal-200/20 bg-teal-950/50 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-teal-200/70 uppercase">
                        {typeLabel(preset)}
                      </span>
                      {rowDirty && (
                        <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-950/40 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-amber-200/80 uppercase">
                          Unsaved
                        </span>
                      )}
                    </div>
                  )}

                  {editEnabled && renamingId !== preset.id && (
                    <div
                      className={cn(
                        "flex shrink-0 items-center gap-0.5",
                        active
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {active && selectedDirty && (
                        <>
                          <button
                            type="button"
                            title="Save"
                            className="rounded-md px-1.5 py-0.5 font-[Figtree] text-[10px] font-semibold tracking-wide text-teal-50 bg-teal-400/25 hover:bg-teal-400/35"
                            onClick={onSave}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            title={selectedIsCommitted ? "Discard" : "Cancel"}
                            className="rounded-md px-1.5 py-0.5 font-[Figtree] text-[10px] font-semibold tracking-wide text-teal-100/70 hover:bg-teal-400/10 hover:text-teal-100"
                            onClick={onDiscard}
                          >
                            {selectedIsCommitted ? "Discard" : "Cancel"}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        title="Duplicate as editable copy"
                        className="rounded-md p-1 text-teal-100/50 transition hover:bg-teal-400/10 hover:text-teal-100"
                        onClick={() => onDuplicate(preset.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {!builtin && (
                        <>
                          <button
                            type="button"
                            title="Rename"
                            className="rounded-md p-1 text-teal-100/50 transition hover:bg-teal-400/10 hover:text-teal-100"
                            onClick={() => startRename(preset)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            className="rounded-md p-1 text-teal-100/50 transition hover:bg-rose-400/10 hover:text-rose-300"
                            onClick={() => onDelete(preset.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {showUserChrome && (
                  <div
                    className="mt-1.5 flex flex-wrap items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex rounded-md border border-teal-200/10 bg-depth-950/60 p-0.5">
                      {(["constant", "schedule"] as PresetMode[]).map(
                        (mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => onModeChange(preset.id, mode)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide capitalize transition",
                              preset.mode === mode
                                ? "bg-teal-400/20 text-teal-100"
                                : "text-teal-100/45 hover:text-teal-100/75",
                            )}
                          >
                            {mode}
                          </button>
                        ),
                      )}
                    </div>
                    {preset.mode === "schedule" && (
                      <div className="flex rounded-md border border-teal-200/10 bg-depth-950/60 p-0.5">
                        {(["free", "hour"] as SnapMode[]).map((snap) => (
                          <button
                            key={snap}
                            type="button"
                            onClick={() => onSnapChange(preset.id, snap)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide capitalize transition",
                              preset.snap === snap
                                ? "bg-teal-400/20 text-teal-100"
                                : "text-teal-100/45 hover:text-teal-100/75",
                            )}
                          >
                            {snap === "free" ? "Free" : "Hours"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
