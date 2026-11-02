import asyncio, threading, time, os, json
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = __import__("os").environ["LIGHT_ADDRESS"]  # set in .env
W = "0000fff2-0000-1000-8000-00805f9b34fb"
samples = []
stop = threading.Event()
ready = threading.Event()


def cam_thread():
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
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
    ready.set()
    while not stop.is_set():
        ok, f = cap.read()
        t = time.perf_counter()
        b, g, r = f[: f.shape[0] * 4 // 10].reshape(-1, 3).mean(0)
        samples.append((t, float(r), float(g), float(b)))
    cap.release()


def report(label, t0, dur):
    rows = [s for s in samples if t0 <= s[0] <= t0 + dur]
    print(f"--- {label}")
    for sec in range(0, int(dur) + 1, 1):
        w = [s for s in rows if sec <= s[0] - t0 < sec + 1]
        if w:
            m = np.mean([s[1:] for s in w], axis=0)
            print(f"   +{sec:2d}s  R {m[0]:6.1f} G {m[1]:6.1f} B {m[2]:6.1f}  sum {m.sum():6.1f}")


async def main():
    th = threading.Thread(target=cam_thread, daemon=True)
    th.start()
    ready.wait()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    async with BleakClient(d, timeout=15) as c:
        async def send(h):
            await c.write_gatt_char(W, bytes.fromhex(h), response=False)
            return time.perf_counter()

        await send("FDF1555555555555")
        await asyncio.sleep(0.5)
        await send("FEF9000024000000")
        await asyncio.sleep(0.5)
        t = await send("FBF9000000005555")
        await asyncio.sleep(30)
        t = await send("FBF979DF74EB5555")
        await asyncio.sleep(30)
        report("OFF -> preset 3 (first 30 s)", t, 30)
        t = await send("FBF9000000005555")
        await asyncio.sleep(30)
        report("preset 3 -> OFF", t, 30)
        t = await send("FBF9EB0000005555")
        await asyncio.sleep(30)
        t = await send("FBF900EB00005555")
        await asyncio.sleep(30)
        report("red -> green", t, 30)
        t = await send("FBF9000000005555")
        await asyncio.sleep(30)
        report("green -> OFF", t, 30)
    stop.set()
    th.join()


asyncio.run(main())
