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
        await new Promise((r) => setTimeout(r, 150));
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
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await bridgeRpc([{ type: "connect" }]);
  const btn = await page.$("button");
  if (btn) {
    const label = await page.evaluate((el) => el.textContent || "", btn);
    if (label.includes("Connect")) await btn.click();
  }
  await page.waitForFunction(
    () => /live mix/i.test(document.body.innerText),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 600));

  const proof = await page.evaluate(() => {
    const top = document.body.innerText.split("\n").filter(Boolean).slice(0, 8);
    return {
      top,
      hasAquaLampTitle: top.some((l) => l.trim() === "AquaLamp"),
      hasChannelsTitle: top.some((l) => l.trim() === "Channels"),
      hasDisconnect: document.body.innerText.includes("Disconnect"),
      hasStatus: /Connected/i.test(document.body.innerText),
    };
  });
  console.log("proof", proof);
  if (proof.hasAquaLampTitle) throw new Error("AquaLamp title still in header");
  if (proof.hasChannelsTitle) throw new Error("Channels title still present");

  const out = path.join(mediaDir, "ui-header-minimal.png");
  await page.screenshot({ path: out, fullPage: false });
  console.log("wrote", out);
} finally {
  await browser.close();
}
