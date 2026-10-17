import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeChannels,
  encodeCustomModeFrame,
  encodePowerFrame,
  percentToWire,
  wireToPercent,
  PROTOCOL_CAPTURES_READY,
  DEVICE_FROM_LOGS,
  CHANNEL_WIRE_MAX,
  RED_PERCENT_WIRE,
  PROTOCOL_CAPTURES,
} from "../src/protocol.js";
import { normalizeChannels } from "../src/types.js";

describe("encodeChannels", () => {
  it("maps 0–100 channels onto CustomMode fb f9 frames (white→UV)", () => {
    const buf = encodeChannels(
      normalizeChannels({ red: 100, green: 0, blue: 50, white: 25 }),
    );
    assert.equal(buf.length, 8);
    assert.equal(buf[0], 0xfb);
    assert.equal(buf[1], 0xf9);
    assert.equal(buf[2], CHANNEL_WIRE_MAX); // 100%
    assert.equal(buf[3], 0);
    assert.equal(buf[4], percentToWire(50));
    assert.equal(buf[5], percentToWire(25));
    assert.equal(buf[6], 0x55);
    assert.equal(buf[7], 0x55);
  });

  it("clamps out-of-range values via normalizeChannels", () => {
    const channels = normalizeChannels({ red: 150, green: -3, blue: 40.6, white: 0 });
    assert.deepEqual(channels, { red: 100, green: 0, blue: 41, white: 0 });
  });

  it("opens hardware gate now that UUIDs/frames/scale are known", () => {
    assert.equal(PROTOCOL_CAPTURES_READY, true);
  });

  it("records GATT UUIDs from full HCI snoop", () => {
    assert.equal(DEVICE_FROM_LOGS.serviceUuidShort, "fff0");
    assert.equal(DEVICE_FROM_LOGS.characteristicUuidShort, "fff2");
  });

  it("uses linear 0–100 → 0–235 scale matching Capture #3 Red ladder", () => {
    assert.equal(percentToWire(0), RED_PERCENT_WIRE[0]);
    assert.equal(percentToWire(25), RED_PERCENT_WIRE[25]);
    assert.equal(percentToWire(50), RED_PERCENT_WIRE[50]);
    assert.equal(percentToWire(75), RED_PERCENT_WIRE[75]);
    assert.equal(percentToWire(100), RED_PERCENT_WIRE[100]);
    assert.equal(wireToPercent(235), 100);
    assert.equal(wireToPercent(59), 25);
    assert.equal(CHANNEL_WIRE_MAX, 235);
  });

  it("encodes Capture #3 Red checklist frames exactly", () => {
    for (const pct of [0, 25, 50, 75, 100] as const) {
      const buf = encodeChannels(normalizeChannels({ red: pct }));
      const expected = PROTOCOL_CAPTURES[`red-${pct}`].split(" ").map((h) => parseInt(h, 16));
      assert.deepEqual([...buf], expected);
    }
  });

  it("builds CustomMode research frames matching observed layout", () => {
    const buf = encodeCustomModeFrame(0xeb, 0, 0, 0);
    assert.deepEqual(
      [...buf],
      [0xfb, 0xf9, 0xeb, 0x00, 0x00, 0x00, 0x55, 0x55],
    );
  });

  it("builds Power frames as fc <level> + pad", () => {
    const buf = encodePowerFrame(0);
    assert.deepEqual(
      [...buf],
      [0xfc, 0x00, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55],
    );
    assert.equal(encodePowerFrame(25)[1], 59);
  });
});
