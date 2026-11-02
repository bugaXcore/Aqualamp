"""Print the wall colour every few seconds without touching the lamp.

Run: python -u tools/hwtest/wall_watch.py [seconds] [step]
"""
import asyncio, datetime as dt, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from night import cam_open, ex, observe  # noqa: E402


async def main():
    seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    step = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    await asyncio.get_running_loop().run_in_executor(ex, cam_open)
    now = dt.datetime.now()
    await observe("wall", now, now + dt.timedelta(seconds=seconds), step, [])


if __name__ == "__main__":
    asyncio.run(main())
