# AquaLamp UI: component and behaviour spec

This describes **what each part of the interface is for and how it behaves**. It deliberately says nothing about how it should look. Layout, colour, type, spacing, motion, iconography and copy tone are all open for redesign. Keep the behaviour, state rules and constraints, or change them on purpose.

Source: `apps/web/src` (React, TypeScript). The current look is not part of this spec.

---

## 1. What the product is

A controller for a **Week Aqua S300 Pro** aquarium lamp. The lamp has four light channels: **Red, Green, Blue, UV** (each 0–100 %). The user can:

- set a colour mix live,
- play a **day preset**, a named lighting plan for 24 hours,
- compose their own presets,
- send a preset to the lamp so it runs it on its own,
- use the lamp's built-in power, mode and daily-window controls.

Two audiences, one UI: desktop browser and phone browser. Later, **more than one lamp** will be supported (see §10). Nothing multi-lamp is built yet.

## 2. Facts about the lamp that shape the UI

These come from hardware testing and should be visible in the design wherever they matter.

| Fact | Consequence for the UI |
|---|---|
| The lamp **eases** to every new colour over about 15 s. | Changes look delayed. Users need to know this is the lamp, not the app. A one-line note exists today. |
| Turning off passes briefly through green. | Normal. Worth a short note near power. |
| The lamp accepts **one connection at a time**. | If the phone app or another tab is connected, this app cannot connect. The connect screen must say so. |
| The radio is weak: about 30 cm from a PC adapter. | Connect failures are usually range. The connect screen must say so. |
| In its "daily window" mode the lamp is **dark outside the window**. | The app resets the window to all day on every connect so colours are visible. The user can then set a real window. |
| The lamp has **five schedule slots**, each one fixed colour for one time window. | A smooth 24 h curve can only be sent as up to five steps. The UI must say this where presets are sent to the lamp. |
| Brightness is uneven across the slider range. | Optional "even brightness" correction exists. |

## 3. Two ways the app reaches the lamp

The UI is identical in both; only the connect step and error wording differ.

- **Bridge:** the browser talks to a small local server that holds the Bluetooth link. The page can be closed and reopened without dropping the lamp. Default.
- **Browser Bluetooth:** the browser talks to the lamp directly (`?transport=ble`). Needs Chrome or Edge on localhost or HTTPS. The browser shows its own device chooser, which the app cannot style or skip.

Both expose the same interface to the UI:

```
state: disconnected | scanning | connecting | connected | error
channels {red, green, blue, uv}   (0-100, what was last sent)
mode: 1 | 2        calibrated: boolean        mock: boolean
error: string | null               bridgeError: string | null
socketOpen: boolean (bridge reachable / browser supports Bluetooth)
connect()  disconnect()  setChannels(partial)
power(on)  setMode(1|2)  setTimer(sunrise, sunset, fade)
setSchedule(windows)  setCalibrated(on)
```

`mock` means no real lamp, a simulated one. The UI must always show when it is mock.

## 4. Screens and states

There are two top-level states.

1. **Not connected.** Only the connect experience (§5.1) and the status indicator.
2. **Connected.** The control surface (§5.3–5.8).

Within connected, the user is always in exactly one **selection** and one **session**:

- **Selection:** which preset is selected. There is always a "Sliders mode" entry, the default.
- **Session:** **Playing** (read-only, following the clock) or **Composing** (editing a draft).

The session is Composing only when the user has chosen New, Duplicate or Edit on a preset. Selecting a different preset ends composing.

## 5. Components

### 5.1 Connect screen
**Purpose:** get from "nothing" to "connected" and make failure recoverable.
- A primary **Connect** action.
- Disabled while connecting or scanning (label becomes a progress wording) and while the bridge/Bluetooth is unavailable.
- While the bridge is being reached and no error exists, a small "Reaching bridge…" note.
- **Error text** turns a raw failure into an instruction. Mapping today:
  - not found / no devices → "No lamp found. Close the official app, power-cycle the lamp and move it closer."
  - user cancelled the chooser → "No lamp was selected. Click Connect and pick the lamp named B3.0-…"
  - GATT / network / timeout → "The lamp did not answer. It may be connected to another device, or too far away."
  - anything else → shown as is.
