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

  // Clear storage so starters re-seed on reload
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v1");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await ensureConnected(page);

  await page.waitForFunction(
    () => document.body.innerText.includes("The Jewel Canopy"),
    { timeout: 10000 },
  );
  await new Promise((r) => setTimeout(r, 600));

  // Select Jewel Canopy so description detail is visible
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("The Jewel Canopy"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));

  const listPath = path.join(mediaDir, "presets-with-descriptions.png");
  await page.screenshot({ path: listPath, fullPage: true });
  console.log("wrote", listPath);

  // Select Bioactive schedule + scroll timeline
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("Bioactive 24/7"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    document.querySelector(".timeline-panel")?.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 500));

  const bioPath = path.join(mediaDir, "bioactive-schedule-seeded.png");
  await page.screenshot({ path: bioPath, fullPage: true });
  console.log("wrote", bioPath);
} finally {
  await browser.close();
}
