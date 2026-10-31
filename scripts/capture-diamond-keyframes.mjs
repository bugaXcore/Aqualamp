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
  // Hard navigation — bust stale EDIT/LIVE cache
  await page.goto(`${webUrl}/?t=${Date.now()}`, {
    waitUntil: "networkidle0",
    timeout: 25000,
  });
  await page.evaluate(() => localStorage.removeItem("aqualamp.dayPresets.v3"));
  await page.reload({ waitUntil: "networkidle0" });
  await connect(page);

  // Duplicate Bioactive → compose with keyframes
  await page.evaluate(() => {
    const row = [
      ...document.querySelectorAll(".presets-panel [role='button']"),
    ].find((el) => (el.textContent || "").includes("Bioactive"));
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    const dup = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("title") || "").includes("Duplicate"),
    );
    dup?.click();
  });
  await page.waitForFunction(
    () => /\bComposing\b/i.test(document.body.innerText),
    { timeout: 5000 },
  );
  await new Promise((r) => setTimeout(r, 400));

  // Scrub mid-day so CTI sits away from edge chips
  const svgEl = await page.$(".timeline-plot svg");
  const box = await svgEl.boundingBox();
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.55);
  await new Promise((r) => setTimeout(r, 350));

  const checks = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".timeline-kf-chip")];
    const chipBox = chips[0]?.getBoundingClientRect();
    const diamonds = document.querySelectorAll(
      ".timeline-plot svg [data-kf] polygon",
    ).length;
    const text = document.body.innerText;
    return {
      noModeSwitch: !document.querySelector(".timeline-mode-switch"),
      noEditLiveBtns: ![...document.querySelectorAll("button")].some((b) => {
        const t = (b.textContent || "").trim();
        return t === "EDIT" || t === "LIVE";
      }),
      composing: /\bComposing\b/i.test(text),
      chipCount: chips.length,
      chipTextOk: chips.every((c) => /^\d{2}:\d{2}$/.test(c.textContent.trim())),
      chipAspect:
        chipBox && chipBox.height > 0
          ? Number((chipBox.width / chipBox.height).toFixed(2))
          : null,
      chipHeight: chipBox ? Number(chipBox.height.toFixed(1)) : null,
      diamonds,
      ctiChip: Boolean(document.querySelector(".timeline-cti-chip")),
    };
  });
  console.log("checks", checks);
  if (!checks.noModeSwitch || !checks.noEditLiveBtns) {
    throw new Error("EDIT/LIVE toggle still present — hard-refresh failed?");
  }
  if (checks.chipCount < 2) throw new Error("expected keyframe time chips");
  if (!checks.chipTextOk) throw new Error("chip text not HH:MM");
  if (checks.chipHeight != null && checks.chipHeight < 12) {
    throw new Error(`chip still squashed: h=${checks.chipHeight}`);
  }
  if (checks.chipAspect != null && checks.chipAspect > 6) {
    throw new Error(`chip aspect too flat: ${checks.chipAspect}`);
  }
  if (checks.diamonds < 4) throw new Error("expected diamond polygons");

  await page.evaluate(() => {
    document.querySelector(".timeline-panel")?.scrollIntoView({
      block: "center",
    });
  });
  await new Promise((r) => setTimeout(r, 300));

  const out = path.join(mediaDir, "ui-diamond-keyframes.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
