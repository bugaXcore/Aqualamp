import { useEffect, useRef, useState } from "react";
import {
  defaultBridgeUrl,
  type Channels,
  type ConnectionState,
  type ServerMessage,
} from "@/lib/bridge";

const EMPTY: Channels = { red: 0, green: 0, blue: 0, white: 0 };

export function useBridge(url = defaultBridgeUrl()) {
  const wsRef = useRef<WebSocket | null>(null);
  const [socketOpen, setSocketOpen] = useState(false);
  const [state, setState] = useState<ConnectionState>("disconnected");
  const [channels, setChannels] = useState<Channels>(EMPTY);
  const [mock, setMock] = useState(true);
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
            setChannels(msg.channels);
            setMock(msg.mock);
            setError(null);
            break;
          case "state":
            setState(msg.state);
            setMock(msg.mock);
            if (msg.state !== "error") setError(null);
            break;
          case "channels":
            setChannels(msg.channels);
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
    connect: () => send({ type: "connect" }),
    disconnect: () => send({ type: "disconnect" }),
    setChannels: (partial: Partial<Channels>) =>
      send({ type: "setChannels", channels: partial }),
  };
}
