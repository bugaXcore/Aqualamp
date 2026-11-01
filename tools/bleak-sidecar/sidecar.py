"""BLE sidecar for the AquaLamp bridge (Windows/Linux/macOS, via bleak).

Speaks JSON lines on stdin/stdout.
  in : {"id": 1, "cmd": "connect", "address": "C8:47:..."}   (address optional)
       {"id": 2, "cmd": "send", "hex": "FB F9 ..."}
       {"id": 3, "cmd": "disconnect"}
  out: {"id": 1, "ok": true} | {"id": 1, "ok": false, "error": "..."}
       {"event": "state", "state": "connected" | "disconnected"}

Only 8-byte frames with opcodes FB-FF are written, and only to FFF2.
The firmware-update service (FFC0) is never touched.
"""
import asyncio
import json
import sys

from bleak import BleakClient, BleakScanner

WRITE_CHAR = "0000fff2-0000-1000-8000-00805f9b34fb"
NAME_PREFIX = "B3.0-"
ALLOWED = {0xFB, 0xFC, 0xFD, 0xFE, 0xFF}


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


class Sidecar:
    def __init__(self):
        self.client = None

    async def find(self, address):
        if address:
            device = await BleakScanner.find_device_by_address(address, timeout=15)
        else:
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: (d.name or ad.local_name or "").startswith(NAME_PREFIX),
                timeout=15,
            )
        if device is None:
            raise RuntimeError(
                "Lamp not found. Close the official app, power-cycle the lamp and move it within 30 cm of the adapter."
            )
        return device

    async def connect(self, address):
        if self.client and self.client.is_connected:
            return self.client.address
        device = await self.find(address)

        def on_disconnect(_client):
            emit({"event": "state", "state": "disconnected"})

        self.client = BleakClient(device, disconnected_callback=on_disconnect)
        await self.client.connect()
        return device.address

    async def send(self, hex_str):
        data = bytes.fromhex(hex_str)
        if len(data) != 8 or data[0] not in ALLOWED:
            raise ValueError("Refusing frame: " + hex_str)
        if not self.client or not self.client.is_connected:
            raise RuntimeError("Lamp link is closed.")
        await self.client.write_gatt_char(WRITE_CHAR, data, response=False)

    async def disconnect(self):
        if self.client:
            await self.client.disconnect()
            self.client = None


async def main():
    sidecar = Sidecar()
    loop = asyncio.get_running_loop()
    emit({"event": "ready"})
    # Commands run in order so frames are never reordered.
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        try:
            cmd = msg.get("cmd")
            reply = {"id": msg.get("id"), "ok": True}
            if cmd == "connect":
                reply["address"] = await sidecar.connect(msg.get("address"))
            elif cmd == "send":
                await sidecar.send(msg["hex"])
            elif cmd == "disconnect":
                await sidecar.disconnect()
            else:
                raise ValueError("Unknown command: %s" % cmd)
            emit(reply)
        except Exception as exc:  # report every failure to the host
            emit({"id": msg.get("id"), "ok": False, "error": str(exc) or type(exc).__name__})
    await sidecar.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
