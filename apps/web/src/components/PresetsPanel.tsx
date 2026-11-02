import { useState } from "react";
import { Copy, Lock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  isBuiltinPreset,
  isFreeManualPreset,
  presetOrbBackground,
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
  /** Compose session for selected user preset â€” shows mode/snap/Save chrome. */
  composing?: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  /** Pencil / edit â€” enter compose on a user preset. */
  onRequestCompose: (id: string) => void;
  onDelete: (id: string) => void;
  onModeChange: (id: string, mode: PresetMode) => void;
  onSnapChange: (id: string, snap: SnapMode) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDuplicate: (id: string) => void;
  dirtyIds?: Set<string>;
  /** Id of the preset currently sent to the lamp. */
  playingId: string | null;
  /** Drafts that were never saved cannot be played. */
  neverSavedIds: Set<string>;
  onPlay: (id: string) => void;
};

export function PresetsPanel({
  presets,
  selectedId,
  dirty: selectedDirty,
  selectedIsCommitted,
  composing = false,
  onSelect,
  onCreate,
  onRename,
  onRequestCompose,
  onDelete,
  onModeChange,
  onSnapChange,
  onSave,
  onDiscard,
  onDuplicate,
  dirtyIds,
  playingId,
  neverSavedIds,
  onPlay,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startRename = (preset: DayPreset) => {
    if (isBuiltinPreset(preset)) return;
    onRequestCompose(preset.id);
    setRenamingId(preset.id);
    setDraftName(preset.name);
  };

  const startCompose = (preset: DayPreset) => {
    if (isBuiltinPreset(preset)) return;
    onRequestCompose(preset.id);
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
            {composing
              ? "Composing draft Â· Save or Cancel when done."
              : "Tap to preview Â· press play to send to the lamp."}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
      </div>

      <ul className="mt-3 flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
        {presets.map((preset) => {
          const active = preset.id === selectedId;
          const freeManual = isFreeManualPreset(preset);
          const builtin = isBuiltinPreset(preset);
          const lockedBuiltin = builtin && !freeManual;
          const rowDirty = dirtyIds?.has(preset.id) ?? false;
          const showUserChrome =
            composing && active && !builtin && renamingId !== preset.id;
          const orbBg = presetOrbBackground(preset);
          const isPlaying = preset.id === playingId;
          const neverSaved = neverSavedIds.has(preset.id);
          const playTitle = isPlaying
            ? "Playing on the lamp"
            : neverSaved
              ? "Save this preset to play it"
              : rowDirty
                ? "Play the saved version"
                : "Play on the lamp";
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
                  "group relative overflow-hidden rounded-lg border transition-colors",
                  active
                    ? "border-teal-400/35 bg-teal-400/10"
                    : "border-teal-200/10 bg-depth-900/50 hover:border-teal-200/20",
                )}
              >
                <div className="relative z-[1] px-2.5 py-1.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="preset-orb"
                      style={{ background: orbBg }}
                    />                    {renamingId === preset.id ? (
                      <form
                        className="flex min-w-0 flex-[0_1_70%]"
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
                      <div className="flex min-w-0 flex-[0_1_70%] items-center gap-1.5">
                        {lockedBuiltin && (
                          <Lock
                            className="h-3 w-3 shrink-0 text-teal-200/55"
                            aria-label="Built-in"
                          />
                        )}
                        <div
                          className="min-w-0 truncate font-[Syne] text-sm font-semibold leading-snug text-teal-50/90"
                          onDoubleClick={(e) => {
                            if (builtin) return;
                            e.stopPropagation();
                            startRename(preset);
                          }}
                        >
                          {preset.name}
                        </div>
                        {!builtin ? (
                          <span className="shrink-0 font-mono text-[9px] tracking-wide text-teal-100/45 uppercase">
                            {preset.mode}
                          </span>
                        ) : null}
                        {rowDirty && (
                          <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-950/40 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-amber-200/80 uppercase">
                            Unsaved
                          </span>
                        )}
                      </div>
                    )}

                    {renamingId !== preset.id && (
                      <div
                        className={cn(
                          "ml-auto flex shrink-0 items-center gap-0.5",
                          active
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {active && composing && (
                          <>
                            {selectedDirty ? (
                              <button
                                type="button"
                                title="Save"
                                className="rounded-md bg-teal-400/25 px-1.5 py-0.5 font-[Figtree] text-[10px] font-semibold tracking-wide text-teal-50 hover:bg-teal-400/35"
                                onClick={onSave}
                              >
                                Save
                              </button>
                            ) : null}
                            <button
                              type="button"
                              title={
                                selectedDirty && selectedIsCommitted
                                  ? "Discard"
                                  : "Cancel"
                              }
                              className="rounded-md px-1.5 py-0.5 font-[Figtree] text-[10px] font-semibold tracking-wide text-teal-100/70 hover:bg-teal-400/10 hover:text-teal-100"
                              onClick={onDiscard}
                            >
                              {selectedDirty && selectedIsCommitted
                                ? "Discard"
                                : "Cancel"}
                            </button>
                          </>
                        )}
                        {!freeManual && (
                          <button
                            type="button"
                            title="Duplicate as editable copy"
                            className="rounded-md p-1 text-teal-100/50 transition hover:bg-teal-400/10 hover:text-teal-100"
                            onClick={() => onDuplicate(preset.id)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!builtin && (
                          <>
                            <button
                              type="button"
                              title="Edit"
                              className="rounded-md p-1 text-teal-100/50 transition hover:bg-teal-400/10 hover:text-teal-100"
                              onClick={() => startCompose(preset)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title={
                                isPlaying
                                  ? "Switch to another preset before deleting"
                                  : "Delete"
                              }
                              disabled={isPlaying}
                              className="rounded-md p-1 text-teal-100/50 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-teal-100/50"
                              onClick={() => onDelete(preset.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {renamingId !== preset.id && (
                      <button
                        type="button"
                        title={playTitle}
                        aria-label={`${isPlaying ? "Playing" : "Play"} ${preset.name}`}
                        aria-pressed={isPlaying}
                        disabled={neverSaved}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isPlaying) onPlay(preset.id);
                        }}
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition",
                          isPlaying
                            ? "border-teal-300/60 bg-teal-300 text-depth-950"
                            : "border-teal-200/20 text-teal-100/70 hover:border-teal-300/50 hover:bg-teal-400/15 hover:text-teal-50",
                          neverSaved && "cursor-not-allowed opacity-35",
                        )}
                      >
                        <Play
                          className={cn(
                            "h-3.5 w-3.5 translate-x-px",
                            isPlaying && "fill-current",
                          )}
                          aria-hidden
                        />
                      </button>
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
