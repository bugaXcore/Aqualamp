"""Hardware mode (mode-2 slot) vs App mode (mode-1 colour frame): same wire values, same lamp.

Run: python -u tools/hwtest/mode_compare.py   (needs LIGHT_ADDRESS; lamp near the adapter, webcam
on the wall, official app and browser tabs disconnected). About 25 minutes.
Results: %TEMP%\\lampcam\\mode_compare\\compare.json plus a table at the end.

Each colour is sent as raw wire bytes (0-235) both ways, in A B B A order so ordering and
easing effects show up:
  A = app path   : mode 1, always-on window, colour frame FB F9
  B = slot path  : slot 1 window 00:00-24:00, colour frame FB F1, mode 2
If A and B give the same wall colour the two modes render identically and any difference seen in
the app comes from the app (calibration, graph, easing). A consistent per-channel ratio points at
the lamp (the slot path scales or maps channels differently). The last block measures how long a
step takes to settle in each path.

The lamp is restored at the end (slots cleared, mode 1, colour off, timer 11:48-18:05).
"""
import asyncio, datetime as dt, json, os, sys, traceback

sys.path.insert(0, os.path.dirname(__file__))
from night import (  # noqa: E402
    ALWAYS_ON, MODE1, MODE2, OFF, OUT, cam_open, cam_shot, clock_frame, ex, final_restore, log,
    restore_quiet, session, slot_color, slot_window, timer_frame,
)

SETTLE = 22  # the lamp eases to a new colour over about 15 s
SAMPLES = 3

COLOURS = [
    ("red 50%", (118, 0, 0, 0)),
    ("red 100%", (235, 0, 0, 0)),
    ("green 50%", (0, 118, 0, 0)),
    ("green 100%", (0, 235, 0, 0)),
    ("blue 50%", (0, 0, 118, 0)),
    ("blue 100%", (0, 0, 235, 0)),
    ("uv 100%", (0, 0, 0, 235)),
    ("white 50%", (118, 118, 118, 0)),
    ("daily mix", (100, 113, 129, 42)),
    ("dim blue 10%", (0, 0, 24, 0)),
]


async def measure(loop):
    rows = []
    for _ in range(SAMPLES):
        rows.append(await loop.run_in_executor(ex, cam_shot))
        await asyncio.sleep(2)
    return [round(sum(r[i] for r in rows) / len(rows), 1) for i in range(3)]


async def send_app(rgbu):
    async def fn(send):
        await send(MODE1)
        await send(ALWAYS_ON)
        await send("FBF9" + "".join(f"{v:02X}" for v in rgbu) + "5555")
    await session(fn)


async def send_slot(rgbu):
    async def fn(send):
        await send(slot_window(1, (0, 0), (24, 0)))
        await send(slot_color(1, rgbu))
        await send(MODE2)
    await session(fn)


async def settle_curve(loop, path, rgbu):
    """Dark, then a step to rgbu; wall sum every ~3 s for 40 s."""
    await send_app((0, 0, 0, 0))
    await asyncio.sleep(SETTLE)
    base = dt.datetime.now()
    await (send_app if path == "app" else send_slot)(rgbu)
    out = []
    for _ in range(14):
        r, g, b = await loop.run_in_executor(ex, cam_shot)
        out.append((round((dt.datetime.now() - base).total_seconds(), 1), round(r + g + b, 1)))
        await asyncio.sleep(1.5)
    return out


def table(results, dark):
    print("\n" + "colour".ljust(14) + "app wall RGB".ljust(26) + "slot wall RGB".ljust(26) + "slot/app per channel")
    flagged = []
    for name, rgbu, a_runs, b_runs in results:
        a = [sum(run[i] for run in a_runs) / len(a_runs) - dark[i] for i in range(3)]
        b = [sum(run[i] for run in b_runs) / len(b_runs) - dark[i] for i in range(3)]
        ratio = [round(b[i] / a[i], 2) if a[i] > 3 else None for i in range(3)]
        print(name.ljust(14) + str([round(v) for v in a]).ljust(26) + str([round(v) for v in b]).ljust(26) + str(ratio))
        if any(r is not None and abs(r - 1) > 0.1 for r in ratio):
            flagged.append(name)
    print("\nDiffers by more than 10%:", flagged or "none")


async def main():
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(ex, cam_open)
    results = []
    curves = {}
    try:
        await restore_quiet()
        await asyncio.sleep(SETTLE)
        dark = await measure(loop)
        log(f"dark wall {dark}")

        async def sync_clock(send):
            await send(clock_frame(dt.datetime.now()))

        await session(sync_clock)

        for name, rgbu in COLOURS:
            a_runs, b_runs = [], []
            for path in ("app", "slot", "slot", "app"):
                await (send_app if path == "app" else send_slot)(rgbu)
                await asyncio.sleep(SETTLE)
                m = await measure(loop)
                (a_runs if path == "app" else b_runs).append(m)
                log(f"{name:14} {path:4} wall {m}")
            results.append((name, rgbu, a_runs, b_runs))

        for path in ("app", "slot"):
            curves[path] = await settle_curve(loop, path, (0, 0, 235, 0))
            log(f"settle {path}: {curves[path]}")

        with open(os.path.join(OUT, "compare.json"), "w") as f:
            json.dump({"dark": dark, "results": results, "settle": curves}, f)
        table(results, dark)
    except Exception:
        log("FAILED: " + traceback.format_exc())
    finally:
        try:
            await final_restore()
            log("lamp restored: slots cleared, mode 1, off, timer 11:48-18:05")
        except Exception:
            log("RESTORE FAILED: " + traceback.format_exc())


if __name__ == "__main__":
    asyncio.run(main())
