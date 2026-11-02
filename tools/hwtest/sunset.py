import asyncio, concurrent.futures, os, json, datetime, sys
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = __import__("os").environ["LIGHT_ADDRESS"]  # set in .env
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = r"C:\Users\bugas\AppData\Local\Temp\lampcam"
FADE = int(sys.argv[1])
SUNSET_IN_MIN = int(sys.argv[2])
ex = concurrent.futures.ThreadPoolExecutor(1)
cap = None


def bcd(v):
    return (v // 10) * 16 + v % 10


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


def cam_sum():
    for _ in range(3):
        cap.read()
    frames = [cap.read()[1].astype(np.float32) for _ in range(4)]
    wall = np.mean(frames, axis=0)[:288]
    b, g, r = wall.reshape(-1, 3).mean(0)
    return float(r + g + b)


async def main():
    loop = asyncio.get_running_loop()
    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    await loop.run_in_executor(ex, cam_open)
    log = []
    async with BleakClient(d, timeout=15) as c:
        async def send(frame):
            await c.write_gatt_char(W, frame, response=False)
            await asyncio.sleep(0.5)

        await send(bytes.fromhex("FDF1555555555555"))
        now = datetime.datetime.now()
        await send(bytes([0xFF, bcd(now.hour), bcd(now.minute), bcd(now.second), 0x55, 0x55, 0x55, 0x55]))
        await send(bytes.fromhex("FBF979DF74EB5555"))
        sunset = (now + datetime.timedelta(minutes=SUNSET_IN_MIN)).replace(second=0, microsecond=0)
        sunrise = now.replace(second=0, microsecond=0) - datetime.timedelta(minutes=1)
        if sunrise.date() != now.date():
            sunrise = now.replace(hour=0, minute=0, second=0, microsecond=0)
        frame = bytes([0xFE, 0xF9, bcd(sunrise.hour), bcd(sunrise.minute), bcd(sunset.hour), bcd(sunset.minute), 0x00, FADE])
        await send(frame)
        print(f"sunset {sunset:%H:%M} frame {frame.hex(' ').upper()}", flush=True)
        start = sunset - datetime.timedelta(seconds=90)
        while datetime.datetime.now() < start:
            await asyncio.sleep(1)
        end = sunset + datetime.timedelta(seconds=120)
        while datetime.datetime.now() < end:
            s = await loop.run_in_executor(ex, cam_sum)
            el = (datetime.datetime.now() - sunset).total_seconds()
            log.append({"t": el, "sum": s})
            print(f"t={el:6.0f}s sum {s:6.1f}", flush=True)
            await asyncio.sleep(6)
        await send(bytes.fromhex("FBF9000000005555"))
        await send(bytes.fromhex("FEF9114818050000"))
    cap.release()
    json.dump(log, open(os.path.join(OUT, "sunset.json"), "w"), indent=1)
    print("done", flush=True)


asyncio.run(main())
