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
  await page.evaluate(() => localStorage.removeItem("aqualamp.dayPresets.v3"));
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
  await new Promise((r) => setTimeout(r, 300));

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
    const text = document.body.innerText;
    const buttons = [...document.querySelectorAll("button")].map(
      (b) => b.textContent?.trim() || "",
    );
    return {
      hasPresetsPanel: Boolean(document.querySelector(".presets-panel")),
      hasBioactive: text.includes("Bioactive"),
      hasJewel: text.includes("Jewel Canopy"),
      hasNew: buttons.some((t) => t.includes("New")),
      hasDuplicate: /Duplicate to edit/i.test(text),
      hasSave: buttons.some((t) => t === "Save"),
      hasMode: /\bMODE\b/i.test(text) && /Constant/i.test(text) && buttons.some((t) => t.toLowerCase() === "schedule"),
      hasSnap: /Free \/ Min/i.test(text),
    };
  });
  console.log("proof", proof);
  if (!proof.hasPresetsPanel) throw new Error("presets list missing in LIVE");
  if (!proof.hasBioactive) throw new Error("cannot select/see builtins in LIVE");
  if (proof.hasNew || proof.hasDuplicate || proof.hasSave || proof.hasSnap) {
    throw new Error("edit chrome still visible in LIVE");
  }

  // Switch preset while LIVE to prove selection works
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("Jewel Canopy"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  const after = await page.evaluate(() => {
    const dials = [...document.querySelectorAll('[role="slider"]')].map((el) =>
      el.getAttribute("aria-valuenow"),
    );
    return { dials, hint: document.body.innerText.slice(0, 200) };
  });
  console.log("after Jewel select", after);

  await page.evaluate(() => {
    document.querySelector(".presets-panel")?.scrollIntoView({ block: "start" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const out = path.join(mediaDir, "live-presets-list-no-edit.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
