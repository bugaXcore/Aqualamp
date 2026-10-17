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
        await new Promise((r) => setTimeout(r, 250));
      }
      clearTimeout(timer);
      ws.close();
      resolve();
    });
    ws.on("error", reject);
  });
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  // Disconnected hero
  await bridgeRpc([{ type: "disconnect" }]);
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("AquaLamp"),
    { timeout: 10000 },
  );
  await new Promise((r) => setTimeout(r, 800));
  const heroPath = path.join(mediaDir, "aqualamp-mock-hero.png");
  await page.screenshot({ path: heroPath, fullPage: false });
  console.log("wrote", heroPath);

  // Connected controls
  await page.click("button");
  await page.waitForFunction(
    () => document.body.innerText.includes("Channels"),
    { timeout: 10000 },
  );
  await bridgeRpc([
    {
      type: "setChannels",
      channels: { red: 65, green: 20, blue: 85, white: 35 },
    },
  ]);
  await new Promise((r) => setTimeout(r, 900));
  const connectedPath = path.join(mediaDir, "aqualamp-mock-connected.png");
  await page.screenshot({ path: connectedPath, fullPage: false });
  console.log("wrote", connectedPath);

  // Simple "recording" as sequential frames + note — also capture a short
  // animated-feel by saving a third mid-state if needed.
  const proofPath = path.join(mediaDir, "aqualamp-mock-e2e-proof.txt");
  fs.writeFileSync(
    proofPath,
    [
      "AquaLamp mock e2e proof",
      `web=${webUrl}`,
      `bridge=${bridgeUrl}`,
      `hero=${heroPath}`,
      `connected=${connectedPath}`,
      `capturedAt=${new Date().toISOString()}`,
    ].join("\n"),
  );
  console.log("wrote", proofPath);
} finally {
  await browser.close();
}
