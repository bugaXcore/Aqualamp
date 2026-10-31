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
  defaultViewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  await bridgeRpc([{ type: "disconnect" }]);
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v1");
    localStorage.removeItem("aqualamp.dayPresets.v2");
    localStorage.removeItem("aqualamp.dayPresets.v3");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await ensureConnected(page);

  await page.waitForFunction(
    () => document.body.innerText.includes("The Bioactive 24/7"),
    { timeout: 10000 },
  );

  // Select first builtin so description shows under timeline
  const rows = await page.$$(".presets-panel [role='button']");
  if (!rows.length) throw new Error("no preset rows");
  await rows[0].click();
  await new Promise((r) => setTimeout(r, 600));

  // Confirm no circular dials and description under timeline
  const checks = await page.evaluate(() => {
    const hasDialSvg = Boolean(
      document.querySelector('svg[role="slider"] circle'),
    );
    const sliders = document.querySelectorAll("input.channel-slider").length;
    const timeline = document.querySelector(".timeline-panel");
    const descWrap = timeline?.lastElementChild;
    const descText = (descWrap?.textContent || "").trim();
    const descUnderTimeline =
      descWrap?.className?.includes("mt-3") &&
      descText.includes("nutrient-rich dirted layers");
    const listHasLongDesc = [
      ...document.querySelectorAll(".presets-panel li"),
    ].some((li) => (li.textContent || "").includes("nutrient-rich"));
    return {
      hasDialSvg,
      sliders,
      descUnderTimeline,
      listHasLongDesc,
      descPreview: descText.slice(0, 80),
    };
  });
  console.log("checks", checks);
  if (checks.hasDialSvg) throw new Error("circular dial still present");
  if (checks.sliders !== 4) throw new Error(`expected 4 sliders, got ${checks.sliders}`);
  if (!checks.descUnderTimeline) throw new Error("description not under timeline");
  if (checks.listHasLongDesc) throw new Error("preset list still has long descriptions");

  const out = path.join(mediaDir, "ui-compact-sliders-presets.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
