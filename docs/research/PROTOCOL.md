# Week Aqua S300 Pro protocol notes

## Confirmed from the lamp's GATT report

Device name: `B3.0-S300pro-03`.

| UUID | Reported properties | Notes |
|---|---|---|
| `FFF0` | Primary service | Week Aqua service |
| `FFF1` | Read, notify | Descriptor `2902` is present |
| `FFF2` | Write without response | Lamp command characteristic |

The report was discovered from Android Chrome over Web Bluetooth. A successful GATT write only confirms that the BLE operation completed; it does not mean the lamp acknowledged the command or that a given value has a verified visual effect.

## Timer and wake behavior

The user confirmed that the lamp follows a timer configured through the official app. They also observed that changing the timer in the official app to a time matching the current time wakes the lamp. This is a known wake-up workaround through the official app; it does not establish how the timer is stored or whether the lamp remains Bluetooth-advertising while asleep. Schedule command frames (`FD F1` / `FD F2`) have not been verified and must not be sent.

### Official-app HCI capture (one sunset timer edit; frames not classified)

The Android bug report contained `FS/data/misc/bluetooth/logs/btsnoop_hci.log`. The user confirmed that this capture session involved one timer edit, setting the app's time to “sunset”. In the captured connection, the official app sent the following eight-byte Write Commands to the FFF2 value handle (`0x0010`):

```text
FF 17 23 11 55 55 55 55
F9 55 55 55 55 55 55 55
FD F1 55 55 55 55 55 55
FB F9 79 DF 74 EB 55 55
FD F1 55 55 55 55 55 55
FE F9 11 48 18 03 00 00
FE F9 11 48 16 00 00 00
```

Because only one timer edit was made, this capture narrows the candidate writes to that official-app session. It still does not decode which individual packet carries the sunset setting: `FD F1` appears twice, and `FE F9` appears with two different payloads. The first frame is the clock frame `FF HH MM SS` (sent at 17:23:11). The `F9` frame is unclassified.

### Second capture (timer set to the current time, 17:43)

Every connection starts with the same handshake: `FF HH MM SS` (clock, matched 17:43:26), `F9`, `FD F1`, `FB F9 79 DF 74 EB` (a colour frame the app sends on connect), `FD F1`. Then:

```text
FE F9 11 48 16 00 00 00   (stored timer shown as 16:00, the earlier sunset value)
FE F9 11 48 17 43 00 00   (new timer, 17:43)
FE F9 11 48 18 05 00 00
```

**Fade duration (capture 19:43, unverified from the page):** the timer frame's last byte is the "Sunrise Sunset Mode" setting: `FE F9 11 48 18 05 00 00` is 0 h and `FE F9 11 48 18 05 00 01` is 0.5 h. The app resends the whole timer frame on each change (00 → 01 → 00 → 01 in this capture). Probably 1 h = `02`, 1.5 h = `03`, and so on, but only 00 and 01 are observed. The lamp also faded at 0 h in the earlier test, so a "0 h" frame may still fade briefly.

**Sunrise verified (2026-10-31):** an earlier test sent sunrise 18:25 with sunset 18:05 (sunset before sunrise) and the lamp stayed off. Sending `FE F9 18 35 18 40 00 00` (sunrise 18:35, sunset 18:40) at 18:31 with the official app closed turned the lamp on at 18:35 and off at 18:40, both as a gradual fade. So the page can wake a sleeping lamp by timer, with no official app involved, as long as sunrise is earlier than sunset. The fade duration is a separate official-app setting ("Sunrise Sunset Mode": 0 h, 0.5 h, 1 h, 1.5 h, 2 h …) whose frame is not yet captured; the app showed 0 h selected in the screenshot, so the lamp's fade may be a default or a stored value.

