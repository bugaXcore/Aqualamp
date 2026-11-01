Protocol notes now live in [`docs/research/PROTOCOL.md`](../../../docs/research/PROTOCOL.md). They are hardware-verified and cover colour, clock, timer, modes, advanced slots, fade codes, calibration and the lamp's timing quirks.

Frame builders are in `src/frames.ts`; every frame is 8 bytes padded with `0x55`, written to `FFF2`.
