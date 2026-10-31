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
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 25000 });
  await page.evaluate(() => localStorage.removeItem("aqualamp.dayPresets.v3"));
  await page.reload({ waitUntil: "networkidle0" });
  await connect(page);

  // Select builtin Bioactive (playback — no compose chrome)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".presets-panel [role='button']")].find(
      (el) => (el.textContent || "").includes("Bioactive"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));

  const playbackChecks = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasEditLiveToggle: Boolean(
        document.querySelector(".timeline-mode-switch"),
      ),
      hasEditBtn: [...document.querySelectorAll("button")].some((b) =>
        /^EDIT$/i.test((b.textContent || "").trim()),
      ),
      hasLiveBtn: [...document.querySelectorAll("button")].some(
        (b) =>
          /^LIVE$/i.test((b.textContent || "").trim()) &&
          b.closest(".timeline-mode-switch"),
      ),
      playingBadge: /Playing/i.test(text),
      composingBadge: /\bComposing\b/i.test(text),
      newVisible: [...document.querySelectorAll("button")].some((b) =>
        (b.textContent || "").includes("New"),
      ),
      noPencilOnBuiltin: ![
        ...document.querySelectorAll(".presets-panel [role='button']"),
      ]
        .find((el) => (el.textContent || "").includes("Bioactive"))
        ?.querySelector('[title="Edit / rename"]'),
    };
  });
  console.log("playback checks", playbackChecks);
  if (playbackChecks.hasEditLiveToggle || playbackChecks.hasEditBtn) {
    throw new Error("EDIT/LIVE toggle still present");
  }
  if (!playbackChecks.playingBadge) throw new Error("Playing badge missing");
  if (playbackChecks.composingBadge) {
    throw new Error("unexpected Composing badge in playback");
  }
  if (!playbackChecks.newVisible) throw new Error("+ New not visible");
  if (!playbackChecks.noPencilOnBuiltin) {
    throw new Error("builtin should not show pencil");
  }

  // Duplicate → enter compose
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

  const composeChecks = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      composingBadge: /\bComposing\b/i.test(text),
      hasSaveOrCancel:
        [...document.querySelectorAll("button")].some((b) =>
          /^(Save|Cancel|Discard)$/i.test((b.textContent || "").trim()),
        ),
      hasPlusTrash: Boolean(
        document.querySelector(
          '.timeline-panel button[title*="Add"], .timeline-panel button[aria-label*="Add"], .timeline-panel button[title*="Delete"], .timeline-panel button[aria-label*="Delete"]',
        ) ||
          document.querySelector(".timeline-panel .lucide-plus") ||
          document.querySelector(".timeline-panel svg.lucide-plus"),
      ),
      ctiChrome: Boolean(
        document.querySelector(".timeline-panel button .lucide-plus") ||
          [...document.querySelectorAll(".timeline-panel button")].some((b) =>
            b.querySelector("svg"),
          ),
      ),
    };
  });
  console.log("compose checks", composeChecks);
  if (!composeChecks.composingBadge) throw new Error("Composing badge missing");
  if (!composeChecks.hasSaveOrCancel) {
    throw new Error("Save/Cancel missing in compose");
  }

  // Cancel → back to playback
  await page.evaluate(() => {
    const cancel = [...document.querySelectorAll("button")].find((b) =>
      /^(Cancel|Discard)$/i.test((b.textContent || "").trim()),
    );
    cancel?.click();
  });
  await page.waitForFunction(
    () =>
      /Playing/i.test(document.body.innerText) &&
      !/\bComposing\b/i.test(document.body.innerText),
    { timeout: 5000 },
  );
  await new Promise((r) => setTimeout(r, 300));

  // Re-enter compose via Duplicate for final screenshot (compose chrome visible)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".presets-panel [role='button']")].find(
      (el) => (el.textContent || "").includes("Bioactive"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 200));
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
  await new Promise((r) => setTimeout(r, 500));

  const out = path.join(mediaDir, "ui-no-edit-live-toggle.png");
  await page.screenshot({ path: out, fullPage: true });
  console.log("wrote", out);

  const final = await page.evaluate(() => ({
    noToggle: !document.querySelector(".timeline-mode-switch"),
    composing: /\bComposing\b/i.test(document.body.innerText),
    newBtn: [...document.querySelectorAll("button")].some((b) =>
      (b.textContent || "").includes("New"),
    ),
  }));
  console.log("final", final);
  if (!final.noToggle || !final.composing || !final.newBtn) {
    throw new Error("final screenshot preconditions failed");
  }
} finally {
  await browser.close();
}
