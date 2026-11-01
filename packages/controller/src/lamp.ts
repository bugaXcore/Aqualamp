import {
  assertAllowedFrame,
  colorFrame,
  modeFrame,
  percentToWire,
  powerOffFrame,
  powerOnFrames,
  presetFrame,
  sessionSetupFrames,
  slotFrames,
  timerFrame,
  bytesToHex,
  type ClockTime,
  type Frame,
} from "./frames.js";
import type { LampTransport } from "./transport.js";
import { calibrateChannels, MEASURED_CURVES, type CalibrationCurves } from "./calibration.js";
import { MAX_SLOTS, type ScheduleWindow } from "./schedule.js";
import { DEFAULT_CHANNELS, normalizeChannels, type Channels, type ConnectionState } from "./types.js";

export type LampSnapshot = {
  state: ConnectionState;
  channels: Channels;
  error: string | null;
  mode: 1 | 2;
  calibrated: boolean;
};

export type LampOptions = {
  /** Pause between frames of one multi-frame command. The bench used 500 ms. */
  frameGapMs?: number;
  now?: () => Date;
  /** Send brightness-corrected levels so sliders look linear. Default off (raw wire scale). */
  calibrated?: boolean;
  curves?: CalibrationCurves;
  /** Automatic retries after an unexpected drop. Default 0 (off). */
  reconnectAttempts?: number;
  /** Wait before retry n is n times this. Default 2000 ms. */
  reconnectDelayMs?: number;
};

/**
 * One lamp on top of a transport: runs the connect sequence, and sends only the
 * latest colour (never a queue of stale ones) and only when it changed.
 */
