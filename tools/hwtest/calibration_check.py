import asyncio, concurrent.futures, os, json
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = "C8:47:80:70:BB:07"
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = r"C:\Users\bugas\AppData\Local\Temp\lampcam"
SETTLE = 16.0
ex = concurrent.futures.ThreadPoolExecutor(1)
cap = None

# calibrated wire frames from MEASURED_CURVES (apps/bridge calibration), per channel
CAL = {
    "R": ["FBF92F0000005555", "FBF9590000005555", "FBF9920000005555", "FBF9EB0000005555"],
    "G": ["FBF9004400005555", "FBF9007600005555", "FBF900AC00005555", "FBF900EB00005555"],
    "B": ["FBF9000034005555", "FBF9000063005555", "FBF900009D005555", "FBF90000EB005555"],
}
LEVELS = [25, 50, 75, 100]


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
    cap.set(cv2.CAP_PROP_EXPOSURE, -9)
    for _ in range(10):
        cap.read()
    return "ok"


def cam_shot(name):
    for _ in range(4):
        cap.read()
    frames = [cap.read()[1].astype(np.float32) for _ in range(6)]
    mean = np.mean(frames, axis=0)
    cv2.imwrite(os.path.join(OUT, name + ".png"), mean.astype(np.uint8))
    wall = mean[: int(mean.shape[0] * 0.4)]
    b, g, r = wall.reshape(-1, 3).mean(0)
    return float(r + g + b)


async def main():
    loop = asyncio.get_running_loop()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    await loop.run_in_executor(ex, cam_open)
    out = {}
    async with BleakClient(d, timeout=15) as c:
        async def send(h):
            await c.write_gatt_char(W, bytes.fromhex(h), response=False)
            await asyncio.sleep(0.5)

        await send("FDF1555555555555")
        await send("FEF9000024000000")
        await send("FBF9000000005555")
        await asyncio.sleep(SETTLE)
        dark = await loop.run_in_executor(ex, cam_shot, "cal_dark")
        print("dark", round(dark, 1), flush=True)
        for ch, frames in CAL.items():
            vals = []
            for pct, h in zip(LEVELS, frames):
                await send(h)
                await asyncio.sleep(SETTLE)
                vals.append(await loop.run_in_executor(ex, cam_shot, f"cal_{ch}_{pct}") - dark)
            full = vals[-1]
            out[ch] = [round(v / full * 100, 1) for v in vals]
            print(ch, "target", LEVELS, "measured % of full", out[ch], flush=True)
        await send("FBF9000000005555")
    cap.release()
    with open(os.path.join(OUT, "cal.json"), "w") as f:
        json.dump(out, f)


asyncio.run(main())
