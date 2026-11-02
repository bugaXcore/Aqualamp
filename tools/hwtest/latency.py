import asyncio, threading, time, os, json
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = __import__("os").environ["LIGHT_ADDRESS"]  # set in .env
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = r"C:\Users\bugas\AppData\Local\Temp\lampcam"
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
        wall = f[: f.shape[0] * 4 // 10]
        b, g, r = wall.reshape(-1, 3).mean(0)
        samples.append((t, float(r), float(g), float(b)))
    cap.release()


async def main():
    th = threading.Thread(target=cam_thread, daemon=True)
    th.start()
    ready.wait()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    events = []
    async with BleakClient(d, timeout=15) as c:
        async def send(label, h):
            t = time.perf_counter()
            await c.write_gatt_char(W, bytes.fromhex(h), response=False)
            events.append((t, time.perf_counter(), label))

        await send("mode1", "FDF1555555555555")
        await asyncio.sleep(0.5)
        await send("window", "FEF9000024000000")
        await asyncio.sleep(1)
        for rep in range(3):
            await send("preset3", "FBF979DF74EB5555")
            await asyncio.sleep(6)
            await send("red100", "FBF9EB0000005555")
            await asyncio.sleep(6)
            await send("blue100", "FBF900 00EB005555".replace(" ", ""))
            await asyncio.sleep(6)
            await send("off", "FBF9000000005555")
            await asyncio.sleep(6)
    stop.set()
    th.join()
    json.dump({"events": events, "samples": samples}, open(os.path.join(OUT, "latency.json"), "w"))
    base = samples[0][0]
    print("frames", len(samples), "fps", len(samples) / (samples[-1][0] - base))
    for t_start, t_done, label in events:
        win = [s for s in samples if t_start - 0.2 <= s[0] <= t_start + 3.0]
        pre = [s for s in samples if t_start - 0.5 <= s[0] < t_start]
        p = np.mean([s[1:] for s in pre], axis=0) if pre else np.zeros(3)
        print(f"--- {label}: write took {(t_done - t_start) * 1000:.0f} ms, before RGB {p.round(0)}")
        last = None
        for s in win:
            rgb = np.array(s[1:])
            if last is None or np.abs(rgb - last).max() > 6:
                print(f"   +{(s[0] - t_start) * 1000:6.0f} ms  R {s[1]:6.1f} G {s[2]:6.1f} B {s[3]:6.1f}")
                last = rgb


asyncio.run(main())
