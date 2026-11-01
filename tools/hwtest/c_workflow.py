"""Checks behind the "keep running when app is closed" design (approach C).

Run: python -u tools/hwtest/c_workflow.py   (lamp near the adapter, webcam on the wall,
bridge / Chrome / official app disconnected). Restores slots, mode 1, always-on window, off.

Q1  Mode 1 + stored slots: does a streamed colour still win?
Q2  Writing slot frames while in mode 1: does it change the mode by itself?
Q3  Mode 2 then BLE disconnect: does the lamp keep running the slots alone?
Q4  Do slots survive a power-off / power-on frame sequence?
Q5  Does the timer window (FE F9) also gate mode 2?
"""
import asyncio, datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from night import (  # reuse the verified helpers
    ADDR, OFF, MODE1, MODE2, ALWAYS_ON, clock_frame, timer_frame, slot_window, slot_color,
    session, cam_open, cam_shot, restore_quiet, log, ex,
)

OUT = os.path.join(os.environ.get("TEMP", "."), "lampcam", "c_workflow")
os.makedirs(OUT, exist_ok=True)
RED = "FBF9EB0000005555"
SETTLE = 22
results = []


async def measure(label):
    loop = asyncio.get_running_loop()
    await asyncio.sleep(SETTLE)
    r, g, b = await loop.run_in_executor(ex, cam_shot)
    row = {"label": label, "r": round(r, 1), "g": round(g, 1), "b": round(b, 1), "sum": round(r + g + b, 1)}
    results.append(row)
    log(f"{label:46} R {r:6.1f} G {g:6.1f} B {b:6.1f} sum {r+g+b:6.1f}")
    return row


def dominant(row):
    if row["sum"] < 40:
        return "dark"
    ch = max(("r", "g", "b"), key=lambda k: row[k])
    return {"r": "red", "g": "green", "b": "blue"}[ch]


async def main():
    await asyncio.get_running_loop().run_in_executor(ex, cam_open)
    log("baseline: always-on window, mode 1, off")
    async def base(send):
        await send(clock_frame(dt.datetime.now()))
        await send(MODE1)
        await send(ALWAYS_ON)
        await send(OFF)
    await session(base)
    dark = await measure("baseline off")

    # Q1: store a blue all-day slot, run it in mode 2, then go back to mode 1 and stream red.
    async def q1(send):
        await send(clock_frame(dt.datetime.now()))
        await send(MODE2)
        await send(slot_window(1, (0, 0), (24, 0)))
        await send(slot_color(1, (0, 0, 0xEB, 0)))
    await session(q1)
    m2 = await measure("Q1a mode 2, slot1 blue all day")

    async def q1b(send):
        await send(MODE1)
        await send(ALWAYS_ON)
        await send(RED)
    await session(q1b)
    m1 = await measure("Q1b mode 1 + stream red (blue slot stored)")

    # Q2: rewrite slot 1 as green while staying in mode 1.
    async def q2(send):
        await send(slot_window(1, (0, 0), (24, 0)))
        await send(slot_color(1, (0, 0xEB, 0, 0)))
    await session(q2)
    q2row = await measure("Q2 slot rewritten to green, no mode frame")

    # Q3: switch to mode 2 and leave (session closes = BLE disconnected).
    async def q3(send):
        await send(MODE2)
    await session(q3)
    q3row = await measure("Q3 mode 2, BLE disconnected")

    # Q4: power-off then power-on frame sequence, then mode 2 again.
    async def q4(send):
        await send(MODE1)
        await send(OFF)
        await send(MODE1)
        await send("FBF979DF74EB5555")
        await send(ALWAYS_ON)
        await send(MODE2)
    await session(q4)
    q4row = await measure("Q4 after off/on frames then mode 2")

    # Q5: a timer window that excludes now, with an all-day slot in mode 2.
    async def q5(send):
        now = dt.datetime.now()
        a = now + dt.timedelta(minutes=40)
        b = now + dt.timedelta(minutes=100)
        await send(clock_frame(now))
        await send(timer_frame((a.hour, a.minute), (b.hour, b.minute), 0))
        await send(MODE2)
    await session(q5)
    q5row = await measure("Q5 mode 2, timer window not yet open")

    async def q5b(send):
        await send(MODE1)
        await send(RED)
    await session(q5b)
    q5b_row = await measure("Q5b mode 1, timer window not yet open")

    summary = {
        "Q1 streamed colour wins over stored slots in mode 1": dominant(m1) == "red",
        "Q1 slot colour shows in mode 2": dominant(m2) == "blue",
        "Q2 slot writes alone do not change mode (still red)": dominant(q2row) == "red",
        "Q3 lamp runs slots alone after disconnect (green)": dominant(q3row) == "green",
        "Q4 slots survive off/on frames (green)": dominant(q4row) == "green",
        "Q5 timer window gates mode 2 (dark)": dominant(q5row) == "dark",
        "Q5 timer window gates mode 1 (dark)": dominant(q5b_row) == "dark",
    }
    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump({"rows": results, "summary": summary}, f, indent=1)
    log("SUMMARY " + json.dumps(summary, indent=1))


try:
    asyncio.run(main())
finally:
    log("restoring lamp")
    try:
        asyncio.run(restore_quiet())
    except Exception as exc:
        log(f"restore failed: {exc!r}")
