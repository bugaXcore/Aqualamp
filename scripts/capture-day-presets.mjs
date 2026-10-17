import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import WebSocket from "ws";

const mediaDir =
  process.env.AQUALAMP_MEDIA_DIR ||
  String.raw`C:\Users\bugas\AppData\Local\Cursor\AgentStores\cursor_agent_stores\bc-c60d5f05-ca4d-4eb0-854e-5524d1b9bb8c\files\media`;
const chromePath =
  process.env.CHROME_PATH ||
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const webUrl = process.env.AQUALAMP_WEB_URL || "http://127.0.0.1:5173";
const bridgeUrl = process.env.AQUALAMP_BRIDGE_WS || "ws://127.0.0.1:8787";

fs.mkdirSync(mediaDir, { recursive: true });

async function bridgeRpc(messages) {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(bridgeUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("bridge timeout"));
    }, 5000);
    ws.on("open", async () => {
      for (const msg of messages) {
        ws.send(JSON.stringify(msg));
        await new Promise((r) => setTimeout(r, 200));
      }
      clearTimeout(timer);
      ws.close();
      resolve();
    });
    ws.on("error", reject);
  });
}

async function ensureConnected(page) {
  await bridgeRpc([{ type: "connect" }]);
  const btn = await page.$("button");
  if (btn) {
    const label = await page.evaluate((el) => el.textContent || "", btn);
    if (label.includes("Connect")) await btn.click();
  }
  await page.waitForFunction(
    () => document.body.innerText.includes("Day presets"),
    { timeout: 15000 },
  );
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  await bridgeRpc([{ type: "disconnect" }]);
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });

  // Leave v1 junk in place; only remove v2 so we prove a cold v2 seed
  // (Stav's browser still has v1 — new key alone is enough for him).
  await page.evaluate(() => {
    localStorage.setItem(
      "aqualamp.dayPresets.v1",
      JSON.stringify({
        version: 1,
        presets: [
          {
            id: "legacy",
            name: "Preset 1",
            mode: "schedule",
            constantChannels: { red: 0, green: 0, blue: 0, uv: 0 },
            keyframes: [],
            snap: "free",
            interpolation: "linear",
          },
        ],
      }),
    );
    localStorage.removeItem("aqualamp.dayPresets.v2");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await ensureConnected(page);

  await page.waitForFunction(
    () =>
      document.body.innerText.includes("The Bioactive 24/7") &&
      document.body.innerText.includes("The Jewel Canopy") &&
      document.body.innerText.includes("The High-Contrast Scape") &&
      document.body.innerText.includes("Crisp Photography") &&
      document.body.innerText.includes("Lunar Viewing"),
    { timeout: 10000 },
  );
  // Confirm v2 was written and v1 was ignored
  const keys = await page.evaluate(() => ({
    v1: localStorage.getItem("aqualamp.dayPresets.v1")?.slice(0, 80),
    v2: JSON.parse(localStorage.getItem("aqualamp.dayPresets.v2") || "null"),
  }));
  if (!keys.v2 || keys.v2.version !== 2 || keys.v2.presets?.length !== 5) {
    throw new Error(`v2 seed failed: ${JSON.stringify(keys)}`);
  }
  console.log("v2 seeded with", keys.v2.presets.length, "presets (v1 leftover ignored)");

  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => {
    document.querySelector(".presets-panel")?.scrollIntoView({ block: "start" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const v2Path = path.join(mediaDir, "presets-reseeding-v2.png");
  await page.screenshot({ path: v2Path, fullPage: true });
  console.log("wrote", v2Path);
} finally {
  await browser.close();
}
