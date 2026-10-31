import type { ConnectionState } from "./types.js";

/**
 * Moves 8-byte frames to one lamp. Implementations: Web Bluetooth (browser),
 * WebSocket bridge (headless host), mock (tests). Browser-safe: no Node imports.
 */
export interface LampTransport {
  /** Opens the link to the lamp (`lampId` is reserved for several lamps). */
  connect(lampId?: string): Promise<void>;
  disconnect(): Promise<void>;
  /** Writes one frame without response; resolves when it has been handed to the radio. */
  send(frame: Uint8Array): Promise<void>;
  /** Reports link changes, including drops the app did not ask for. Returns an unsubscribe. */
  onState(listener: (state: ConnectionState, error?: Error) => void): () => void;
}

/** In-memory transport that records frames; used by tests and mock mode. */
export class MockTransport implements LampTransport {
  readonly sent: Uint8Array[] = [];
  failNextSend: Error | null = null;
  private listeners = new Set<(state: ConnectionState, error?: Error) => void>();

  constructor(private readonly latencyMs = 0) {}

  async connect(): Promise<void> {
    this.emit("connecting");
    await this.delay();
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    this.emit("disconnected");
  }

  async send(frame: Uint8Array): Promise<void> {
    await this.delay();
    if (this.failNextSend) {
      const error = this.failNextSend;
      this.failNextSend = null;
      throw error;
    }
    this.sent.push(frame.slice());
  }

  onState(listener: (state: ConnectionState, error?: Error) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Simulates the lamp dropping the link. */
  drop(): void {
    this.emit("disconnected");
  }

  private emit(state: ConnectionState, error?: Error): void {
    for (const listener of this.listeners) listener(state, error);
  }

  private delay(): Promise<void> {
    return this.latencyMs > 0 ? new Promise((r) => setTimeout(r, this.latencyMs)) : Promise.resolve();
  }
}
