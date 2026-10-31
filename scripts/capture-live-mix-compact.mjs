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

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  await bridgeRpc([{ type: "disconnect" }]);
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
    () => document.body.innerText.includes("Day presets"),
    { timeout: 15000 },
  );
  await page.waitForSelector(".mix-ribbon", { timeout: 8000 });

  const rows = await page.$$(".presets-panel [role='button']");
  if (rows[0]) await rows[0].click();
  await new Promise((r) => setTimeout(r, 500));

  const checks = await page.evaluate(() => {
    const hasTank = Boolean(document.querySelector(".tank-preview"));
    const hasLiveMixLabel = [...document.querySelectorAll("*")].some(
      (el) =>
        el.children.length === 0 &&
        (el.textContent || "").trim().toUpperCase() === "LIVE MIX",
    );
    const ribbon = document.querySelector(".mix-ribbon");
    const wash = document.querySelector(".mix-wash");
    const shell = document.querySelector(".app-shell");
    const strip = document.querySelector(".channel-strip");
    return {
      hasTank,
      hasLiveMixLabel,
      hasRibbon: Boolean(ribbon),
      ribbonH: ribbon ? getComputedStyle(ribbon).height : null,
      hasWash: Boolean(wash),
      washOpacity: wash ? getComputedStyle(wash).opacity : null,
      mixVar: shell ? getComputedStyle(shell).getPropertyValue("--mix").trim() : "",
      strength: shell
        ? getComputedStyle(shell).getPropertyValue("--mix-strength").trim()
        : "",
      hasStrip: Boolean(strip),
    };
  });
  console.log(JSON.stringify(checks, null, 2));
  if (checks.hasTank || checks.hasLiveMixLabel) {
    throw new Error("tall LIVE MIX card still present");
  }
  if (!checks.hasRibbon || !checks.hasWash) {
    throw new Error("missing ribbon or wash");
  }
  const strength = Number(checks.strength);
  if (!(strength > 0 && strength <= 0.32)) {
    throw new Error(`wash strength out of range: ${checks.strength}`);
  }

  const out = path.join(mediaDir, "ui-live-mix-compact.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
