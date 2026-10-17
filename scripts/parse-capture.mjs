/**
 * Parse a capture folder (or any btsnoop/btsnooz log) for Week Aqua ATT writes.
 * Target MAC C8:47:80:70:BB:07 / write handle 0x0010.
 *
 * Usage:
 *   node scripts/parse-capture.mjs [path-to-capture-dir-or-log]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_MAC = "c8:47:80:70:bb:07";
const TARGET_HANDLE = 0x0010;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES = path.join(REPO, "files", "captures");

function resolveInput() {
  const arg = process.argv[2];
  if (arg) return path.resolve(arg);
  const latest = path.join(CAPTURES, "LATEST.txt");
  if (fs.existsSync(latest)) {
    return fs.readFileSync(latest, "utf8").trim();
  }
  if (fs.existsSync(CAPTURES)) {
    const dirs = fs
      .readdirSync(CAPTURES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
    if (dirs[0]) return path.join(CAPTURES, dirs[0]);
  }
  return null;
}

function findLogs(root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  const st = fs.statSync(root);
  if (st.isFile()) {
    out.push(root);
    return out;
  }
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let s;
      try {
        s = fs.statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(full);
      else if (/btsnoop|btsnooz/i.test(name) || /\.log$/i.test(name)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

function parseBtsnoop(buf) {
  const magic = buf.subarray(0, 8).toString("ascii");
  if (!magic.startsWith("btsnoop")) {
    return { ok: false, reason: "not btsnoop magic", packets: [] };
  }
  let offset = 16;
  const packets = [];
  while (offset + 24 <= buf.length) {
    const incLen = buf.readUInt32BE(offset + 4);
    const flags = buf.readUInt32BE(offset + 8);
    const dataStart = offset + 24;
    const dataEnd = dataStart + incLen;
    if (dataEnd > buf.length) break;
    packets.push({
      flags,
      data: buf.subarray(dataStart, dataEnd),
    });
    offset = dataEnd;
  }
  return { ok: true, packets };
}

function macFromBytes(b) {
  return [...b]
    .reverse()
    .map((x) => x.toString(16).padStart(2, "0"))
    .join(":");
}

function hex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
}

function analyze(packets) {
  /** @type {Map<number, string>} */
  const connMac = new Map();
  const writes = [];
  const allWrites = [];

  for (const p of packets) {
    let d = p.data;
    if (!d.length) continue;
    const h4 = d[0];
    if (![0x01, 0x02, 0x04].includes(h4)) continue;
    d = d.subarray(1);

    // LE connection events → map HCI handle to MAC
    if (h4 === 0x04 && d[0] === 0x3e && d.length > 14) {
      const sub = d[2];
      if (sub === 0x01 || sub === 0x0a) {
        // Enhanced / legacy connection complete — handle at offset 4 (2 bytes LE)
        const handle = d.readUInt16LE(4) & 0x0fff;
        const addr = macFromBytes(d.subarray(8, 14));
        connMac.set(handle, addr);
      }
    }

    if (h4 !== 0x02 || d.length < 8) continue;
    const hdr = d.readUInt16LE(0);
    const conn = hdr & 0x0fff;
    const alen = d.readUInt16LE(2);
    const payload = d.subarray(4, 4 + Math.min(alen, d.length - 4));
    if (payload.length < 7) continue;
    const cid = payload.readUInt16LE(2);
    if (cid !== 0x0004) continue;
    const att = payload.subarray(4);
    if (att.length < 3) continue;
    const op = att[0];
    if (op !== 0x52 && op !== 0x12) continue;
    const handle = att.readUInt16LE(1);
    const value = att.subarray(3);
    const mac = connMac.get(conn) || "unknown";
    const row = {
      conn,
      mac,
      op: "0x" + op.toString(16),
      handle,
      valueHex: hex(value),
      towardTarget:
        mac === TARGET_MAC ||
        mac.endsWith("bb:07") ||
        handle === TARGET_HANDLE,
    };
    allWrites.push(row);
    if (row.towardTarget) writes.push(row);
  }

  return { connMac: Object.fromEntries(connMac), writes, allWrites };
}

