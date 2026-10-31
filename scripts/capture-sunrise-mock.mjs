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

async function connect(page) {
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

async function enterComposeSchedule(page) {
  const rows = await page.$$(".presets-panel [role='button']");
  await rows[0].click();
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    const dup = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("title") || "").includes("Duplicate"),
    );
    dup?.click();
  });
  await page.waitForSelector(".solar-assist", { timeout: 8000 });
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
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 25000 });
  await page.evaluate(() => localStorage.removeItem("aqualamp.dayPresets.v3"));
  await page.reload({ waitUntil: "networkidle0" });
  await connect(page);
  await enterComposeSchedule(page);

  // --- B first: open Sunrise popover ---
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".solar-assist button")].find(
      (b) => (b.textContent || "").includes("Sunrise"),
    );
    chip?.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("Sunrise ramp"),
    { timeout: 5000 },
  );
  await new Promise((r) => setTimeout(r, 300));
  const bPath = path.join(mediaDir, "mock-sunrise-b-assist.png");
  await page.screenshot({ path: bPath, fullPage: true });
  console.log("wrote", bPath);

  // Apply sunrise + sunset for A shot
  await page.evaluate(() => {
    const apply = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Apply",
    );
    apply?.click();
  });
  await new Promise((r) => setTimeout(r, 350));
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".solar-assist button")].find(
      (b) => (b.textContent || "").includes("Sunset"),
    );
    chip?.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("Sunset ramp"),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const apply = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Apply",
    );
    apply?.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // Scrub away HUD for cleaner A shot
  const svgEl = await page.$(".timeline-canvas svg");
  const sbox = await svgEl.boundingBox();
  await page.mouse.click(sbox.x + sbox.width * 0.5, sbox.y + sbox.height * 0.55);
  await new Promise((r) => setTimeout(r, 300));

  const checks = await page.evaluate(() => ({
    dawn: document.body.innerText.includes("DAWN"),
    dusk: document.body.innerText.includes("DUSK"),
    handles: document.querySelectorAll('button[aria-label*="ramp"]').length,
    nextChip: [...document.querySelectorAll("span")].some((s) =>
      (s.textContent || "").startsWith("Next ·"),
    ),
    linked: (document.body.innerText.match(/linked/gi) || []).length,
  }));
  console.log("A checks", checks);
  if (!checks.dawn || !checks.dusk) throw new Error("missing ramp bands");
  if (checks.handles < 4) throw new Error(`expected 4 handles, got ${checks.handles}`);

  const aPath = path.join(mediaDir, "mock-sunrise-a-handles.png");
  await page.screenshot({ path: aPath, fullPage: true });
  console.log("wrote", aPath);
} finally {
  await browser.close();
}
