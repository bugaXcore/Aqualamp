import asyncio, concurrent.futures, os, json, time
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = "C8:47:80:70:BB:07"
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = r"C:\Users\bugas\AppData\Local\Temp\lampcam"
SETTLE = 8.0
EXPOSURE = -9
ex = concurrent.futures.ThreadPoolExecutor(1)
cap = None
results = []


def cam_open():
    global cap
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    for _ in range(20):
        cap.read()
    cap.set(cv2.CAP_PROP_AUTO_WB, 0)
    cap.set(cv2.CAP_PROP_WB_TEMPERATURE, 4600)
    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
    cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
    cap.set(cv2.CAP_PROP_GAIN, 0)
    cap.set(cv2.CAP_PROP_EXPOSURE, EXPOSURE)
    for _ in range(10):
        cap.read()
    return {k: cap.get(v) for k, v in {
        "auto_wb": cv2.CAP_PROP_AUTO_WB, "wb": cv2.CAP_PROP_WB_TEMPERATURE,
        "auto_exp": cv2.CAP_PROP_AUTO_EXPOSURE, "exp": cv2.CAP_PROP_EXPOSURE,
        "gain": cv2.CAP_PROP_GAIN}.items()}


def cam_shot(name):
    for _ in range(4):
        cap.read()
    frames = [cap.read()[1].astype(np.float32) for _ in range(6)]
    mean = np.mean(frames, axis=0)
    cv2.imwrite(os.path.join(OUT, name + ".png"), mean.astype(np.uint8))
    wall = mean[: int(mean.shape[0] * 0.4)]
    b, g, r = wall.reshape(-1, 3).mean(0)
    return float(r), float(g), float(b), float(wall.max())


async def main():
    loop = asyncio.get_running_loop()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    print("camera:", await loop.run_in_executor(ex, cam_open), flush=True)
    async with BleakClient(d, timeout=15) as c:
        async def send(h):
            await c.write_gatt_char(W, bytes.fromhex(h), response=False)

        async def measure(group, label, frames):
            for h in frames:
                await send(h)
                await asyncio.sleep(0.5)
            await asyncio.sleep(SETTLE)
            r, g, b, mx = await loop.run_in_executor(ex, cam_shot, f"{group}_{label}")
            sat = " SATURATED" if mx >= 250 else ""
            results.append({"group": group, "label": label, "r": r, "g": g, "b": b, "sum": r + g + b})
            print(f"{group:8} {label:14} R {r:6.1f} G {g:6.1f} B {b:6.1f} sum {r+g+b:6.1f}{sat}", flush=True)

        OFF = "FBF9000000005555"
        MODE1 = "FDF1555555555555"
        MODE2 = "FDF2555555555555"
        await send(MODE1)
        await asyncio.sleep(0.5)

        for i in range(3):
            await measure("dark", f"off{i+1}", [OFF])

        for ch, name in enumerate(["R", "G", "B", "UV"]):
            for pct in (10, 25, 50, 75, 100):
                v = round(pct * 0xEB / 100)
                bytes4 = ["00"] * 4
                bytes4[ch] = f"{v:02X}"
                await measure(f"ch_{name}", f"{pct}%", ["FBF9" + "".join(bytes4) + "5555"])
            await measure("dark", f"off_after_{name}", [OFF])

        presets = ["6CE373EB", "A7B974EB", "79DF74EB", "C15EBCEB", "EB5E94EB", "A3EB7000",
                   "77EB7700", "83EB8500", "5EEB5E00", "59EB6000", "6EEB6500", "7EEB6900"]
        for i, p in enumerate(presets, 1):
            await measure("preset", f"{i}", ["FBF9" + p + "5555"])

        # advanced slot 1: blue, window 00:00-24:00, shown only in mode 2
        await measure("slot", "m1_base", [MODE1, "FBF979DF74EB5555"])
        await measure("slot", "m2_before", [MODE2])
        await measure("slot", "m1_again", [MODE1])
        await send("FEF1000024005555")
        await asyncio.sleep(0.5)
        await send("FBF10000EB005555")
        await asyncio.sleep(0.5)
        await measure("slot", "m2_slot_blue", [MODE2])
        await measure("slot", "m1_after", [MODE1])
        await send("FEF1000000005555")
        await asyncio.sleep(0.5)
        await send("FBF1000000005555")
        await asyncio.sleep(0.5)
        await measure("slot", "m2_cleared", [MODE2])
        await send(MODE1)
        await asyncio.sleep(0.5)
        await measure("dark", "final_off", [OFF])
    cap.release()
    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(results, f, indent=1)


asyncio.run(main())
