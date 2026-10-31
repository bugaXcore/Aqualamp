import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChannelSlider } from "@/components/ChannelSlider";
import { DayTimeline } from "@/components/DayTimeline";
import { PresetsPanel } from "@/components/PresetsPanel";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/button";
import { useBridge } from "@/hooks/useBridge";
import { channelsToCss, mixLuma, type Channels } from "@/lib/bridge";
import {
  BUILTIN_PRESETS,
  clampMinutes,
  clonePreset,
  createEmptyPreset,
  duplicateAsUserPreset,
  FREE_MANUAL_CHANNELS,
  FREE_MANUAL_PRESET_ID,
  interpolateAt,
  isBuiltinPreset,
  isFreeManualPreset,
  loadUserPresets,
  minsToTime,
  newId,
  presetsEqual,
  saveUserPresets,
  type DayPreset,
  type PresetMode,
  type RampKind,
  type SnapMode,
} from "@/lib/presets";
import {
  applySolarRamp,
  describeNextEvent,
  moveRampEdge,
  type SolarApplyInput,
} from "@/lib/ramps";

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

const CHANNEL_META: {
  key: keyof Channels;
  label: string;
  accent: string;
}[] = [
  { key: "red", label: "Red", accent: "#f87171" },
  { key: "green", label: "Green", accent: "#4ade80" },
  { key: "blue", label: "Blue", accent: "#60a5fa" },
  { key: "uv", label: "UV", accent: "#c084fc" },
];

