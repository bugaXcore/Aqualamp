import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { SidecarTransport } from "../src/sidecarTransport.js";
import type { ConnectionState } from "../src/types.js";

const fake = fileURLToPath(new URL("./fixtures/fake-sidecar.mjs", import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = (...bytes: number[]) => new Uint8Array([...bytes, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55].slice(0, 8));

let transport: SidecarTransport | null = null;
function make(address?: string) {
  transport = new SidecarTransport({ command: process.execPath, args: [fake], address, requestTimeoutMs: 1000 });
  const states: ConnectionState[] = [];
  transport.onState((s) => states.push(s));
  return { transport, states };
}

afterEach(() => {
  transport?.close();
  transport = null;
});

describe("SidecarTransport", () => {
  it("connects and sends a frame through the child process", async () => {
    const { transport, states } = make();
    await transport.connect();
    await transport.send(frame(0xfb, 0xf9, 1, 2, 3, 4));
    assert.deepEqual(states, ["scanning", "connected"]);
  });

  it("rejects a connect the sidecar refuses", async () => {
    const { transport } = make("bad");
    await assert.rejects(transport.connect(), /Lamp not found/);
  });

  it("rejects a send the sidecar refuses", async () => {
    const { transport } = make();
    await transport.connect();
    await assert.rejects(transport.send(frame(0x00)), /frame refused/);
  });

  it("reports a drop the sidecar announces", async () => {
    const { transport, states } = make();
    await transport.connect();
    await transport.send(frame(0xfd, 0xf0));
    await wait(20);
    assert.equal(states[states.length - 1], "disconnected");
  });

  it("fails pending requests and reports a disconnect when the child exits", async () => {
    const { transport, states } = make();
    await transport.connect();
    await assert.rejects(transport.send(frame(0xfd, 0xf9)), /exited/);
    await wait(20);
    assert.equal(states[states.length - 1], "disconnected");
  });

  it("explains a missing interpreter", async () => {
    transport = new SidecarTransport({ command: "definitely-not-a-real-program", args: [] });
    await assert.rejects(transport.connect(), /Could not start the BLE sidecar/);
  });

  it("refuses to send before connecting", async () => {
    const { transport } = make();
    await assert.rejects(transport.send(frame(0xfb)), /not running/);
  });
});
