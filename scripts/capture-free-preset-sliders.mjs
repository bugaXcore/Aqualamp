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
  await page.goto(`${webUrl}/?free=${Date.now()}`, {
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
  await new Promise((r) => setTimeout(r, 500));

  // Nudge a slider to prove live
  await page.evaluate(() => {
    const input = document.querySelector(
      '.channel-strip input[type="range"]',
    );
    if (!input) return;
    const el = input;
    el.value = "70";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));

  const checks = await page.evaluate(() => {
    const first = document.querySelector(
      ".presets-panel [role='button']",
    );
    const ranges = [...document.querySelectorAll('.channel-strip input[type="range"]')];
    const disabled = ranges.filter((r) => r.disabled).length;
    const stripLocked = document
      .querySelector(".channel-strip")
      ?.classList.contains("pointer-events-none");
    return {
      firstName: (first?.textContent || "").slice(0, 40),
      freeFirst: (first?.textContent || "").includes("Free mix"),
      freeBadge: (first?.textContent || "").includes("Free"),
      selected: first?.className.includes("border-teal-400"),
      disabledCount: disabled,
      stripLocked: Boolean(stripLocked),
      noEditLive: !document.querySelector(".timeline-mode-switch"),
      diamondsOk: document.querySelectorAll(".timeline-kf-chip").length >= 0,
      hint: (document.body.innerText.match(/Free mix[^\n]*/)?.[0] || "").slice(
        0,
        80,
      ),
    };
  });
  console.log("checks", checks);
  if (!checks.freeFirst) throw new Error("Free mix not first");
  if (checks.disabledCount > 0 || checks.stripLocked) {
    throw new Error("sliders still look locked on free mix");
  }
  if (!checks.noEditLive) throw new Error("EDIT/LIVE still present");

  const out = path.join(mediaDir, "ui-free-preset-sliders.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
