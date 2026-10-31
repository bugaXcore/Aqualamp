import test from "node:test";
import assert from "node:assert/strict";
import {
  buildColorFrame,
  buildCombinedColorFrame,
  buildFanFrame,
  buildClockFrame,
  buildTimerFrame,
  buildModeFrame,
  buildPowerOffFrame,
  buildPowerOnFrames,
  buildPresetFrame,  bytesToHex,
  describeUuid,
  getCharacteristicProperties,
  UUIDS,
} from "./protocol.js";

test("builds the clock frame captured from the official app", () => {
  assert.equal(bytesToHex(buildClockFrame(17, 23, 11)), "FF 17 23 11 55 55 55 55");
  assert.throws(() => buildClockFrame(24, 0, 0), RangeError);
});

test("builds the timer frame matching the official app captures", () => {
  assert.equal(bytesToHex(buildTimerFrame({ hours: 11, minutes: 48 }, { hours: 18, minutes: 5 })), "FE F9 11 48 18 05 00 00");
  assert.equal(bytesToHex(buildTimerFrame({ hours: 11, minutes: 48 }, { hours: 16, minutes: 0 })), "FE F9 11 48 16 00 00 00");
  assert.equal(bytesToHex(buildTimerFrame({ hours: 11, minutes: 48 }, { hours: 18, minutes: 5 }, 1)), "FE F9 11 48 18 05 00 01");
  assert.throws(() => buildTimerFrame({ hours: 11, minutes: 48 }, { hours: 18, minutes: 5 }, 256), RangeError);
  assert.throws(() => buildTimerFrame({ hours: 11, minutes: 60 }, { hours: 18, minutes: 5 }), RangeError);
});

test("formats a byte buffer as uppercase spaced hex", () => {
  assert.equal(bytesToHex(Uint8Array.from([0xfb, 0xf9, 0x3b, 0, 0, 0, 0x55, 0x55])), "FB F9 3B 00 00 00 55 55");
});

test("includes the lamp service and expected browser services", () => {
  assert.ok(UUIDS.optionalServices.includes(UUIDS.service));
  assert.ok(UUIDS.optionalServices.includes("device_information"));
  assert.ok(UUIDS.optionalServices.includes("battery_service"));
});

test("labels known lamp UUIDs", () => {
  assert.match(describeUuid("0000fff2-0000-1000-8000-00805f9b34fb"), /write characteristic/);
});

test("reads characteristic properties even when the browser exposes them as non-enumerable getters", () => {
  const properties = Object.create({});
  Object.defineProperties(properties, {
    write: { get: () => true },
    writeWithoutResponse: { get: () => true },
    notify: { get: () => false },
  });
  assert.deepEqual(getCharacteristicProperties(properties), ["writeWithoutResponse", "write"]);
});

test("builds the verified single-channel 25 percent red frame", () => {
  assert.equal(bytesToHex(buildColorFrame("R", 25)), "FB F9 3B 00 00 00 55 55");
});

test("builds isolated frames for each color channel", () => {
  for (const [channel, expected] of [
    ["R", "FB F9 EB 00 00 00 55 55"],
    ["G", "FB F9 00 EB 00 00 55 55"],
    ["B", "FB F9 00 00 EB 00 55 55"],
    ["UV", "FB F9 00 00 00 EB 55 55"],
  ]) {
    assert.equal(bytesToHex(buildColorFrame(channel, 100)), expected);
  }
});

test("rejects invalid channel levels and names", () => {
  assert.throws(() => buildColorFrame("W", 50), RangeError);
  assert.throws(() => buildColorFrame("R", 101), RangeError);
  assert.throws(() => buildColorFrame("R", Number.NaN), RangeError);
});

test("builds a frame with equal values for all four channels", () => {
  assert.equal(bytesToHex(buildCombinedColorFrame(50)), "FB F9 76 76 76 76 55 55");
});

test("builds the candidate fan frame without guessing a value scale", () => {
  assert.equal(bytesToHex(buildFanFrame(0x42)), "FC 42 55 55 55 55 55 55");
  assert.throws(() => buildFanFrame(256), RangeError);
});

test("builds mode, power and preset frames from the app's code", () => {
  assert.equal(bytesToHex(buildModeFrame(1)), "FD F1 55 55 55 55 55 55");
  assert.equal(bytesToHex(buildModeFrame(2)), "FD F2 55 55 55 55 55 55");
  assert.throws(() => buildModeFrame(3), RangeError);
  assert.equal(bytesToHex(buildPowerOffFrame()), "FB F9 00 00 00 00 55 55");
  assert.deepEqual(buildPowerOnFrames().map(bytesToHex), [
    "FD F1 55 55 55 55 55 55",
    "FB F9 79 DF 74 EB 55 55",
    "FE F9 00 00 24 00 00 00",
  ]);
  assert.equal(bytesToHex(buildPresetFrame(11)), "FB F9 7E EB 69 00 55 55");
  assert.throws(() => buildPresetFrame(12), RangeError);
});