export class Lamp {
  private snapshot: LampSnapshot = {
    state: "disconnected",
    channels: { ...DEFAULT_CHANNELS },
    error: null,
    mode: 1,
    calibrated: false,
  };
  private readonly curves: CalibrationCurves;
  private listeners = new Set<(s: LampSnapshot) => void>();
  private desired: Channels = { ...DEFAULT_CHANNELS };
  // Until a colour is set, connecting must not blank a lamp that is already lit.
  private hasDesired = false;
  private lastSentHex: string | null = null;
  private chain: Promise<void> = Promise.resolve();
  private flushQueued = false;
  private readonly frameGapMs: number;
  private readonly reconnectAttempts: number;
  private readonly reconnectDelayMs: number;
  private reconnecting = false;
  // Bumped by disconnect() so a pending reconnect knows the user gave up.
  private session = 0;
  private lastLampId: string | undefined;
  private readonly now: () => Date;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly transport: LampTransport,
    options: LampOptions = {},
  ) {
    this.frameGapMs = options.frameGapMs ?? 500;
    this.reconnectAttempts = options.reconnectAttempts ?? 0;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000;
    this.now = options.now ?? (() => new Date());
    this.curves = options.curves ?? MEASURED_CURVES;
    this.snapshot.calibrated = options.calibrated ?? false;
    this.unsubscribe = transport.onState((state, error) => this.onTransportState(state, error));
  }

  get current(): LampSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: LampSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  async connect(lampId?: string): Promise<void> {
    if (this.snapshot.state === "connecting" || this.snapshot.state === "connected") return;
    this.lastLampId = lampId;
    this.session += 1;
    this.update({ state: "connecting", error: null });
    await this.establish(lampId);
  }

  private async establish(lampId?: string): Promise<void> {
    try {
      await this.transport.connect(lampId);
      this.lastSentHex = null;
      await this.sendSequence(sessionSetupFrames(this.now()));
      this.update({ state: "connected", mode: 1 });
      this.scheduleFlush();
    } catch (error) {
      await this.transport.disconnect().catch(() => {});
      this.update({ state: "error", error: message(error) });
    }
  }

  async disconnect(): Promise<void> {
    this.session += 1;
    // Mark closed first so the transport's own "disconnected" is not treated as a drop.
    this.update({ state: "disconnected" });
    await this.transport.disconnect();
    this.update({ state: "disconnected" });
  }

  /** Latest-wins: later calls overwrite what has not been written yet. */
  setChannels(partial: Partial<Channels> & { white?: number }): void {
    this.desired = normalizeChannels(partial, this.desired);
    this.hasDesired = true;
    this.update({ channels: this.desired });
    this.scheduleFlush();
  }

  async powerOff(): Promise<void> {
    this.desired = { ...DEFAULT_CHANNELS };
    this.hasDesired = true;
    this.update({ channels: this.desired, mode: 1 });
    await this.command([modeFrame(1), powerOffFrame()]);
    this.lastSentHex = bytesToHex(this.desiredFrame());
  }

  /** The official app's power-on: mode 1, preset 3, always-on window. */
  async powerOn(): Promise<void> {
    await this.command(powerOnFrames());
    this.desired = { red: 51, green: 95, blue: 49, uv: 100 };
    this.hasDesired = true;
    this.lastSentHex = bytesToHex(presetFrame(2));
    this.update({ channels: this.desired, mode: 1 });
  }

  async setMode(mode: 1 | 2): Promise<void> {
    await this.command([modeFrame(mode)]);
    this.update({ mode });
  }

  async setTimer(sunrise: ClockTime, sunset: ClockTime, fade = 0): Promise<void> {
    await this.command([timerFrame(sunrise, sunset, fade)]);
  }

  /**
   * Programs the lamp's own schedule (advanced mode, up to five windows) and switches to it.
   * The lamp then runs it by itself, even with this app closed.
   */
  async setSchedule(windows: ScheduleWindow[]): Promise<void> {
    if (windows.length < 1 || windows.length > MAX_SLOTS) {
      throw new RangeError(`A schedule needs 1 to ${MAX_SLOTS} windows.`);
    }
    const frames: Frame[] = [];
    for (let slot = 1; slot <= MAX_SLOTS; slot += 1) {
      const w = windows[slot - 1];
      if (!w) {
        // An empty slot is a zero-length window.
        frames.push(...slotFrames(slot, { hours: 0, minutes: 0 }, { hours: 0, minutes: 0 }, [0, 0, 0, 0]));
        continue;
      }
      if (!(w.startMin >= 0 && w.endMin <= 1440 && w.startMin < w.endMin)) {
        throw new RangeError("Each window must start before it ends, within one day.");
      }
      const levels = this.snapshot.calibrated ? calibrateChannels(w.channels, this.curves) : w.channels;
      const [r, g, b, uv] = toTuple(levels).map(percentToWire) as [number, number, number, number];
      frames.push(...slotFrames(slot, toClock(w.startMin), toClock(w.endMin), [r, g, b, uv]));
    }
    frames.push(modeFrame(2));
    await this.command(frames);
    this.update({ mode: 2 });
  }

  /** Switches between the raw wire scale and brightness-corrected levels. */
  setCalibrated(calibrated: boolean): void {
    this.update({ calibrated });
    this.scheduleFlush();
  }

  private desiredFrame(): Frame {
    const levels = this.snapshot.calibrated ? calibrateChannels(this.desired, this.curves) : this.desired;
    return colorFrame(...toTuple(levels));
  }

  private async command(frames: Frame[]): Promise<void> {
    this.requireConnected();
    // Colour writes are re-sent after a command that may change what the lamp shows.
    this.lastSentHex = null;
    await this.sendSequence(frames);
  }

  private requireConnected(): void {
    if (this.snapshot.state !== "connected") throw new Error("Lamp is not connected.");
  }

  private scheduleFlush(): void {
    if (!this.hasDesired || this.flushQueued || this.snapshot.state !== "connected") return;
    this.flushQueued = true;
    this.chain = this.chain.then(() => this.flush()).catch(() => {});
  }

  private async flush(): Promise<void> {
    this.flushQueued = false;
    if (this.snapshot.state !== "connected") return;
    const frame = this.desiredFrame();
    const hex = bytesToHex(frame);
    if (hex === this.lastSentHex) return;
    try {
      await this.write(frame);
      this.lastSentHex = hex;
    } catch (error) {
      this.update({ state: "error", error: message(error) });
      return;
    }
    // A newer value arrived during the write.
    if (bytesToHex(this.desiredFrame()) !== hex) this.scheduleFlush();
  }

  private sendSequence(frames: Frame[]): Promise<void> {
    const run = this.chain.then(async () => {
      for (let i = 0; i < frames.length; i += 1) {
        await this.write(frames[i]);
        // The lamp drops a colour that arrives right after a setup frame, so pause after the last one too.
        if (this.frameGapMs > 0) await new Promise((r) => setTimeout(r, this.frameGapMs));
      }
    });
    this.chain = run.catch(() => {});
    return run;
  }

  private async write(frame: Frame): Promise<void> {
    assertAllowedFrame(frame);
    await this.transport.send(frame);
  }

  private onTransportState(state: ConnectionState, error?: Error): void {
    // connect() owns the connecting/connected transitions; only react to drops here.
    if (state === "disconnected" || state === "error") {
      if (this.snapshot.state === "connected" || this.snapshot.state === "connecting") {
        const wasConnected = this.snapshot.state === "connected";
        this.lastSentHex = null;
        this.update({ state, error: error ? error.message : null });
        if (wasConnected) void this.reconnect();
      }
    }
  }

  /** After an unexpected drop: retry a few times, re-running the session setup each time. */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.reconnectAttempts < 1) return;
    this.reconnecting = true;
    const session = this.session;
    try {
      for (let attempt = 1; attempt <= this.reconnectAttempts; attempt += 1) {
        await new Promise((r) => setTimeout(r, this.reconnectDelayMs * attempt));
        if (session !== this.session) return;
        this.update({ state: "connecting", error: null });
        await this.establish(this.lastLampId);
        if (this.snapshot.state === "connected" || session !== this.session) return;
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private update(patch: Partial<LampSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

function toClock(minutes: number): ClockTime {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

function toTuple(c: Channels): [number, number, number, number] {
  return [c.red, c.green, c.blue, c.uv];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
