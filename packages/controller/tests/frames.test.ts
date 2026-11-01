import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alwaysOnTimerFrame,
  assertAllowedFrame,
  bytesToHex,
  clockFrame,
  colorFrame,
  isAllowedFrame,
  modeFrame,
  powerOffFrame,
  powerOnFrames,
  presetFrame,
  sessionSetupFrames,
  slotFrames,
  timerFrame,
} from "../src/frames.js";

describe("frames", () => {
  it("matches the Capture #3 red ladder", () => {
    assert.equal(bytesToHex(colorFrame(25, 0, 0)), "FB F9 3B 00 00 00 55 55");
    assert.equal(bytesToHex(colorFrame(100, 0, 0)), "FB F9 EB 00 00 00 55 55");
  });

  it("builds the clock and timer frames from the official app", () => {
    assert.equal(bytesToHex(clockFrame(17, 23, 11)), "FF 17 23 11 55 55 55 55");
    assert.equal(
      bytesToHex(timerFrame({ hours: 11, minutes: 48 }, { hours: 18, minutes: 5 })),
      "FE F9 11 48 18 05 00 00",
    );
    assert.equal(
      bytesToHex(timerFrame({ hours: 11, minutes: 48 }, { hours: 18, minutes: 5 }, 1)),
      "FE F9 11 48 18 05 00 01",
    );
    assert.throws(() => timerFrame({ hours: 1, minutes: 0 }, { hours: 2, minutes: 0 }, 6), RangeError);
    assert.throws(() => clockFrame(24, 0, 0), RangeError);
  });

  it("builds mode, power and always-on frames", () => {
    assert.equal(bytesToHex(modeFrame(2)), "FD F2 55 55 55 55 55 55");
    assert.equal(bytesToHex(alwaysOnTimerFrame()), "FE F9 00 00 24 00 00 00");
    assert.equal(bytesToHex(powerOffFrame()), "FB F9 00 00 00 00 55 55");
    assert.deepEqual(powerOnFrames().map(bytesToHex), [
      "FD F1 55 55 55 55 55 55",
      "FB F9 79 DF 74 EB 55 55",
      "FE F9 00 00 24 00 00 00",
    ]);
    assert.equal(bytesToHex(presetFrame(11)), "FB F9 7E EB 69 00 55 55");
    assert.throws(() => presetFrame(12), RangeError);
  });

  it("builds the verified advanced slot 1 frames", () => {
    const [window, color] = slotFrames(1, { hours: 0, minutes: 0 }, { hours: 24, minutes: 0 }, [0, 0, 235, 0]);
    assert.equal(bytesToHex(window), "FE F1 00 00 24 00 55 55");
    assert.equal(bytesToHex(color), "FB F1 00 00 EB 00 55 55");
  });

  it("sends clock, mode 1 and the always-on window on connect", () => {
    const frames = sessionSetupFrames(new Date(2026, 9, 31, 23, 5, 9));
    assert.deepEqual(frames.map(bytesToHex), [
      "FF 23 05 09 55 55 55 55",
      "FD F1 55 55 55 55 55 55",
      "FE F9 00 00 24 00 00 00",
    ]);
  });

  it("refuses frames with unknown opcodes or wrong length", () => {
    assert.equal(isAllowedFrame(colorFrame(1, 2, 3)), true);
    assert.equal(isAllowedFrame(Uint8Array.from([0xf9, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55])), false);
    assert.equal(isAllowedFrame(Uint8Array.from([0xfb, 0xf9])), false);
    assert.throws(() => assertAllowedFrame(Uint8Array.from([0x41, 0x44, 0x56, 0x5f, 0x4e, 0x41, 0x4d, 0x45])));
  });
});
