import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Lamp } from "../src/lamp.js";
import { MockTransport } from "../src/transport.js";
import { bytesToHex } from "../src/frames.js";

const hex = (t: MockTransport) => t.sent.map(bytesToHex);
const tick = () => new Promise((r) => setTimeout(r, 20));
const fixedNow = () => new Date(2026, 9, 31, 23, 5, 9);

function setup(latencyMs = 0) {
  const transport = new MockTransport(latencyMs);
  const lamp = new Lamp(transport, { frameGapMs: 0, now: fixedNow });
  return { transport, lamp };
}

describe("Lamp", () => {
  it("runs the session setup on connect", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    assert.equal(lamp.current.state, "connected");
    assert.deepEqual(hex(transport), [
      "FF 23 05 09 55 55 55 55",
      "FD F1 55 55 55 55 55 55",
      "FE F9 00 00 24 00 00 00",
    ]);
  });

  it("sends a colour once and skips unchanged values", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    lamp.setChannels({ red: 25 });
    await tick();
    lamp.setChannels({ red: 25 });
    await tick();
    assert.deepEqual(hex(transport).slice(3), ["FB F9 3B 00 00 00 55 55"]);
  });

  it("keeps only the latest value while a write is in flight", async () => {
    const { transport, lamp } = setup(15);
    await lamp.connect();
    const before = transport.sent.length;
    for (const red of [10, 20, 30, 40, 50]) lamp.setChannels({ red });
    await new Promise((r) => setTimeout(r, 120));
    const colours = hex(transport).slice(before);
    assert.ok(colours.length <= 2, `expected at most 2 writes, got ${colours.length}`);
    assert.equal(colours.at(-1), "FB F9 76 00 00 00 55 55");
  });

  it("accepts the legacy white alias as uv", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    lamp.setChannels({ white: 100 });
    await tick();
    assert.equal(hex(transport).at(-1), "FB F9 00 00 00 EB 55 55");
  });

  it("powers on and off with the app's frames", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    await lamp.powerOn();
    await lamp.powerOff();
    assert.deepEqual(hex(transport).slice(3), [
      "FD F1 55 55 55 55 55 55",
      "FB F9 79 DF 74 EB 55 55",
      "FE F9 00 00 24 00 00 00",
      "FD F1 55 55 55 55 55 55",
      "FB F9 00 00 00 00 55 55",
    ]);
    assert.deepEqual(lamp.current.channels, { red: 0, green: 0, blue: 0, uv: 0 });
  });

  it("tracks the mode and sends the timer", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    await lamp.setMode(2);
    assert.equal(lamp.current.mode, 2);
    await lamp.setTimer({ hours: 11, minutes: 48 }, { hours: 18, minutes: 5 }, 2);
    assert.deepEqual(hex(transport).slice(3), [
      "FD F2 55 55 55 55 55 55",
      "FE F9 11 48 18 05 00 02",
    ]);
  });

  it("sends brightness-corrected levels only when calibrated", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    lamp.setChannels({ red: 50 });
    await tick();
    assert.equal(hex(transport).at(-1), "FB F9 76 00 00 00 55 55");
    lamp.setCalibrated(true);
    await tick();
    const corrected = transport.sent.at(-1)![2];
    assert.ok(corrected < 0x76, `expected less than raw 0x76, got ${corrected}`);
    lamp.setCalibrated(false);
    await tick();
    assert.equal(hex(transport).at(-1), "FB F9 76 00 00 00 55 55");
  });

  it("re-sends the colour after a drop and reconnect", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    lamp.setChannels({ blue: 100 });
    await tick();
    transport.drop();
    assert.equal(lamp.current.state, "disconnected");
    const before = transport.sent.length;
    await lamp.connect();
    await tick();
    const after = hex(transport).slice(before);
    assert.equal(after.length, 4);
    assert.equal(after[0], "FF 23 05 09 55 55 55 55");
    assert.equal(after[3], "FB F9 00 00 EB 00 55 55");
  });

  it("keeps the lamp's own program when connecting or reconnecting while it runs one", async () => {
    const { transport, lamp } = setup();
    await lamp.connect(undefined, true);
    assert.equal(lamp.current.mode, 2);
    assert.deepEqual(hex(transport), ["FF 23 05 09 55 55 55 55"]);

    transport.drop();
    const before = transport.sent.length;
    await lamp.connect();
    assert.deepEqual(hex(transport).slice(before), [
      "FF 23 05 09 55 55 55 55",
      "FD F1 55 55 55 55 55 55",
      "FE F9 00 00 24 00 00 00",
    ]);
    assert.equal(lamp.current.mode, 1);
  });

  it("reports a failed setup as an error and disconnects", async () => {
    const { transport, lamp } = setup();
    transport.failNextSend = new Error("write failed");
    await lamp.connect();
    assert.equal(lamp.current.state, "error");
    assert.equal(lamp.current.error, "write failed");
  });

  it("rejects commands while disconnected", async () => {
    const { lamp } = setup();
    await assert.rejects(() => lamp.powerOn(), /not connected/);
  });
});
