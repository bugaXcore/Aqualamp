"""Overnight hardware tests: advanced slots 1-5 and sunrise fade codes 1-5.

Run: python -u tools/hwtest/night.py   (lamp within ~30 cm of the adapter, webcam on the wall,
official app and Chrome tab disconnected). Results go to %TEMP%\\lampcam\\night.

The lamp is always restored at the end: slots cleared, mode 1, colour off,
stored timer 11:48-18:05.
"""
import asyncio, concurrent.futures, datetime as dt, json, os, sys, traceback
import cv2, numpy as np
from bleak import BleakScanner, BleakClient

ADDR = "C8:47:80:70:BB:07"
W = "0000fff2-0000-1000-8000-00805f9b34fb"
OUT = os.path.join(os.environ.get("TEMP", "."), "lampcam", "night")
os.makedirs(OUT, exist_ok=True)
ex = concurrent.futures.ThreadPoolExecutor(1)
cap = None
OFF = "FBF9000000005555"
MODE1 = "FDF1555555555555"
MODE2 = "FDF2555555555555"
ALWAYS_ON = "FEF9000024000000"
PRESET3 = "FBF979DF74EB5555"


def dec(n):
    return f"{(n // 10) * 16 + n % 10:02X}"


def clock_frame(t):
    return "FF" + dec(t.hour) + dec(t.minute) + dec(t.second) + "55555555"


def timer_frame(sr, ss, fade):
    return "FEF9" + dec(sr[0]) + dec(sr[1]) + dec(ss[0]) + dec(ss[1]) + "00" + f"{fade:02X}"


def slot_window(n, a, b):
    return f"FEF{n}" + dec(a[0]) + dec(a[1]) + dec(b[0]) + dec(b[1]) + "5555"


def slot_color(n, rgbu):
    return f"FBF{n}" + "".join(f"{v:02X}" for v in rgbu) + "5555"


def hm(t):
    return (t.hour, t.minute)


def log(msg):
    print(dt.datetime.now().strftime("%H:%M:%S"), msg, flush=True)


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


def cam_shot():
    for _ in range(3):
        cap.read()
    frames = [cap.read()[1].astype(np.float32) for _ in range(4)]
    mean = np.mean(frames, axis=0)
    wall = mean[: int(mean.shape[0] * 0.4)]
    b, g, r = wall.reshape(-1, 3).mean(0)
    return float(r), float(g), float(b)


async def session(fn):
    last = None
    for attempt in range(8):
        try:
            d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
            if d is None:
                raise RuntimeError("lamp not found")
            async with BleakClient(d, timeout=20) as c:
                async def send(h):
                    await c.write_gatt_char(W, bytes.fromhex(h), response=False)
                    await asyncio.sleep(0.5)
                return await fn(send)
        except Exception as exc:  # retry with a fresh scan
            last = exc
            log(f"session attempt {attempt + 1} failed: {exc!r}")
            await asyncio.sleep(10)
    raise RuntimeError(f"gave up: {last!r}")


async def observe(label, base, until, step, rows):
    loop = asyncio.get_running_loop()
    while dt.datetime.now() < until:
        r, g, b = await loop.run_in_executor(ex, cam_shot)
        off = (dt.datetime.now() - base).total_seconds()
        rows.append({"label": label, "t": round(off, 1), "r": r, "g": g, "b": b, "sum": r + g + b})
        print(f"{label:10} t={off:7.1f}s R {r:6.1f} G {g:6.1f} B {b:6.1f} sum {r+g+b:6.1f}", flush=True)
        await asyncio.sleep(step)


async def restore_quiet():
    async def fn(send):
        for n in range(1, 6):
            await send(slot_window(n, (0, 0), (0, 0)))
            await send(slot_color(n, (0, 0, 0, 0)))
        await send(MODE1)
        await send(ALWAYS_ON)
        await send(OFF)
    await session(fn)


async def slots_phase():
    log("slots phase: setup")
    holder = {}

    async def setup(send):
        now = dt.datetime.now()
        base = (now + dt.timedelta(minutes=3)).replace(second=0, microsecond=0)
        holder["base"] = base
        await send(clock_frame(now))
        await send(MODE2)
        at = lambda m: hm(base + dt.timedelta(minutes=m))
        plan = [
            (1, 0, 3, (0xEB, 0, 0, 0)),      # red
            (2, 3, 6, (0, 0xEB, 0, 0)),      # green, adjacent
            (3, 6, 9, (0, 0, 0xEB, 0)),      # blue, adjacent
            (4, 11, 14, (0xEB, 0xEB, 0, 0)),  # yellow after a 2 minute gap
            (5, 13, 17, (0xEB, 0, 0xEB, 0)),  # magenta overlapping slot 4
        ]
        for n, a, b, color in plan:
            await send(slot_window(n, at(a), at(b)))
            await send(slot_color(n, color))
        holder["plan"] = [(n, a, b) for n, a, b, _ in plan]

    await session(setup)
    base = holder["base"]
    log(f"slots programmed, base {base:%H:%M} plan {holder['plan']}")
    rows = []
    await observe("slots", base - dt.timedelta(seconds=0), base + dt.timedelta(minutes=19), 10, rows)
    with open(os.path.join(OUT, "slots.json"), "w") as f:
        json.dump({"base": base.isoformat(), "plan": holder["plan"], "rows": rows}, f)
    await restore_quiet()


async def fade_phase(code, minutes):
    log(f"fade phase code {code}")
    holder = {}

    async def setup(send):
        now = dt.datetime.now()
        base = (now + dt.timedelta(minutes=3)).replace(second=0, microsecond=0)
        holder["base"] = base
        end = base + dt.timedelta(hours=3)
        end_hm = (end.hour, end.minute) if end.date() == base.date() else (24, 0)
        await send(clock_frame(now))
        await send(MODE1)
        await send(PRESET3)
        await send(timer_frame(hm(base), end_hm, code))

    await session(setup)
    base = holder["base"]
    rows = []
    await observe(f"fade{code}", base, base + dt.timedelta(minutes=minutes), 20, rows)
    with open(os.path.join(OUT, f"fade{code}.json"), "w") as f:
        json.dump({"base": base.isoformat(), "code": code, "rows": rows}, f)
    await restore_quiet()
    await asyncio.sleep(25)


async def final_restore():
    async def fn(send):
        for n in range(1, 6):
            await send(slot_window(n, (0, 0), (0, 0)))
            await send(slot_color(n, (0, 0, 0, 0)))
        await send(MODE1)
        await send(OFF)
        await send(timer_frame((11, 48), (18, 5), 0))
    await session(fn)


async def main():
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(ex, cam_open)
    try:
        await restore_quiet()
        await asyncio.sleep(20)
        await slots_phase()
        for code, minutes in ((3, 12), (4, 12), (5, 12), (2, 12), (1, 38)):
            await fade_phase(code, minutes)
    except Exception:
        log("FAILED: " + traceback.format_exc())
    finally:
        try:
            await final_restore()
            log("lamp restored: slots cleared, mode 1, off, timer 11:48-18:05")
        except Exception:
            log("RESTORE FAILED: " + traceback.format_exc())
    log("done")


asyncio.run(main())
