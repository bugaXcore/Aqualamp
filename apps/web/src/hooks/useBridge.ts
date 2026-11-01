import { useEffect, useRef, useState } from "react";
import {
  defaultBridgeUrl,
  normalizeBridgeChannels,
  type Channels,
  type ConnectionState,
  type LampTime,
  type ScheduleWindow,
  type ServerMessage,
} from "@/lib/bridge";

const EMPTY: Channels = { red: 0, green: 0, blue: 0, uv: 0 };

export function useBridge(url = defaultBridgeUrl()) {
  const wsRef = useRef<WebSocket | null>(null);
  const [socketOpen, setSocketOpen] = useState(false);
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [channels, setChannels] = useState<Channels>(EMPTY);
  const [mock, setMock] = useState(true);
  const [mode, setModeState] = useState<1 | 2>(1);
  const [calibrated, setCalibratedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connectSocket = () => {
      if (closed) return;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        setSocketOpen(true);
        setBridgeError(null);
      };

      ws.onclose = () => {
        if (closed) return;
        setSocketOpen(false);
        setBridgeError("Bridge unreachable — is `npm run bridge` running?");
        retryTimer = setTimeout(connectSocket, 1500);
      };

      ws.onerror = () => {
        // onclose handles retry messaging
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case "hello":
            setState(msg.state);
            setChannels(normalizeBridgeChannels(msg.channels));
            setMock(msg.mock);
            setModeState(msg.mode ?? 1);
            setCalibratedState(msg.calibrated ?? false);
            setError(null);
            break;
          case "state":
            setState(msg.state);
            setMock(msg.mock);
            if (msg.mode) setModeState(msg.mode);
            if (msg.calibrated !== undefined) setCalibratedState(msg.calibrated);
            if (msg.state !== "error") setError(null);
            break;
          case "channels":
            setChannels(normalizeBridgeChannels(msg.channels));
            break;
          case "error":
            setError(msg.message);
            break;
        }
      };
    };

    connectSocket();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setBridgeError("Bridge not connected");
      return;
    }
    ws.send(JSON.stringify(payload));
  };

  return {
    socketOpen,
    state,
    channels,
    mock,
    error,
    bridgeError,
    connect: (opts?: { remember?: boolean }) =>
      send({ type: "connect", remember: opts?.remember ?? false }),
    forgetDevice: () => send({ type: "forget" }),
    disconnect: () => send({ type: "disconnect" }),
    setChannels: (partial: Partial<Channels>) =>
      send({ type: "setChannels", channels: partial }),
    mode,
    calibrated,
    power: (on: boolean) => send({ type: "power", on }),
    setMode: (next: 1 | 2) => send({ type: "setMode", mode: next }),
    setTimer: (sunrise: LampTime, sunset: LampTime, fade: number) =>
      send({ type: "setTimer", sunrise, sunset, fade }),
    setCalibrated: (on: boolean) => send({ type: "setCalibrated", on }),
    setSchedule: (windows: ScheduleWindow[]) => send({ type: "setSchedule", windows }),
  };
}
