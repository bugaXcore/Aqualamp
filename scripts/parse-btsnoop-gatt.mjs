import fs from "node:fs";

const path =
  process.argv[2] ||
  String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\FS\data\misc\bluetooth\logs\btsnooz_hci.log`;
const buf = fs.readFileSync(path);

let offset = 16;
const packets = [];
while (offset + 24 <= buf.length) {
  const incLen = buf.readUInt32BE(offset + 4);
  const flags = buf.readUInt32BE(offset + 8);
  const dataStart = offset + 24;
  const dataEnd = dataStart + incLen;
  if (dataEnd > buf.length) break;
  packets.push({ flags, data: buf.subarray(dataStart, dataEnd), ts: buf.readBigUInt64BE(offset + 16) });
  offset = dataEnd;
}

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");
const uuid16 = (n) => `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;

const services = [];
const chars = [];
const descriptors = [];
const writes = [];
const events = [];

for (const p of packets) {
  let d = p.data;
  let h4 = null;
  if (d.length && [0x01, 0x02, 0x04].includes(d[0])) {
    h4 = d[0];
    d = d.subarray(1);
  }

  if (h4 === 0x04) {
    // LE Meta
    if (d[0] === 0x3e && d.length > 12) {
      const sub = d[2];
      if (sub === 0x01) {
        // Legacy LE Connection Complete
        const status = d[3];
        const role = d[6];
        const addrType = d[7];
        const addr = [...d.subarray(8, 14)].reverse().map((x) => x.toString(16).padStart(2, "0")).join(":");
        events.push({ type: "le_conn", status, role, addrType, addr });
      } else if (sub === 0x0a) {
        const status = d[3];
        const role = d[6];
        const addrType = d[7];
        const addr = [...d.subarray(8, 14)].reverse().map((x) => x.toString(16).padStart(2, "0")).join(":");
        events.push({ type: "le_conn_enh", status, role, addrType, addr });
      } else if (sub === 0x02) {
        // Advertising report — try extract name
        const data = d.subarray(3);
        // rough scan for complete local name AD type 0x09
        for (let i = 0; i < data.length - 2; ) {
          const len = data[i];
          if (len === 0) break;
          const t = data[i + 1];
          const v = data.subarray(i + 2, i + 1 + len);
          if (t === 0x09 || t === 0x08) {
            const name = v.toString("utf8");
            events.push({ type: "adv_name", name, hex: hex(v) });
          }
          i += len + 1;
        }
      }
    }
    continue;
  }

  if (h4 !== 0x02) continue;
  if (d.length < 8) continue;
  const l2 = d.subarray(4);
  const l2Len = l2.readUInt16LE(0);
  const cid = l2.readUInt16LE(2);
  if (cid !== 0x0004) continue;
  const att = l2.subarray(4, 4 + l2Len);
  if (!att.length) continue;
  const op = att[0];

  // Read By Group Type Response (services) 0x11
  if (op === 0x11 && att.length >= 8) {
    const el = att[1];
    for (let i = 2; i + el <= att.length; i += el) {
      const start = att.readUInt16LE(i);
      const end = att.readUInt16LE(i + 2);
      let uuid;
      if (el === 6) uuid = uuid16(att.readUInt16LE(i + 4));
      else if (el === 20) {
        uuid = [...att.subarray(i + 4, i + 20)].reverse().map((x) => x.toString(16).padStart(2, "0")).join("");
        uuid = `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
      } else uuid = hex(att.subarray(i + 4, i + el));
      services.push({ start, end, uuid, el });
    }
  }

  // Read By Type Response (chars) 0x09
  if (op === 0x09 && att.length >= 8) {
    const el = att[1];
    for (let i = 2; i + el <= att.length; i += el) {
      const declHandle = att.readUInt16LE(i);
      const props = att[i + 2];
      const valueHandle = att.readUInt16LE(i + 3);
      let uuid;
      if (el === 7) uuid = uuid16(att.readUInt16LE(i + 5));
      else if (el === 21) {
        const u = [...att.subarray(i + 5, i + 21)].reverse().map((x) => x.toString(16).padStart(2, "0")).join("");
        uuid = `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
      } else uuid = hex(att.subarray(i + 5, i + el));
      chars.push({ declHandle, props, valueHandle, uuid, el });
    }
  }

  // Find Information Response 0x05
  if (op === 0x05 && att.length >= 4) {
    const fmt = att[1];
    const step = fmt === 1 ? 4 : 18;
    for (let i = 2; i + step <= att.length; i += step) {
      const handle = att.readUInt16LE(i);
      let uuid;
      if (fmt === 1) uuid = uuid16(att.readUInt16LE(i + 2));
      else {
        const u = [...att.subarray(i + 2, i + 18)].reverse().map((x) => x.toString(16).padStart(2, "0")).join("");
        uuid = `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
      }
      descriptors.push({ handle, uuid });
    }
  }

  // Write req/cmd
  if (op === 0x12 || op === 0x52) {
    const handle = att.readUInt16LE(1);
    const value = att.subarray(3);
    writes.push({ op: op.toString(16), handle, value: hex(value), bytes: [...value] });
  }
}

const out = { events, services, chars, descriptors, writes };
const outPath = String.raw`F:\Projects\AquaLamp\files\weekaqua_logs\gatt-map.json`;
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log("EVENTS");
for (const e of events) console.log(JSON.stringify(e));
console.log("\nSERVICES");
for (const s of services) console.log(`${s.start.toString(16)}-${s.end.toString(16)} ${s.uuid}`);
console.log("\nCHARS");
for (const c of chars)
  console.log(
    `decl=${c.declHandle.toString(16)} val=${c.valueHandle.toString(16)} props=0x${c.props.toString(16)} ${c.uuid}`,
  );
console.log("\nDESCRIPTORS");
for (const d of descriptors) console.log(`h=${d.handle.toString(16)} ${d.uuid}`);
console.log("\nWRITES");
for (const w of writes) console.log(`h=0x${w.handle.toString(16)} op=${w.op} ${w.value}`);
console.log("\nwrote", outPath);
