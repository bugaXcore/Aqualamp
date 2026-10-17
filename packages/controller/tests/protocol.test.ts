import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeChannels,
  PROTOCOL_CAPTURES_READY,
} from "../src/protocol.js";
import { normalizeChannels } from "../src/types.js";

describe("encodeChannels", () => {
  it("encodes 0–100 channels into a deterministic stub frame", () => {
    const buf = encodeChannels(
      normalizeChannels({ red: 100, green: 0, blue: 50, white: 25 }),
    );
    assert.equal(buf.length, 7);
    assert.equal(buf[0], 0xa1);
    assert.equal(buf[1], 0x01);
    assert.equal(buf[2], 100);
    assert.equal(buf[3], 0);
    assert.equal(buf[4], 50);
    assert.equal(buf[5], 25);
    const sum = (0xa1 + 0x01 + 100 + 0 + 50 + 25) & 0xff;
    assert.equal(buf[6], sum);
  });

  it("clamps out-of-range values via normalizeChannels", () => {
    const channels = normalizeChannels({ red: 150, green: -3, blue: 40.6, white: 0 });
    assert.deepEqual(channels, { red: 100, green: 0, blue: 41, white: 0 });
  });

  it("marks protocol captures as not ready until Phase 0 inputs arrive", () => {
    assert.equal(PROTOCOL_CAPTURES_READY, false);
  });
});