- A **Retry** action next to a live error.
- A short **checklist** of preconditions, with different wording per access method (§3):
  - close the official app and switch off phone Bluetooth (one connection only),
  - keep the lamp close (about 30 cm from a PC adapter),
  - browser mode only: use Chrome or Edge on localhost or HTTPS.
- A one-line product tagline.
- **Automatic reconnect:** after an unexpected drop the app retries up to three times (2 s, 4 s, 6 s). During this, state shows connecting. After the last failure, state is error with the reason. The UI should show that retrying is happening, and when it has stopped. Today it only shows the state change.

### 5.2 Status indicator
Always visible. Shows state (disconnected / scanning / connecting / connected / error) and a **mock** marker when simulated. Connected state has a **Disconnect** action beside it.

### 5.3 Status line / hint
A single line of context, shown when connected, that explains the current mode. Examples of what it says today:
- Sliders mode: sliders drive the lamp anytime.
- Playing a preset: read-only, shows the time being played.
- Built-in preset: read-only, Duplicate to edit.
- Composing: what the sliders will edit (constant levels, or the key at the cursor time), and whether there are unsaved changes.

A **"Next · …" chip** appears when a scheduled preset is selected, naming the next event ("Next · Sunrise 06:30", "Next · Sunset done 20:00", or a key's label).

### 5.4 Channel sliders (the live mix)
Four controls: Red, Green, Blue, UV. Each is 0–100, integer, shows its value as a percentage.
- **Sliders mode:** always editable. Moving one sends a colour to the lamp.
- **Playing a preset:** locked. They are telemetry: they show the colour the preset currently produces.
- **Composing a constant preset:** edit the preset's single mix.
- **Composing a scheduled preset:** edit the **key at the cursor**. If there is no key at the cursor time, moving a slider **creates one** there.
- **Built-in preset (not Sliders mode):** locked.
- Locked state must be unmistakable and should explain why (see §5.3).

Writing rule: only the **latest** value is ever sent; the lamp is never sent a backlog. Repeating the same colour sends nothing.

A one-line note says the lamp takes ~15 s to ease to a new colour.

### 5.5 Header power and Settings: lamp behaviour
There is no "Lamp controls" group any more.

- **Power:** a header icon. Off sends all channels to zero and ends any lamp-run schedule; on restores the lamp (the official app's default colour, then the app resumes the playing preset).
- **Lamp mode (Settings):** *Hardware* (default) or *App*, with a short pros/cons note for the selected mode only.
  - *Hardware:* the playing preset is uploaded automatically as at most five lamp steps and the graph is drawn as steps. It keeps running with the app closed.
  - *App:* the app streams smooth colours while open; the lamp stops following when the app closes. The Smooth/Sharp curve option only appears in this mode.
- **Even brightness (Settings):** a toggle. When on, what is sent to the lamp differs from slider values (the curve is corrected so 50 % looks half as bright). The explanation must say that.
- **Background animation (Settings):** a checkbox that turns the koi pond on or off; when on, a cog opens a floating tuning panel (Settings closes so the pond is visible).
- **Key limit:** only lit keyframes count, at most 5 ("n of 5 keys" counter). An all-zero key means lights off until the next key and costs no lamp slot. Built-ins and over-limit user presets are simplified to 5 on Duplicate or first edit (Undo restores).
### 5.6 Day presets panel
A list of presets plus creation. Each preset has: **name**, **mode** (constant or schedule), **snap** (free minutes or whole hours, schedule only), optional **description**.

Preset kinds:
- **Sliders mode:** always first. Not a real preset; it is the "live mix" state. Cannot be duplicated, deleted or edited as a preset.
- **Built-ins:** a small fixed library (a 24 h cycle, a UV-heavy low-light mix, a high-contrast red mix, a neutral photography mix, a dim night-viewing mix). Read-only. They can be **duplicated** into an editable copy.
- **User presets:** created with **New**, or by duplicating. Stored in the browser (local storage) and survive reloads. Not synced anywhere.

Row actions (shown on the selected row, or on hover on pointer devices; they must be reachable on touch):
- select (starts playing the preset),
- **duplicate** (not for Sliders mode),
- **edit** (user presets only; enters composing),
- **delete** (user presets only),
- inline **rename** (user presets).

While composing, the selected row also offers:
- **Save**, offered only when there are unsaved changes,
- **Cancel**, or **Discard** if the preset was already saved and has unsaved changes,
- mode switch: constant / schedule,
- snap switch: free / hours (schedule only).

Each row shows a small preview of the preset's colour mix. A row with unsaved changes should be marked.

Behaviour rules:
- Selecting a preset ends any other compose session. Unsaved drafts are kept in memory so they are not lost until saved or discarded.
- A new unsaved preset that is cancelled disappears.
- Deleting the selected preset clears the selection.
- Selecting a preset immediately pushes its colour for "now" to the lamp (constant: its mix; schedule: the interpolated colour at the current time).

### 5.7 24-hour timeline
The centre of the preset experience. Shows one preset over a day, 00:00 to 24:00, with the four channel curves.

**Always shown:** title, a session badge (Playing / Composing), the current cursor time, a hint line (explains what is possible right now), and the hour scale.

**Cursor ("CTI", current time indicator):**
- *Playing:* follows the real clock, updated every second, cannot be moved. The colour for that moment is computed and sent to the lamp each tick; unchanged colours are not re-sent.
- *Composing:* the user places it by clicking or dragging on the timeline. Placing it sends the colour for that time to the lamp as a live preview.

**Keys (keyframes)** (scheduled presets only): a point in time with a colour. Between keys the colour is smoothly interpolated, and the curve wraps from the last key of the day to the first key of the next. Keys are:
- drawn on the timeline with their time,
- selectable, which moves the cursor to them and loads their colour,
- draggable in time (respecting snap),
- added at the cursor with an *Add key* action, which takes the current interpolated colour,
- removed with a *Delete key* action, enabled only when a key is selected or sits exactly on the cursor,
- editable through a small floating **key editor** that appears when a key is active: a time field (24 h text, commits on blur or Enter; invalid input is ignored), the key's label if it has one, and the four channel sliders (compact).
- The key editor must stay on screen near the cursor wherever the cursor is.

**Constant presets** have no keys and no curves to edit; the timeline shows the flat mix, and the sliders edit it.

**Locked states:** built-ins and playback do not allow edits. Scrubbing in a locked built-in still previews; keys cannot be written.

**Description block:** shows the preset's description. When composing a user preset it is an editable multi-line field with a placeholder; otherwise read-only and hidden if empty.

### 5.8 Solar assist (sunrise/sunset helper)
Available only while composing a **scheduled** preset. A small strip with two entries: **Sunrise** and **Sunset**. Each opens a form to create or edit a **linked ramp**: a pair of keys, start and end, that make a smooth sunrise or sunset.
- Fields: start time, duration (slider, 30–120 min, 5 min steps, shows the resulting end time), and either *use adjacent/curve levels* (default for a new ramp) or explicit *From %* and *To %* for R, G, B, UV (0–100).
- A ramp that already exists opens pre-filled, and is shown as "linked" on the timeline.
- **Apply** writes the key pair (replacing any existing ramp of that kind) and moves the cursor to the start. **Close** discards the form. Changes are drafts until the preset is saved.
- On the timeline, a linked ramp has **drag handles** on its start and end. Dragging keeps the duration within 30–120 min.
- Defaults when new: sunrise 06:30 from off to a day mix; sunset 19:00 from a day mix to off.

### 5.9 Error banner
Any current error from the connection or a command is shown in the connected view as plain text. Errors should say what happened and what to do, not apologise. (Command errors today: not connected, a bad schedule, a refused frame.)

## 6. Rules the UI must respect

1. **Latest wins.** The lamp is slow; never queue colours. Dragging a slider fast sends the final value, not every step.
2. **No pointless writes.** An unchanged colour is not resent.
3. **Playing is read-only.** The clock drives the lamp; users cannot move the cursor or sliders, except in Sliders mode.
4. **Nothing built-in is editable.** Offer duplicate.
5. **Save is explicit** for presets. Unsaved changes are visible and recoverable until discarded.
6. **Connecting is not destructive.** Connecting does not blank a lamp that is already lit; the first colour is only sent once the user sets one or a preset starts playing.
7. **Locks need reasons.** Whenever something is unavailable (locked sliders, disabled save), the user must be told why.
8. **Disconnect leaves the lamp as is.** It keeps its last colour or its sent schedule.

## 7. Playing a preset vs. sending it to the lamp

These are two different things; the UI should make the difference clear.

| | Play (the app drives it) | Send to lamp (the lamp drives it) |
|---|---|---|
| Who runs the schedule | This app, one colour update per second | The lamp's own clock |
| Needs the app open | **Yes** (a closed tab or lost link stops it) | **No** |
| Smoothness | Smooth curve (the lamp eases between updates) | Up to five steps |
| Resolution | Any key count | Five windows maximum, 15-minute grid |
| Mode of lamp | Daily window (all day) | Advanced |

## 8. Data the UI works with

```
Channels   { red, green, blue, uv }            0-100 integers
Keyframe   { id, minutes (0-1439), channels, label?, ramp?: sunrise|sunset, rampRole?: start|end }
DayPreset  { id, name, description?, mode: constant|schedule, constantChannels,
             keyframes[], snap: free|hour, builtin? }
ScheduleWindow { startMin, endMin (1440 = 24:00), channels }   // what "Send to lamp" sends, 1-5 of them
Time       { hours, minutes }                   // daily window on/off
```

User presets are stored locally as a versioned blob. Built-ins live in code and are never stored.

## 9. Known gaps and open questions for the redesign

- **Reconnect visibility:** retries are silent. Decide how the user is told "trying again (2 of 3)".
- **Lamp-side schedule status:** the app cannot read back what the lamp is running (the lamp is write-only). After "Send to lamp" the UI can only show what it last sent, not confirm it. Decide how to show "last sent at …" without implying certainty.
- **Disconnected-but-running:** after sending a schedule, the lamp runs on its own. The UI could say so on the connect screen.
- **Even brightness** changes the meaning of slider numbers. Needs a clear, non-technical explanation and probably a visible indicator whenever it is on.
- **Fade options** on the daily window are unconfirmed beyond the first step. Either hide the higher steps or mark them experimental.
- **UV is not brightness-corrected**; only R, G and B are.
- **Per-lamp state:** nothing today. See §10.
- **Touch:** several actions appear on hover today. Everything must work on touch.
- **Accessibility:** timeline keys and drag handles need keyboard operation; locked controls need an announced reason.
- **Slow feedback:** because of the 15 s ease, consider showing the *intended* colour and the *expected* colour separately.
- **Mobile layout:** the timeline editor is the hardest part to fit on a phone. Decide what is essential there (probably view and play; compose on larger screens).

## 10. Planned: multiple lamps (design for it, do not build it)

The transport layer already takes a lamp id. The UI will eventually need:
- A **first-connect page** that lists nearby or known lamps (name, address, last seen, connection state) and lets the user pick one, add one, rename it, and forget it.
- A **lamp switcher** once connected, with per-lamp state: connection, current mix, mode, last-sent schedule.
- Possibly **groups** (apply a mix or a preset to several lamps).
- Presets stay global; what a lamp is running is per-lamp.
- The connect screen's guidance ("one connection per lamp", "move it closer") applies per lamp.

Today there is exactly one lamp and no lamp-selection UI. Keep the layout able to take a lamp switcher in the header and a lamp list as the first screen.
