import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Lamp } from "../src/lamp.js";
import { MockTransport } from "../src/transport.js";
import { compileSchedule } from "../src/schedule.js";
import { bytesToHex } from "../src/frames.js";

const hex = (t: MockTransport) => t.sent.map(bytesToHex);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fixedNow = () => new Date(2026, 9, 31, 23, 5, 9);

function setup(reconnectAttempts = 0) {
  const transport = new MockTransport();
  const lamp = new Lamp(transport, { frameGapMs: 0, now: fixedNow, reconnectAttempts, reconnectDelayMs: 5 });
  return { transport, lamp };
}

describe("Lamp reconnect", () => {
  it("stays down after a drop when reconnect is off", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    transport.drop();
    await wait(30);
    assert.equal(lamp.current.state, "disconnected");
  });

  it("reconnects after a drop, re-runs the setup and re-sends the colour", async () => {
    const { transport, lamp } = setup(3);
    await lamp.connect();
    lamp.setChannels({ red: 25 });
    await wait(20);
    transport.drop();
    await wait(60);
    assert.equal(lamp.current.state, "connected");
    const sent = hex(transport);
    assert.equal(sent.filter((f) => f.startsWith("FF 23")).length, 2);
    assert.equal(sent.filter((f) => f === "FB F9 3B 00 00 00 55 55").length, 2);
  });

  it("gives up after the configured attempts", async () => {
    const { transport, lamp } = setup(2);
    await lamp.connect();
    let tries = 0;
    transport.connect = async () => {
      tries += 1;
      throw new Error("not in range");
    };
    transport.drop();
    await wait(80);
    assert.equal(tries, 2);
    assert.equal(lamp.current.state, "error");
    assert.match(lamp.current.error ?? "", /not in range/);
  });

  it("does not reconnect after the user disconnects", async () => {
    const { transport, lamp } = setup(3);
    await lamp.connect();
    await lamp.disconnect();
    await wait(40);
    assert.equal(lamp.current.state, "disconnected");
    assert.equal(hex(transport).filter((f) => f.startsWith("FF")).length, 1);
  });
});

describe("schedule", () => {
  it("compiles a constant curve to one window", () => {
    const w = compileSchedule(() => ({ red: 40, green: 40, blue: 40, uv: 0 }));
    assert.deepEqual(w, [{ startMin: 0, endMin: 1440, channels: { red: 40, green: 40, blue: 40, uv: 0 } }]);
  });

  it("leaves dark stretches out, so they cost no slot", () => {
    const day = (m: number) => (m >= 480 && m < 1200 ? { red: 80, green: 80, blue: 80, uv: 0 } : { red: 0, green: 0, blue: 0, uv: 0 });
    const w = compileSchedule(day);
    assert.deepEqual(
      w.map((x) => [x.startMin, x.endMin, x.channels.red]),
      [[480, 1200, 80]],
    );
  });

  it("spends all five slots on lit windows when the day has dark stretches", () => {
    const steps = [0, 20, 40, 60, 80];
    const day = (m: number) => {
      if (m < 360 || m >= 1320) return { red: 0, green: 0, blue: 0, uv: 0 };
      const v = steps[Math.min(4, Math.floor((m - 360) / 192))];
      return { red: v + 10, green: 0, blue: 0, uv: 0 };
    };
    const w = compileSchedule(day);
    assert.equal(w.length, 5);
    assert.equal(w[0].startMin, 360);
    assert.equal(w[4].endMin, 1320);
  });

  it("never exceeds five windows and keeps them in order", () => {
    const w = compileSchedule((m) => ({ red: Math.round(m / 15) % 100, green: 0, blue: 0, uv: 0 }));
    assert.ok(w.length <= 5);
    w.slice(1).forEach((x, i) => assert.ok(x.startMin >= w[i].endMin));
  });

  it("programs five slots then switches to advanced mode", async () => {
    const { transport, lamp } = setup();
    await lamp.connect();
    await lamp.setSchedule([
      { startMin: 0, endMin: 480, channels: { red: 0, green: 0, blue: 10, uv: 0 } },
      { startMin: 480, endMin: 1440, channels: { red: 100, green: 50, blue: 0, uv: 100 } },
    ]);
    const sent = hex(transport).slice(3);
    assert.deepEqual(sent, [
      "FE F1 00 00 08 00 55 55",
      "FB F1 00 00 18 00 55 55",
      "FE F2 08 00 24 00 55 55",
      "FB F2 EB 76 00 EB 55 55",
      "FE F3 00 00 00 00 55 55",
      "FB F3 00 00 00 00 55 55",
      "FE F4 00 00 00 00 55 55",
      "FB F4 00 00 00 00 55 55",
      "FE F5 00 00 00 00 55 55",
      "FB F5 00 00 00 00 55 55",
      "FD F2 55 55 55 55 55 55",
    ]);
    assert.equal(lamp.current.mode, 2);
  });

  it("rejects an empty or backwards window", async () => {
    const { lamp } = setup();
    await lamp.connect();
    await assert.rejects(lamp.setSchedule([]), RangeError);
    await assert.rejects(
      lamp.setSchedule([{ startMin: 600, endMin: 600, channels: { red: 0, green: 0, blue: 0, uv: 0 } }]),
      RangeError,
    );
  });
});
