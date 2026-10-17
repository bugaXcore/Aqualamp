import type { ConnectionState } from "@/lib/bridge";
import { cn } from "@/lib/utils";

const LABELS: Record<ConnectionState, string> = {
  disconnected: "Disconnected",
  scanning: "Scanning…",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Error",
};

export function StatusChip({
  state,
  mock,
}: {
  state: ConnectionState;
  mock: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium tracking-wide transition-all duration-500",
        state === "connected" && "bg-teal-400/15 text-teal-200",
        state === "connecting" || state === "scanning"
          ? "bg-cyan-300/10 text-cyan-100"
          : null,
        state === "disconnected" && "bg-white/5 text-teal-100/70",
        state === "error" && "bg-rose-400/15 text-rose-200",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full transition-all duration-500",
          state === "connected" && "bg-teal-300 shadow-[0_0_10px_#5eead4]",
          (state === "connecting" || state === "scanning") &&
            "animate-pulse bg-cyan-200",
          state === "disconnected" && "bg-slate-400/70",
          state === "error" && "bg-rose-300",
        )}
      />
      <span>{LABELS[state]}</span>
      {mock && <span className="text-teal-100/45">· mock</span>}
    </div>
  );
}
