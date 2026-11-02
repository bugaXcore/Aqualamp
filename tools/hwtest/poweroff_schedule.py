"""Does power-off beat a stored schedule?  (feeding switch check, ~6 min)

Run: python -u tools/hwtest/poweroff_schedule.py   (lamp within ~30 cm of the adapter, webcam on
the wall, official app and Chrome tab disconnected).

Steps: store a slot that lights blue 00:00-24:00 in mode 2, confirm blue, send the app's power-off
(`FB F9 00 00 00 00`) and watch whether the lamp stays dark or the slot relights it. Then send
mode 1 (`FD F1`) after the off frame and watch again. The lamp is restored at the end (slots
cleared, mode 1, colour off).

Read the output: if "after off" stays near the dark level the app's power-off is enough; if it
returns to the blue level, power-off must also leave mode 2 (send FD F1) or clear the slots.
"""
import asyncio, datetime as dt, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from night import (  # noqa: E402
    ALWAYS_ON, MODE1, MODE2, OFF, cam_open, clock_frame, log, observe, restore_quiet,
    session, slot_color, slot_window,
)


async def main():
    cam_open()
    rows = []

    async def setup(send):
        await send(clock_frame(dt.datetime.now()))
        await send(MODE2)
        await send(slot_window(1, (0, 0), (24, 0)))
        await send(slot_color(1, (0, 0, 0xEB, 0)))

    await session(setup)
    log("slot stored; watching blue")
    now = dt.datetime.now()
    await observe("blue", now, now + dt.timedelta(seconds=40), 10, rows)

    async def power_off(send):
        await send(OFF)

    await session(power_off)
    log("sent power-off frame only; watching")
    now = dt.datetime.now()
    await observe("after off", now, now + dt.timedelta(seconds=60), 10, rows)

    async def leave_mode2(send):
        await send(MODE1)
        await send(ALWAYS_ON)
        await send(OFF)

    await session(leave_mode2)
    log("sent mode 1 + off; watching")
    now = dt.datetime.now()
    await observe("mode1 off", now, now + dt.timedelta(seconds=60), 10, rows)

    await restore_quiet()
    log("restored")


if __name__ == "__main__":
    asyncio.run(main())
