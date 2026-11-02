"""Does the UV channel show up on the webcam? (~4 min)

Run: python -u tools/hwtest/uv_test.py   (lamp near the adapter, webcam on the wall).
Sends mode-1 colour frames with only the UV byte set (0, 25%, 50%, 100%) and prints the wall
colour. A rise over the dark level means the webcam sees UV (violet or fluorescence).
"""
import asyncio, datetime as dt, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from night import MODE1, OFF, cam_open, ex, log, observe, restore_quiet, session  # noqa: E402


async def main():
    await asyncio.get_running_loop().run_in_executor(ex, cam_open)
    rows = []

    async def setup(send):
        await send(MODE1)
        await send(OFF)

    await session(setup)
    now = dt.datetime.now()
    await observe("dark", now, now + dt.timedelta(seconds=30), 10, rows)

    for pct in (25, 50, 100):
        v = round(255 * pct / 100)

        async def uv(send, v=v):
            await send(f"FBF90000" + "00" + f"{v:02X}" + "5555")

        await session(uv)
        log(f"UV {pct}%")
        now = dt.datetime.now()
        await observe(f"uv {pct}%", now, now + dt.timedelta(seconds=40), 10, rows)

    await restore_quiet()
    log("restored")


if __name__ == "__main__":
    asyncio.run(main())
