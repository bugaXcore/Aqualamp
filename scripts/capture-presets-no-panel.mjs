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

  const rows = await page.$$(".presets-panel [role='button']");
  if (!rows.length) throw new Error("no preset rows");
  await rows[0].click();
  await new Promise((r) => setTimeout(r, 600));

  // Nudge channel values so progress fill is obvious (via slider inputs)
  const sliders = await page.$$("input.channel-slider");
  for (const [i, val] of [68, 53, 45, 25].entries()) {
    if (!sliders[i]) continue;
    await page.evaluate(
      (el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      sliders[i],
      val,
    );
  }
  await new Promise((r) => setTimeout(r, 300));

  const checks = await page.evaluate(() => {
    const panel = document.querySelector(".presets-panel");
    const text = panel?.innerText || "";
    const hasDuplicatePanel =
      text.includes("Creates an editable user copy") ||
      text.includes("Built-in · locked") ||
      Boolean(
        [...(panel?.querySelectorAll("button") || [])].some((b) =>
          (b.textContent || "").includes("Duplicate to edit"),
        ),
      );
    const wraps = [...document.querySelectorAll(".channel-slider-wrap")];
    const fills = wraps.map((w) => {
      const fill = w.querySelector(".channel-slider-fill");
      const track = w.querySelector(".channel-slider-track");
      const cs = getComputedStyle(fill);
      const trackBg = getComputedStyle(track).backgroundColor;
      return {
        width: cs.width,
        bg: cs.backgroundColor,
        trackBg,
        boxShadow: cs.boxShadow,
        filter: cs.filter,
      };
    });
    const thumbs = wraps.map((w) => {
      // Can't read pseudo styles easily; check wrap vars + structure
      return {
        accent: getComputedStyle(w).getPropertyValue("--accent").trim(),
        pct: getComputedStyle(w).getPropertyValue("--pct").trim(),
        hasFill: Boolean(w.querySelector(".channel-slider-fill")),
      };
    });
    const desc =
      document.querySelector(".timeline-panel")?.lastElementChild?.textContent ||
      "";
    return {
      hasDuplicatePanel,
      fills,
      thumbs,
      descOk: desc.includes("nutrient-rich"),
      listDescLeak: [...document.querySelectorAll(".presets-panel li")].some(
        (li) => (li.textContent || "").includes("nutrient-rich"),
      ),
    };
  });
  console.log(JSON.stringify(checks, null, 2));
  if (checks.hasDuplicatePanel) {
    throw new Error("duplicate/selected detail panel still present");
  }
  if (!checks.descOk) throw new Error("description missing under timeline");
  if (checks.listDescLeak) throw new Error("description still in list");
  if (checks.thumbs.length !== 4) throw new Error("expected 4 sliders");
  for (const t of checks.thumbs) {
    if (!t.hasFill) throw new Error("missing fill track");
  }

  const out = path.join(mediaDir, "ui-presets-no-duplicate-panel.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);
} finally {
  await browser.close();
}
