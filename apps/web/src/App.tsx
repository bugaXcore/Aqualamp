import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChannelSlider } from "@/components/ChannelSlider";
import { AsciiBackground } from "@/components/AsciiBackground";
import { AsciiTunePanel } from "@/components/AsciiTunePanel";
import { DayTimeline } from "@/components/DayTimeline";
import { PresetsPanel } from "@/components/PresetsPanel";
import { Button } from "@/components/ui/button";
import { useBridge } from "@/hooks/useBridge";
import { useLamp } from "@/hooks/useLamp";
import { useConnectRetry } from "@/hooks/useConnectRetry";
import { Bluetooth, BluetoothConnected, BluetoothOff, Power } from "lucide-react";
import { compileSchedule } from "@aqualamp/core";
import { IconButton } from "@/components/ui/icon-button";
import { SettingsMenu } from "@/components/SettingsMenu";
import { useKoiControls } from "@/lib/koiControls";
import { useLampMode } from "@/lib/lampMode";
import { ConnectGuide, explainError } from "@/components/ConnectGuide";
import { channelsToCss, type Channels } from "@/lib/bridge";
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
  litKeyCount,
  loadUserPresets,
  MAX_LIT_KEYS,
  minsToTime,
  newId,
  presetsEqual,
  saveUserPresets,
  exceedsKeyLimit,
  simplifyToLimit,
  type DayPreset,
  type Keyframe,
  type RampKind,
  type SnapMode,
} from "@/lib/presets";
import {
  applySolarRamp,
  describeNextEvent,
  moveRampEdge,
  type SolarApplyInput,
} from "@/lib/ramps";

const PLAYING_KEY = "aqualamp.playingPreset";
/** Preset the lamp runs on its own (five-step schedule) while the app is closed. */
/** Last schedule uploaded for that preset, so reconnecting does not rewrite an identical one. */
const LAMP_RUN_SIG_KEY = "aqualamp.lampRunSig";

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

// Fixed for the page load. `?transport=ble` or `?transport=bridge` forces one; otherwise the
// PC dev page uses the bridge and any hosted page (phone, installed app) uses Web Bluetooth.
const useTransport = (() => {
  const forced = new URLSearchParams(window.location.search).get("transport");
  if (forced === "ble") return useLamp;
  if (forced === "bridge") return useBridge;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  return local ? useBridge : useLamp;
})();

