export * as frames from "./frames.js";
export { Lamp, type LampSnapshot, type LampOptions } from "./lamp.js";
export { MockTransport, type LampTransport } from "./transport.js";
export { SidecarTransport, type SidecarOptions } from "./sidecarTransport.js";
export { calibrateChannels, linearise, MEASURED_CURVES } from "./calibration.js";
export { compileSchedule, MAX_SLOTS, type ScheduleWindow } from "./schedule.js";
export {
  DEFAULT_CHANNELS,
  clampChannel,
  normalizeChannels,
  type Channels,
  type ConnectionState,
} from "./types.js";
export { loadEnvFile } from "./loadEnv.js";
