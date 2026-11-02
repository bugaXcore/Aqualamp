import asyncio, concurrent.futures, os, json
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = __import__("os").environ["LIGHT_ADDRESS"]  # set in .env
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = r"C:\Users\bugas\AppData\Local\Temp\lampcam"
SETTLE = 16.0
ex = concurrent.futures.ThreadPoolExecutor(1)
cap = None


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
    return float(r), float(g), float(b)


async def main():
    loop = asyncio.get_running_loop()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    print("camera:", await loop.run_in_executor(ex, cam_open), flush=True)
    results = []
    async with BleakClient(d, timeout=15) as c:
        async def send(h):
            await c.write_gatt_char(W, bytes.fromhex(h), response=False)
            await asyncio.sleep(0.5)

        async def measure(label, frames):
            for h in frames:
                await send(h)
            await asyncio.sleep(SETTLE)
            r, g, b = await loop.run_in_executor(ex, cam_shot, "fc_" + label)
            results.append({"label": label, "sum": r + g + b})
            print(f"{label:14} R {r:6.1f} G {g:6.1f} B {b:6.1f} sum {r+g+b:6.1f}", flush=True)

        await send("FDF1555555555555")
        await send("FEF9000024000000")
        await measure("off", ["FBF9000000005555"])
        await measure("preset3", ["FBF979DF74EB5555"])
        for pct in (0, 25, 50, 100):
            v = round(pct * 235 / 100)
            await measure(f"FC_{pct}", [f"FC{v:02X}" + "55" * 6])
        await measure("preset3_end", ["FBF979DF74EB5555"])
        await send("FBF9000000005555")
    cap.release()
    with open(os.path.join(OUT, "fc.json"), "w") as f:
        json.dump(results, f, indent=1)


asyncio.run(main())
