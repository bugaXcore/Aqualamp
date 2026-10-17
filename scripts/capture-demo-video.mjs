import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
const framesDir = path.join(mediaDir, "_frames");

fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

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

function findFfmpeg() {
  const candidates = [
    "ffmpeg",
    String.raw`C:\Users\bugas\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe`,
    String.raw`C:\Program Files\ffmpeg\bin\ffmpeg.exe`,
  ];
  for (const c of candidates) {
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  // WinGet package path glob
  const base = String.raw`C:\Users\bugas\AppData\Local\Microsoft\WinGet\Packages`;
  if (fs.existsSync(base)) {
    for (const dir of fs.readdirSync(base)) {
      if (!dir.toLowerCase().includes("ffmpeg")) continue;
      const walk = (d, depth = 0) => {
        if (depth > 4) return null;
        for (const name of fs.readdirSync(d)) {
          const full = path.join(d, name);
          if (name === "ffmpeg.exe") return full;
          try {
            if (fs.statSync(full).isDirectory()) {
              const hit = walk(full, depth + 1);
              if (hit) return hit;
            }
          } catch {
            /* ignore */
          }
        }
        return null;
      };
      const hit = walk(path.join(base, dir));
      if (hit) return hit;
    }
  }
  return null;
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ["--hide-scrollbars"],
});

let frame = 0;
const page = await browser.newPage();

async function snap() {
  const file = path.join(framesDir, `frame-${String(frame).padStart(3, "0")}.png`);
  await page.screenshot({ path: file, fullPage: false });
  frame += 1;
}

try {
  await bridgeRpc([{ type: "disconnect" }]);
  await page.goto(webUrl, { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForFunction(() => document.body.innerText.includes("Connect"));
  for (let i = 0; i < 4; i++) {
    await snap();
    await new Promise((r) => setTimeout(r, 250));
  }

  await page.click("button");
  await page.waitForFunction(() => document.body.innerText.includes("Channels"));
  for (let i = 0; i < 3; i++) {
    await snap();
    await new Promise((r) => setTimeout(r, 200));
  }

  const steps = [
    { red: 40, green: 10, blue: 60, uv: 10 },
    { red: 55, green: 15, blue: 75, uv: 20 },
    { red: 65, green: 20, blue: 85, uv: 35 },
    { red: 80, green: 30, blue: 95, uv: 45 },
  ];
  for (const channels of steps) {
    await bridgeRpc([{ type: "setChannels", channels }]);
    await new Promise((r) => setTimeout(r, 350));
    await snap();
  }

  for (let i = 0; i < 3; i++) {
    await snap();
    await new Promise((r) => setTimeout(r, 200));
  }
} finally {
  await browser.close();
}

const ffmpeg = findFfmpeg();
if (!ffmpeg) {
  console.error("ffmpeg not found");
  process.exit(1);
}

const out = path.join(mediaDir, "aqualamp-mock-demo.mp4");
const result = spawnSync(
  ffmpeg,
  [
    "-y",
    "-framerate",
    "2.5",
    "-i",
    path.join(framesDir, "frame-%03d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ],
  { encoding: "utf8" },
);

if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

fs.rmSync(framesDir, { recursive: true, force: true });
console.log("wrote", out);
console.log("frames", frame);
