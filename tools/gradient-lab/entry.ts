import { BUILTIN_PRESETS, interpolateAt } from "@/lib/presets";
import { channelsToCss } from "@/lib/bridge";

(window as unknown as { AQ: unknown }).AQ = {
  presets: BUILTIN_PRESETS,
  interpolateAt,
  channelsToCss,
};
