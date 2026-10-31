import asyncio, threading, time
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = "C8:47:80:70:BB:07"
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


RED = "FBF9EB0000005555"
BLUE = "FBF900 00EB005555".replace(" ", "")


async def main():
    th = threading.Thread(target=cam_thread, daemon=True)
    th.start()
    ready.wait()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    async with BleakClient(d, timeout=15) as c:
        async def send(h):
            await c.write_gatt_char(W, bytes.fromhex(h), response=False)

        await send("FDF1555555555555")
        await asyncio.sleep(0.5)
        await send("FEF9000024000000")
        await asyncio.sleep(0.5)
        await send(RED)
        await asyncio.sleep(20)
        for interval in (2.0, 1.0, 0.5, 0.25, 0.1, 0.05, 0.02):
            await send(RED)
            await asyncio.sleep(6)
            t0 = time.perf_counter()
            n = 0
            while time.perf_counter() - t0 < 8:
                await send(RED if n % 2 == 0 else BLUE)
                n += 1
                nxt = t0 + n * interval
                await asyncio.sleep(max(0, nxt - time.perf_counter()))
            t1 = time.perf_counter()
            win = np.array([s[1:] for s in samples if t0 + 3 <= s[0] <= t1])
            rate = n / (t1 - t0)
            print(f"interval {interval*1000:5.0f} ms  writes {n:4d} ({rate:5.1f}/s)  "
                  f"R {win[:,0].min():5.1f}-{win[:,0].max():5.1f}  B {win[:,2].min():5.1f}-{win[:,2].max():5.1f}  "
                  f"R swing {win[:,0].max()-win[:,0].min():5.1f}  B swing {win[:,2].max()-win[:,2].min():5.1f}", flush=True)
        await send("FBF9000000005555")
        await asyncio.sleep(1)
    stop.set()
    th.join()


asyncio.run(main())
