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
  defaultViewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  await bridgeRpc([{ type: "disconnect" }]);
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 25000 });
  await page.evaluate(() => localStorage.removeItem("aqualamp.dayPresets.v3"));
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

  const rows = await page.$$(".presets-panel [role='button']");
  await rows[0].click();
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    const dup = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("title") || "").includes("Duplicate"),
    );
    dup?.click();
  });
  await page.waitForSelector(".cti-chrome", { timeout: 8000 });

  const kf = await page.$("svg g[data-kf]");
  const box = await kf.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 12);
  await new Promise((r) => setTimeout(r, 450));

  const checks = await page.evaluate(() => {
    const hud = document.querySelector(".cti-hud");
    const canvas = document.querySelector(".timeline-canvas");
    const strip = document.querySelector(".channel-strip");
    const preview = document.querySelector(".preset-mix-preview");
    const hudCs = hud ? getComputedStyle(hud) : null;
    const previewCs = preview ? getComputedStyle(preview) : null;
    const stripCs = strip ? getComputedStyle(strip) : null;
    return {
      hudPos: hudCs?.position,
      hudTop: hudCs?.top,
      canvasTop: canvas?.getBoundingClientRect().top,
      hudBottom: hud?.getBoundingClientRect().bottom,
      canvasBottom: canvas?.getBoundingClientRect().bottom,
      overlaysCanvas:
        hud && canvas
          ? hud.getBoundingClientRect().bottom >
              canvas.getBoundingClientRect().top + 20 &&
            hud.getBoundingClientRect().top <
              canvas.getBoundingClientRect().bottom
          : false,
      previewOpacity: previewCs?.opacity,
      colGap: stripCs?.columnGap,
      hudW: hud?.getBoundingClientRect().width,
    };
  });
  console.log(JSON.stringify(checks, null, 2));
  if (checks.hudPos !== "absolute") throw new Error("HUD not absolute overlay");
  if (!checks.overlaysCanvas) throw new Error("HUD not floating over timeline");
  if (Number(checks.previewOpacity) > 0.55) {
    throw new Error(`gradient opacity too strong: ${checks.previewOpacity}`);
  }

  const out = path.join(mediaDir, "ui-cti-hud-compact.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
