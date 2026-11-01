import { useCallback, useEffect, useRef, useState } from "react";
import { isUserCancel } from "@/components/ConnectGuide";
import type { ConnectionState } from "@/lib/bridge";

type Options = {
  state: ConnectionState;
  error: string | null;
  connect: () => void;
  maxAttempts?: number;
  delayMs?: number;
};

/**
 * Keeps trying to connect after a failure, up to `maxAttempts` tries in total.
 * Stops on success, on a dismissed device chooser, when the limit is hit, or on request.
 */
export function useConnectRetry({ state, error, connect, maxAttempts = 5, delayMs = 3000 }: Options) {
  const [active, setActive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const connectRef = useRef(connect);
  connectRef.current = connect;

  const start = useCallback(() => {
    setAttempt(1);
    setActive(true);
    connectRef.current();
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    setAttempt(0);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (state === "connected") {
      setActive(false);
      setAttempt(0);
      return;
    }
    if (state !== "error") return;
    if (isUserCancel(error) || attempt >= maxAttempts) {
      setActive(false);
      return;
    }
    const timer = setTimeout(() => {
      setAttempt((n) => n + 1);
      connectRef.current();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [active, state, error, attempt, maxAttempts, delayMs]);

  return { retrying: active, attempt, maxAttempts, start, stop };
}
