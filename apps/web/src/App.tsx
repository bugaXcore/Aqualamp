import { useEffect, useState } from "react";
import { ChannelDial } from "@/components/ChannelDial";
import { DayTimeline } from "@/components/DayTimeline";
import { PresetsPanel } from "@/components/PresetsPanel";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/button";
import { useBridge } from "@/hooks/useBridge";
import { channelsToCss, type Channels } from "@/lib/bridge";
import {
  clampMinutes,
  createEmptyPreset,
  interpolateAt,
  loadPresets,
  minsToTime,
  newId,
  savePresets,
  type DayPreset,
  type PresetMode,
  type SnapMode,
} from "@/lib/presets";

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
  const [local, setLocal] = useState<Channels>(bridge.channels);
  const [presets, setPresets] = useState<DayPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(
    null,
  );
  const [playheadMinutes, setPlayheadMinutes] = useState(12 * 60);
  const [hydrated, setHydrated] = useState(false);

  const connected = bridge.state === "connected";
  const busy = bridge.state === "connecting" || bridge.state === "scanning";
  const selectedPreset =
    presets.find((p) => p.id === selectedPresetId) ?? null;

  useEffect(() => {
    const loaded = loadPresets();
    setPresets(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePresets(presets);
  }, [presets, hydrated]);

  useEffect(() => {
    setLocal(bridge.channels);
  }, [bridge.channels]);

  /** When scrubbing with no keyframe selected (schedule) or always in constant, sync dials. */
  useEffect(() => {
    if (!selectedPreset) return;
    if (selectedPreset.mode === "constant") {
      setLocal({ ...selectedPreset.constantChannels });
      return;
    }
    if (selectedKeyframeId) {
      const kf = selectedPreset.keyframes.find((k) => k.id === selectedKeyframeId);
      if (kf) setLocal({ ...kf.channels });
      return;
    }
    setLocal(interpolateAt(selectedPreset, playheadMinutes));
  }, [selectedPreset, selectedKeyframeId, playheadMinutes]);

  const patchPreset = (id: string, patch: (p: DayPreset) => DayPreset) => {
    setPresets((prev) => prev.map((p) => (p.id === id ? patch(p) : p)));
  };

  const pushToBridge = (channels: Channels) => {
    setLocal(channels);
    bridge.setChannels(channels);
  };

  const updateChannel = (key: keyof Channels, value: number) => {
    if (!selectedPreset) {
      const next = { ...local, [key]: value };
      pushToBridge(next);
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

    // Schedule mode
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

    // No keyframe selected → create one at playhead from current mix
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
        keyframes: [
          ...p.keyframes,
          { id, minutes, channels: nextChannels },
        ],
      }));
      setSelectedKeyframeId(id);
    }
    pushToBridge(nextChannels);
  };

  const handleCreatePreset = () => {
    const preset = createEmptyPreset(`Preset ${presets.length + 1}`);
    setPresets((prev) => [...prev, preset]);
    setSelectedPresetId(preset.id);
    setSelectedKeyframeId(null);
    setLocal({ ...preset.constantChannels });
  };

  const handleDeletePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (selectedPresetId === id) {
      setSelectedPresetId(null);
      setSelectedKeyframeId(null);
    }
  };

  const handleModeChange = (id: string, mode: PresetMode) => {
    patchPreset(id, (p) => ({ ...p, mode }));
    setSelectedKeyframeId(null);
  };

  const handleAddKeyframe = (minutes: number, channels: Channels) => {
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

  const handleMoveKeyframe = (id: string, minutes: number) => {
    if (!selectedPreset) return;
    const snapped = clampMinutes(minutes, selectedPreset.snap);
    patchPreset(selectedPreset.id, (p) => ({
      ...p,
      keyframes: p.keyframes.map((k) =>
        k.id === id ? { ...k, minutes: snapped } : k,
      ),
    }));
    setPlayheadMinutes(snapped);
  };

  const dialHint = (() => {
    if (!selectedPreset) return "Manual mix — no day preset selected.";
    if (selectedPreset.mode === "constant") {
      return "Editing constant levels for this preset.";
    }
    if (selectedKeyframeId) {
      const kf = selectedPreset.keyframes.find((k) => k.id === selectedKeyframeId);
      return kf
        ? `Editing keyframe at ${minsToTime(kf.minutes)}.`
        : "Editing keyframe.";
    }
    return `Scrubbing ${minsToTime(playheadMinutes)} — dials create a keyframe here.`;
  })();

  const mix = channelsToCss(local);

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden>
        <div className="caustics" />
        <div className="depth-glow" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <div className="font-[Syne] text-lg font-bold tracking-tight text-teal-50/90 sm:text-xl">
          AquaLamp
        </div>
        <StatusChip state={bridge.state} mock={bridge.mock} />
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-5xl flex-col px-5 pb-10 sm:px-8">
        {!connected ? (
          <section className="hero-enter flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="font-[Syne] text-6xl font-extrabold tracking-tight text-white sm:text-7xl md:text-8xl">
              AquaLamp
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-teal-100/70 sm:text-lg">
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
          <section className="controls-enter flex flex-1 flex-col gap-10 overflow-visible pt-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-[Syne] text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Channels
                </h2>
                <p className="mt-2 max-w-md text-sm text-teal-100/60">
                  {dialHint}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => bridge.disconnect()}>
                Disconnect
              </Button>
            </div>

            <div
              className="tank-preview"
              style={{
                ["--mix" as string]: mix,
              }}
            >
              <div className="tank-glow" />
              <span className="relative z-10 font-[Figtree] text-xs font-medium tracking-[0.2em] text-white/70 uppercase">
                Live mix
              </span>
            </div>

            <div className="grid grid-cols-2 gap-10 overflow-visible px-3 sm:gap-12 lg:grid-cols-4 lg:gap-8 lg:px-4">
              {CHANNEL_META.map((ch) => (
                <ChannelDial
                  key={ch.key}
                  label={ch.label}
                  value={local[ch.key]}
                  accent={ch.accent}
                  onChange={(v) => updateChannel(ch.key, v)}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <PresetsPanel
                presets={presets}
                selectedId={selectedPresetId}
                onSelect={(id) => {
                  setSelectedPresetId(id);
                  setSelectedKeyframeId(null);
                  const p = presets.find((x) => x.id === id);
                  if (!p) return;
                  if (p.mode === "constant") {
                    pushToBridge({ ...p.constantChannels });
                  } else {
                    pushToBridge(interpolateAt(p, playheadMinutes));
                  }
                }}
                onCreate={handleCreatePreset}
                onRename={(id, name) =>
                  patchPreset(id, (p) => ({ ...p, name }))
                }
                onDelete={handleDeletePreset}
                onModeChange={handleModeChange}
                onSnapChange={(id, snap: SnapMode) =>
                  patchPreset(id, (p) => ({ ...p, snap }))
                }
              />

              <DayTimeline
                preset={selectedPreset}
                selectedKeyframeId={selectedKeyframeId}
                playheadMinutes={playheadMinutes}
                onScrub={(mins) => {
                  setPlayheadMinutes(mins);
                  setSelectedKeyframeId(null);
                  if (selectedPreset) {
                    pushToBridge(interpolateAt(selectedPreset, mins));
                  }
                }}
                onSelectKeyframe={(id) => {
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
              />
            </div>

            {selectedPreset?.mode === "schedule" && selectedKeyframeId && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    patchPreset(selectedPreset.id, (p) => ({
                      ...p,
                      keyframes: p.keyframes.filter(
                        (k) => k.id !== selectedKeyframeId,
                      ),
                    }));
                    setSelectedKeyframeId(null);
                    pushToBridge(
                      interpolateAt(
                        {
                          ...selectedPreset,
                          keyframes: selectedPreset.keyframes.filter(
                            (k) => k.id !== selectedKeyframeId,
                          ),
                        },
                        playheadMinutes,
                      ),
                    );
                  }}
                >
                  Delete keyframe
                </Button>
              </div>
            )}

            {bridge.error && (
              <p className="text-center text-sm text-rose-200/90">{bridge.error}</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
