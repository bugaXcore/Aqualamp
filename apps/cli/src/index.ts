#!/usr/bin/env node
/**
 * Thin CLI adapter — no BLE logic beyond WeekAquaController.
 */
import {
  WeekAquaController,
  loadControllerConfigFromEnv,
  loadEnvFile,
} from "@aqualamp/controller";

loadEnvFile();

function parseArgs(argv: string[]): Partial<{
  red: number;
  green: number;
  blue: number;
  white: number;
}> {
  const out: Record<string, number> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (!["red", "green", "blue", "white"].includes(name)) continue;
    const raw = argv[i + 1];
    if (raw === undefined || raw.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    out[name] = Number(raw);
    i++;
  }
  return out;
}

async function main(): Promise<void> {
  const channels = parseArgs(process.argv.slice(2));
  if (Object.keys(channels).length === 0) {
    channels.red = 40;
    channels.green = 20;
    channels.blue = 80;
    channels.white = 10;
  }

  const config = loadControllerConfigFromEnv();
  // CLI: auto-reconnect off unless explicitly enabled
  const controller = new WeekAquaController({
    ...config,
    autoReconnect: process.env.AQUALAMP_AUTO_RECONNECT === "1",
  });

  controller.on("state", (state) => {
    console.log(`[state] ${state}`);
  });
  controller.on("error", (err) => {
    console.error(`[error] ${err.message}`);
  });

  console.log(
    `AquaLamp CLI — mock=${controller.isMock()} address=${config.address}`,
  );

  try {
    await controller.connect();
    await controller.setChannels(channels);
    console.log("[ok] setChannels", controller.getChannels());
    await controller.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(
      `[fail] ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      await controller.disconnect();
    } catch {
      /* ignore */
    }
    // Force exit: WinRT/noble can leave open handles after a hung connect.
    process.exit(1);
  }
}

void main();
