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

  // Clear any prior presets so empty state is clean
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await page.evaluate(() => {
    localStorage.removeItem("aqualamp.dayPresets.v1");
  });
  await page.reload({ waitUntil: "networkidle0" });

  await page.waitForFunction(
    () => document.body.innerText.includes("Connect"),
    { timeout: 10000 },
  );
  await bridgeRpc([{ type: "connect" }]);
  // Prefer UI connect if still disconnected
  const connectBtn = await page.$("button");
  if (connectBtn) {
    const label = await page.evaluate((el) => el.textContent || "", connectBtn);
    if (label.includes("Connect")) await connectBtn.click();
  }

  await page.waitForFunction(
    () => document.body.innerText.includes("Day presets"),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 700));

  const emptyPath = path.join(mediaDir, "day-presets-empty.png");
  await page.screenshot({ path: emptyPath, fullPage: true });
  console.log("wrote", emptyPath);

  // Create schedule preset with a few keyframes via localStorage + reload
  // (user-authored demo data for screenshot only — not shipped as defaults)
  await page.evaluate(() => {
    const store = {
      version: 1,
      presets: [
        {
          id: "demo-edit",
          name: "Working draft",
          mode: "schedule",
          constantChannels: { red: 0, green: 0, blue: 0, uv: 0 },
          snap: "free",
          interpolation: "linear",
          keyframes: [
            {
              id: "kf1",
              minutes: 360,
              channels: { red: 10, green: 15, blue: 40, uv: 20 },
            },
            {
              id: "kf2",
              minutes: 720,
              channels: { red: 55, green: 48, blue: 52, uv: 35 },
            },
            {
              id: "kf3",
              minutes: 1140,
              channels: { red: 40, green: 12, blue: 8, uv: 5 },
            },
          ],
        },
      ],
    };
    localStorage.setItem("aqualamp.dayPresets.v1", JSON.stringify(store));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => document.body.innerText.includes("Connect") || document.body.innerText.includes("Day presets"),
    { timeout: 10000 },
  );
  await bridgeRpc([{ type: "connect" }]);
  const connectBtn2 = await page.$("button");
  if (connectBtn2) {
    const label = await page.evaluate((el) => el.textContent || "", connectBtn2);
    if (label.includes("Connect")) await connectBtn2.click();
  }
  await page.waitForFunction(
    () => document.body.innerText.includes("Working draft"),
    { timeout: 15000 },
  );

  // Select the preset row
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='button']")].find((el) =>
      (el.textContent || "").includes("Working draft"),
    );
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));

  // Select midday keyframe via dialing into timeline interaction by evaluating click on SVG text
  await page.evaluate(() => {
    const texts = [...document.querySelectorAll("svg text")];
    const midday = texts.find((t) => t.textContent === "12:00");
    midday?.parentElement?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
  });
  await new Promise((r) => setTimeout(r, 600));

  // Scroll timeline into view
  await page.evaluate(() => {
    document.querySelector(".timeline-panel")?.scrollIntoView({ block: "center" });
  });
  await new Promise((r) => setTimeout(r, 400));

  const editingPath = path.join(mediaDir, "day-presets-editing-timeline.png");
  await page.screenshot({ path: editingPath, fullPage: true });
  console.log("wrote", editingPath);
} finally {
  await browser.close();
}