function writeReport(outDir, analysis, logFiles) {
  const lines = [];
  lines.push("# AquaLamp capture report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Target light MAC: ${TARGET_MAC.toUpperCase()}`);
  lines.push(`Target ATT write handle: 0x${TARGET_HANDLE.toString(16)}`);
  lines.push("");
  lines.push("## Log files scanned");
  for (const f of logFiles) lines.push(`- ${f}`);
  if (!logFiles.length) lines.push("- (none found)");
  lines.push("");
  lines.push("## Connections seen (HCI handle → MAC)");
  const macs = Object.entries(analysis.connMac);
  if (!macs.length) lines.push("_No LE connection events parsed._");
  for (const [h, m] of macs) {
    const mark = m === TARGET_MAC || m.endsWith("bb:07") ? "  (likely light)" : "";
    lines.push(`- handle 0x${Number(h).toString(16)} -> ${m.toUpperCase()}${mark}`);
  }
  lines.push("");
  lines.push("## ATT writes toward the light (handle 0x0010 or matching MAC)");
  if (!analysis.writes.length) {
    lines.push("_No matching writes found._");
    lines.push("");
    lines.push("Try again with HCI snoop enabled, lamp connected in Week Aqua,");
    lines.push("and move the sliders as the checklist asks.");
  } else {
    const uniq = [...new Set(analysis.writes.map((w) => w.valueHex))];
    lines.push(`Count: ${analysis.writes.length}  |  Unique payloads: ${uniq.length}`);
    lines.push("");
    lines.push("| # | MAC | Handle | Op | Payload (hex) |");
    lines.push("|---|-----|--------|----|---------------|");
    analysis.writes.forEach((w, i) => {
      lines.push(
        `| ${i + 1} | ${w.mac.toUpperCase()} | 0x${w.handle.toString(16)} | ${w.op} | \`${w.valueHex}\` |`,
      );
    });
    lines.push("");
    lines.push("### Unique payloads (copy these)");
    for (const u of uniq) lines.push(`- \`${u}\``);
  }
  lines.push("");
  lines.push("## All ATT writes in log (debug)");
  lines.push(`Total: ${analysis.allWrites.length}`);
  if (analysis.allWrites.length && analysis.allWrites.length <= 40) {
    for (const w of analysis.allWrites) {
      lines.push(
        `- mac=${w.mac} h=0x${w.handle.toString(16)} ${w.op} ${w.valueHex}`,
      );
    }
  }
  lines.push("");
  lines.push("## What to do next");
  lines.push("1. Keep this report.");
  lines.push("2. If unique payloads appeared while you moved Red/Blue/Green/White/Off, tell the AquaLamp agent which step produced which hex (or paste this report).");
  lines.push("3. Optional: open nRF Connect → connect to B3.0-S300pro-03 → screenshot UUIDs.");

  const reportPath = path.join(outDir, "capture-report.md");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  const jsonPath = path.join(outDir, "capture-report.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ targetMac: TARGET_MAC, targetHandle: TARGET_HANDLE, ...analysis, logFiles }, null, 2),
    "utf8",
  );
  return { reportPath, jsonPath };
}

const input = resolveInput();
if (!input) {
  console.error("No capture folder found. Run: npm run capture:android");
  process.exit(1);
}

const outDir = fs.existsSync(input) && fs.statSync(input).isDirectory()
  ? input
  : path.dirname(input);

console.log("Parsing:", input);
const logs = findLogs(input);
if (!logs.length) {
  console.error("No btsnoop/btsnooz logs inside. Did capture-android finish a bugreport?");
  // still write an empty report
}
const merged = { connMac: {}, writes: [], allWrites: [] };
const used = [];
for (const log of logs) {
  let buf;
  try {
    buf = fs.readFileSync(log);
  } catch {
    continue;
  }
  const parsed = parseBtsnoop(buf);
  if (!parsed.ok) {
    console.log("skip (not btsnoop):", log);
    continue;
  }
  console.log(`ok ${path.basename(log)}: ${parsed.packets.length} packets`);
  used.push(log);
  const a = analyze(parsed.packets);
  Object.assign(merged.connMac, a.connMac);
  merged.writes.push(...a.writes);
  merged.allWrites.push(...a.allWrites);
}

const { reportPath, jsonPath } = writeReport(outDir, merged, used);
console.log("");
console.log("Wrote", reportPath);
console.log("Wrote", jsonPath);
console.log(`Light-targeted writes: ${merged.writes.length}`);
if (merged.writes.length) {
  const uniq = [...new Set(merged.writes.map((w) => w.valueHex))];
  console.log("Unique payloads:");
  for (const u of uniq) console.log(" ", u);
}
