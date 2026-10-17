# AquaLamp BLE protocol notes

**Status:** Phase 0 — Capture #2 analyzed. UUIDs + CustomMode/Power frames + **0–100 → 0–235** scale drafted. Live BLE **not** verified. `PROTOCOL_CAPTURES_READY = false`. Mock remains default.

Canonical analysis: Project store `docs/phase-0-from-logs.md`.  
Public notes: Project store `docs/s300pro-research.md`.

## Confirmed

| Field | Value |
|-------|-------|
| Device | `B3.0-S300pro-03` / `C8:47:80:70:BB:07` |
| Service / write / notify | `FFF0` / `FFF2`@`0x0010` / `FFF1` |
| CustomMode | `fb f9 <R> <G> <B> <UV> 55 55` |
| Power | `fc <level> 55 55 55 55 55 55` |
| Scale | `wire = round(pct * 235 / 100)` (`0xeb` = 100%) |

`Channels.white` is encoded as **UV** until the API is renamed. Fan: no frames seen (likely unused on S-series).

## Capture #2 gaps

- Discrete Red 25/50/75/100 ladder not in the snoop (scale from UV ladder)
- Fan not observed
- Companion opcodes (`fe f9`, `fd f1`) role unknown

## Encoder

`encodeChannels` → CustomMode frame. `encodePowerFrame` → Power. Hardware path still blocked by `PROTOCOL_CAPTURES_READY`.

## Capture recipe

```powershell
npm run capture
```

Follow Capture #2 checklist in repo `README.md`.
