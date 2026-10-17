import fs from "node:fs";

const path =
  String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\FS\data\misc\bluetooth\logs\btsnooz_hci.log`;
const buf = fs.readFileSync(path);

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
const uuid16 = (n) =>
  `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
function uuid128(bytes) {
  // little-endian 128-bit UUID in ATT
  const u = [...bytes].reverse().map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

// Collect ACL by connection handle with reassembly
const streams = new Map(); // handle -> { expect, buf }

let offset = 16;
const attPdus = []; // {dir, handle, att}

while (offset + 24 <= buf.length) {
  const incLen = buf.readUInt32BE(offset + 4);
  const flags = buf.readUInt32BE(offset + 8); // bit0: 0=sent host->controller, 1=received
  const dataStart = offset + 24;
  const dataEnd = dataStart + incLen;
  if (dataEnd > buf.length) break;
  let d = buf.subarray(dataStart, dataEnd);
  offset = dataEnd;
  if (!d.length || d[0] !== 0x02) continue;
  d = d.subarray(1);
  if (d.length < 4) continue;

  const hdr = d.readUInt16LE(0);
  const conn = hdr & 0x0fff;
  const pb = (hdr >> 12) & 0x3;
  const payload = d.subarray(4); // after handle+len

  if (pb === 0b10 || pb === 0b00) {
    // First flush previous incomplete? start new
    // ACL first fragment contains L2CAP header
    if (payload.length < 4) continue;
    const l2Len = payload.readUInt16LE(0);
    const cid = payload.readUInt16LE(2);
    const body = payload.subarray(4);
    if (cid !== 0x0004) {
      streams.delete(conn);
      continue;
    }
    if (body.length >= l2Len) {
      attPdus.push({
        dir: flags & 1 ? "rx" : "tx",
        conn,
        att: body.subarray(0, l2Len),
      });
      streams.delete(conn);
    } else {
      streams.set(conn, { expect: l2Len, buf: Buffer.from(body), dir: flags & 1 ? "rx" : "tx" });
    }
  } else if (pb === 0b01) {
    // continuation
    const st = streams.get(conn);
    if (!st) continue;
    st.buf = Buffer.concat([st.buf, payload]);
    if (st.buf.length >= st.expect) {
      attPdus.push({ dir: st.dir, conn, att: st.buf.subarray(0, st.expect) });
      streams.delete(conn);
    }
  }
}

const services = [];
const chars = [];
const descriptors = [];
const writes = [];
const reads = [];

for (const { dir, conn, att } of attPdus) {
  const op = att[0];
  if (op === 0x11 && att.length >= 4) {
    const el = att[1];
    if (el >= 6) {
      for (let i = 2; i + el <= att.length; i += el) {
        const start = att.readUInt16LE(i);
        const end = att.readUInt16LE(i + 2);
        let uuid;
        if (el === 6) uuid = uuid16(att.readUInt16LE(i + 4));
        else if (el === 20) uuid = uuid128(att.subarray(i + 4, i + 20));
        else uuid = hex(att.subarray(i + 4, i + el));
        services.push({ conn, start, end, uuid, raw: hex(att) });
      }
    }
  }
  if (op === 0x09 && att.length >= 4) {
    const el = att[1];
    if (el >= 7) {
      for (let i = 2; i + el <= att.length; i += el) {
        const declHandle = att.readUInt16LE(i);
        const props = att[i + 2];
        const valueHandle = att.readUInt16LE(i + 3);
        let uuid;
        if (el === 7) uuid = uuid16(att.readUInt16LE(i + 5));
        else if (el === 21) uuid = uuid128(att.subarray(i + 5, i + 21));
        else uuid = hex(att.subarray(i + 5, i + el));
        chars.push({ conn, declHandle, props, valueHandle, uuid, raw: hex(att) });
      }
    }
  }
  if (op === 0x05 && att.length >= 4) {
    const fmt = att[1];
    const step = fmt === 1 ? 4 : 18;
    for (let i = 2; i + step <= att.length; i += step) {
      const handle = att.readUInt16LE(i);
      const uuid =
        fmt === 1
          ? uuid16(att.readUInt16LE(i + 2))
          : uuid128(att.subarray(i + 2, i + 18));
      descriptors.push({ conn, handle, uuid });
    }
  }
  if (op === 0x12 || op === 0x52) {
    writes.push({
      dir,
      conn,
      op: "0x" + op.toString(16),
      handle: att.readUInt16LE(1),
      value: hex(att.subarray(3)),
      bytes: [...att.subarray(3)],
    });
  }
  if (op === 0x0a || op === 0x0b) {
    // read blob / read response
    reads.push({ dir, conn, op: "0x" + op.toString(16), hex: hex(att) });
  }
}

// Filter to conn that had writes (light)
const writeConns = [...new Set(writes.map((w) => w.conn))];
console.log("ATT PDUs:", attPdus.length);
console.log("Write conns:", writeConns);
console.log("\nSERVICES");
for (const s of services) {
  if (writeConns.length && !writeConns.includes(s.conn)) continue;
  console.log(
    `conn=${s.conn} 0x${s.start.toString(16)}-0x${s.end.toString(16)} ${s.uuid}`,
  );
}
console.log("\nCHARS");
for (const c of chars) {
  if (writeConns.length && !writeConns.includes(c.conn)) continue;
  console.log(
    `conn=${c.conn} decl=0x${c.declHandle.toString(16)} val=0x${c.valueHandle.toString(16)} props=0x${c.props.toString(16)} ${c.uuid}`,
  );
}
console.log("\nDESCS");
for (const d of descriptors) {
  if (writeConns.length && !writeConns.includes(d.conn)) continue;
  console.log(`conn=${d.conn} h=0x${d.handle.toString(16)} ${d.uuid}`);
}
console.log("\nWRITES");
for (const w of writes) {
  console.log(
    `conn=${w.conn} ${w.op} h=0x${w.handle.toString(16)} ${w.value}`,
  );
}

const out = {
  writeConns,
  services: services.filter((s) => writeConns.includes(s.conn)),
  chars: chars.filter((c) => writeConns.includes(c.conn)),
  descriptors: descriptors.filter((d) => writeConns.includes(d.conn)),
  writes,
};
fs.writeFileSync(
  String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\gatt-reasm.json`,
  JSON.stringify(out, null, 2),
);

// Also print ALL services/chars for both conns for comparison
console.log("\n=== ALL SERVICES ===");
for (const s of services)
  console.log(`conn=${s.conn} 0x${s.start.toString(16)}-0x${s.end.toString(16)} ${s.uuid}`);
console.log("\n=== ALL CHARS ===");
for (const c of chars)
  console.log(
    `conn=${c.conn} decl=0x${c.declHandle.toString(16)} val=0x${c.valueHandle.toString(16)} props=0x${c.props.toString(16)} ${c.uuid}`,
  );