export default function App() {
  const bridge = useTransport();
  const [koiControls] = useKoiControls();
  const [local, setLocal] = useState<Channels>({ ...FREE_MANUAL_CHANNELS });
  /** Committed user presets (localStorage). */
  const [savedUserPresets, setSavedUserPresets] = useState<DayPreset[]>([]);
  /** Draft overlays + never-saved new presets. */
  const [drafts, setDrafts] = useState<Record<string, DayPreset>>({});
  /** Default = Sliders mode so top controls never open dead. */
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    FREE_MANUAL_PRESET_ID,
  );
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(
    null,
  );
  const [playheadMinutes, setPlayheadMinutes] = useState(12 * 60);
  /** Non-null = composing that preset id (intent from New / Edit / Duplicate). */
  const [composeIntentId, setComposeIntentId] = useState<string | null>(null);
  /** Preset the app is sending to the lamp. Selection alone never sends. */
  const [playingId, setPlayingId] = useState<string | null>(() =>
    localStorage.getItem(PLAYING_KEY),
  );
  /** User dragged the preview playhead; stops it following the clock. */
  const [scrubbed, setScrubbed] = useState(false);
  /** Net "offset all keys" applied to the open draft, minutes wrapped to -720..720. */
  const [shiftMinutes, setShiftMinutes] = useState(0);
  const [history, setHistory] = useState<
    Record<string, { preset: DayPreset; shift: number }[]>
  >({});
  const lastHistoryPush = useRef({ id: "", t: 0 });
  /** The app cannot read the lamp's state, so this only tracks what it last asked for. */
  const [powered, setPowered] = useState(true);
  const [lampMode] = useLampMode();
  /** Hardware mode: the lamp runs the playing preset on its own schedule, even with the app closed. */
  const lampRunId =
    lampMode === "hardware" &&
    powered &&
    playingId !== null &&
    playingId !== FREE_MANUAL_PRESET_ID
      ? playingId
      : null;
  /** Short message under the timeline title (limit reached, preset simplified). */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef(0);
  const showNotice = (text: string, ms = 4000) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), ms);
  };
  const connected = bridge.state === "connected";
  const busy = bridge.state === "connecting" || bridge.state === "scanning";
  const [rememberLamp, setRememberLamp] = useState(
    () => localStorage.getItem("aqualamp.rememberLamp") !== "0",
  );
  const lampRunRef = useRef(lampRunId);
  lampRunRef.current = lampRunId;
  const retry = useConnectRetry({
    state: bridge.state,
    error: bridge.error,
    connect: () =>
      bridge.connect({
        remember: rememberLamp,
        keepProgram: lampRunRef.current !== null,
      }),
  });
  const startConnect = retry.start;
  const handleRememberChange = (next: boolean) => {
    setRememberLamp(next);
    localStorage.setItem("aqualamp.rememberLamp", next ? "1" : "0");
    if (!next) bridge.forgetDevice();
  };
  const isComposing =
    composeIntentId !== null && composeIntentId === selectedPresetId;
  const isPlayback = !isComposing;
  const setChannelsRef = useRef(bridge.setChannels);
  setChannelsRef.current = bridge.setChannels;

  const enterCompose = (id: string) => {
    if (isBuiltinPreset(id)) return;
    setComposeIntentId(id);
    setShiftMinutes(0);
    setSelectedPresetId(id);
  };

  const exitCompose = () => {
    setComposeIntentId(null);
    setShiftMinutes(0);
    setScrubbed(false);
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
  /** Built-in day looks are read-only; Sliders mode is not locked. */
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
    if (playingId && playingId !== FREE_MANUAL_PRESET_ID) {
      localStorage.setItem(PLAYING_KEY, playingId);
    } else {
      localStorage.removeItem(PLAYING_KEY);
    }
  }, [playingId]);

  /** The lamp always plays the saved version, never an open draft. */
  const playingPreset = useMemo(() => {
    if (!playingId || playingId === FREE_MANUAL_PRESET_ID) return null;
    return (
      [...BUILTIN_PRESETS, ...savedUserPresets].find(
        (p) => p.id === playingId,
      ) ?? null
    );
  }, [playingId, savedUserPresets]);

  const neverSavedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(drafts)) {
      if (!isBuiltinPreset(id) && !savedUserPresets.some((p) => p.id === id)) {
        ids.add(id);
      }
    }
    return ids;
  }, [drafts, savedUserPresets]);

  const runPreset = useMemo(() => {
    if (!lampRunId) return null;
    return (
      [...BUILTIN_PRESETS, ...savedUserPresets].find((p) => p.id === lampRunId) ??
      null
    );
  }, [lampRunId, savedUserPresets]);

  // The lamp runs its own schedule while the app streams nothing.
  const runningOnLamp = lampRunId !== null && lampRunId === playingId;
  /** Power-on resets the lamp to its default colour; colours sent before it settles get lost. */
  const resumeAt = useRef(0);

  useEffect(() => {
    if (!connected || !playingPreset || runningOnLamp || !powered) return;
    let last = "";
    const send = () => {
      if (Date.now() < resumeAt.current) return;
      const channels = interpolateAt(playingPreset, nowMinutes());
      const key = JSON.stringify(channels);
      if (key === last) return;
      last = key;
      setChannelsRef.current(channels);
    };
    send();
    const id = window.setInterval(send, 1000);
    return () => window.clearInterval(id);
  }, [connected, playingPreset, runningOnLamp, powered]);

  useEffect(() => {
    if (!connected || !runPreset || !powered) return;
    const windows = compileSchedule((m) => interpolateAt(runPreset, m));
    const sig = JSON.stringify([windows, bridge.calibrated]);
    if (sig === localStorage.getItem(LAMP_RUN_SIG_KEY) && bridge.mode === 2) {
      return;
    }
    const wait = Math.max(400, resumeAt.current - Date.now());
    const t = window.setTimeout(() => {
      bridge.setSchedule(windows);
      localStorage.setItem(LAMP_RUN_SIG_KEY, sig);
    }, wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, runPreset, powered, bridge.calibrated, bridge.mode]);

  const endLampRun = () => {
    if (lampRunRef.current === null) return;
    localStorage.removeItem(LAMP_RUN_SIG_KEY);
    if (connected) bridge.setMode(1);
  };

  // Leaving hardware mode hands the lamp back to the app's own colour stream.
  const prevRunId = useRef(lampRunId);
  useEffect(() => {
    if (prevRunId.current !== null && lampRunId === null && powered) {
      localStorage.removeItem(LAMP_RUN_SIG_KEY);
      if (connected) bridge.setMode(1);
    }
    prevRunId.current = lampRunId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lampRunId]);

  useEffect(() => {
    if (connected) setPowered(true);
  }, [connected]);

  const wakeLamp = () => {
    if (powered) return;
    setPowered(true);
    bridge.power(true);
    resumeAt.current = Date.now() + 2500;
  };

  const handlePower = () => {
    if (powered) {
      setPowered(false);
      localStorage.removeItem(LAMP_RUN_SIG_KEY);
      bridge.power(false);
      return;
    }
    wakeLamp();
    if (playingId === FREE_MANUAL_PRESET_ID) {
      window.setTimeout(() => bridge.setChannels(local), 2500);
    }
  };

  useEffect(() => {
    if (isFreeManual) return;
    if (isPlayback) return;
    setLocal(bridge.channels);
  }, [bridge.channels, isPlayback, isFreeManual]);

  useEffect(() => {
    if (!isPlayback) return;
    const tick = () => {
      if (!scrubbed) setPlayheadMinutes(nowMinutes());
      setSelectedKeyframeId(null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isPlayback, scrubbed]);

  useEffect(() => {
    if (!selectedPreset) return;
    /** Sliders mode is user-driven — never overwrite local from playhead ticks. */
    if (isFreeManualPreset(selectedPreset)) return;
    if (isPlayback) {
      setLocal(interpolateAt(selectedPreset, playheadMinutes));
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

  const pushToBridge = (channels: Channels) => {
    setLocal(channels);
    // Only Sliders mode drives the lamp directly; every preset edit is local until played.
    if (isFreeManual) {
      endLampRun();
      const wasOff = !powered;
      wakeLamp();
      setPlayingId(FREE_MANUAL_PRESET_ID);
      if (wasOff) window.setTimeout(() => bridge.setChannels(channels), 2500);
      else bridge.setChannels(channels);
    }
  };

  const handlePlay = (id: string) => {
    if (id === FREE_MANUAL_PRESET_ID) {
      endLampRun();
      const wasOff = !powered;
      wakeLamp();
      setPlayingId(id);
      if (wasOff) window.setTimeout(() => bridge.setChannels(local), 2500);
      else bridge.setChannels(local);
      return;
    }
    if (!BUILTIN_PRESETS.some((p) => p.id === id) && !savedUserPresets.some((p) => p.id === id)) return;
    wakeLamp();
    setPlayingId(id);
  };

  // Rapid edits (slider drags) collapse into one undo step.
  const pushHistory = (id: string) => {
    const base =
      drafts[id] ??
      savedUserPresets.find((p) => p.id === id) ??
      displayPresets.find((p) => p.id === id);
    if (!base) return;
    const now = Date.now();
    const last = lastHistoryPush.current;
    lastHistoryPush.current = { id, t: now };
    if (last.id === id && now - last.t < 500) return;
    setHistory((prev) => ({
      ...prev,
      [id]: [...(prev[id] ?? []).slice(-49), { preset: clonePreset(base), shift: shiftMinutes }],
    }));
  };

  const clearHistory = (id: string) =>
    setHistory((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const handleUndo = () => {
    if (!selectedPresetId) return;
    const stack = history[selectedPresetId];
    const entry = stack?.[stack.length - 1];
    if (!entry) return;
    lastHistoryPush.current = { id: "", t: 0 };
    setHistory((prev) => ({ ...prev, [selectedPresetId]: stack.slice(0, -1) }));
    setDrafts((prev) => ({ ...prev, [selectedPresetId]: entry.preset }));
    setShiftMinutes(entry.shift);
    setSelectedKeyframeId(null);
    setLocal(
      entry.preset.mode === "constant"
        ? { ...entry.preset.constantChannels }
        : interpolateAt(entry.preset, playheadMinutes),
    );
  };

  const patchPreset = (id: string, patch: (p: DayPreset) => DayPreset) => {
    if (isBuiltinPreset(id) || isPlayback) return;
    pushHistory(id);
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
      const id = newId();
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        mode: "schedule",
        constantChannels: nextChannels,
        keyframes: [{ id, minutes: 0, channels: nextChannels }],
      }));
      setSelectedKeyframeId(id);
      pushToBridge(nextChannels);
      return;
    }

    if (selectedKeyframeId) {
      const nextChannels = { ...local, [key]: value };
      if (
        blockedByLimit(
          selectedPreset.keyframes.map((k) =>
            k.id === selectedKeyframeId ? { ...k, channels: nextChannels } : k,
          ),
        )
      )
        return;
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
    const id = existing?.id ?? newId();
    if (
      blockedByLimit(
        existing
          ? selectedPreset.keyframes.map((k) =>
              k.id === existing.id ? { ...k, channels: nextChannels } : k,
            )
          : [
              ...selectedPreset.keyframes,
              { id, minutes, channels: nextChannels },
            ],
      )
    )
      return;
    if (existing) {
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        keyframes: p.keyframes.map((k) =>
          k.id === existing.id ? { ...k, channels: nextChannels } : k,
        ),
      }));
      setSelectedKeyframeId(existing.id);
    } else {
      patchPreset(selectedPreset.id, (p) => ({
        ...p,
        keyframes: [...p.keyframes, { id, minutes, channels: nextChannels }],
      }));
      setSelectedKeyframeId(id);
    }
    pushToBridge(nextChannels);
  };

  const blockedByLimit = (next: Keyframe[]) => {
    if (!selectedPreset || !exceedsKeyLimit(selectedPreset, next)) return false;
    showNotice(
      `Limit reached: ${MAX_LIT_KEYS} of ${MAX_LIT_KEYS} keys. Delete one or set a key to off.`,
    );
    return true;
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
    clearHistory(selectedPresetId);
    exitCompose();
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
    }
    clearHistory(selectedPresetId);
    exitCompose();
  };

  const handleDeletePreset = (id: string) => {
    if (isBuiltinPreset(id) || id === playingId) return;
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
    clearHistory(id);
    if (composeIntentId === id) setComposeIntentId(null);
    if (selectedPresetId === id) {
      setSelectedPresetId(null);
      setSelectedKeyframeId(null);
    }
  };

  const handleDuplicate = (id: string) => {
    const source = displayPresets.find((p) => p.id === id);
    if (!source) return;
    const full = duplicateAsUserPreset(source);
    const copy = simplifyToLimit(full);
    if (copy !== full) {
      showNotice(
        `Simplified from ${litKeyCount(full)} to ${MAX_LIT_KEYS} keys to fit the lamp.`,
        8000,
      );
    }
    setDrafts((prev) => ({ ...prev, [copy.id]: copy }));
    setSelectedKeyframeId(null);
    enterCompose(copy.id);
    setLocal(
      copy.mode === "constant"
        ? { ...copy.constantChannels }
        : interpolateAt(copy, playheadMinutes),
    );
  };

  const handleRequestCompose = (id: string) => {
    const original = displayPresets.find((p) => p.id === id);
    if (!original || isBuiltinPreset(original)) return;
    const source = simplifyToLimit(original);
    if (source !== original) {
      pushHistory(id);
      setDrafts((prev) => ({ ...prev, [id]: source }));
      showNotice(
        `Simplified from ${litKeyCount(original)} to ${MAX_LIT_KEYS} keys to fit the lamp. Undo restores it.`,
        8000,
      );
    }
    enterCompose(id);
    setLocal(
      source.mode === "constant"
        ? { ...source.constantChannels }
        : interpolateAt(source, playheadMinutes),
    );
  };

  const handleShiftAll = (delta: number) => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    if (selectedPreset.mode !== "schedule") return;
    patchPreset(selectedPreset.id, (p) => ({
      ...p,
      keyframes: p.keyframes.map((k) => ({
        ...k,
        minutes: (((k.minutes + delta) % 1440) + 1440) % 1440,
      })),
    }));
    setShiftMinutes((s) => {
      const wrapped = (((s + delta) % 1440) + 1440) % 1440;
      return wrapped > 720 ? wrapped - 1440 : wrapped;
    });
    setPlayheadMinutes((m) => (((m + delta) % 1440) + 1440) % 1440);
  };

  const handleResetToSaved = () => {
    if (!selectedPresetId || !selectedIsCommitted) return;
    const id = selectedPresetId;
    pushHistory(id);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setShiftMinutes(0);
    setSelectedKeyframeId(null);
  };

  const handleClearKeys = () => {
    if (isPlayback || compositionLocked || !selectedPreset) return;
    patchPreset(selectedPreset.id, (p) => ({ ...p, keyframes: [] }));
    setSelectedKeyframeId(null);
    setShiftMinutes(0);
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
    if (
      blockedByLimit([
        ...selectedPreset.keyframes,
        { id, minutes: snapped, channels },
      ])
    )
      return;
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
    if (
      blockedByLimit(
        selectedPreset.keyframes.map((k) =>
          k.id === id ? { ...k, channels: nextChannels } : k,
        ),
      )
    )
      return;
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
      return "Sliders mode — drag R/G/B/UV anytime · day presets below for schedules.";
    }
    if (isPlayback) {
      if (!selectedPreset) {
        return "Nothing selected · tap a preset to preview it.";
      }
      const onLamp = selectedPreset.id === playingId;
      const when = scrubbed ? minsToTime(playheadMinutes) : "now";
      if (onLamp) {
        return scrubbed
          ? `Playing on the lamp · previewing ${when} · tap the preset to return to now.`
          : "Playing on the lamp.";
      }
      return `Previewing ${when} — not on the lamp · press play to send it.`;
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
  const nextChip =
    selectedPreset && selectedPreset.mode === "schedule"
      ? describeNextEvent(
          selectedPreset,
          isPlayback ? playheadMinutes : nowMinutes(),
        )
      : null;

  const mockTag = bridge.mock ? " (mock)" : "";
  const connectLabel =
    bridge.state === "connected"
      ? `Connected${mockTag}. Select to disconnect`
      : busy
        ? `Connecting${mockTag}. Select to cancel`
        : bridge.state === "error"
          ? "Connection failed. Select to retry"
          : "Disconnected. Select to connect";
  const ConnectIcon =
    bridge.state === "connected"
      ? BluetoothConnected
      : bridge.state === "disconnected"
        ? BluetoothOff
        : Bluetooth;
  const onConnectButton = () => {
    if (bridge.state === "connected") bridge.disconnect();
    else if (busy || retry.retrying) retry.stop();
    else startConnect();
  };

  return (
    <div
      className="app-shell"
      style={
        connected
          ? ({
              ["--mix" as string]: mix,
            } as CSSProperties)
          : undefined
      }
    >
      <AsciiBackground />
      {koiControls ? <AsciiTunePanel /> : null}
      <header className="relative z-40 flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="min-w-0 flex-1">
          {connected ? (
            <p className="truncate text-sm text-teal-100/60">{sliderHint}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {connected && nextChip ? (
            <span className="hidden max-w-[14rem] truncate rounded-full border border-teal-300/20 bg-teal-950/40 px-2 py-0.5 font-mono text-[10px] tracking-wide text-teal-100/75 sm:inline-block">
              {nextChip}
            </span>
          ) : null}
          <IconButton
            label={connectLabel}
            data-status={bridge.state}
            disabled={bridge.state === "disconnected" && !bridge.socketOpen}
            onClick={onConnectButton}
          >
            <ConnectIcon aria-hidden />
          </IconButton>
          {connected ? (
            <IconButton
              label={powered ? "Turn lamp off" : "Turn lamp on"}
              aria-pressed={powered}
              onClick={handlePower}
            >
              <Power aria-hidden className={powered ? "" : "opacity-50"} />
            </IconButton>
          ) : null}
          <SettingsMenu
            calibrated={bridge.calibrated}
            onCalibratedChange={bridge.setCalibrated}
          />
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
                onClick={startConnect}
              >
                {busy ? "Connecting…" : "Connect"}
              </Button>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-teal-100/70">
                <input
                  type="checkbox"
                  checked={rememberLamp}
                  onChange={(e) => handleRememberChange(e.target.checked)}
                  className="accent-teal-300"
                />
                Remember this lamp
              </label>
              {(bridge.bridgeError || bridge.error) && (
                <p className="max-w-sm text-sm text-rose-200/90">
                  {explainError(bridge.error ?? bridge.bridgeError ?? "")}
                </p>
              )}
              {retry.retrying && (
                <p className="max-w-sm text-sm text-teal-100/70" role="status">
                  {busy
                    ? `Attempt ${retry.attempt} of ${retry.maxAttempts}…`
                    : `Trying again shortly (attempt ${Math.min(retry.attempt + 1, retry.maxAttempts)} of ${retry.maxAttempts}).`}
                  <button
                    type="button"
                    className="ml-2 underline decoration-teal-100/40 underline-offset-2"
                    onClick={retry.stop}
                  >
                    Stop
                  </button>
                </p>
              )}
              {!retry.retrying && bridge.error && !busy && (
                <button
                  type="button"
                  className="text-sm text-teal-100/70 underline decoration-teal-100/40 underline-offset-2"
                  onClick={startConnect}
                >
                  Try again
                </button>
              )}
              {!bridge.socketOpen && !bridge.bridgeError && (
                <p className="text-sm text-teal-100/50">Reaching bridge…</p>
              )}
              <ConnectGuide viaBridge={useTransport === useBridge} />
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
            <p className="-mt-3 text-[11px] text-teal-100/45">
              The lamp eases to each new colour over about 15 seconds, so changes look delayed.
            </p>

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
                    setShiftMinutes(0);
                  }
                  setSelectedPresetId(id);
                  setSelectedKeyframeId(null);
                  setScrubbed(false);
                  if (composeIntentId !== id) setPlayheadMinutes(nowMinutes());
                }}
                playingId={playingId}
                neverSavedIds={neverSavedIds}
                onPlay={handlePlay}
                onCreate={handleCreatePreset}
                onRename={(id, name) =>
                  patchPreset(id, (p) => ({ ...p, name }))
                }
                onRequestCompose={handleRequestCompose}
                onDelete={handleDeletePreset}
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
                shiftMinutes={shiftMinutes}
                onShiftAll={handleShiftAll}
                canReset={dirty && selectedIsCommitted}
                onReset={handleResetToSaved}
                canUndo={Boolean(
                  selectedPresetId && history[selectedPresetId]?.length,
                )}
                onUndo={handleUndo}
                onClearKeys={handleClearKeys}
                onCurveChange={(curve) =>
                  selectedPresetId &&
                  patchPreset(selectedPresetId, (p) => ({
                    ...p,
                    curve: curve === "sharp" ? "sharp" : undefined,
                  }))
                }
                onAir={
                  selectedPresetId !== null &&
                  selectedPresetId === playingId &&
                  !scrubbed
                }
                descriptionEditable={
                  isComposing && Boolean(selectedPreset) && !compositionLocked
                }
                onScrub={(mins) => {
                  setPlayheadMinutes(mins);
                  setSelectedKeyframeId(null);
                  if (isPlayback) setScrubbed(true);
                  else if (selectedPreset) {
                    setLocal(interpolateAt(selectedPreset, mins));
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
                notice={notice}
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
