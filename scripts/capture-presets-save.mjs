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
  defaultViewport: { width: 1440, height: 1300, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

try {
  const page = await browser.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  // Clear all preset keys so v3 user store is empty and builtins come from code
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v1");
    localStorage.removeItem("aqualamp.dayPresets.v2");
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
    () =>
      document.body.innerText.includes("Built-in") &&
      document.body.innerText.includes("The Bioactive 24/7"),
    { timeout: 15000 },
  );

  // Select Bioactive (builtin)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("Bioactive 24/7"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    document.querySelector(".presets-panel")?.scrollIntoView({ block: "start" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const builtinPath = path.join(mediaDir, "presets-builtin-readonly.png");
  await page.screenshot({ path: builtinPath, fullPage: true });
  console.log("wrote", builtinPath);

  // Create new user preset and dirty it
  await page.evaluate(() => {
    const newBtn = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("New"),
    );
    newBtn?.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("Unsaved"),
    { timeout: 8000 },
  );
  // Switch to schedule and tweak a dial via range input
  await page.evaluate(() => {
    const schedule = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim().toLowerCase() === "schedule",
    );
    schedule?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"][aria-label="Red slider"]');
    if (slider) {
      const el = /** @type {HTMLInputElement} */ (slider);
      el.value = "42";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    document.querySelector(".presets-panel")?.scrollIntoView({ block: "start" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const dirtyPath = path.join(mediaDir, "presets-save-dirty.png");
  await page.screenshot({ path: dirtyPath, fullPage: true });
  console.log("wrote", dirtyPath);

  const proof = await page.evaluate(() => ({
    builtinBadge: document.body.innerText.includes("Built-in"),
    locked: /built-in.*locked/i.test(document.body.innerText) || document.body.innerText.includes("Built-in · locked") || document.body.innerText.includes("BUILT-IN"),
    unsaved: /unsaved/i.test(document.body.innerText),
    saveDisabled: [...document.querySelectorAll("button")].some(
      (b) => b.textContent?.trim() === "Save" && !b.disabled,
    ),
    v3: localStorage.getItem("aqualamp.dayPresets.v3"),
  }));
  console.log("proof", proof);
  if (!proof.builtinBadge) throw new Error("missing Built-in badge");
  if (!proof.unsaved) throw new Error("missing Unsaved state");
  if (!proof.saveDisabled) throw new Error("Save should be enabled when dirty");
  // Dirty draft must NOT be in localStorage yet
  if (proof.v3 && JSON.parse(proof.v3).presets?.length > 0) {
    throw new Error("dirty draft was persisted before Save");
  }
} finally {
  await browser.close();
}
