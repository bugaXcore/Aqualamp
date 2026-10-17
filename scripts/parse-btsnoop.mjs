/**
 * Minimal BTSnoop HCI parser focused on LE ATT Write / UUID discovery.
 * Input: Android btsnoop/btsnooz log (uncompressed btsnoop magic).
 */
import fs from "node:fs";

const path =
  process.argv[2] ||
  String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\FS\data\misc\bluetooth\logs\btsnooz_hci.log`;

const buf = fs.readFileSync(path);
const magic = buf.subarray(0, 8).toString("ascii");
console.log("magic:", JSON.stringify(magic), "size:", buf.length);

if (!magic.startsWith("btsnoop")) {
  console.error("Not a plain btsnoop file");
  process.exit(1);
}

// BTSnoop header: 16 bytes
// version (4) + datalink (4) after magic(8)
const version = buf.readUInt32BE(8);
const datalink = buf.readUInt32BE(12);
console.log("version:", version, "datalink:", datalink);

let offset = 16;
const packets = [];
while (offset + 24 <= buf.length) {
  const origLen = buf.readUInt32BE(offset);
  const incLen = buf.readUInt32BE(offset + 4);
  const flags = buf.readUInt32BE(offset + 8);
  // drops (4) + timestamp (8)
  const dataStart = offset + 24;
  const dataEnd = dataStart + incLen;
  if (dataEnd > buf.length) break;
  const data = buf.subarray(dataStart, dataEnd);
  packets.push({ origLen, incLen, flags, data });
  offset = dataEnd;
}

console.log("packets:", packets.length);

function hex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
}

// HCI ACL data: first byte packet indicator for H4?
// datalink 1001/1002 often means H4 UART (0x02 = ACL)
const attWrites = [];
const uuidHits = [];
const connects = [];
const advNames = [];

for (const p of packets) {
  let d = p.data;
  // Strip H4 packet type if present
  let h4 = null;
  if (d.length && [0x01, 0x02, 0x04].includes(d[0]) && d.length > 4) {
    h4 = d[0];
    d = d.subarray(1);
  }

  // HCI Event
  if (h4 === 0x04 || (!h4 && d[0] === 0x0e)) {
    // LE Connection Complete / Enhanced: event 0x3e sub 0x01 / 0x0a
    if (d[0] === 0x3e && d.length > 10) {
      const sub = d[2];
      if (sub === 0x01 || sub === 0x0a) {
        // address at different offsets
        const addrOff = sub === 0x01 ? 8 : 8;
        if (d.length >= addrOff + 6) {
          const addr = [...d.subarray(addrOff, addrOff + 6)]
            .reverse()
            .map((x) => x.toString(16).padStart(2, "0"))
            .join(":");
          connects.push({ sub, addr, raw: hex(d.subarray(0, Math.min(32, d.length))) });
        }
      }
    }
  }

  // ACL data → L2CAP → ATT
  if (h4 === 0x02 || (!h4 && d.length > 8)) {
    // HCI ACL header: handle(2) + len(2) little endian
    if (d.length < 8) continue;
    const aclLen = d.readUInt16LE(2);
    const l2 = d.subarray(4);
    if (l2.length < 4) continue;
    const l2Len = l2.readUInt16LE(0);
    const cid = l2.readUInt16LE(2);
    if (cid !== 0x0004) continue; // ATT CID
    const att = l2.subarray(4, 4 + l2Len);
    if (att.length < 1) continue;
    const opcode = att[0];
    // Write Request 0x12, Write Command 0x52, Prepare Write 0x16
    if (opcode === 0x12 || opcode === 0x52 || opcode === 0x16) {
      const handle = att.length >= 3 ? att.readUInt16LE(1) : null;
      const value = att.subarray(opcode === 0x16 ? 5 : 3);
      attWrites.push({
        opcode: opcode.toString(16),
        handle,
        valueHex: hex(value),
        valueLen: value.length,
      });
    }
    // Read By Type Response / Find Info may carry UUIDs
    if (opcode === 0x09 || opcode === 0x05 || opcode === 0x11) {
      const s = hex(att);
      if (s.includes("00 00") || att.length > 4) {
        uuidHits.push({ opcode: opcode.toString(16), hex: s.slice(0, 200) });
      }
    }
  }
}

console.log("\n=== LE connects/addrs (sample) ===");
const uniqAddr = [...new Set(connects.map((c) => c.addr))];
console.log(uniqAddr);
console.log("connect events:", connects.length);

console.log("\n=== ATT writes ===");
console.log("count:", attWrites.length);
const byHandle = new Map();
for (const w of attWrites) {
  const k = w.handle;
  if (!byHandle.has(k)) byHandle.set(k, []);
  byHandle.get(k).push(w);
}
for (const [h, list] of [...byHandle.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`\nhandle 0x${h.toString(16)} (${h}) n=${list.length}`);
  const uniq = [...new Set(list.map((x) => x.valueHex))];
  for (const u of uniq.slice(0, 30)) {
    console.log(" ", u);
  }
  if (uniq.length > 30) console.log(" ...", uniq.length - 30, "more unique");
}

console.log("\n=== ATT uuid-ish responses (first 40) ===");
for (const u of uuidHits.slice(0, 40)) {
  console.log(u.opcode, u.hex);
}

// Dump unique write payloads to JSON for further analysis
const out = {
  addresses: uniqAddr,
  writesByHandle: Object.fromEntries(
    [...byHandle.entries()].map(([h, list]) => [
      `0x${h.toString(16)}`,
      [...new Set(list.map((x) => x.valueHex))],
    ]),
  ),
  writeCount: attWrites.length,
};
fs.writeFileSync(
  String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\btsnoop-parsed.json`,
  JSON.stringify(out, null, 2),
);
console.log("\nwrote btsnoop-parsed.json");
