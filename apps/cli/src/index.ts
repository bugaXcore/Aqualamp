#!/usr/bin/env node
/**
 * Thin CLI adapter over Lamp. Mock by default; AQUALAMP_MOCK=0 drives the real
 * lamp through the Python bleak sidecar.
 */
import {
  Lamp,
  MockTransport,
  SidecarTransport,
  loadEnvFile,
  type Channels,
  type LampTransport,
} from "@aqualamp/controller";

loadEnvFile();

const CHANNEL_NAMES = ["red", "green", "blue", "uv"] as const;

type Action = { kind: "channels"; channels: Partial<Channels> } | { kind: "off" } | { kind: "on" };

function parseArgs(argv: string[]): Action {
  const channels: Partial<Channels> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--off") return { kind: "off" };
    if (key === "--on") return { kind: "on" };
    if (!key.startsWith("--")) continue;
    let name = key.slice(2);
    // Legacy alias: --white maps to uv (S300 Pro has UV, not white).
    if (name === "white") name = "uv";
    if (!(CHANNEL_NAMES as readonly string[]).includes(name)) continue;
    const raw = argv[i + 1];
    if (raw === undefined || raw.startsWith("--")) throw new Error(`Missing value for --${name}`);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`--${name} must be a number from 0 to 100`);
    channels[name as keyof Channels] = value;
    i++;
  }
  if (Object.keys(channels).length === 0) return { kind: "channels", channels: { red: 40, green: 20, blue: 80, uv: 10 } };
  return { kind: "channels", channels };
}

function makeTransport(): { transport: LampTransport; mock: boolean; close: () => void } {
  const raw = process.env.AQUALAMP_MOCK?.toLowerCase();
  const mock = !(raw === "0" || raw === "false" || raw === "no");
  if (mock) return { transport: new MockTransport(), mock, close: () => {} };
  const address = process.env.LIGHT_ADDRESS;
  const sidecar = new SidecarTransport({ address: address && !address.toUpperCase().includes("X") ? address : undefined });
  return { transport: sidecar, mock, close: () => sidecar.close() };
}

async function main(): Promise<void> {
  const action = parseArgs(process.argv.slice(2));
  const { transport, mock, close } = makeTransport();
  const lamp = new Lamp(transport);
  lamp.subscribe((s) => {
    if (s.error) console.error(`[error] ${s.error}`);
  });
  console.log(`AquaLamp CLI — mock=${mock}`);

  let code = 0;
  try {
    await lamp.connect();
    if (lamp.current.state !== "connected") throw new Error(lamp.current.error ?? "Could not connect to the lamp.");
    if (action.kind === "off") await lamp.powerOff();
    else if (action.kind === "on") await lamp.powerOn();
    else {
      lamp.setChannels(action.channels);
      // setChannels is fire-and-forget; give the write queue time to drain.
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log("[ok]", lamp.current.channels);
  } catch (err) {
    console.error(`[fail] ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  } finally {
    await lamp.disconnect().catch(() => {});
    close();
  }
  process.exit(code);
}

void main();
