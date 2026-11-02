import asyncio
from bleak import BleakScanner, BleakClient

ADDR = __import__("os").environ["LIGHT_ADDRESS"]  # set in .env
W = "0000fff2-0000-1000-8000-00805f9b34fb"


async def main():
    adv = {}

    def cb(d, a):
        if d.address == ADDR:
            adv[(a.local_name, tuple(a.service_uuids), tuple((k, v.hex()) for k, v in a.manufacturer_data.items()),
                 tuple((k, v.hex()) for k, v in a.service_data.items()), a.tx_power)] = a.rssi

    async with BleakScanner(cb, scanning_mode="active"):
        await asyncio.sleep(12)
    print("ADVERTISEMENTS")
    for k, rssi in adv.items():
        print(" ", k, "rssi", rssi)

    d = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    async with BleakClient(d, timeout=15) as c:
        print("SERVICES")
        for s in c.services:
            for ch in s.characteristics:
                descs = []
                for ds in ch.descriptors:
                    try:
                        descs.append((ds.uuid[4:8], bytes(await c.read_gatt_descriptor(ds.handle)).hex()))
                    except Exception as e:
                        descs.append((ds.uuid[4:8], "err"))
                print(" ", s.uuid[4:8], ch.uuid[4:8], "h", ch.handle, ch.properties, descs)
        got = []
        for s in c.services:
            for ch in s.characteristics:
                if "notify" in ch.properties or "indicate" in ch.properties:
                    try:
                        await c.start_notify(ch, lambda x, data, u=ch.uuid[4:8]: got.append((round(asyncio.get_event_loop().time() - t0, 1), u, bytes(data).hex(" "))))
                        print("subscribed", ch.uuid[4:8])
                    except Exception as e:
                        print("subscribe failed", ch.uuid[4:8], type(e).__name__, e)
        t0 = asyncio.get_event_loop().time()
        steps = [("clock+mode1", ["FF22115555555555", "FDF1555555555555"]),
                 ("preset3", ["FBF979DF74EB5555"]),
                 ("timer", ["FEF9114818050000"]),
                 ("mode2", ["FDF2555555555555"]),
                 ("mode1", ["FDF1555555555555"]),
                 ("off", ["FBF9000000005555"])]
        for name, frames in steps:
            print("send", name, flush=True)
            for f in frames:
                await c.write_gatt_char(W, bytes.fromhex(f), response=False)
                await asyncio.sleep(0.5)
            await asyncio.sleep(5)
        await asyncio.sleep(20)
        print("NOTIFICATIONS:", got)
        for s in c.services:
            for ch in s.characteristics:
                if "read" in ch.properties and ch.uuid[4:8] == "fff1":
                    v = bytes(await c.read_gatt_char(ch))
                    print("fff1 after:", v.hex(" ")[:60], "nonzero bytes:", sum(1 for x in v if x))


asyncio.run(main())
