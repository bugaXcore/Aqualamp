import { EventEmitter } from "node:events";
import {
  assertProtocolReadyForHardware,
  encodeChannels,
  isPlaceholderId,
} from "./protocol.js";
import {
  DEFAULT_CHANNELS,
  normalizeChannels,
  type Channels,
  type ConnectionState,
  type ControllerOptions,
} from "./types.js";

type NobleModule = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
  startScanningAsync: (serviceUuids: string[], allowDuplicates: boolean) => Promise<void>;
  stopScanningAsync: () => Promise<void>;
  state: string;
};

type NoblePeripheral = {
  id: string;
  address: string;
  addressType?: string;
  connectable?: boolean;
  rssi?: number;
  advertisement?: {
    localName?: string;
    serviceUuids?: string[];
  };
  connectAsync: () => Promise<void>;
  disconnectAsync: () => Promise<void>;
  discoverSomeServicesAndCharacteristicsAsync: (
    serviceUuids: string[],
    characteristicUuids: string[],
  ) => Promise<{
    characteristics: Array<{
      uuid: string;
      writeAsync: (data: Buffer, withoutResponse: boolean) => Promise<void>;
    }>;
  }>;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
};

/** Strip to lowercase hex for Windows id/address compare (`c847…` vs `c8:47:…`). */
function normalizeBleAddr(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * BLE controller for Week Aqua S300 Pro.
 * Fully decoupled from CLI / HTTP / WebSocket — adapters only.
 */
export class WeekAquaController extends EventEmitter {
  private readonly address: string;
  private readonly serviceUuid: string;
  private readonly characteristicUuid: string;
  private readonly mock: boolean;
  private readonly autoReconnect: boolean;
  private readonly timeoutMs: number;

  private state: ConnectionState = "disconnected";
  private channels: Channels = { ...DEFAULT_CHANNELS };
  private connecting: Promise<void> | null = null;
  private intentionalDisconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  private noble: NobleModule | null = null;
  private peripheral: NoblePeripheral | null = null;
  private characteristic: {
    writeAsync: (data: Buffer, withoutResponse: boolean) => Promise<void>;
  } | null = null;

  constructor(options: ControllerOptions) {
    super();
    this.address = options.address;
    this.serviceUuid = options.serviceUuid;
    this.characteristicUuid = options.characteristicUuid;
    this.mock = options.mock ?? envFlag("AQUALAMP_MOCK", true);
    this.autoReconnect = options.autoReconnect ?? false;
    // Windows scans can take a while; lamp advertises intermittently.
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  getState(): ConnectionState {
    return this.state;
  }

  isMock(): boolean {
    return this.mock;
  }

  getChannels(): Channels {
    return { ...this.channels };
  }

  async connect(): Promise<void> {
    if (this.state === "connected") return;
    if (this.connecting) return this.connecting;

    this.intentionalDisconnect = false;
    this.clearReconnectTimer();

    this.connecting = this.doConnect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;

    if (this.mock) {
      this.setState("disconnected");
      return;
    }

    try {
      if (this.peripheral) {
        await this.peripheral.disconnectAsync().catch(() => undefined);
      }
    } finally {
      this.teardownBle();
      this.setState("disconnected");
    }
  }

  async setChannels(partial: Partial<Channels>): Promise<void> {
    const next = normalizeChannels(partial, this.channels);
    const buffer = encodeChannels(next);

    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        if (this.state !== "connected") {
          throw new Error("Not connected — call connect() before setChannels()");
        }

        if (this.mock) {
          this.channels = next;
          this.emit("channels", this.getChannels());
          return;
        }

        assertProtocolReadyForHardware();
        if (!this.characteristic) {
          throw new Error("GATT characteristic not available");
        }

        try {
          // Characteristic is write-without-response (props 0x04) — second arg true.
          await withTimeout(
            this.characteristic.writeAsync(buffer, true),
            this.timeoutMs,
            "BLE write",
          );
          this.channels = next;
          this.emit("channels", this.getChannels());
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit("error", error);
          if (this.state === "connected") {
            // Unexpected mid-write failure — surface disconnect-like recovery
            this.handleUnexpectedDisconnect(error);
          }
          throw error;
        }
      });

    return this.writeChain;
  }

  /** Encode helper exposed for unit tests / adapters that only need buffers. */
  encodeChannels(channels: Channels): Buffer {
    return encodeChannels(normalizeChannels(channels));
  }

  private async doConnect(): Promise<void> {
    try {
      if (this.mock) {
        this.setState("connecting");
        await delay(180);
        this.setState("connected");
        this.emit("channels", this.getChannels());
        return;
      }

      this.assertHardwareConfig();
      assertProtocolReadyForHardware();

      this.setState("scanning");
      this.noble = await this.loadNoble();
      await this.waitForPoweredOn();

      this.peripheral = await withTimeout(
        this.scanForPeripheral(),
        this.timeoutMs,
        "BLE scan",
      );

      // Intel WinRT: must fully stop scanning before connect, or connect fails.
      await this.noble.stopScanningAsync().catch(() => undefined);
      await delay(300);

      this.setState("connecting");
      await this.connectPeripheralWithRetry(this.peripheral);

      this.peripheral.once("disconnect", () => {
        this.handleUnexpectedDisconnect(new Error("Peripheral disconnected"));
      });

      const { characteristics } =
        await withTimeout(
          this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [this.normalizeUuid(this.serviceUuid)],
            [this.normalizeUuid(this.characteristicUuid)],
          ),
          this.timeoutMs,
          "GATT discovery",
        );

      const char = characteristics.find(
        (c) => this.normalizeUuid(c.uuid) === this.normalizeUuid(this.characteristicUuid),
      );
      if (!char) {
        throw new Error(
          `Characteristic ${this.characteristicUuid} not found on service ${this.serviceUuid}`,
        );
      }

      this.characteristic = char;
      this.reconnectAttempt = 0;
      this.setState("connected");
      this.emit("channels", this.getChannels());
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const hint =
        /could not connect|timed out|unreachable/i.test(error.message)
          ? " Hint: force-close Week Aqua on the phone, keep the lamp near the PC, " +
            "do not pair the lamp in Windows Settings, toggle PC Bluetooth off/on once."
          : "";
      const wrapped = new Error(error.message + hint);
      this.teardownBle();
      this.setState("error");
      this.emit("error", wrapped);
      this.scheduleReconnect();
      throw wrapped;
    }
  }

  private async connectPeripheralWithRetry(peripheral: NoblePeripheral): Promise<void> {
    const noble = this.noble!;
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await noble.stopScanningAsync().catch(() => undefined);
        await delay(attempt === 1 ? 200 : 800);
        await withTimeout(peripheral.connectAsync(), this.timeoutMs, "BLE connect");
        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        try {
          await peripheral.disconnectAsync();
        } catch {
          /* ignore */
        }
      }
    }
    throw lastErr ?? new Error("BLE connect failed");
  }

  private assertHardwareConfig(): void {
    if (isPlaceholderId(this.address)) {
      throw new Error(
        "LIGHT_ADDRESS is still a placeholder (BLOCKER). Set a real MAC or use AQUALAMP_MOCK=1.",
      );
    }
    if (isPlaceholderId(this.serviceUuid) || isPlaceholderId(this.characteristicUuid)) {
      throw new Error(
        "SERVICE_UUID / CHARACTERISTIC_UUID are still placeholders (BLOCKER). " +
          "Fill .env or use AQUALAMP_MOCK=1.",
      );
    }
  }

  private async loadNoble(): Promise<NobleModule> {
    try {
      // Optional dependency — absent on mock-only Windows installs.
      const mod = (await Function('return import("@abandonware/noble")')()) as {
        default?: NobleModule;
      } & NobleModule;
      return (mod.default ?? mod) as NobleModule;
    } catch (err) {
      throw new Error(
        "Failed to load @abandonware/noble. Install Bluetooth dependencies on Linux (BlueZ) " +
          `or use AQUALAMP_MOCK=1. Underlying error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private waitForPoweredOn(): Promise<void> {
    const noble = this.noble!;
    if (noble.state === "poweredOn") return Promise.resolve();

    return withTimeout(
      new Promise<void>((resolve, reject) => {
        const onState = (state: unknown) => {
          if (state === "poweredOn") {
            noble.removeListener("stateChange", onState);
            resolve();
          } else if (state === "unsupported" || state === "unauthorized") {
            noble.removeListener("stateChange", onState);
            reject(new Error(`Bluetooth adapter state: ${String(state)}`));
          }
        };
        noble.on("stateChange", onState);
      }),
      this.timeoutMs,
      "Bluetooth adapter power-on",
    );
  }

  private scanForPeripheral(): Promise<NoblePeripheral> {
    const noble = this.noble!;
    const targetHex = normalizeBleAddr(this.address);
    const serviceNeedle = this.normalizeUuid(this.serviceUuid);

    return new Promise<NoblePeripheral>((resolve, reject) => {
      let settled = false;

      const onDiscover = (peripheral: unknown) => {
        if (settled) return;
        const p = peripheral as NoblePeripheral;
        if (!this.peripheralMatches(p, targetHex, serviceNeedle)) return;
        settled = true;
        cleanup();
        // Caller awaits stopScanning before connect — just resolve the handle.
        resolve(p);
      };

      const onError = (err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const cleanup = () => {
        noble.removeListener("discover", onDiscover);
        noble.removeListener("warning", onError);
      };

      noble.on("discover", onDiscover);
      // allowDuplicates helps catch intermittent advertisers on Windows.
      void noble.startScanningAsync([], true).catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new Error(
            `BLE scan failed (is the adapter up?). ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      });
    });
  }

  private peripheralMatches(
    p: NoblePeripheral,
    targetHex: string,
    serviceNeedle: string,
  ): boolean {
    const addrHex = normalizeBleAddr(p.address || "");
    const idHex = normalizeBleAddr(p.id || "");
    if (targetHex && (addrHex === targetHex || idHex === targetHex)) return true;

    const name = (p.advertisement?.localName || "").toLowerCase();
    if (name.includes("b3.0-s300") || name.includes("s300pro")) return true;

    const services = p.advertisement?.serviceUuids ?? [];
    if (
      targetHex &&
      (addrHex === targetHex || idHex === targetHex) === false &&
      services.some((u) => this.normalizeUuid(u) === serviceNeedle)
    ) {
      // Service-only match is too loose alone — require MAC when we have one.
      return false;
    }
    return false;
  }

  private handleUnexpectedDisconnect(error: Error): void {
    if (this.intentionalDisconnect) return;
    this.teardownBle();
    if (this.state !== "disconnected") {
      this.emit("error", error);
      this.setState("disconnected");
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.intentionalDisconnect || this.mock) return;
    if (this.reconnectTimer) return;

    const attempt = this.reconnectAttempt++;
    const delayMs = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownBle(): void {
    this.characteristic = null;
    if (this.peripheral) {
      try {
        this.peripheral.removeListener("disconnect", () => undefined);
      } catch {
        /* ignore */
      }
    }
    this.peripheral = null;
    if (this.noble) {
      void this.noble.stopScanningAsync().catch(() => undefined);
    }
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit("state", next);
  }

  private normalizeUuid(uuid: string): string {
    return uuid.replace(/-/g, "").toLowerCase();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
