import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import WebSocket from "ws";

const parentMedia =
  String.raw`C:\Users\bugas\AppData\Local\Cursor\AgentStores\cursor_agent_stores\bc-c60d5f05-ca4d-4eb0-854e-5524d1b9bb8c\files\media`;
const selfMedia =
  String.raw`C:\Users\bugas\AppData\Local\Cursor\AgentStores\cursor_agent_stores\bc-c60d5f05-ca4d-4eb0-854e-5524d1b9bb8c\files\artifacts\cursor\stores\self\media`;
const chromePath =
  process.env.CHROME_PATH ||
  String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const webUrl = process.env.AQUALAMP_WEB_URL || "http://127.0.0.1:5173";
const bridgeUrl = process.env.AQUALAMP_BRIDGE_WS || "ws://127.0.0.1:8787";

for (const dir of [parentMedia, selfMedia]) fs.mkdirSync(dir, { recursive: true });

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
  await page.goto(`${webUrl}/?sliders=${Date.now()}`, {
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
    () => document.body.innerText.includes("Sliders mode"),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 450));

  const checks = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".presets-panel [role='button']")];
    const names = rows.map((r) =>
      (r.querySelector(".font-\\[Syne\\]")?.textContent || r.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40),
    );
    const first = rows[0];
    const firstText = (first?.textContent || "").replace(/\s+/g, " ");
    const freeMentions = (document.body.innerText.match(/Free mix/gi) || [])
      .length;
    const freePill = [...(first?.querySelectorAll("span") || [])].some((s) =>
      /^free$/i.test((s.textContent || "").trim()),
    );
    const dupOnFirst = Boolean(
      first?.querySelector('button[title*="Duplicate"]'),
    );
    const ranges = [
      ...document.querySelectorAll('.channel-strip input[type="range"]'),
    ];
    const slidersModeRows = names.filter((n) =>
      /sliders mode/i.test(n),
    ).length;
    return {
      firstLabel: firstText.trim().slice(0, 48),
      firstIsSliders: /sliders mode/i.test(firstText),
      slidersModeRows,
      freeMentions,
      freePill,
      dupOnFirst,
      slidersLive: ranges.length > 0 && ranges.every((r) => !r.disabled),
      noEditLive: !document.querySelector(".timeline-mode-switch"),
    };
  });
  console.log("checks", checks);
  if (!checks.firstIsSliders) throw new Error("Sliders mode not first");
  if (checks.slidersModeRows !== 1) {
    throw new Error(`expected 1 Sliders mode row, got ${checks.slidersModeRows}`);
  }
  if (checks.freeMentions > 0) throw new Error("Free mix copy still visible");
  if (checks.freePill) throw new Error("FREE pill still present");
  if (checks.dupOnFirst) throw new Error("Duplicate still on Sliders mode");
  if (!checks.slidersLive) throw new Error("sliders locked");

  const buf = await page.screenshot({ fullPage: true });
  const a = path.join(parentMedia, "ui-sliders-mode.png");
  const b = path.join(selfMedia, "ui-sliders-mode.png");
  fs.writeFileSync(a, buf);
  fs.writeFileSync(b, buf);
  console.log("wrote", a);
  console.log("wrote", b);
} finally {
  await browser.close();
}
