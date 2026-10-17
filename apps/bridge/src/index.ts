/**
 * Local WebSocket bridge — thin adapter over a single WeekAquaController.
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  WeekAquaController,
  loadControllerConfigFromEnv,
  loadEnvFile,
  type Channels,
  type ConnectionState,
} from "@aqualamp/controller";

loadEnvFile();

type ClientMessage =
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "setChannels"; channels: Partial<Channels> }
  | { type: "getStatus" };

type ServerMessage =
  | { type: "state"; state: ConnectionState; mock: boolean }
  | { type: "channels"; channels: Channels }
  | { type: "error"; message: string }
  | { type: "hello"; state: ConnectionState; channels: Channels; mock: boolean };

const host = process.env.BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.BRIDGE_PORT ?? 8787);

const config = loadControllerConfigFromEnv();
const controller = new WeekAquaController({
  ...config,
  // Bridge defaults auto-reconnect on unless explicitly disabled
  autoReconnect:
    process.env.AQUALAMP_AUTO_RECONNECT === undefined
      ? true
      : process.env.AQUALAMP_AUTO_RECONNECT === "1",
});

const httpServer = createServer((req, res) => {
  // Local-dev friendly CORS for simple health checks
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        state: controller.getState(),
        mock: controller.isMock(),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end("AquaLamp bridge — connect via WebSocket");
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage): void {
  for (const client of wss.clients) {
    send(client, msg);
  }
}

controller.on("state", (state: ConnectionState) => {
  broadcast({ type: "state", state, mock: controller.isMock() });
});

controller.on("channels", (channels: Channels) => {
  broadcast({ type: "channels", channels });
});

controller.on("error", (err: Error) => {
  broadcast({ type: "error", message: err.message });
});

wss.on("connection", (ws) => {
  send(ws, {
    type: "hello",
    state: controller.getState(),
    channels: controller.getChannels(),
    mock: controller.isMock(),
  });

  ws.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "Invalid JSON message" });
      return;
    }

    try {
      switch (msg.type) {
        case "connect":
          await controller.connect();
          break;
        case "disconnect":
          await controller.disconnect();
          break;
        case "setChannels":
          if (!msg.channels || typeof msg.channels !== "object") {
            throw new Error("setChannels requires a channels object");
          }
          await controller.setChannels(msg.channels);
          break;
        case "getStatus":
          send(ws, {
            type: "hello",
            state: controller.getState(),
            channels: controller.getChannels(),
            mock: controller.isMock(),
          });
          break;
        default:
          send(ws, {
            type: "error",
            message: `Unknown message type: ${(msg as { type: string }).type}`,
          });
      }
    } catch (err) {
      send(ws, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
});

httpServer.listen(port, host, () => {
  console.log(
    `AquaLamp bridge listening on ws://${host}:${port} (mock=${controller.isMock()})`,
  );
});

function shutdown(): void {
  void controller.disconnect().finally(() => {
    wss.close();
    httpServer.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
