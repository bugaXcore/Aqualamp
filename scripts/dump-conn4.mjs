import fs from "fs";

const buf = fs.readFileSync(
  "files/weekaqua_logs/FS/data/misc/bluetooth/logs/btsnooz_hci.log",
);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
let o = 16;
const acl = [];
while (o + 24 <= buf.length) {
  const inc = buf.readUInt32BE(o + 4);
  const flags = buf.readUInt32BE(o + 8);
  const d = buf.subarray(o + 24, o + 24 + inc);
  o += 24 + inc;
  if (!d.length || d[0] !== 0x02) continue;
  const p = d.subarray(1);
  if (p.length < 4) continue;
  const hdr = p.readUInt16LE(0);
  const conn = hdr & 0x0fff;
  const pb = (hdr >> 12) & 3;
  const alen = p.readUInt16LE(2);
  const payload = p.subarray(4, 4 + Math.min(alen, p.length - 4));
  if (conn !== 4) continue;
  acl.push({ flags, pb, alen, payloadLen: payload.length, payload });
}

console.log("conn4", acl.length);
for (const [i, a] of acl.entries()) {
  console.log(
    `#${i} pb=${a.pb} flags=${a.flags} alen=${a.alen} plen=${a.payloadLen} ${hex(a.payload)}`,
  );
}

// Reassemble: start on pb 2 or 0 when looks like L2CAP ATT
let expect = 0;
let acc = null;
let dir = null;
const att = [];
for (const a of acl) {
  const isFirst = a.pb === 2 || a.pb === 0;
  if (isFirst) {
    if (a.payload.length < 4) continue;
    const l2Len = a.payload.readUInt16LE(0);
    const cid = a.payload.readUInt16LE(2);
    const body = a.payload.subarray(4);
    if (cid !== 0x0004) {
      expect = 0;
      acc = null;
      continue;
    }
    dir = a.flags & 1 ? "rx" : "tx";
    if (body.length >= l2Len) {
      att.push({ dir, data: Buffer.from(body.subarray(0, l2Len)) });
      expect = 0;
      acc = null;
    } else {
      expect = l2Len;
      acc = Buffer.from(body);
    }
  } else if (a.pb === 1) {
    if (!acc) continue;
    acc = Buffer.concat([acc, a.payload]);
    if (acc.length >= expect) {
      att.push({ dir: dir || "rx", data: Buffer.from(acc.subarray(0, expect)) });
      expect = 0;
      acc = null;
    }
  }
}

const uuid16 = (n) =>
  `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
function uuid128(bytes) {
  const u = [...bytes]
    .reverse()
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

console.log("\n=== REASSEMBLED ATT", att.length, "===");
for (const p of att) console.log(p.dir, hex(p.data));

console.log("\n=== DECODE ===");
for (const p of att) {
  const a = p.data;
  if (a.length < 1) continue;
  const op = a[0];
  try {
    if (op === 0x11 && a.length >= 4 && a[1] >= 6) {
      const el = a[1];
      for (let i = 2; i + el <= a.length; i += el) {
        const start = a.readUInt16LE(i);
        const end = a.readUInt16LE(i + 2);
        const uuid =
          el === 6
            ? uuid16(a.readUInt16LE(i + 4))
            : el === 20
              ? uuid128(a.subarray(i + 4, i + 20))
              : hex(a.subarray(i + 4, i + el));
        console.log(`SERVICE 0x${start.toString(16)}-0x${end.toString(16)} ${uuid}`);
      }
    } else if (op === 0x09 && a.length >= 4 && a[1] >= 7) {
      const el = a[1];
      for (let i = 2; i + el <= a.length; i += el) {
        const decl = a.readUInt16LE(i);
        const props = a[i + 2];
        const val = a.readUInt16LE(i + 3);
        const uuid =
          el === 7
            ? uuid16(a.readUInt16LE(i + 5))
            : el === 21
              ? uuid128(a.subarray(i + 5, i + 21))
              : hex(a.subarray(i + 5, i + el));
        console.log(
          `CHAR decl=0x${decl.toString(16)} val=0x${val.toString(16)} props=0x${props.toString(16)} ${uuid}`,
        );
      }
    } else if (op === 0x05 && a.length >= 4) {
      const fmt = a[1];
      const step = fmt === 1 ? 4 : 18;
      for (let i = 2; i + step <= a.length; i += step) {
        const h = a.readUInt16LE(i);
        const uuid =
          fmt === 1
            ? uuid16(a.readUInt16LE(i + 2))
            : uuid128(a.subarray(i + 2, i + 18));
        console.log(`DESC h=0x${h.toString(16)} ${uuid}`);
      }
    } else if (op === 0x52 || op === 0x12) {
      if (a.length >= 3)
        console.log(
          `WRITE op=0x${op.toString(16)} h=0x${a.readUInt16LE(1).toString(16)} ${hex(a.subarray(3))}`,
        );
    } else if (op === 0x01) {
      console.log(`ERROR ${hex(a)}`);
    } else {
      console.log(`OP 0x${op.toString(16)} ${hex(a)}`);
    }
  } catch (e) {
    console.log("parse err", e.message, hex(a));
  }
}
