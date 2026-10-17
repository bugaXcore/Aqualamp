# AquaLamp BLE protocol notes

**Status:** Phase 0 partial — MAC + raw write frames from phone logs; UUIDs and channel mapping still blocked. `PROTOCOL_CAPTURES_READY = false`. Mock remains default.

## Confirmed from `weekaqua_logs.zip` (2026-10-17)

| Field | Value | Source |
|-------|-------|--------|
| Device name | `B3.0-S300pro-03` | `dumpsys bluetooth` shim::record |
| MAC | `C8:47:80:70:BB:07` | HCI LE Enhanced Connection Complete (bugreport redacts to `xx:xx:xx:xx:bb:07`) |
| App | `com.weekled.weekaquas` | GATT client registration |
| Write ATT handle | `0x0010` | 5× ATT Write Command (`0x52`) |
| Write property | Write Without Response (`0x04`) | Characteristic declaration at handle `0x000F` |

### Observed write payloads (handle `0x0010`)

| Hex | Notes |
|-----|-------|
| `ff 10 00` | Unknown intent |
| `f9 55 55` | Unknown intent (`0x55` = 85) |
| `fd f2 55` | Unknown intent |
| `fe f1 00` | Unknown intent |
| `fb f1 00` | Unknown intent |

These are **not** yet mapped to AquaLamp’s 0–100 `red/green/blue/white` API.

## Still missing (BLOCKER for real writes)

1. **Service UUID** containing the write characteristic (btsnooz truncated primary-service PDU; custom 128-bit service at handles `0x0027–0x002F` also truncated).
2. **Characteristic UUID** for value handle `0x0010` (declaration response truncated mid-UUID).
3. **Labeled channel captures** — which opcode/payload is red-100, blue-100, all-off, etc.
4. Full unfiltered HCI snoop (enable complete BT HCI logging / nRF Connect while changing one channel at a time).

## Stub encoder (mock / tests only)

```
A1 01 <red> <green> <blue> <white> <checksum>
```

Not valid on hardware.

## Next capture recipe (beginner)

From the repo root, with the lamp already connected in the Week Aqua app:

```powershell
npm run capture
```

Follow the on-screen checklist (Red / Blue / Green / White / Off), press Enter, then open the printed `capture-report.md` under `files/captures/`.

Optional: nRF Connect (Play Store) for UUID screenshots of `B3.0-S300pro-03`.
