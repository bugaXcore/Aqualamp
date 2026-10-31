import { useEffect, useMemo, useState } from "react";
import { Lamp, type Channels } from "@aqualamp/core";
import { WebBluetoothTransport, webBluetoothAvailable } from "@/lib/webBluetoothTransport";
import type { ConnectionState } from "@/lib/bridge";

/** Same shape as useBridge, but talks to the lamp over Web Bluetooth from this tab. */
export function useLamp() {
  const lamp = useMemo(() => new Lamp(new WebBluetoothTransport()), []);
  const [snapshot, setSnapshot] = useState(lamp.current);

  useEffect(() => {
    const unsubscribe = lamp.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      void lamp.disconnect();
    };
  }, [lamp]);

  const supported = webBluetoothAvailable();

  return {
    socketOpen: supported,
    state: snapshot.state as ConnectionState,
    channels: snapshot.channels,
    mock: false,
    error: snapshot.error,
    bridgeError: supported ? null : "Web Bluetooth is unavailable here. Use Chrome or Edge on localhost or HTTPS.",
    connect: () => void lamp.connect(),
    disconnect: () => void lamp.disconnect(),
    setChannels: (partial: Partial<Channels>) => lamp.setChannels(partial),
  };
}
