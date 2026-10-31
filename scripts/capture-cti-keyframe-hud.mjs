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
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v3");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await connect(page);

  // Select bioactive builtin then Duplicate → editable schedule
  const rows = await page.$$(".presets-panel [role='button']");
  if (!rows[0]) throw new Error("no presets");
  await rows[0].click();
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const dup = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("title") || "").includes("Duplicate"),
    );
    dup?.click();
  });
  await page.waitForSelector(".cti-chrome", { timeout: 8000 });

  // --- Shot 1: HUD on a keyframe ---
  const clicked = await page.evaluate(() => {
    const g = document.querySelector("svg g[data-kf]");
    if (!g) return false;
    g.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 }),
    );
    return true;
  });
  if (!clicked) {
    // Fallback: click first key label area via bounding box
    const kf = await page.$("svg g[data-kf]");
    if (!kf) throw new Error("no keyframe nodes");
    const box = await kf.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 10);
  }
  await new Promise((r) => setTimeout(r, 500));

  let checks = await page.evaluate(() => ({
    hud: Boolean(document.querySelector(".cti-hud")),
    chrome: Boolean(document.querySelector(".cti-chrome")),
    sliders: document.querySelectorAll(".cti-hud input.channel-slider").length,
    trashDisabled: document
      .querySelector('.cti-chrome button[aria-label="Delete keyframe at CTI"]')
      ?.hasAttribute("disabled"),
  }));
  console.log("hud shot checks", checks);
  if (!checks.hud) throw new Error("HUD missing");
  if (checks.sliders !== 4) throw new Error(`expected 4 HUD sliders, got ${checks.sliders}`);
  if (checks.trashDisabled) throw new Error("trash should be enabled on key");

  const hudPath = path.join(mediaDir, "ui-cti-keyframe-hud.png");
  await page.screenshot({ path: hudPath, fullPage: true });
  console.log("wrote", hudPath);

  // --- Shot 2: scrub off key → +/trash chrome, HUD collapsed ---
  await page.evaluate(() => {
    const svg = document.querySelector(".timeline-canvas svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Click near 02:00 (empty-ish for bioactive after sunrise gap — use ~3:00)
    const x = rect.left + rect.width * (180 / 1440);
    const y = rect.top + rect.height * 0.55;
    svg.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
      }),
    );
    svg.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
      }),
    );
  });
  // Prefer real mouse click on canvas
  const svgEl = await page.$(".timeline-canvas svg");
  const sbox = await svgEl.boundingBox();
  await page.mouse.click(
    sbox.x + sbox.width * (200 / 1440),
    sbox.y + sbox.height * 0.5,
  );
  await new Promise((r) => setTimeout(r, 400));

  checks = await page.evaluate(() => ({
    hud: Boolean(document.querySelector(".cti-hud")),
    chrome: Boolean(document.querySelector(".cti-chrome")),
    add: Boolean(
      document.querySelector(
        '.cti-chrome button[aria-label="Add keyframe at CTI"]',
      ),
    ),
    trashDisabled: document
      .querySelector('.cti-chrome button[aria-label="Delete keyframe at CTI"]')
      ?.hasAttribute("disabled"),
  }));
  console.log("add/delete shot checks", checks);
  if (!checks.chrome || !checks.add) throw new Error("CTI chrome missing");

  // Click + to add, then show trash enabled
  await page.click('.cti-chrome button[aria-label="Add keyframe at CTI"]');
  await new Promise((r) => setTimeout(r, 400));
  checks = await page.evaluate(() => ({
    hud: Boolean(document.querySelector(".cti-hud")),
    trashDisabled: document
      .querySelector('.cti-chrome button[aria-label="Delete keyframe at CTI"]')
      ?.hasAttribute("disabled"),
    keyCount: document.querySelectorAll("svg g[data-kf]").length,
  }));
  console.log("after add", checks);
  if (!checks.hud) throw new Error("HUD should open after add");
  if (checks.trashDisabled) throw new Error("trash should enable after add");

  const addPath = path.join(mediaDir, "ui-cti-add-delete.png");
  await page.screenshot({ path: addPath, fullPage: true });
  console.log("wrote", addPath);
} finally {
  await browser.close();
}
