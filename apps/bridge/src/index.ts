/**
 * Local WebSocket bridge — a thin adapter over one Lamp (mock or bleak sidecar).
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  Lamp,
  MockTransport,
  SidecarTransport,
  loadEnvFile,
  type Channels,
  type ConnectionState,
  type LampSnapshot,
  type ScheduleWindow,
} from "@aqualamp/controller";

loadEnvFile();

type Time = { hours: number; minutes: number };

type ClientMessage =
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "setChannels"; channels: Partial<Channels> }
  | { type: "power"; on: boolean }
  | { type: "setMode"; mode: 1 | 2 }
  | { type: "setTimer"; sunrise: Time; sunset: Time; fade?: number }
  | { type: "setSchedule"; windows: ScheduleWindow[] }
  | { type: "setCalibrated"; on: boolean }
  | { type: "getStatus" };

type Status = { state: ConnectionState; mock: boolean; mode: 1 | 2; calibrated: boolean };

type ServerMessage =
  | ({ type: "state" } & Status)
  | { type: "channels"; channels: Channels }
  | { type: "error"; message: string }
  | ({ type: "hello"; channels: Channels } & Status);

const host = process.env.BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.BRIDGE_PORT ?? 8787);
const flag = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  return raw === undefined ? fallback : ["1", "true", "yes"].includes(raw.toLowerCase());
};

const mock = flag("AQUALAMP_MOCK", true);
const configuredAddress = process.env.LIGHT_ADDRESS;
const transport = mock
  ? new MockTransport(30)
  : new SidecarTransport({
      address: configuredAddress && !configuredAddress.toUpperCase().includes("X") ? configuredAddress : undefined,
    });
const lamp = new Lamp(transport, {
  calibrated: flag("AQUALAMP_CALIBRATED", false),
  reconnectAttempts: Number(process.env.AQUALAMP_RECONNECT_ATTEMPTS ?? 3),
});

const status = (s: LampSnapshot = lamp.current): Status => ({
  state: s.state,
  mock,
  mode: s.mode,
  calibrated: s.calibrated,
});

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...status() }));
    return;
  }
  res.writeHead(404);
  res.end("AquaLamp bridge — connect via WebSocket");
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage): void {
  for (const client of wss.clients) send(client, msg);
}

let previous = lamp.current;
lamp.subscribe((s) => {
  const p = previous;
  previous = s;
  if (s.state !== p.state || s.mode !== p.mode || s.calibrated !== p.calibrated) {
    broadcast({ type: "state", ...status(s) });
  }
  if (s.channels !== p.channels) broadcast({ type: "channels", channels: s.channels });
  if (s.error && s.error !== p.error) broadcast({ type: "error", message: s.error });
});

function hello(): ServerMessage {
  return { type: "hello", channels: lamp.current.channels, ...status() };
}

wss.on("connection", (ws) => {
  send(ws, hello());

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
          await lamp.connect();
          break;
        case "disconnect":
          await lamp.disconnect();
          break;
        case "setChannels":
          if (!msg.channels || typeof msg.channels !== "object") {
            throw new Error("setChannels requires a channels object");
          }
          lamp.setChannels(msg.channels);
          break;
        case "power":
          await (msg.on ? lamp.powerOn() : lamp.powerOff());
          break;
        case "setMode":
          await lamp.setMode(msg.mode);
          break;
        case "setTimer":
          await lamp.setTimer(msg.sunrise, msg.sunset, msg.fade ?? 0);
          break;
        case "setSchedule":
          if (!Array.isArray(msg.windows)) throw new Error("setSchedule requires a windows array");
          await lamp.setSchedule(msg.windows);
          break;
        case "setCalibrated":
          lamp.setCalibrated(Boolean(msg.on));
          break;
        case "getStatus":
          send(ws, hello());
          break;
        default:
          send(ws, { type: "error", message: `Unknown message type: ${(msg as { type: string }).type}` });
      }
    } catch (err) {
      send(ws, { type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
});

httpServer.listen(port, host, () => {
  console.log(`AquaLamp bridge listening on ws://${host}:${port} (${mock ? "mock" : "bleak sidecar"})`);
});

function shutdown(): void {
  void lamp.disconnect().finally(() => {
    if (transport instanceof SidecarTransport) transport.close();
    wss.close();
    httpServer.close(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
