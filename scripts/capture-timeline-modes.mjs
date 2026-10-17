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
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v2");
  });
  await page.reload({ waitUntil: "networkidle0" });

  await bridgeRpc([{ type: "connect" }]);
  const btn = await page.$("button");
  if (btn) {
    const label = await page.evaluate((el) => el.textContent || "", btn);
    if (label.includes("Connect")) await btn.click();
  }
  await page.waitForFunction(
    () => document.body.innerText.includes("The Bioactive 24/7"),
    { timeout: 15000 },
  );

  // Select Bioactive
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("Bioactive 24/7"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));

  // Ensure EDIT mode
  await page.evaluate(() => {
    const edit = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "EDIT" || b.textContent?.includes("EDIT"),
    );
    edit?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    document.querySelector(".timeline-panel")?.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 500));

  const editPath = path.join(mediaDir, "timeline-edit-mode.png");
  await page.screenshot({ path: editPath, fullPage: true });
  console.log("wrote", editPath);

  // Switch to LIVE
  await page.evaluate(() => {
    const live = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("LIVE") && b.closest(".timeline-mode-switch"),
    );
    live?.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("Locked") || document.body.innerText.includes("telemetry"),
    { timeout: 5000 },
  );
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => {
    document.querySelector(".timeline-panel")?.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const livePath = path.join(mediaDir, "timeline-live-mode.png");
  await page.screenshot({ path: livePath, fullPage: true });
  console.log("wrote", livePath);

  const modes = await page.evaluate(() => {
    const switchEl = document.querySelector(".timeline-mode-switch");
    const active = switchEl?.querySelector(".is-active")?.textContent?.trim();
    const text = document.body.innerText;
    const locked =
      /locked/i.test(text) && document.querySelector(".timeline-canvas-live");
    return { active, locked: Boolean(locked) };
  });
  console.log("live proof", modes);
  if (!modes.locked) throw new Error("LIVE lock cue missing");
} finally {
  await browser.close();
}
