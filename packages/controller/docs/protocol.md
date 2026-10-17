# AquaLamp BLE protocol notes

**Status:** Phase 0 advanced — MAC, GATT UUIDs (`fff0` / `fff2`), and CustomMode R/G/B sample frames from full HCI snoop. **0–100 channel scaling + UV/Fan/Power mapping still blocked.** `PROTOCOL_CAPTURES_READY = false`. Mock remains default.

Canonical analysis: Project store `docs/phase-0-from-logs.md`.  
Public product notes: Project store `docs/s300pro-research.md` (no published BLE protocol; RGB+UVA S-series; Power scales intensity; Fan likely unused on S-series; `FFF0/1/2` module pattern with proprietary payloads).
## Confirmed

| Field | Value | Source |
|-------|-------|--------|
| Device name | `B3.0-S300pro-03` | Bluetooth stack |
| MAC | `C8:47:80:70:BB:07` | HCI LE connection complete |
| App | `com.weekled.weekaquas` | GATT client |
| App UI channels | R / G / B / UV / Fan / Power | Stav / Week Aqua UI |
| Primary service | `0xFFF0` (handles `0x000E–0x0013`) | Full btsnoop Read By Group |
| Write characteristic | `0xFFF2` @ handle `0x0010` (decl `0x000F`, props `0x04` WwR) | Full btsnoop Read By Type |
| Notify characteristic | `0xFFF1` @ handle `0x0012` | Full btsnoop |
| Write type | ATT Write Command `0x52` | HCI snoop |

Also present (not used for color writes): Device Information / GAP / GATT standard services; TI-style service `f000ffc0-0451-4000-b000-000000000000` at `0x0027–0x002F`.

## CustomMode R/G/B samples (`manual-20261017-121500`)

Layout (high confidence):

```
fb f9 <R> <G> <B> <X> 55 55
```

| Label | Payload | Notes |
|-------|---------|-------|
| CustomMode Red | `fb f9 eb 00 00 00 55 55` | R=`0xeb` (235), G=B=0 |
| CustomMode Green | `fb f9 00 eb 00 00 55 55` | G=`0xeb` |
| CustomMode Blue | `fb f9 00 00 eb 00 55 55` | B=`0xeb` |
| CustomMode RGB zero | `fb f9 00 00 00 00 55 55` | channels cleared |
| Mixed | `fb f9 79 df 74 eb 55 55` | multi-channel; `X=0xeb` |

Often followed by companion `fe f9 …` frames (intent unclear). Observed “on” uses **235**, not app **100** — linear 0–100 mapping unknown. Byte `X` is a candidate for UV (unconfirmed). Fan/Power likely other opcodes.

### Earlier truncated scraps (ignore for encoder)

From first `btsnooz` capture: `ff 10 00`, `f9 55 55`, etc. — ACL truncated; superseded by 8-byte frames above.

## Still missing (BLOCKER for real writes)

1. **0–100 ↔ byte mapping** for R/G/B (and whether `0xeb` is max, a preset, or mid-scale)
2. **UV / Fan / Power** frame identification
3. Role of companion opcodes (`fe f9`, `fd f1`, `ff …`, `f9 …`)

## Stub encoder (mock / tests only)

```
A1 01 <red> <green> <blue> <white> <checksum>
```

Not valid on hardware. Research helper `encodeCustomModeFrame(r,g,b,x)` builds `fb f9 … 55 55` but is **not** wired to live writes.

## Capture recipe (beginner)

```powershell
npm run capture
```

Script auto-finds `files\platform-tools\adb.exe`. If direct HCI pull says Permission denied, it continues with bugreport (do not abort). Follow CustomMode R/G/B (+ UV/Fan/Power) checklist, then open `capture-report.md`.
