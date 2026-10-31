export { Lamp, type LampSnapshot, type LampOptions } from "./lamp.js";
export { MockTransport, type LampTransport } from "./transport.js";
export { calibrateChannels, linearise, MEASURED_CURVES, type CalibrationCurves } from "./calibration.js";
export * from "./frames.js";
export {
  DEFAULT_CHANNELS,
  clampChannel,
  normalizeChannels,
  type Channels,
  type ConnectionState,
} from "./types.js";
