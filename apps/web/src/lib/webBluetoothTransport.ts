import type { ConnectionState, LampTransport } from "@aqualamp/core";

const SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
const WRITE_CHAR = "0000fff2-0000-1000-8000-00805f9b34fb";

// Minimal Web Bluetooth typing; the DOM lib does not ship it.
type BtCharacteristic = { writeValueWithoutResponse(data: BufferSource): Promise<void> };
type BtServer = {
  connected: boolean;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BtCharacteristic> }>;
};
type BtDevice = EventTarget & {
  id: string;
  name?: string;
  forget?(): Promise<void>;
  gatt?: { connected: boolean; connect(): Promise<BtServer>; disconnect(): void };
};
type Bluetooth = { requestDevice(options: unknown): Promise<BtDevice>; getDevices?(): Promise<BtDevice[]> };

const REMEMBERED_ID_KEY = "aqualamp.lampDeviceId";

export function webBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class WebBluetoothTransport implements LampTransport {
  /** When true, the chosen lamp is stored and later connects skip the device chooser. */
  remember = false;
  private device: BtDevice | null = null;
  private characteristic: BtCharacteristic | null = null;
  private listeners = new Set<(state: ConnectionState, error?: Error) => void>();
  private expectingDisconnect = false;

  private readonly handleDrop = () => {
    this.characteristic = null;
    if (!this.expectingDisconnect) this.emit("disconnected");
    this.expectingDisconnect = false;
  };

  /** A lamp the browser already has permission for; needs Chrome's persistent permissions. */
  private async findRemembered(bluetooth: Bluetooth): Promise<BtDevice | null> {
    const id = localStorage.getItem(REMEMBERED_ID_KEY);
    if (!id || !bluetooth.getDevices) return null;
    const devices = await bluetooth.getDevices().catch(() => [] as BtDevice[]);
    return devices.find((d) => d.id === id) ?? null;
  }

  /** Drops the stored lamp so the next connect shows the chooser again. */
  async forget(): Promise<void> {
    localStorage.removeItem(REMEMBERED_ID_KEY);
    if (this.device && !this.device.gatt?.connected) {
      await this.device.forget?.().catch(() => {});
      this.device = null;
    }
  }

  async connect(): Promise<void> {
    const bluetooth = (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth is not available. Use Chrome or Edge over localhost or HTTPS.");
    this.emit("scanning");
    if (!this.device) {
      let device = this.remember ? await this.findRemembered(bluetooth) : null;
      // The chooser is only allowed from a click, so it is the fallback.
      device ??= await bluetooth.requestDevice({
        filters: [{ namePrefix: "B3.0-" }, { services: [SERVICE] }],
        optionalServices: [SERVICE],
      });
      device.addEventListener("gattserverdisconnected", this.handleDrop);
      this.device = device;
    }
    if (this.remember) localStorage.setItem(REMEMBERED_ID_KEY, this.device.id);
    this.emit("connecting");
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE);
    this.characteristic = await service.getCharacteristic(WRITE_CHAR);
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    this.expectingDisconnect = this.device?.gatt?.connected === true;
    this.device?.gatt?.disconnect();
    this.characteristic = null;
    this.emit("disconnected");
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error("Lamp link is closed.");
    await this.characteristic.writeValueWithoutResponse(frame as BufferSource);
  }

  onState(listener: (state: ConnectionState, error?: Error) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(state: ConnectionState): void {
    for (const listener of this.listeners) listener(state);
  }
}
