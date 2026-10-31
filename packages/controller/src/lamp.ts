import {
  assertAllowedFrame,
  colorFrame,
  modeFrame,
  powerOffFrame,
  powerOnFrames,
  presetFrame,
  sessionSetupFrames,
  timerFrame,
  bytesToHex,
  type ClockTime,
  type Frame,
} from "./frames.js";
import type { LampTransport } from "./transport.js";
import { calibrateChannels, MEASURED_CURVES, type CalibrationCurves } from "./calibration.js";
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
  private readonly now: () => Date;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly transport: LampTransport,
    options: LampOptions = {},
  ) {
    this.frameGapMs = options.frameGapMs ?? 500;
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
    this.update({ state: "connecting", error: null });
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
        if (i > 0 && this.frameGapMs > 0) await new Promise((r) => setTimeout(r, this.frameGapMs));
        await this.write(frames[i]);
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
        this.lastSentHex = null;
        this.update({ state, error: error ? error.message : null });
      }
    }
  }

  private update(patch: Partial<LampSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

function toTuple(c: Channels): [number, number, number, number] {
  return [c.red, c.green, c.blue, c.uv];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
