# AquaLamp BLE protocol notes

**Status:** Phase 0 — Capture #3 confirmed Red ladder + scale **0–100 → 0–235**. `PROTOCOL_CAPTURES_READY = true`. Everyday **`AQUALAMP_MOCK=1`** still recommended until a live Red 25 is confirmed on the lamp.

Canonical analysis: Project store `docs/phase-0-from-logs.md`.  
Public notes: Project store `docs/s300pro-research.md`.

## Confirmed

| Field | Value |
|-------|-------|
| Device | `B3.0-S300pro-03` / `C8:47:80:70:BB:07` |
| Service / write / notify | `FFF0` / `FFF2`@`0x0010` / `FFF1` |
| CustomMode | `fb f9 <R> <G> <B> <UV> 55 55` |
| Power | `fc <level> 55 55 55 55 55 55` |
| Scale | `wire = round(pct * 235 / 100)` — Red ladder Capture #3 |

`Channels.white` → UV. Fan: no frames seen.

## Encoder

`encodeChannels` / `encodePowerFrame` / `RED_PERCENT_WIRE`. Hardware path still gated.