**Verified on hardware (2026-10-31):** sending `FF 18 10 28` then `FE F9 11 48 18 15 00 00` from the page at 18:10:38, with the official app closed, made the lamp turn off at the new sunset time (reported as 18:15; the app's stored value was 18:05). So `FE F9 SH SM EH EM 00 00` sets the sunset (and presumably sunrise) on the lamp. Sunrise was not yet tested separately. of the app (sunrise 11:48, sunset 18:05): `FE F9 SH SM EH EM 00 00` is the timer frame, with sunrise `SH:SM` and sunset `EH:EM` as decimal digits in hex. `11 48` is sunrise 11:48 and the last two bytes are the sunset (`16 00`, `17 43`, `18 05`; `18 03` in the first capture). The app sends the stored timer on connect and a full frame on every edit. This is supported by two captures plus the screenshot, but it has not been sent from the page. Do not replay until a controlled test with a harmless value. Do not replay any unclassified frames. The observed `FB F9` packet has the known color-frame structure, but its relationship to the timer edit is not established by this capture.

### Findings from the official app's decompiled code (com.weekled.weekaquas)

Source: `tools/StringTools.java` and related classes, read with jadx for protocol discovery only. Everything below is the app's own frame builder. The color and timer parts match our hardware tests.

- All frames are 8 bytes, padded with `55`. Clock: `FF HH MM SS`. Hours and minutes are decimal digits written as hex.
- Timer: `FE F9 SH SM EH EM TT RR`. `SH SM` is sunrise (start) and `EH EM` is sunset (end). `TT` is `00` or `01`, toggled by an AM/PM control in the app (meaning not tested; keep `00`). `RR` is the fade, a ramp index: 0 = 0 h, 1 = 0.5 h, 2 = 1 h, 3 = 1.5 h, 4 = 2 h, 5 = 2.5 h. The app only accepts a ramp when the on-window is longer than index × 60 minutes. The app works in 5-minute steps, though the lamp accepted our one-minute values.
- Color: `FB F9 R G B UV 55 55`. Each channel is `round(percent / 100 × 235)`, so 0xEB = 100%. This matches ours.
- Fan: `FC XX 55…`, `XX = round(percent / 100 × 235)`. A second family `F9 XX …` is used on the "mode" screens, with an inverted scale. Neither has been tested on the lamp.
- Advanced schedule (5 slots, n = 1–5): `FE Fn SH SM EH EM 55 55` sets slot n's time window and `FB Fn R G B UV 55 55` sets its color. An empty slot is `FE Fn 00 00 00 00 55 55` plus `FB Fn 00 00 00 00 55 55`. A window ending at the end of the day is written as `24 00`. Not tested.
- `FD F1 55…` selects the app's Mode Setting screen (the single sunrise/sunset timer). `FD F2 55…` selects the Advanced Setting screen (the slot schedule). The app sends one of these whenever you switch tabs and remembers the choice. Inferred from `SettingActivity` and `EquipmentListActivity`; not tested on the lamp.
- `F9 55…` is sent once right after the clock on connect. Its effect is unknown.
- The lamp model is detected from the advertisement: the scan record must list service `FFF0` (or `FF60`), and two bytes at scan-record offset 9–10 (hex digits 18–22) give a code. The code `5746` takes the path that uses `FB F9` / `FE F9`, which matches our lamp's frames. Whether the lamp advertises while asleep is still unknown.
- For this model the app never subscribes to FFF1 notifications (only the unrelated `SpileModel` does), so the lamp is effectively write-only. The app paces frames 500 ms apart.
- Rename: writing the ASCII text `!%!%:ADV_NAME:<name>` to FFF2 changes the advertised name. Not tested. Do not try it without a reason.
- The app stores its settings locally and writes the timer on connect, which overwrites what we send.

### Power and presets, as the app sends them (not tested from the page)

- **Power on:** `FD F1`, then `FB F9 79 DF 74 EB 55 55`, then `FE F9 00 00 24 00 00 00` (on from 00:00 to 24:00).
- **Power off:** `FB F9 00 00 00 00 55 55`.
- **Timer mode:** if the Mode Setting tab is active, the app sends the stored timer frame (`FE F9 …`); otherwise it sends `FD F2`.
- **Built-in presets**, as `FB F9 R G B UV 55 55` (names not matched yet): 
  1. `6C E3 73 EB`
  2. `A7 B9 74 EB`
  3. `79 DF 74 EB` (also the power-on color)
  4. `C1 5E BC EB`
  5. `EB 5E 94 EB`
  6. `A3 EB 70 00`
  7. `77 EB 77 00`
  8. `83 EB 85 00`
  9. `5E EB 5E 00`
  10. `59 EB 60 00`
  11. `6E EB 65 00`
  12. `7E EB 69 00`

  Presets 6–12 have UV off, presets 1–5 have it at full.
- The `TT` byte of the timer frame (`FE F9 … TT RR`) is flipped by the app's `viewAmAndPm` control. Its meaning is still unknown.

## Color frame

The documented eight-byte frame is:

```text
FB F9 R G B UV 55 55
```

Each channel is a byte from `00` through `EB`, corresponding to `0` through `100` percent. The workbench converts percentages to bytes with `round(percent * 0xEB / 100)`. The documented example for red at 25 percent is:

```text
FB F9 3B 00 00 00 55 55
```

Channel isolation sequences and equal-channel intensity comparisons use this frame. One-shot channel tests leave the value set, while sequences finish by sending zero. After waking the lamp with the official app and closing it, the user visually verified that one-shot red, green, blue, and UV commands change the emitted color. The reported appearance was brighter than expected at the encoded 25-percent level; visible brightness is not calibrated and may not be linear. A 5-percent red command was also transmitted as `FB F9 0C 00 00 00 55 55`; its visual brightness still needs a controlled observation. The workbench lets the user adjust the encoded level. Sent operations are recorded as TX entries in the traffic log; a GATT write without response does not confirm that the lamp received or acted on the command. Reports sent to the PC include the most recent traffic entries and omit the device ID.

A separate master-brightness command has not been identified and is intentionally not generated.

## Unverified fan and mode commands

The candidate fan frame is `FC XX 55 55 55 55 55 55`. The meaning and valid range of `XX` have not been verified. The UI only sends one manually entered byte per explicitly confirmed operation; do not infer a percentage scale from the byte.

Power, custom-mode, schedule, and master-brightness frames remain unverified here. Do not send schedule frames until they are understood and verified from a fresh capture.

## Hardware tests from the PC (Windows dongle + locked webcam)

Setup: Bleak on Windows over a USB dongle, with the lamp within about 30 cm. At normal distance the dongle does not see the lamp, while the phone does. The lamp's public address is `XX:XX:XX:XX:XX:XX` (redacted). A Logitech C925e watched a white wall near the lamp with white balance, exposure and gain locked, and each command was followed by an 8 s settle time. Values below are mean wall RGB (0–255), only meaningful relative to each other.

Verified on the lamp:
- Power on (`FD F1`, `FB F9 79 DF 74 EB`, `FE F9 00 00 24 00 00 00`) and power off (`FB F9 00 00 00 00`) work.
- All 12 presets give different colors. Their brightness is similar (sum 233–296).
- `FD F2` (Mode 2) changes the light. With the slots empty it is nearly dark (sum 34 against 8 when off), and `FD F1` brings the color back.
- Advanced slot 1 works: `FE F1 00 00 24 00 55 55` (window 00:00–24:00) plus `FB F1 00 00 EB 00 55 55` (blue) turns the lamp blue in Mode 2 only. Sending the same frames with zeros clears it. Slots 2–5 were not tested.
- Single-channel level curve is strongly compressive. Red at 10/25/50/75/100 % gave sums 20/58/106/136/158, blue 16/41/78/102/123, green 12/30/63/92/117.
- The webcam cannot see the UV channel (no change at any level).

Facts that remain open:
- The residual light in Mode 2 with empty slots (green about 20) may come from slots stored by the official app.
- Returning from Mode 2 to Mode 1 settled about 5 % lower than the first reading, then recovered. The lamp may ease between states.
- The lamp also exposes a service `FFC0` with characteristics `FFC1` and `FFC2` (write, write-without-response, notify). `FFF1` is readable (128 zero bytes). Their use is unknown.
- Device information: manufacturer `BEKEN SAS`, model `BK-BLE-1.0`, firmware `6.1.2`, software `6.3.0`.

### Fade measurement (PC + locked webcam)

Sunrise was set about 2 minutes ahead, sunset 23:59, and the wall brightness was sampled every 30 s. Values are camera sums (dark is about 8).
- Fade code 0: on within 12 s at 252, full by 42 s (280), then a slow drift down to 275 over 6 minutes.
- Fade code 1 (0.5 h): starts at about 55, rises in tiny steps (55.1 to 55.8) for 6 minutes, then jumped to 129 at 379 s. The ramp looks stepped, not smooth.
- Fade code 2 (1 h): starts at about 56 and stayed at 56.2–56.4 for 6.5 minutes.
So fade code 1 changes the sunrise, and the ramp starts at roughly 20 % of full output. Code 2 stayed flat for 6.5 minutes here and for 12 minutes in the overnight test (see below), so it is not confirmed to ramp within that time. Only the first 6.5 minutes were watched, so the full ramp shape and the sunset fade are still unmeasured. The timer was reset to 11:48 / 18:05, fade 0 afterwards, and the lamp was turned off.

### Passive probes (PC)

- Advertisement: service `FFF0`, manufacturer data with company ID 0x4657 (18007) and payload `00 01 C8 47 80 70 BB 07`, which is `00 01` plus the lamp's own address. No name in the advertisement (the name arrives in the scan response), no TX power, no service data.
- `FFC0` is a firmware-update service: `FFC1` has the user description "Img Identify" and `FFC2` has "Img Block" (the usual OAD image-identify and image-block pair). The official app never uses it. Do not write to it: a bad write can corrupt or brick the lamp.
- Subscribing to `FFF1`, `FFC1` and `FFC2` and then sending clock, mode, color, timer and off frames produced no notifications at all in about 50 s. `FFF1` still reads as all zeros. The Service Changed indication (`2A05`) cannot be enabled (access denied).
- Timer frame with `TT = 01` (`FE F9 22 15 23 59 01 00`): the lamp was lit before the sunrise time, which it is not with `TT = 00`, and stayed lit through the sunrise and onward (sum about 279 before and after). So `TT = 01` appears to switch the timer window off (lamp always on). This was tested once, with the window running to 23:59 only.

### Sunset fade, code 0 (PC + webcam)

Window 22:22–22:27, fade 0, sampled about every 6 s. Brightness stayed at about 276 until the sunset minute, then fell to 178 at +4 s, 21 at +10 s and 8 (dark) by +17 s. So with fade 0 the lamp ramps down over roughly 15 s after the sunset minute begins, not instantly. Fade codes 1 and later were not measured at sunset. The timer was restored to 11:48 / 18:05 and the lamp was switched off.

### Color-change delay and the green flash on power off (PC + webcam, 30 fps)

The writes returned in 1–2 ms, and the PC sent plain `FB F9 …` frames with no app involved. The lamp itself eases between colors:
- Off to preset 3 took about 16 s to settle (the wall sum rose from 10 to 308), with the light visibly rising from the first second.
- Preset 3 to off took about 15 s. The channels did not fall together: red was gone by 9 s, blue by 14 s, and green was the last to go (still 36 at 9 s, 6.5 at 14 s). So the lamp passes through green on the way to dark.
- Red to green took about 17 s: red fell and green rose together over the same period, so the ramp length is roughly fixed, not proportional to the step.
- Green to off was abrupt (under 1 s) in one run. Not explained, and not repeated.
Conclusion: the delay and the green-before-off are the lamp's own color easing, not the official app. Sending the frames faster does not help. Note: the lamp shows nothing outside its timer window, so send the always-on window (`FE F9 00 00 24 00 00 00`) first if the timer is set to a daytime window.

### Rapid color switching (PC + webcam)

Alternating pure red (`FB F9 EB 00 00 00`) and pure blue (`FB F9 00 00 EB 00`) for 8 s per step: at write intervals of 2 s, 1 s, 0.5 s, 0.25 s, 0.1 s, 0.05 s and 0.02 s, the lamp stayed red. Blue only rose to about 18 (against about 120 at full) at the 2 s and 50 ms steps. The lamp accepts the writes (up to 50 per second, none rejected) but its color easing takes about 15 s, so there is no visible flicker or party effect. The 50 ms step's larger swing was not explained. Fast strobing is not possible with the lamp's own color frames.

### FC byte is not a dimmer (PC + webcam)

With preset 3 lit, `FC 00`, `FC 3B`, `FC 76` and `FC EB` (0, 25, 50, 100%) left the wall brightness unchanged (sum 281.6, 279.9, 279.4, 279.0, drift under 1%). So `FC XX` is not a global intensity control, as the AquaLamp mockup assumed. The official app's code calls it the fan (`getFanString`, percent x 2.35), so treat it as a fan speed. The lamp had no audible or visible reaction in this test.

### Brightness calibration check (PC + webcam)

The lamp's brightness curve is compressive. Sending the raw 25/50/75% levels gave output of about 33/65/85% of full for red. After correcting with the measured per-channel curves (`MEASURED_CURVES` in `packages/controller/src/calibration.ts`), the measured output was within 1.6 points of the target:

| Channel | 25% | 50% | 75% |
|---|---|---|---|
| Red | 25.6 | 51.6 | 75.3 |
| Green | 25.3 | 50.0 | 75.9 |
| Blue | 25.1 | 50.4 | 75.5 |

UV is not calibrated (the camera cannot see it). Reproduce with `tools/hwtest/calibration_check.py`.

### Timing after setup frames (Node sidecar + webcam)

A colour frame sent right after the always-on window frame (`FE F9 00 00 24 00 00 00`) was silently dropped: red 40 never lit, while a later blue frame did. Leaving 500 ms after every setup frame, including the last, fixed it. `Lamp` now waits `frameGapMs` (default 500) after each frame of a command. Verified through the bleak sidecar: red lit, eased to blue, then power off (clock, `FD F1`, window, then colour).

## Overnight test: advanced slots and fade codes (2026-11-01)

Programmed over BLE, then BLE disconnected and the lamp ran alone while the webcam sampled the wall (`tools/hwtest/night.py`).

Advanced slots (mode 2), clock base 04:01:
- All five slots work, not only slot 1. Each window starts and ends within about 5 s of its programmed minute.
- Colour changes ease over about 15 s, including adjacent slots (red -> green -> blue) and at window ends.
- A gap between slots goes dark (about 2 s ease to off).
- Overlap: when slot 4 (11-14) overlaps slot 5 (13-17), slot 4 wins until it ends at 14, then slot 5 shows until 17. The lower slot number has priority.

Fade codes (`RR` in the timer frame), 12 min observed each:
- Codes 2, 3 and 4: output sits at a flat floor (about 52 on the camera scale) for the whole 12 min. They look identical in that span, so any ramp is slower than 12 min.
- Code 5: jumps straight to a bright level (about 276) and drifts down slowly (about 276 -> 268 in 11 min).
- Code 1: ramps in steps, about 53 -> 126 -> 185 -> 234 -> 268, reaching full in about 27 min, then flat.
- The "30 minutes per step" mapping is therefore not confirmed. Only code 1 shows a clear ramp. Codes 2-4 would need a longer observation.

## Keep-running workflow check (PC + webcam)

- In mode 1 with slots stored, a streamed colour still wins. Writing slot frames alone does not change the mode.
- In mode 2 the lamp keeps running its slots after the BLE disconnect.
- Stored slots survive off/on frames.
- The daily-window timer gates mode 1 (dark outside the window) but does not gate mode 2, so the app clips the uploaded slots to its own lamp hours instead.
- Connecting without the session setup frames (clock only) leaves a running mode-2 schedule untouched.

## Schedule compile: free dark stretches

An all-zero keyframe means lights off until the next key. Dark stretches cost no lamp slot (a gap between slots is dark), so only lit windows count toward the 5-slot limit. The app caps lit keyframes at 5 so the graph and the lamp stay in sync.

## App modes

Hardware mode (default): the playing preset is always uploaded as lamp steps (mode 2) and graphed as holds, so it keeps running with the app closed. App mode: the app streams smooth colours while open; the lamp stops following when the app closes.

## Power-off and slot-vs-colour comparison (2026-11-02)

`tools/hwtest/poweroff_schedule.py`, `tools/hwtest/mode_compare.py`.

- With a stored mode-2 slot lit, the colour-off frame alone (`FB F9` zeros) does not turn the lamp off: the wall stayed at the slot colour for 60 s. Mode 1 (`FD F1`) followed by the off frame does (wall back to dark). The app's power-off sends mode 1 then off, so it is correct.
- The same wire values sent as a mode-1 colour frame or as a slot-1 colour (00:00-24:00) give the same wall colour. Across red, green, blue (50% and 100%), white, a daily mix and 10% blue, every channel agreed within about 1-4% (the largest gap was white 50%, green 4%), and A-B-B-A order made no difference. UV is not visible to the webcam, so it is not covered.
- Both paths reach the final colour within the first sample (7-10 s after the write, which includes the BLE connect), so easing does not differ measurably between them.
- So any difference seen between hardware and app mode in the UI comes from the app side (graph, calibration, streaming against holds), not from how the lamp renders the two modes.

### Persistence and fade code 3 (2026-11-02)

- Closing the browser tab (preset 1 playing in hardware mode): wall colour steady for 60 s. The bridge ignores client closes and the app has no unload handler.
- Killing the bridge and sidecar: the lamp kept running its stored schedule (45 s watched, steady).
- Fade code 3, 50 min with the timer starting at the base time: wall sum about 6 (off) before start, then stepped plateaus rather than a smooth ramp: about 52 from 0 s, about 222 from about 7 min, about 348 from about 18 min, about 424 from about 36 min, holding to 50 min. Plateaus drift down by about 1%.
- `tools/hwtest/wall_watch.py` prints the wall colour passively.
- Not tested: a lamp power cut (needs a physical unplug), UV, fade codes 2 and 4 over long runs.
- Lamp power cut (unplugged about 55 s, replugged): the stored all-day blue slot in mode 2 came back by itself about 5 s after power returned, with no app or bridge connected. Schedules survive power loss (a window-based slot was not tested against the clock, which the lamp loses until it is set again).
