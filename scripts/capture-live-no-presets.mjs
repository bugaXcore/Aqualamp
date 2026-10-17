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
  defaultViewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v3");
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

  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("Bioactive 24/7"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 400));

  // Switch to LIVE
  await page.evaluate(() => {
    const live = [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.includes("LIVE") && b.closest(".timeline-mode-switch"),
    );
    live?.click();
  });
  await page.waitForFunction(
    () => document.querySelector(".timeline-canvas-live"),
    { timeout: 5000 },
  );
  await new Promise((r) => setTimeout(r, 500));

  const proof = await page.evaluate(() => {
    const hasPresetsPanel = Boolean(document.querySelector(".presets-panel"));
    const hasNew = [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").includes("New"),
    );
    const hasSave = [...document.querySelectorAll("button")].some(
      (b) => b.textContent?.trim() === "Save",
    );
    const text = document.body.innerText;
    return {
      hasPresetsPanel,
      hasNew,
      hasSave,
      playing: /Playing/i.test(text),
      live: /LIVE/i.test(text),
    };
  });
  console.log("proof", proof);
  if (proof.hasPresetsPanel) throw new Error("presets panel still visible in LIVE");
  if (proof.hasNew || proof.hasSave) throw new Error("edit chrome still visible in LIVE");

  await page.evaluate(() => {
    document.querySelector(".timeline-panel")?.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const out = path.join(mediaDir, "live-mode-no-presets-edit.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);

  // Optional EDIT counterpart
  await page.evaluate(() => {
    const edit = [...document.querySelectorAll("button")].find(
      (b) =>
        b.textContent?.includes("EDIT") && b.closest(".timeline-mode-switch"),
    );
    edit?.click();
  });
  await page.waitForFunction(
    () => document.querySelector(".presets-panel"),
    { timeout: 5000 },
  );
  await new Promise((r) => setTimeout(r, 400));
  const editOut = path.join(mediaDir, "edit-mode-presets-restored.png");
  await page.screenshot({ path: editOut, fullPage: true });
  console.log("wrote", editOut);
} finally {
  await browser.close();
}
