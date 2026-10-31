import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calibrateChannels, linearise, MEASURED_CURVES } from "../src/calibration.js";

describe("calibration", () => {
  it("keeps 0 and 100 unchanged", () => {
    assert.equal(linearise(0, MEASURED_CURVES.red), 0);
    assert.equal(linearise(100, MEASURED_CURVES.red), 100);
  });

  it("lowers mid levels where the lamp is brighter than linear", () => {
    const out = calibrateChannels({ red: 50, green: 50, blue: 50, uv: 50 }, MEASURED_CURVES);
    assert.ok(out.red < 50);
    assert.equal(out.uv, 50);
  });

  it("is monotonic", () => {
    let last = -1;
    for (let p = 0; p <= 100; p += 1) {
      const v = linearise(p, MEASURED_CURVES.blue);
      assert.ok(v >= last);
      last = v;
    }
  });
});
