/**
 * Parse a capture folder (or any btsnoop/btsnooz log) for Week Aqua ATT writes.
 * Target MAC from LIGHT_ADDRESS / write handle 0x0010.
 *
 * Usage:
 *   node scripts/parse-capture.mjs [path-to-capture-dir-or-log]
 *
 * Also accepts a folder that only contains bugreport.zip — expands it and
 * finds btsnoop/btsnooz logs inside.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const TARGET_MAC = (process.env.LIGHT_ADDRESS ?? "00:00:00:00:00:00").toLowerCase();
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

function ensureBugreportExpanded(root) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;
  const zip = path.join(root, "bugreport.zip");
  if (!fs.existsSync(zip)) return;
  const already = findLogs(root).length > 0;
  if (already) return;
  const expandDir = path.join(root, "bugreport-expanded");
  if (!fs.existsSync(expandDir)) {
    fs.mkdirSync(expandDir, { recursive: true });
  }
  console.log("Expanding bugreport.zip (first time)...");
  try {
    // Prefer PowerShell Expand-Archive on Windows; unzip if present.
    if (process.platform === "win32") {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${expandDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: "inherit" },
      );
    } else {
      execFileSync("unzip", ["-o", zip, "-d", expandDir], { stdio: "inherit" });
    }
  } catch (err) {
    console.log("Could not expand bugreport.zip:", err.message || err);
    return;
  }
  // Copy any HCI logs to the capture root for convenience
  for (const log of findLogs(expandDir)) {
    const dest = path.join(root, path.basename(log));
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(log, dest);
      console.log("Copied", path.basename(log), "from bugreport");
    }
  }
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

/** Prefer unique file contents (avoid parsing the same snoop twice). */
function dedupeLogs(logs) {
  const seen = new Set();
  const unique = [];
  for (const log of logs) {
    let buf;
    try {
      buf = fs.readFileSync(log);
    } catch {
      continue;
    }
    const hash = crypto.createHash("sha1").update(buf).digest("hex");
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push({ path: log, buf });
  }
  return unique;
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

function uuid128FromLe(bytes) {
  const a = [...bytes]
    .reverse()
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return (
    a.slice(0, 8) +
    "-" +
    a.slice(8, 12) +
    "-" +
    a.slice(12, 16) +
    "-" +
    a.slice(16, 20) +
    "-" +
    a.slice(20)
  );
}

function uuid16(n) {
  return "0x" + n.toString(16).padStart(4, "0");
}

function formatHandle(h) {
  return "0x" + h.toString(16).padStart(4, "0");
}

/**
 * Label CustomMode-style frames when evidence is clear.
 * Layout (high confidence from R/G/B custom-mode capture):
 *   fb f9 <R> <G> <B> <X> 55 55
 * where X may be UV / another channel (still unconfirmed).
 */
function labelPayload(valueHex) {
  const parts = valueHex.trim().split(/\s+/);
  if (parts.length === 8 && parts[0] === "fb" && parts[1] === "f9" && parts[6] === "55" && parts[7] === "55") {
    const r = parseInt(parts[2], 16);
    const g = parseInt(parts[3], 16);
    const b = parseInt(parts[4], 16);
    const x = parseInt(parts[5], 16);
    const on = (v) => v > 0;
    if (!on(r) && !on(g) && !on(b) && !on(x)) {
      return "CustomMode RGB all-zero (likely channels cleared)";
    }
    if (on(r) && !on(g) && !on(b)) {
      return `CustomMode Red sample (R=0x${parts[2]}, G=0, B=0; X=0x${parts[5]})`;
    }
    if (!on(r) && on(g) && !on(b)) {
      return `CustomMode Green sample (R=0, G=0x${parts[3]}, B=0; X=0x${parts[5]})`;
    }
    if (!on(r) && !on(g) && on(b)) {
      return `CustomMode Blue sample (R=0, G=0, B=0x${parts[4]}; X=0x${parts[5]})`;
    }
    return `CustomMode RGB frame (R=0x${parts[2]} G=0x${parts[3]} B=0x${parts[4]} X=0x${parts[5]})`;
  }
  if (parts[0] === "fe" && parts[1] === "f9") {
    return "Companion fe f9 frame (often follows CustomMode writes; intent unclear)";
  }
  if (parts[0] === "fd" && parts[1] === "f1") {
    return "fd f1 frame (session/setup?; intent unclear)";
  }
  if (parts[0] === "ff") {
    return "ff-prefix frame (intent unclear)";
  }
  if (parts[0] === "f9") {
    return "f9 frame (intent unclear)";
  }
  return "";
}

function analyze(packets) {
  /** @type {Map<number, string>} */
  const connMac = new Map();
  const writes = [];
  const allWrites = [];
  /** @type {{mac:string,start:number,end:number,uuid:string}[]} */
  const services = [];
  /** @type {{mac:string,declHandle:number,props:number,valueHandle:number,uuid:string}[]} */
  const characteristics = [];
  /** @type {{mac:string,handle:number,uuid:string}[]} */
  const descriptors = [];
  let truncatedAcl = 0;
  let fullAcl = 0;

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
        const handle = d.readUInt16LE(4) & 0x0fff;
        const addr = macFromBytes(d.subarray(8, 14));
        connMac.set(handle, addr);
      }
    }

    if (h4 !== 0x02 || d.length < 8) continue;
    const hdr = d.readUInt16LE(0);
    const conn = hdr & 0x0fff;
    const alen = d.readUInt16LE(2);
    const available = d.length - 4;
    if (available < alen) truncatedAcl++;
    else fullAcl++;
    const payload = d.subarray(4, 4 + Math.min(alen, available));
    if (payload.length < 7) continue;
    const cid = payload.readUInt16LE(2);
    if (cid !== 0x0004) continue;
    const att = payload.subarray(4);
    if (att.length < 1) continue;
    const mac = connMac.get(conn) || "unknown";
    const op = att[0];

    // Read By Group Type Response — primary services
    if (op === 0x11 && att.length >= 6) {
      const len = att[1];
      if (len >= 6) {
        let i = 2;
        while (i + len <= att.length) {
          const start = att.readUInt16LE(i);
          const end = att.readUInt16LE(i + 2);
          const uuidBytes = att.subarray(i + 4, i + len);
          let uuid = "?";
          if (uuidBytes.length === 2) uuid = uuid16(uuidBytes.readUInt16LE(0));
          else if (uuidBytes.length === 16) uuid = uuid128FromLe(uuidBytes);
          else uuid = hex(uuidBytes);
          services.push({ mac, start, end, uuid });
          i += len;
        }
      }
    }

    // Read By Type Response — characteristic declarations
    if (op === 0x09 && att.length >= 6) {
      const len = att[1];
      if (len >= 5) {
        let i = 2;
        while (i + len <= att.length) {
          const declHandle = att.readUInt16LE(i);
          const value = att.subarray(i + 2, i + len);
          if (value.length >= 5) {
            const props = value[0];
            const valueHandle = value.readUInt16LE(1);
            const uuidBytes = value.subarray(3);
            let uuid = "?";
            if (uuidBytes.length === 2) uuid = uuid16(uuidBytes.readUInt16LE(0));
            else if (uuidBytes.length === 16) uuid = uuid128FromLe(uuidBytes);
            else uuid = hex(uuidBytes);
            characteristics.push({ mac, declHandle, props, valueHandle, uuid });
          }
          i += len;
        }
      }
    }

    // Find Information Response — descriptors (CCCD etc.)
    if (op === 0x05 && att.length >= 4) {
      const format = att[1];
      const esz = format === 1 ? 4 : 18;
      let i = 2;
      while (i + esz <= att.length) {
        const handle = att.readUInt16LE(i);
        const uuidBytes = att.subarray(i + 2, i + esz);
        const uuid =
          format === 1
            ? uuid16(uuidBytes.readUInt16LE(0))
            : uuid128FromLe(uuidBytes);
        descriptors.push({ mac, handle, uuid });
        i += esz;
      }
    }

    if (op !== 0x52 && op !== 0x12) continue;
    if (att.length < 3) continue;
    const handle = att.readUInt16LE(1);
    const value = att.subarray(3);
    const valueHex = hex(value);
    const row = {
      conn,
      mac,
      op: "0x" + op.toString(16),
      handle,
      valueHex,
      label: labelPayload(valueHex),
      towardTarget:
        mac === TARGET_MAC ||
        handle === TARGET_HANDLE,
    };
    allWrites.push(row);
    if (row.towardTarget) writes.push(row);
  }

  return {
    connMac: Object.fromEntries(connMac),
    writes,
    allWrites,
    services,
    characteristics,
    descriptors,
    truncatedAcl,
    fullAcl,
  };
}

