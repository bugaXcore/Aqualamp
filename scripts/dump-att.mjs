import fs from "node:fs";

const path =
  String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\FS\data\misc\bluetooth\logs\btsnooz_hci.log`;
const buf = fs.readFileSync(path);
let offset = 16;
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

let n = 0;
while (offset + 24 <= buf.length) {
  const incLen = buf.readUInt32BE(offset + 4);
  const flags = buf.readUInt32BE(offset + 8);
  const dataStart = offset + 24;
  const dataEnd = dataStart + incLen;
  if (dataEnd > buf.length) break;
  let d = buf.subarray(dataStart, dataEnd);
  offset = dataEnd;
  if (!d.length || d[0] !== 0x02) continue;
  d = d.subarray(1);
  if (d.length < 8) continue;
  const handle = d.readUInt16LE(0) & 0x0fff;
  const pb = (d.readUInt16LE(0) >> 12) & 0x3;
  const l2 = d.subarray(4);
  if (l2.length < 4) continue;
  const l2Len = l2.readUInt16LE(0);
  const cid = l2.readUInt16LE(2);
  if (cid !== 0x0004 && pb === 0) {
    // only log non-ATT first fragment headers briefly
    continue;
  }
  // For continuation PB=1, CID may be wrong interpretation — dump ACL payload fully for ATT-looking ops
  const payload = l2;
  const attMaybe = pb === 0 ? l2.subarray(4, 4 + l2Len) : d.subarray(4);
  const op = pb === 0 ? attMaybe[0] : null;
  // Dump all ACL with CID ATT or continuation after ATT
  if (cid === 0x0004 || pb !== 0) {
    n++;
    console.log(
      `#${n} flags=${flags} pb=${pb} hciHandle=${handle} cid=0x${cid.toString(16)} l2Len=${l2Len} op=${op !== null ? "0x" + op.toString(16) : "-"} data=${hex(d.subarray(0, Math.min(d.length, 64)))}`,
    );
  }
}
console.log("total dumped", n);
