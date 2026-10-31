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
  defaultViewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  await bridgeRpc([{ type: "disconnect" }]);
  const page = await browser.newPage();
  await page.goto(`${webUrl}/?nopill=${Date.now()}`, {
    waitUntil: "networkidle0",
    timeout: 25000,
  });
  await page.evaluate(() => localStorage.removeItem("aqualamp.dayPresets.v3"));
  await page.reload({ waitUntil: "networkidle0" });
  await bridgeRpc([{ type: "connect" }]);
  const btn = await page.$("button");
  if (btn) {
    const label = await page.evaluate((el) => el.textContent || "", btn);
    if (label.includes("Connect")) await btn.click();
  }
  await page.waitForFunction(
    () => document.body.innerText.includes("Free mix"),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 400));

  const checks = await page.evaluate(() => {
    const first = document.querySelector(".presets-panel [role='button']");
    const text = first?.textContent || "";
    const hasFreePill = [...(first?.querySelectorAll("span") || [])].some(
      (s) => /^free$/i.test((s.textContent || "").trim()),
    );
    const ranges = [
      ...document.querySelectorAll('.channel-strip input[type="range"]'),
    ];
    return {
      firstLabel: text.replace(/\s+/g, " ").trim().slice(0, 48),
      freeFirst: text.includes("Free mix"),
      hasFreePill,
      slidersLive: ranges.every((r) => !r.disabled),
    };
  });
  console.log("checks", checks);
  if (!checks.freeFirst) throw new Error("Free mix not first");
  if (checks.hasFreePill) throw new Error("FREE pill still present");
  if (!checks.slidersLive) throw new Error("sliders locked");

  const out = path.join(mediaDir, "ui-free-mix-no-pill.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