function isTargetMac(m) {
  return m === TARGET_MAC;
}

function writeReport(outDir, analysis, logFiles) {
  const lines = [];
  lines.push("# AquaLamp capture report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Target light MAC: ${TARGET_MAC.toUpperCase()}`);
  lines.push(`Target ATT write handle: ${formatHandle(TARGET_HANDLE)}`);
  lines.push("");
  lines.push("## Log files scanned");
  for (const f of logFiles) lines.push(`- ${f}`);
  if (!logFiles.length) lines.push("- (none found)");
  lines.push("");
  lines.push("## ACL completeness");
  lines.push(
    `- Full ACL payloads: ${analysis.fullAcl}  |  Truncated (btsnooz-style): ${analysis.truncatedAcl}`,
  );
  if (analysis.truncatedAcl > 0 && analysis.fullAcl === 0) {
    lines.push(
      "- _This looks like truncated btsnooz — UUID bytes and full write values may be incomplete._",
    );
  } else if (analysis.truncatedAcl === 0 && analysis.fullAcl > 0) {
    lines.push("- _Looks like a full HCI snoop — good for UUID recovery._");
  }
  lines.push("");
  lines.push("## Connections seen (HCI handle → MAC)");
  const macs = Object.entries(analysis.connMac);
  if (!macs.length) lines.push("_No LE connection events parsed._");
  for (const [h, m] of macs) {
    const mark = isTargetMac(m) ? "  (likely light)" : "";
    lines.push(`- handle ${formatHandle(Number(h))} -> ${m.toUpperCase()}${mark}`);
  }
  lines.push("");

  const tgtServices = analysis.services.filter((s) => isTargetMac(s.mac));
  const tgtChars = analysis.characteristics.filter((c) => isTargetMac(c.mac));
  const tgtDesc = analysis.descriptors.filter((d) => isTargetMac(d.mac));

  lines.push("## GATT UUIDs (from full snoop discovery)");
  if (!tgtServices.length && !tgtChars.length) {
    lines.push("_No GATT discovery responses for the light MAC in this log._");
    lines.push(
      "If the lamp was already connected before snoop started, try disconnect/reconnect while logging, or use nRF Connect screenshots.",
    );
  } else {
    lines.push("### Primary services");
    for (const s of tgtServices) {
      lines.push(
        `- ${formatHandle(s.start)}–${formatHandle(s.end)} → \`${s.uuid}\``,
      );
    }
    lines.push("");
    lines.push("### Characteristics");
    for (const c of tgtChars) {
      const writeMark =
        c.valueHandle === TARGET_HANDLE ? "  **← write handle used by app**" : "";
      lines.push(
        `- decl ${formatHandle(c.declHandle)} value ${formatHandle(c.valueHandle)} props=0x${c.props.toString(16).padStart(2, "0")} uuid=\`${c.uuid}\`${writeMark}`,
      );
    }
    if (tgtDesc.length) {
      lines.push("");
      lines.push("### Descriptors (Find Information)");
      for (const d of tgtDesc) {
        lines.push(`- ${formatHandle(d.handle)} → \`${d.uuid}\``);
      }
    }
  }
  lines.push("");

  lines.push("## ATT writes toward the light (handle 0x0010 or matching MAC)");
  if (!analysis.writes.length) {
    lines.push("_No matching writes found._");
    lines.push("");
    lines.push("Try again with HCI snoop enabled, lamp connected in Week Aqua,");
    lines.push("and move the sliders / Custom Mode R/G/B as the checklist asks.");
  } else {
    const uniq = [...new Set(analysis.writes.map((w) => w.valueHex))];
    lines.push(`Count: ${analysis.writes.length}  |  Unique payloads: ${uniq.length}`);
    lines.push("");
    lines.push("| # | MAC | Handle | Op | Payload (hex) | Likely label |");
    lines.push("|---|-----|--------|----|---------------|--------------|");
    analysis.writes.forEach((w, i) => {
      lines.push(
        `| ${i + 1} | ${w.mac.toUpperCase()} | ${formatHandle(w.handle)} | ${w.op} | \`${w.valueHex}\` | ${w.label || ""} |`,
      );
    });
    lines.push("");
    lines.push("### Unique payloads (copy these)");
    for (const u of uniq) {
      const lab = labelPayload(u);
      lines.push(`- \`${u}\`${lab ? ` — ${lab}` : ""}`);
    }
    lines.push("");
    lines.push("### CustomMode R/G/B heuristic");
    lines.push(
      "When the app switches Custom Mode channels, frames matching `fb f9 RR GG BB XX 55 55` appear.",
    );
    lines.push(
      "App UI channels are **R / G / B / UV / Fan / Power** — byte `XX` is a candidate for UV (or another channel) but not confirmed.",
    );
    lines.push(
      "0–100 slider scaling is **not** established yet (observed “on” samples used `0xeb` = 235).",
    );
  }
  lines.push("");
  lines.push("## All ATT writes in log (debug)");
  lines.push(`Total: ${analysis.allWrites.length}`);
  if (analysis.allWrites.length && analysis.allWrites.length <= 80) {
    for (const w of analysis.allWrites) {
      lines.push(
        `- mac=${w.mac} h=${formatHandle(w.handle)} ${w.op} ${w.valueHex}${w.label ? "  # " + w.label : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("## What to do next");
  lines.push("1. Keep this report.");
  lines.push(
    "2. If you know which app move produced which hex (CustomMode Red/Green/Blue, UV, Fan, Power), tell the AquaLamp agent.",
  );
  lines.push(
    "3. Optional: nRF Connect → connect to B3.0-S300pro-03 → screenshot services (confirms UUIDs visually).",
  );

  const reportPath = path.join(outDir, "capture-report.md");
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  const jsonPath = path.join(outDir, "capture-report.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        targetMac: TARGET_MAC,
        targetHandle: TARGET_HANDLE,
        ...analysis,
        logFiles,
      },
      null,
      2,
    ),
    "utf8",
  );
  return { reportPath, jsonPath };
}

const input = resolveInput();
if (!input) {
  console.error("No capture folder found. Run: npm run capture:android");
  process.exit(1);
}

const outDir =
  fs.existsSync(input) && fs.statSync(input).isDirectory()
    ? input
    : path.dirname(input);

console.log("Parsing:", input);
ensureBugreportExpanded(outDir);

const logs = findLogs(input);
if (!logs.length) {
  console.error(
    "No btsnoop/btsnooz logs inside. Did capture-android finish a bugreport?",
  );
  // still write an empty report
}
const uniqueLogs = dedupeLogs(logs);
const merged = {
  connMac: {},
  writes: [],
  allWrites: [],
  services: [],
  characteristics: [],
  descriptors: [],
  truncatedAcl: 0,
  fullAcl: 0,
};
const used = [];
for (const { path: log, buf } of uniqueLogs) {
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
  merged.services.push(...a.services);
  merged.characteristics.push(...a.characteristics);
  merged.descriptors.push(...a.descriptors);
  merged.truncatedAcl += a.truncatedAcl;
  merged.fullAcl += a.fullAcl;
}

const { reportPath, jsonPath } = writeReport(outDir, merged, used);
console.log("");
console.log("Wrote", reportPath);
console.log("Wrote", jsonPath);
console.log(`Light-targeted writes: ${merged.writes.length}`);
const tgtChars = merged.characteristics.filter((c) => isTargetMac(c.mac));
const writeChar = tgtChars.find((c) => c.valueHandle === TARGET_HANDLE);
if (writeChar) {
  console.log(
    `Write char UUID: ${writeChar.uuid} (decl ${formatHandle(writeChar.declHandle)})`,
  );
}
const tgtSvc = merged.services.filter((s) => isTargetMac(s.mac));
if (tgtSvc.length) {
  console.log("Services:");
  for (const s of tgtSvc) {
    console.log(
      `  ${formatHandle(s.start)}-${formatHandle(s.end)} ${s.uuid}`,
    );
  }
}
if (merged.writes.length) {
  const uniq = [...new Set(merged.writes.map((w) => w.valueHex))];
  console.log("Unique payloads:");
  for (const u of uniq) {
    const lab = labelPayload(u);
    console.log(" ", u, lab ? `— ${lab}` : "");
  }
}
