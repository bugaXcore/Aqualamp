# AquaLamp BLE protocol notes

**Status:** stub encoder only. Hardware frames are a Phase 0 **BLOCKER**.

## Capture table (fill before real writes)

| Intent | Hex |
|--------|-----|
| Red 100% | _(paste)_ |
| Blue 100% | _(paste)_ |
| All off | _(paste)_ |
| Mixed scene | _(paste)_ |

After pasting captures:

1. Implement real framing in `encodeChannels`.
2. Set `PROTOCOL_CAPTURES_READY = true` in `protocol.ts`.
3. Add fixture tests matching the hex.

## Stub frame (mock / tests only)

```
A1 01 <red> <green> <blue> <white> <checksum>
```

Channel bytes are 0–100. Checksum is the low 8 bits of the sum of the preceding bytes. **Not valid on hardware.**
