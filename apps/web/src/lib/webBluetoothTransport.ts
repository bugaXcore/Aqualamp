import type { ConnectionState, LampTransport } from "@aqualamp/core";

const SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
const WRITE_CHAR = "0000fff2-0000-1000-8000-00805f9b34fb";

// Minimal Web Bluetooth typing; the DOM lib does not ship it.
type BtCharacteristic = { writeValueWithoutResponse(data: BufferSource): Promise<void> };
type BtServer = {
  connected: boolean;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BtCharacteristic> }>;
};
type BtDevice = EventTarget & { id: string; name?: string; gatt?: { connected: boolean; connect(): Promise<BtServer>; disconnect(): void } };
type Bluetooth = { requestDevice(options: unknown): Promise<BtDevice> };

export function webBluetoothAvailable(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class WebBluetoothTransport implements LampTransport {
  private device: BtDevice | null = null;
  private characteristic: BtCharacteristic | null = null;
  private listeners = new Set<(state: ConnectionState, error?: Error) => void>();
  private expectingDisconnect = false;

  private readonly handleDrop = () => {
    this.characteristic = null;
    if (!this.expectingDisconnect) this.emit("disconnected");
    this.expectingDisconnect = false;
  };

  async connect(): Promise<void> {
    const bluetooth = (navigator as unknown as { bluetooth?: Bluetooth }).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth is not available. Use Chrome or Edge over localhost or HTTPS.");
    this.emit("scanning");
    // Called from a click handler, so the chooser is allowed. A known device is reused.
    if (!this.device) {
      const device = await bluetooth.requestDevice({
        filters: [{ namePrefix: "B3.0-" }, { services: [SERVICE] }],
        optionalServices: [SERVICE],
      });
      device.addEventListener("gattserverdisconnected", this.handleDrop);
      this.device = device;
    }
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
