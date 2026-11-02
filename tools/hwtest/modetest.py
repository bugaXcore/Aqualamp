import asyncio, concurrent.futures, os, sys
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = __import__("os").environ["LIGHT_ADDRESS"]  # set in .env
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = os.path.join(os.environ["TEMP"], "lampcam")
SETTLE = 15.0
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


def cam_set_exposure(value):
    cap.set(cv2.CAP_PROP_EXPOSURE, value)
    for _ in range(8):
        cap.read()


def cam_state():
    return {k: cap.get(v) for k, v in {
        "auto_wb": cv2.CAP_PROP_AUTO_WB, "wb": cv2.CAP_PROP_WB_TEMPERATURE,
        "auto_exp": cv2.CAP_PROP_AUTO_EXPOSURE, "exp": cv2.CAP_PROP_EXPOSURE,
        "gain": cv2.CAP_PROP_GAIN}.items()}


def cam_shot(name):
    for _ in range(5):
        cap.read()
    frames = []
    for _ in range(6):
        ok, f = cap.read()
        frames.append(f.astype(np.float32))
    mean = np.mean(frames, axis=0)
    cv2.imwrite(os.path.join(OUT, name + ".png"), mean.astype(np.uint8))
    wall = mean[: int(mean.shape[0] * 0.4)]
    b, g, r = wall.reshape(-1, 3).mean(0)
    return r, g, b


async def send(client, hexs):
    await client.write_gatt_char(W, bytes.fromhex(hexs), response=False)


async def main():
    loop = asyncio.get_running_loop()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    await loop.run_in_executor(ex, cam_open)
    async with BleakClient(d, timeout=15) as c:
        await send(c, "FDF1555555555555")
        await asyncio.sleep(0.5)
        await send(c, "FBF979DF74EB5555")
        await asyncio.sleep(SETTLE)
        chosen = None
        for exp in (-4, -5, -6, -7, -8, -9, -10):
            await loop.run_in_executor(ex, cam_set_exposure, exp)
            r, g, b = await loop.run_in_executor(ex, cam_shot, "calib")
            print(f"exp {exp}: wall RGB {r:.0f} {g:.0f} {b:.0f}", flush=True)
            if max(r, g, b) < 190 and chosen is None:
                chosen = exp
                break
        if chosen is None:
            print("no safe exposure found")
            return
        await loop.run_in_executor(ex, cam_set_exposure, chosen)
        print("locked:", await loop.run_in_executor(ex, cam_state), flush=True)

        steps = [
            ("1_mode1_baseline", "FDF1555555555555"),
            ("2_mode2", "FDF2555555555555"),
            ("3_mode1", "FDF1555555555555"),
            ("4_mode2", "FDF2555555555555"),
            ("5_mode1", "FDF1555555555555"),
            ("6_mode1_repeat", None),
        ]
        rows = []
        for name, frame in steps:
            if frame:
                await send(c, frame)
            await asyncio.sleep(SETTLE)
            r, g, b = await loop.run_in_executor(ex, cam_shot, name)
            rows.append((name, r, g, b))
            print(f"{name}: RGB {r:.1f} {g:.1f} {b:.1f}  R/B {r/b:.3f}  sum {r+g+b:.0f}", flush=True)
        await send(c, "FBF9000000005555")
        await asyncio.sleep(SETTLE)
        r, g, b = await loop.run_in_executor(ex, cam_shot, "7_off")
        print(f"7_off: RGB {r:.1f} {g:.1f} {b:.1f}")
        print("end state:", await loop.run_in_executor(ex, cam_state))
    cap.release()


asyncio.run(main())
