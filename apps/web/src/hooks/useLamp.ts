import { useEffect, useMemo, useState } from "react";
import { Lamp, type Channels, type ScheduleWindow } from "@aqualamp/core";
import { WebBluetoothTransport, webBluetoothAvailable } from "@/lib/webBluetoothTransport";
import type { ConnectionState, LampTime } from "@/lib/bridge";

/** Same shape as useBridge, but talks to the lamp over Web Bluetooth from this tab. */
export function useLamp() {
  const lamp = useMemo(() => new Lamp(new WebBluetoothTransport(), { reconnectAttempts: 3 }), []);
  const [snapshot, setSnapshot] = useState(lamp.current);

  useEffect(() => {
    const unsubscribe = lamp.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      void lamp.disconnect();
    };
  }, [lamp]);

  const [commandError, setCommandError] = useState<string | null>(null);
  const supported = webBluetoothAvailable();

  const run = (job: Promise<void>) =>
    job.then(
      () => setCommandError(null),
      (e: unknown) => setCommandError(e instanceof Error ? e.message : String(e)),
    );

  return {
    socketOpen: supported,
    state: snapshot.state as ConnectionState,
    channels: snapshot.channels,
    mock: false,
    error: snapshot.error ?? commandError,
    bridgeError: supported ? null : "Web Bluetooth is unavailable here. Use Chrome or Edge on localhost or HTTPS.",
    connect: () => void lamp.connect(),
    disconnect: () => void lamp.disconnect(),
    setChannels: (partial: Partial<Channels>) => lamp.setChannels(partial),
    mode: snapshot.mode,
    calibrated: snapshot.calibrated,
    power: (on: boolean) => void run(on ? lamp.powerOn() : lamp.powerOff()),
    setMode: (next: 1 | 2) => void run(lamp.setMode(next)),
    setTimer: (sunrise: LampTime, sunset: LampTime, fade: number) => void run(lamp.setTimer(sunrise, sunset, fade)),
    setCalibrated: (on: boolean) => lamp.setCalibrated(on),
    setSchedule: (windows: ScheduleWindow[]) => void run(lamp.setSchedule(windows)),
  };
}