export default function App() {
  const bridge = useBridge();
  const [local, setLocal] = useState<Channels>({ ...FREE_MANUAL_CHANNELS });
  /** Committed user presets (localStorage). */
  const [savedUserPresets, setSavedUserPresets] = useState<DayPreset[]>([]);
  /** Draft overlays + never-saved new presets. */
  const [drafts, setDrafts] = useState<Record<string, DayPreset>>({});
  /** Default = free mix so top sliders never open dead. */
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    FREE_MANUAL_PRESET_ID,
  );
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(
    null,
  );
  const [playheadMinutes, setPlayheadMinutes] = useState(12 * 60);
  /** Non-null = composing that preset id (intent from New / Edit / Duplicate). */
  const [composeIntentId, setComposeIntentId] = useState<string | null>(null);
  const connected = bridge.state === "connected";
  const busy = bridge.state === "connecting" || bridge.state === "scanning";
  const isComposing =
    composeIntentId !== null && composeIntentId === selectedPresetId;
  const isPlayback = !isComposing;
  const setChannelsRef = useRef(bridge.setChannels);
  setChannelsRef.current = bridge.setChannels;

  const enterCompose = (id: string) => {
    if (isBuiltinPreset(id)) return;
    setComposeIntentId(id);
    setSelectedPresetId(id);
  };

  const exitCompose = () => {
    setComposeIntentId(null);
    setSelectedKeyframeId(null);
    const mins = nowMinutes();
    setPlayheadMinutes(mins);
  };

  const displayPresets = useMemo(() => {
    const savedIds = new Set(savedUserPresets.map((p) => p.id));
    const users = savedUserPresets.map((p) =>
      drafts[p.id] ? clonePreset(drafts[p.id]!) : clonePreset(p),
    );
    const unsaved = Object.values(drafts)
      .filter((p) => !savedIds.has(p.id) && !isBuiltinPreset(p))
      .map(clonePreset);
    return [...BUILTIN_PRESETS.map(clonePreset), ...users, ...unsaved];
  }, [savedUserPresets, drafts]);

  const selectedPreset =
    displayPresets.find((p) => p.id === selectedPresetId) ?? null;
  const isFreeManual = Boolean(
    selectedPreset && isFreeManualPreset(selectedPreset),
  );
  const selectedBuiltin = selectedPreset
    ? isBuiltinPreset(selectedPreset)
    : false;
  /** Built-in day looks are read-only; free mix is not locked. */
  const compositionLocked = selectedBuiltin && !isFreeManual;

  const selectedIsCommitted = Boolean(
    selectedPresetId &&
      savedUserPresets.some((p) => p.id === selectedPresetId),
  );

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, draft] of Object.entries(drafts)) {
      if (isBuiltinPreset(id)) continue;
      const saved = savedUserPresets.find((p) => p.id === id);
      if (!saved || !presetsEqual(saved, draft)) ids.add(id);
    }
    return ids;
  }, [drafts, savedUserPresets]);

  const dirty = selectedPresetId ? dirtyIds.has(selectedPresetId) : false;

  useEffect(() => {
    setSavedUserPresets(loadUserPresets());
  }, []);

  useEffect(() => {
    if (isFreeManual) return;
    if (isPlayback) return;
    setLocal(bridge.channels);
  }, [bridge.channels, isPlayback, isFreeManual]);

  useEffect(() => {
    if (!isPlayback) return;
    const tick = () => {
      setPlayheadMinutes(nowMinutes());
      setSelectedKeyframeId(null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isPlayback]);

  useEffect(() => {
    if (!selectedPreset) return;
    /** Free mix is user-driven — never overwrite local from playhead ticks. */
    if (isFreeManualPreset(selectedPreset)) return;
    if (isPlayback) {
      const channels = interpolateAt(selectedPreset, playheadMinutes);
      setLocal(channels);
      setChannelsRef.current(channels);
      return;
    }
    if (selectedPreset.mode === "constant") {
      setLocal({ ...selectedPreset.constantChannels });
      return;
    }
    if (selectedKeyframeId && !compositionLocked) {
      const kf = selectedPreset.keyframes.find(
        (k) => k.id === selectedKeyframeId,
      );
      if (kf) setLocal({ ...kf.channels });
      return;
    }
    setLocal(interpolateAt(selectedPreset, playheadMinutes));
  }, [
    selectedPreset,
    selectedKeyframeId,
    playheadMinutes,
    isPlayback,
    compositionLocked,
  ]);

  /** Push free-mix starter once connected so mock lamp matches open state. */
  useEffect(() => {
    if (!connected || !isFreeManual) return;
    setChannelsRef.current(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on connect+free
  }, [connected, isFreeManual]);

  const pushToBridge = (channels: Channels) => {
    setLocal(channels);
    bridge.setChannels(channels);
  };

  const patchPreset = (id: string, patch: (p: DayPreset) => DayPreset) => {
    if (isBuiltinPreset(id) || isPlayback) return;
    setDrafts((prev) => {
      const base =
        prev[id] ??
        savedUserPresets.find((p) => p.id === id) ??
        displayPresets.find((p) => p.id === id);
      if (!base || isBuiltinPreset(base)) return prev;
      return { ...prev, [id]: patch(clonePreset(base)) };
    });
  };

  const updateChannel = (key: keyof Channels, value: number) => {
    if (isFreeManual) {
      pushToBridge({ ...local, [key]: value });
      return;
    }
    if (isPlayback || compositionLocked) return;
    if (!selectedPreset) {
      pushToBridge({ ...local, [key]: value });
      return;
    }

    if (selectedPreset.mode === "constant") {
      const nextChannels = {
        ...selectedPreset.constantChannels,
        [key]: value,
      };
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        constantChannels: nextChannels,
      }));
      pushToBridge(nextChannels);
      return;
    }

    if (selectedKeyframeId) {
      const nextChannels = { ...local, [key]: value };
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        keyframes: p.keyframes.map((k) =>
          k.id === selectedKeyframeId
            ? { ...k, channels: { ...k.channels, [key]: value } }
            : k,
        ),
      }));
      pushToBridge(nextChannels);
      return;
    }

    const minutes = clampMinutes(playheadMinutes, selectedPreset.snap);
    const existing = selectedPreset.keyframes.find((k) => k.minutes === minutes);
    const nextChannels = {
      ...(existing?.channels ?? interpolateAt(selectedPreset, minutes)),
      [key]: value,
    };
    if (existing) {
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        keyframes: p.keyframes.map((k) =>
          k.id === existing.id ? { ...k, channels: nextChannels } : k,
        ),
      }));
      setSelectedKeyframeId(existing.id);
    } else {
      const id = newId();
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        keyframes: [...p.keyframes, { id, minutes, channels: nextChannels }],
      }));
      setSelectedKeyframeId(id);
    }
    pushToBridge(nextChannels);
  };

  const handleCreatePreset = () => {
    const n =
      savedUserPresets.length +
      Object.keys(drafts).filter((id) => !savedUserPresets.some((p) => p.id === id))
        .length +
      1;
    const preset = createEmptyPreset(`Preset ${n}`);
    setDrafts((prev) => ({ ...prev, [preset.id]: preset }));
    setSelectedKeyframeId(null);
    setLocal({ ...preset.constantChannels });
    enterCompose(preset.id);
  };

  const handleSave = () => {
    if (!selectedPresetId || isBuiltinPreset(selectedPresetId)) return;
    const draft =
      drafts[selectedPresetId] ??
      savedUserPresets.find((p) => p.id === selectedPresetId);
    if (!draft) return;
    const committed = { ...clonePreset(draft), builtin: false as const };
    setSavedUserPresets((prev) => {
      const exists = prev.some((p) => p.id === committed.id);
      const next = exists
        ? prev.map((p) => (p.id === committed.id ? committed : p))
        : [...prev, committed];
      saveUserPresets(next);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedPresetId];
      return next;
    });
    exitCompose();
    if (committed.mode === "constant") {
      pushToBridge({ ...committed.constantChannels });
    } else {
      pushToBridge(interpolateAt(committed, nowMinutes()));
    }
  };

  const handleDiscard = () => {
    if (!selectedPresetId || isBuiltinPreset(selectedPresetId)) {
      exitCompose();
      return;
    }
    const wasNew = !savedUserPresets.some((p) => p.id === selectedPresetId);
    const hadDraft = Boolean(drafts[selectedPresetId]);
    if (hadDraft) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[selectedPresetId];
        return next;
      });
    }
    if (wasNew) {
      setSelectedPresetId(null);
      exitCompose();
      return;
    }
    const saved = savedUserPresets.find((p) => p.id === selectedPresetId);
    exitCompose();
    if (saved) {
      if (saved.mode === "constant") {
        pushToBridge({ ...saved.constantChannels });
      } else {
        pushToBridge(interpolateAt(saved, nowMinutes()));
      }
    }
  };

  const handleDeletePreset = (id: string) => {
    if (isBuiltinPreset(id)) return;
    setSavedUserPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveUserPresets(next);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (composeIntentId === id) setComposeIntentId(null);
    if (selectedPresetId === id) {
      setSelectedPresetId(null);
      setSelectedKeyframeId(null);
    }
  };

  const handleDuplicate = (id: string) => {
    const source = displayPresets.find((p) => p.id === id);
    if (!source) return;
    const copy = duplicateAsUserPreset(source);
    setDrafts((prev) => ({ ...prev, [copy.id]: copy }));
    setSelectedKeyframeId(null);
    enterCompose(copy.id);
    if (copy.mode === "constant") {
      pushToBridge({ ...copy.constantChannels });
    } else {
      pushToBridge(interpolateAt(copy, playheadMinutes));
    }
  };

  const handleRequestCompose = (id: string) => {
    const source = displayPresets.find((p) => p.id === id);
    if (!source || isBuiltinPreset(source)) return;
    enterCompose(id);
    if (source.mode === "constant") {
      pushToBridge({ ...source.constantChannels });
    } else {
      pushToBridge(interpolateAt(source, playheadMinutes));
    }
  };

  const handleModeChange = (id: string, mode: PresetMode) => {
    patchPreset(id, (p) => ({ ...p, mode }));
    setSelectedKeyframeId(null);
  };

  const handleAddKeyframe = (minutes: number, channels: Channels) => {
    if (isPlayback || compositionLocked) return;
    if (!selectedPreset || selectedPreset.mode !== "schedule") return;
    const snapped = clampMinutes(minutes, selectedPreset.snap);
    const existing = selectedPreset.keyframes.find((k) => k.minutes === snapped);
    if (existing) {
      setSelectedKeyframeId(existing.id);
      setPlayheadMinutes(snapped);
      setLocal({ ...existing.channels });
      return;
    }
    const id = newId();
    patchPreset(selectedPreset.id, (p) => ({
      ...p,
      keyframes: [...p.keyframes, { id, minutes: snapped, channels }],
    }));
    setSelectedKeyframeId(id);
    setPlayheadMinutes(snapped);
    setLocal({ ...channels });
  };

  const handleDeleteKeyframe = (id: string) => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    if (selectedPreset.mode !== "schedule") return;
    const nextKeyframes = selectedPreset.keyframes.filter((k) => k.id !== id);
    patchPreset(selectedPreset.id, (p) => ({
      ...p,
      keyframes: nextKeyframes,
    }));
    if (selectedKeyframeId === id) setSelectedKeyframeId(null);
    pushToBridge(
      interpolateAt(
        { ...selectedPreset, keyframes: nextKeyframes },
        playheadMinutes,
      ),
    );
  };

  const handleKeyframeChannelChange = (
    id: string,
    key: keyof Channels,
    value: number,
  ) => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    const kf = selectedPreset.keyframes.find((k) => k.id === id);
    if (!kf) return;
    const nextChannels = { ...kf.channels, [key]: value };
    patchPreset(selectedPreset.id, (p) => ({
      ...p,
      keyframes: p.keyframes.map((k) =>
        k.id === id ? { ...k, channels: nextChannels } : k,
      ),
    }));
    setSelectedKeyframeId(id);
    setPlayheadMinutes(kf.minutes);
    pushToBridge(nextChannels);
  };

  const handleMoveKeyframe = (id: string, minutes: number) => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    const snapped = clampMinutes(minutes, selectedPreset.snap);
    patchPreset(selectedPreset.id, (p) => ({
      ...p,
      keyframes: p.keyframes.map((k) =>
        k.id === id ? { ...k, minutes: snapped } : k,
      ),
    }));
    setPlayheadMinutes(snapped);
  };

  const handleApplySolarRamp = (input: SolarApplyInput) => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    if (selectedPreset.mode !== "schedule") return;
    const next = applySolarRamp(selectedPreset, input);
    patchPreset(selectedPreset.id, () => next);
    setSelectedKeyframeId(null);
    setPlayheadMinutes(clampMinutes(input.startMins, selectedPreset.snap));
    pushToBridge(interpolateAt(next, input.startMins));
  };

  const handleMoveRampEdge = (
    kind: RampKind,
    edge: "start" | "end",
    minutes: number,
  ) => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    patchPreset(selectedPreset.id, (p) => moveRampEdge(p, kind, edge, minutes));
    setPlayheadMinutes(clampMinutes(minutes, selectedPreset.snap));
  };

  const slidersLocked = isFreeManual
    ? false
    : isPlayback || compositionLocked;

  const sliderHint = (() => {
    if (isFreeManual) {
      return "Free mix — drag R/G/B/UV anytime · day presets below for schedules.";
    }
    if (isPlayback) {
      if (!selectedPreset) {
        return "Playing — sliders locked · Free mix or New / Duplicate to compose.";
      }
      return selectedPreset.mode === "constant"
        ? "Playing — constant levels · read-only telemetry."
        : `Playing — ${minsToTime(playheadMinutes)} · clock CTI · read-only telemetry.`;
    }
    if (!selectedPreset) return "Manual mix — no day preset selected.";
    if (compositionLocked) {
      return "Built-in preset — read-only · Duplicate to compose.";
    }
    if (dirty) {
      return selectedPreset.mode === "constant"
        ? "Composing draft — sliders edit constant levels · Save or Cancel."
        : `Composing draft — scrubbing ${minsToTime(playheadMinutes)} · Save or Cancel.`;
    }
    if (selectedPreset.mode === "constant") {
      return "Composing — constant levels · Save to keep.";
    }
    if (selectedKeyframeId) {
      const kf = selectedPreset.keyframes.find(
        (k) => k.id === selectedKeyframeId,
      );
      if (!kf) return "Composing — keyframe.";
      const label = kf.label ? ` (${kf.label})` : "";
      return `Composing — keyframe at ${minsToTime(kf.minutes)}${label} · Save to keep.`;
    }
    return `Composing — scrubbing ${minsToTime(playheadMinutes)} · sliders write a keyframe · Save to keep.`;
  })();

  const mix = channelsToCss(local);
  /** Soft wash — tracks brightness; stay under ~0.28 so UI stays readable. */
  const washStrength = connected
    ? (0.1 + mixLuma(local) * 0.16).toFixed(3)
    : "0";
  const nextChip =
    selectedPreset && selectedPreset.mode === "schedule"
      ? describeNextEvent(
          selectedPreset,
          isPlayback ? playheadMinutes : nowMinutes(),
        )
      : null;

  return (
    <div
      className="app-shell"
      style={
        connected
          ? ({
              ["--mix" as string]: mix,
              ["--mix-strength" as string]: washStrength,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="app-bg" aria-hidden>
        <div className="caustics" />
        <div className="depth-glow" />
        {connected ? <div className="mix-wash" /> : null}
      </div>

      <header className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="min-w-0 flex-1">
          {connected ? (
            <p className="truncate text-sm text-teal-100/60">{sliderHint}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected && nextChip ? (
            <span className="hidden max-w-[14rem] truncate rounded-full border border-teal-300/20 bg-teal-950/40 px-2 py-0.5 font-mono text-[10px] tracking-wide text-teal-100/75 sm:inline-block">
              {nextChip}
            </span>
          ) : null}
          <StatusChip state={bridge.state} mock={bridge.mock} />
          {connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bridge.disconnect()}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </header>

      {connected ? (
        <div className="mix-ribbon" aria-hidden title="Live mix" />
      ) : null}

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-5xl flex-col px-5 pb-10 sm:px-8">
        {!connected ? (
          <section className="hero-enter flex flex-1 flex-col items-center justify-center text-center">
            <p className="max-w-md text-base leading-relaxed text-teal-100/70 sm:text-lg">
              Balance your Week Aqua light — cool channels, clear water light.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Button
                size="lg"
                className="min-w-[12rem]"
                disabled={!bridge.socketOpen || busy}
                onClick={() => bridge.connect()}
              >
                {busy ? "Connecting…" : "Connect"}
              </Button>
              {(bridge.bridgeError || bridge.error) && (
                <p className="max-w-sm text-sm text-rose-200/90">
                  {bridge.error ?? bridge.bridgeError}
                  {bridge.error && (
                    <button
                      type="button"
                      className="ml-2 underline decoration-rose-200/50 underline-offset-2"
                      onClick={() => bridge.connect()}
                    >
                      Retry
                    </button>
                  )}
                </p>
              )}
              {!bridge.socketOpen && !bridge.bridgeError && (
                <p className="text-sm text-teal-100/50">Reaching bridge…</p>
              )}
            </div>
          </section>
        ) : (
          <section className="controls-enter flex flex-1 flex-col gap-6 overflow-visible pt-4">
            <div
              className={`channel-strip grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${slidersLocked ? "pointer-events-none" : ""}`}
            >
              {CHANNEL_META.map((ch) => (
                <ChannelSlider
                  key={ch.key}
                  label={ch.label}
                  value={local[ch.key]}
                  accent={ch.accent}
                  disabled={slidersLocked}
                  onChange={(v) => updateChannel(ch.key, v)}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <PresetsPanel
                presets={displayPresets}
                selectedId={selectedPresetId}
                dirty={dirty}
                selectedIsCommitted={selectedIsCommitted}
                dirtyIds={dirtyIds}
                composing={isComposing}
                onSelect={(id) => {
                  if (composeIntentId && composeIntentId !== id) {
                    setComposeIntentId(null);
                  }
                  setSelectedPresetId(id);
                  setSelectedKeyframeId(null);
                  const p = displayPresets.find((x) => x.id === id);
                  if (!p) return;
                  if (p.mode === "constant") {
                    pushToBridge({ ...p.constantChannels });
                  } else {
                    pushToBridge(
                      interpolateAt(
                        p,
                        composeIntentId === id ? playheadMinutes : nowMinutes(),
                      ),
                    );
                  }
                }}
                onCreate={handleCreatePreset}
                onRename={(id, name) =>
                  patchPreset(id, (p) => ({ ...p, name }))
                }
                onRequestCompose={handleRequestCompose}
                onDelete={handleDeletePreset}
                onModeChange={handleModeChange}
                onSnapChange={(id, snap: SnapMode) =>
                  patchPreset(id, (p) => ({ ...p, snap }))
                }
                onSave={handleSave}
                onDiscard={handleDiscard}
                onDuplicate={handleDuplicate}
              />

              <DayTimeline
                preset={selectedPreset}
                selectedKeyframeId={selectedKeyframeId}
                playheadMinutes={playheadMinutes}
                composing={isComposing}
                compositionLocked={compositionLocked}
                descriptionEditable={
                  isComposing && Boolean(selectedPreset) && !compositionLocked
                }
                onScrub={(mins) => {
                  if (isPlayback) return;
                  setPlayheadMinutes(mins);
                  setSelectedKeyframeId(null);
                  if (selectedPreset) {
                    pushToBridge(interpolateAt(selectedPreset, mins));
                  }
                }}
                onSelectKeyframe={(id) => {
                  if (isPlayback || compositionLocked) return;
                  setSelectedKeyframeId(id);
                  if (!id || !selectedPreset) return;
                  const kf = selectedPreset.keyframes.find((k) => k.id === id);
                  if (kf) {
                    setPlayheadMinutes(kf.minutes);
                    pushToBridge({ ...kf.channels });
                  }
                }}
                onMoveKeyframe={handleMoveKeyframe}
                onAddKeyframe={handleAddKeyframe}
                onDeleteKeyframe={handleDeleteKeyframe}
                onKeyframeChannelChange={handleKeyframeChannelChange}
                onApplySolarRamp={handleApplySolarRamp}
                onMoveRampEdge={handleMoveRampEdge}
                onDescriptionChange={(description) => {
                  if (!selectedPresetId) return;
                  patchPreset(selectedPresetId, (p) => ({
                    ...p,
                    description,
                  }));
                }}
              />
            </div>

            {bridge.error && (
              <p className="text-center text-sm text-rose-200/90">
                {bridge.error}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
