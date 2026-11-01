// Stands in for tools/bleak-sidecar/sidecar.py: same JSON-lines protocol, no Bluetooth.
import { createInterface } from "node:readline";

const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
out({ event: "ready" });

createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.cmd === "connect") {
    if (msg.address === "bad") out({ id: msg.id, ok: false, error: "Lamp not found." });
    else out({ id: msg.id, ok: true });
  } else if (msg.cmd === "send") {
    if (msg.hex.startsWith("00")) out({ id: msg.id, ok: false, error: "frame refused" });
    else if (msg.hex.startsWith("fd f0")) {
      // Simulates the lamp dropping the link.
      out({ event: "state", state: "disconnected" });
      out({ id: msg.id, ok: true });
    } else if (msg.hex.startsWith("fd f9")) process.exit(1);
    else out({ id: msg.id, ok: true });
  } else if (msg.cmd === "disconnect") out({ id: msg.id, ok: true });
});
