"""Long fade runs for the given codes (default 2 then 4), 50 minutes each.

Run: python -u tools/hwtest/fade_long.py [minutes] [code ...]
Lamp near the adapter, webcam on the wall. The lamp is restored at the end.
"""
import asyncio, os, sys, traceback

sys.path.insert(0, os.path.dirname(__file__))
from night import cam_open, ex, fade_phase, final_restore, log  # noqa: E402


async def main():
    minutes = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    codes = [int(c) for c in sys.argv[2:]] or [2, 4]
    await asyncio.get_running_loop().run_in_executor(ex, cam_open)
    try:
        for code in codes:
            await fade_phase(code, minutes)
    except Exception:
        log("FAILED: " + traceback.format_exc())
    finally:
        await final_restore()
        log("restored")


if __name__ == "__main__":
    asyncio.run(main())
