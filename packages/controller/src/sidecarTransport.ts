import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { LampTransport } from "./transport.js";
import type { ConnectionState } from "./types.js";

export type SidecarOptions = {
  /** Interpreter and script; defaults to `python tools/bleak-sidecar/sidecar.py`. */
  command?: string;
  args?: string[];
  /** Lamp BLE address; when omitted the sidecar scans for a `B3.0-` lamp. */
  address?: string;
  requestTimeoutMs?: number;
};

type Pending = { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

/** Talks to the lamp through the Python bleak sidecar (Node-only). */
export class SidecarTransport implements LampTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(state: ConnectionState, error?: Error) => void>();
  private ready: Promise<void> | null = null;

  constructor(private readonly options: SidecarOptions = {}) {}

  async connect(lampId?: string): Promise<void> {
    await this.start();
    this.emit("scanning");
    await this.request({ cmd: "connect", address: lampId ?? this.options.address }, 45_000);
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    if (!this.child) return;
    await this.request({ cmd: "disconnect" }).catch(() => {});
    this.emit("disconnected");
  }

  send(frame: Uint8Array): Promise<void> {
    const hex = Array.from(frame, (b) => b.toString(16).padStart(2, "0")).join(" ");
    return this.request({ cmd: "send", hex });
  }

  onState(listener: (state: ConnectionState, error?: Error) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stops the sidecar process. */
  close(): void {
    this.child?.kill();
    this.child = null;
    this.ready = null;
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    const command = this.options.command ?? "python";
    const args = this.options.args ?? ["-u", "tools/bleak-sidecar/sidecar.py"];
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("BLE sidecar did not start. Is Python with bleak installed?")), 10_000);
      createInterface({ input: child.stdout }).on("line", (line) => {
        let msg: { event?: string; state?: string; id?: number; ok?: boolean; error?: string };
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.event === "ready") {
          clearTimeout(timer);
          resolve();
        } else if (msg.event === "state") {
          this.emit(msg.state as ConnectionState);
        } else if (typeof msg.id === "number") {
          const entry = this.pending.get(msg.id);
          if (!entry) return;
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.ok) entry.resolve();
          else entry.reject(new Error(msg.error ?? "Sidecar error"));
        }
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Could not start the BLE sidecar: ${err.message}`));
      });
      child.on("exit", () => {
        clearTimeout(timer);
        for (const entry of this.pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(new Error("BLE sidecar exited."));
        }
        this.pending.clear();
        this.child = null;
        this.ready = null;
        this.emit("disconnected");
      });
    });
    this.ready.catch(() => this.close());
    return this.ready;
  }

  private request(body: Record<string, unknown>, timeoutMs = this.options.requestTimeoutMs ?? 10_000): Promise<void> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("BLE sidecar is not running."));
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("BLE sidecar timed out."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, ...body }) + "\n");
    });
  }

  private emit(state: ConnectionState, error?: Error): void {
    for (const listener of this.listeners) listener(state, error);
  }
}
