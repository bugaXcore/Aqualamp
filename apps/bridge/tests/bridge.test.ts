import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
type Msg = Record<string, unknown> & { type: string };

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

let child: ChildProcess;
let port: number;

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, ["--import", "tsx", entry], {
    env: { ...process.env, AQUALAMP_MOCK: "1", BRIDGE_PORT: String(port), BRIDGE_HOST: "127.0.0.1", AQUALAMP_RECONNECT_ATTEMPTS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bridge did not start")), 15_000);
    child.stdout!.on("data", (d) => {
      if (String(d).includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", () => reject(new Error("bridge exited early")));
  });
});

after(() => {
  child.kill();
});

/** Opens a client that records every server message. */
async function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const seen: Msg[] = [];
  ws.on("message", (raw) => seen.push(JSON.parse(String(raw)) as Msg));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const until = async (match: (m: Msg) => boolean, ms = 8000): Promise<Msg> => {
    const start = Date.now();
    for (;;) {
      const hit = seen.find(match);
      if (hit) return hit;
      if (Date.now() - start > ms) throw new Error(`no matching message; saw ${JSON.stringify(seen)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const send = (m: object) => ws.send(JSON.stringify(m));
  return { ws, seen, until, send };
}

describe("bridge (mock mode)", () => {
  it("says hello with the current state", async () => {
    const c = await client();
    const hello = await c.until((m) => m.type === "hello");
    assert.equal(hello.mock, true);
    assert.equal(hello.mode, 1);
    assert.equal(hello.calibrated, false);
    c.ws.close();
  });

  it("serves /health", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await res.json()) as { ok: boolean; mock: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.mock, true);
  });

  it("answers bad input with an error and keeps running", async () => {
    const c = await client();
    c.ws.send("not json");
    await c.until((m) => m.type === "error" && /Invalid JSON/.test(String(m.message)));
    c.send({ type: "nonsense" });
    await c.until((m) => m.type === "error" && /Unknown message type/.test(String(m.message)));
    c.send({ type: "setSchedule", windows: "no" });
    await c.until((m) => m.type === "error" && /windows array/.test(String(m.message)));
    c.send({ type: "setMode", mode: 2 });
    await c.until((m) => m.type === "error" && /not connected/i.test(String(m.message)));
    c.ws.close();
  });

  it("connects, echoes channels, switches mode and calibration, then disconnects", async () => {
    const c = await client();
    c.send({ type: "connect" });
    await c.until((m) => m.type === "state" && m.state === "connected");

    c.send({ type: "setChannels", channels: { red: 30, uv: 5 } });
    const ch = await c.until((m) => m.type === "channels" && (m.channels as { red: number }).red === 30);
    assert.deepEqual(ch.channels, { red: 30, green: 0, blue: 0, uv: 5 });

    c.send({ type: "setCalibrated", on: true });
    await c.until((m) => m.type === "state" && m.calibrated === true);

    c.send({ type: "setMode", mode: 2 });
    await c.until((m) => m.type === "state" && m.mode === 2);

    c.send({ type: "power", on: false });
    await c.until((m) => m.type === "channels" && (m.channels as { red: number }).red === 0);

    c.send({ type: "disconnect" });
    await c.until((m) => m.type === "state" && m.state === "disconnected");
    c.ws.close();
  });

  it("accepts a schedule and moves to advanced mode", async () => {
    const c = await client();
    c.send({ type: "connect" });
    await c.until((m) => m.type === "state" && m.state === "connected");
    c.send({
      type: "setSchedule",
      windows: [{ startMin: 0, endMin: 1440, channels: { red: 10, green: 20, blue: 30, uv: 0 } }],
    });
    await c.until((m) => m.type === "state" && m.mode === 2);
    c.send({ type: "disconnect" });
    await c.until((m) => m.type === "state" && m.state === "disconnected");
    c.ws.close();
  });
});
