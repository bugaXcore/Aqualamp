# AquaLamp wiring handoff spec

**Audience:** agent wiring BLE / bridge / host (not UI polish).  
**Repo checkout:** `F:\Projects\AquaLamp\` · branch `cursor/compact-sliders-presets-3cd5` (or whatever is currently checked out with the running UI).  
**Policy:** local-only git; **do not push / open GitHub PRs** unless Stav asks. Prefer Pi+BlueZ for live lamp; keep PC UI on mock until live smoke passes.

---

> **Superseded in part (2026-11).** This is the original handoff and is kept for context. The wiring it describes was done differently, after hardware testing:
> - The bridge no longer uses noble or `WeekAquaController` (both removed). It runs `Lamp` over a Python `bleak` sidecar, and the browser can use Web Bluetooth.
> - "Windows GATT is blocked" is wrong. Windows works with `bleak` and with Chrome Web Bluetooth. The lamp's radio is weak, so keep it within about 30 cm.
> - `FC XX` is not a global intensity dimmer. Brightness did not change across 0–100%. It is the fan.
> - The lamp is dark outside its timer window in mode 1, so every connect sends clock, `FD F1` and an all-day window.
>
> Current protocol and measurements: `docs/research/PROTOCOL.md`. Current usage: `README.md`.

---

## 1. Product one-liner

AquaLamp is a local control stack for a **Week Aqua S300 Pro** aquarium light: day-preset schedules + live R/G/B/UV mix via a web UI → WebSocket bridge → BLE host (or mock).

---

## 2. Repo layout

| Path | Role for wiring |
|------|-----------------|
| `F:\Projects\AquaLamp\packages\controller\` | `WeekAquaController`, `encodeChannels` / `encodePowerFrame`, protocol constants |
| `F:\Projects\AquaLamp\packages\controller\src\protocol.ts` | GATT IDs, CustomMode/Power frames, scale, `PROTOCOL_CAPTURES_READY` |
| `F:\Projects\AquaLamp\packages\controller\src\WeekAquaController.ts` | Scan → connect → GATT discover → write-without-response |
| `F:\Projects\AquaLamp\packages\controller\src\types.ts` | `Channels` `{red,green,blue,uv}` 0–100; connection states |
| `F:\Projects\AquaLamp\packages\controller\docs\protocol.md` | Repo mirror of protocol notes |
| `F:\Projects\AquaLamp\apps\bridge\src\index.ts` | WS + `/health`; thin adapter over one controller |
| `F:\Projects\AquaLamp\apps\cli\src\index.ts` | One-shot `setChannels` CLI |
| `F:\Projects\AquaLamp\apps\web\` | Vite React UI (already polished; do not redesign) |
| `F:\Projects\AquaLamp\apps\web\src\hooks\useBridge.ts` | Client WS contract |
| `F:\Projects\AquaLamp\apps\web\src\lib\presets.ts` | Day presets / localStorage / Sliders mode |
| `F:\Projects\AquaLamp\scripts\live-cli.ps1` | Forces live env + rebuild + CLI Red write |
| `F:\Projects\AquaLamp\scripts\scan-lamp.ps1` | Noble scan helper (Windows) |
| `F:\Projects\AquaLamp\.env` / `.env.example` | Mock default + MAC/UUIDs |
| `F:\Projects\AquaLamp\files\captures\` | HCI capture folders + reports |

Workspaces: `@aqualamp/controller`, `@aqualamp/bridge`, `@aqualamp/cli`, `@aqualamp/web`.

---

## 3. How to run today

### Mock (everyday on aqualamp-pc)

```powershell
cd F:\Projects\AquaLamp
# .env already has AQUALAMP_MOCK=1
npm install
npm run build -w @aqualamp/controller

# Terminal 1
npm run bridge
# → AquaLamp bridge listening on ws://127.0.0.1:8787 (mock=true)

# Terminal 2
npm run web
# → http://127.0.0.1:5173
```

UI: open `http://127.0.0.1:5173` → **Connect** → drag R/G/B/UV. UI talks **only** to the bridge.

### Ports / URLs

| Service | Default |
|---------|---------|
| Web (Vite) | `http://127.0.0.1:5173` (`apps/web/vite.config.ts`) |
| Bridge WS | `ws://127.0.0.1:8787` |
| Bridge health | `GET http://127.0.0.1:8787/health` → `{ ok, state, mock }` |
| UI override | `VITE_BRIDGE_WS` (optional) |

### Env vars

| Variable | Meaning | Typical |
|----------|---------|---------|
| `AQUALAMP_MOCK` | `1` = no radio (default) | `1` on PC |
| `LIGHT_ADDRESS` | Lamp MAC | `C8:47:80:70:BB:07` |
| `SERVICE_UUID` | GATT service | `0000fff0-0000-1000-8000-00805f9b34fb` |
| `CHARACTERISTIC_UUID` | Write char | `0000fff2-0000-1000-8000-00805f9b34fb` |
| `BRIDGE_HOST` / `BRIDGE_PORT` | Bind | `127.0.0.1` / `8787` |
| `AQUALAMP_AUTO_RECONNECT` | Bridge defaults **on** if unset; CLI off unless `1` | |
| `AQUALAMP_CONNECT_TIMEOUT_MS` | Per-attempt GATT connect | `12000` |
| `AQUALAMP_ALLOW_HARDWARE` | Legacy/live force (`live-cli.ps1` sets `1`) | |
| `VITE_BRIDGE_WS` | Web client WS URL | unset → `ws://127.0.0.1:8787` |

### Scripts

| Command | Use |
|---------|-----|
| `npm run bridge` / `dev:bridge` | Start bridge |
| `npm run web` / `dev:web` | Start UI |
| `npm run cli -- --red 25 --green 0 --blue 0 --uv 0` | One-shot channels |
| `npm test` | Controller tests |
| `powershell -File scripts\live-cli.ps1 -Red 25` | Live one-shot (forces live env) |
| `powershell -File scripts\scan-lamp.ps1` | Scan for MAC |
| `npm run capture` | Android HCI capture + parse |

---

## 4. Architecture

```
apps/web ──WebSocket JSON──► apps/bridge ──► WeekAquaController ──► BLE (noble) ──► S300 Pro
apps/cli  ─────────────────────────────────► WeekAquaController ──► BLE / mock
```

| Layer | Mock today | Real target |
|-------|------------|-------------|
| Web UI | Done; drives `setChannels` | Unchanged |
| Bridge | Runs with `AQUALAMP_MOCK=1` | Same process with mock=0 **or** bridge on Pi |
| Controller | Instant fake connect + channel echo | `@abandonware/noble` scan/connect/write |
| BLE host | None on PC (Windows GATT blocked) | **Raspberry Pi + BlueZ** (recommended) |
| Lamp | Phone Week Aqua still works | Same MAC / CustomMode writes |

**Schedule is app-side only** — the lamp does not store AquaLamp keyframes. Playback = UI (or future host scheduler) repeatedly calling `setChannels` from the host clock.

**Power frame** (`fc …`) is encoded in controller but **not** exposed on the bridge API today (`UNKNOWN` whether wiring agent should add `setPower`).

---

## 5. Channel / API contract

### HTTP

| Endpoint | Response |
|----------|----------|
| `GET /health` | `{ "ok": true, "state": ConnectionState, "mock": boolean }` |
| Other paths | `404` text |

CORS: `Access-Control-Allow-Origin: *` on HTTP responses.

### WebSocket

- URL: `ws://127.0.0.1:8787` (or `VITE_BRIDGE_WS`)
- Framing: one JSON object per message
- On connect, server immediately sends `hello`

#### Client → server

| `type` | Body | Behavior |
|--------|------|----------|
| `connect` | `{}` | `controller.connect()` |
| `disconnect` | `{}` | `controller.disconnect()` |
| `setChannels` | `{ channels: Partial<Channels> }` | Merge + write (or mock update) |
| `getStatus` | `{}` | Reply with `hello` snapshot |

Legacy alias in channel objects: `white` → treated as `uv` (controller + web normalizers).

#### Server → client

| `type` | Fields |
|--------|--------|
| `hello` | `state`, `channels`, `mock` |
| `state` | `state`, `mock` |
| `channels` | `channels` |
| `error` | `message` (string) |

#### `Channels` (app units)

| Field | Range | Unit | Notes |
|-------|-------|------|-------|
| `red` | 0–100 | integer % | CustomMode R |
| `green` | 0–100 | integer % | CustomMode G |
| `blue` | 0–100 | integer % | CustomMode B |
| `uv` | 0–100 | integer % | CustomMode UV (was interim “white”) |

Clamped with `Math.round` on write path.

#### `ConnectionState`

`disconnected` | `scanning` | `connecting` | `connected` | `error`

#### Write semantics (important)

- `setChannels` **requires** `state === "connected"` or bridge returns `error` (`Not connected — call connect()…`).
- Writes are **serialized** on a promise chain inside the controller.
- Hardware write: **write-without-response** (`writeAsync(buf, true)`).
- UI in **playback** (non-compose) pushes full channel objects ~1 Hz from interpolated schedule.
- **Sliders mode** pushes on user drag / on connect.

#### Example messages

```json
{ "type": "connect" }
```

```json
{ "type": "setChannels", "channels": { "red": 25, "green": 0, "blue": 0, "uv": 0 } }
```

```json
{ "type": "hello", "state": "connected", "channels": { "red": 25, "green": 0, "blue": 0, "uv": 0 }, "mock": false }
```

**Not in bridge today:** `setPower`, timeline/play commands, preset sync, Fan. Timeline play is entirely client-side.

---

## 6. BLE / protocol

### Device

| Item | Value | Confidence |
|------|-------|------------|
| Name | `B3.0-S300pro-03` | High |
| MAC | `C8:47:80:70:BB:07` | High |
| Address type | often **random** in ads | High |
| Phone app | `com.weekled.weekaquas` | High |
| Service | `0xFFF0` / `0000fff0-0000-1000-8000-00805f9b34fb` | High |
| Write char | `0xFFF2` @ ATT handle `0x0010` | High |
| Notify char | `0xFFF1` | High (not required for color write) |
| Write props | write-without-response (`0x04`) | High |

### Frames

| Intent | Layout | Scale |
|--------|--------|-------|
| CustomMode channels | `fb f9 <R> <G> <B> <UV> 55 55` | app 0–100 → wire 0–235 |
| Power (global) | `fc <level> 55 55 55 55 55 55` | same scale; **independent** of CustomMode |

**Formula:** `wire = round(pct * 235 / 100)` · `CHANNEL_WIRE_MAX = 235` · `0xeb` = 100%.

#### Red ladder (Capture #3) — acceptance targets

| App % | R byte | Payload |
|------:|--------|---------|
| 0 | `0x00` | `fb f9 00 00 00 00 55 55` |
| 25 | `0x3b` | `fb f9 3b 00 00 00 55 55` |
| 50 | `0x76` | `fb f9 76 00 00 00 55 55` |
| 75 | `0xb0` | `fb f9 b0 00 00 00 55 55` |
| 100 | `0xeb` | `fb f9 eb 00 00 00 55 55` |

Repo: `PROTOCOL_CAPTURES_READY = true` in `protocol.ts`.

### UNKNOWN / TODO (protocol)

| Item | Status |
|------|--------|
| Fan opcode | **UNKNOWN** — no ATT frames in captures; likely unused on fanless S-series |
| Companion frames (`fe f9`, `fd f1`, `ff 12`, …) | Observed; **UNKNOWN** if required for session |
| Live visual confirm of PC/Pi write | **TODO** — not yet succeeded from aqualamp-pc |
| On-lamp day schedule frames | **UNKNOWN** / out of scope — AquaLamp schedules are host-side |
| Power via bridge/UI | Encoded only; **TODO** if product needs it |

### Windows BLE status (closed path)

Tried and failed on aqualamp-pc:

- CSR 4.0 + noble → scan OK, **GATT connect hang**
- UGreen CM749 + noble → phantom connect / service discover timeout / no Red write
- WinRT `FromBluetoothAddress` / GetGattServices → **GATT Unreachable**
- PairAsync → failed; BLE Explorer never lists lamp; nRF Connect Desktop init error

**Do not grind Windows GATT further** unless Stav explicitly says go.

### Recommended live path — Pi + BlueZ

Follow store doc `pi-bluez-live-smoke.md` (summary):

1. Pi near lamp; onboard BT **or** move CM749 to Pi (prefer USB2).
2. Phone BT **off**; Week Aqua force-closed.
3. Install BlueZ + build tools; `npm install`; build controller.
4. Env:

```bash
export AQUALAMP_MOCK=0
export AQUALAMP_ALLOW_HARDWARE=1
export AQUALAMP_AUTO_RECONNECT=0
export AQUALAMP_CONNECT_TIMEOUT_MS=12000
export LIGHT_ADDRESS=C8:47:80:70:BB:07
export SERVICE_UUID=0000fff0-0000-1000-8000-00805f9b34fb
export CHARACTERISTIC_UUID=0000fff2-0000-1000-8000-00805f9b34fb
```

5. Scan for HIT (`c8:47:80:70:bb:07`, `fff0`, `connectable:true`).
6. `npm run cli -- --red 25 --green 0 --blue 0 --uv 0` → expect dim red; payload `fb f9 3b 00 00 00 55 55`.

After smoke: run **live bridge on Pi** (or tunnel to PC UI). Keep aqualamp-pc everyday `.env` on `AQUALAMP_MOCK=1` until intentionally flipped.

---

## 7. Presets & timeline model

### Storage

| Key | `aqualamp.dayPresets.v3` (browser localStorage) |
|-----|--------------------------------------------------|
| Shape | `{ version: 3, presets: DayPreset[] }` |
| Contents | **User presets only** — builtins are code, never persisted |

### `DayPreset`

| Field | Notes |
|-------|-------|
| `id`, `name`, `description?` | |
| `mode` | `"constant"` \| `"schedule"` |
| `constantChannels` | Used when `mode === "constant"` |
| `keyframes[]` | Schedule points |
| `snap` | `"free"` \| `"hour"` |
| `interpolation` | `"linear"` (ease applied in `interpolateAt`) |
| `builtin?` | Hardcoded library flag |

### `Keyframe`

| Field | Notes |
|-------|-------|
| `id` | |
| `minutes` | 0–1439 from midnight |
| `channels` | R/G/B/UV 0–100 |
| `label?` | e.g. `"Sunrise"` |
| `ramp?` | `"sunrise"` \| `"sunset"` (linked assist) |
| `rampRole?` | `"start"` \| `"end"` |

Ramps A/B: compose assist in `apps/web/src/lib/ramps.ts` (duration 30–120 min, default 60). Linked pairs tagged on keyframes.

### Sliders mode vs named presets

| Preset | ID | Behavior |
|--------|-----|----------|
| **Sliders mode** | `builtin-free-manual` | Default selection; top R/G/B/UV always editable; **not** composition-locked; Duplicate **hidden** on this row; no FREE pill |
| Other builtins | `builtin-*` | Read-only looks; Duplicate → user copy to compose |
| User presets | UUID | New / Duplicate / Edit → **compose intent** |

**Naming rule:** call it **Sliders mode**, never “Free mix”.

### Compose vs playing (no EDIT/LIVE chrome)

| State | How entered | CTI | Sliders | Bridge traffic |
|-------|-------------|-----|---------|----------------|
| **Playing** | Default; after Save/Cancel | Wall clock (~1s tick) | Locked for day presets; open in Sliders mode | Playback pushes `setChannels` from `interpolateAt` |
| **Composing** | New / Duplicate / Edit on **user** preset (`composeIntentId`) | Free scrub + HUD | Edit keyframe/constant channels | Compose does **not** auto-drive schedule playback |

There is **no** EDIT|LIVE toggle in the UI.

---

## 8. UI surfaces that depend on live wire

These already call the bridge; they light up for real when mock=0 and GATT works:

| Surface | Depends on |
|---------|------------|
| Header **Connect** / status chip | `connect` → `state` / `hello` / `mock` flag |
| R/G/B/UV sliders (Sliders mode) | `setChannels` on drag |
| Selecting a constant builtin while connected | Playback writes that mix |
| Schedule playback | Periodic `setChannels` from clock CTI |
| Bridge error banner | WS down or `error` messages |
| Mix wash / ribbon | Local preview (works offline); lamp follows only if writes succeed |

**Does not need new UI for first live win:** CLI Red 25 on Pi is enough proof; then point bridge at live controller.

---

## 9. Out of scope for the wiring agent

- UI redesign / compact layout / HUD polish (done)
- Renaming **Sliders mode** or restoring FREE pill / Duplicate on that row
- Wishlist features (PAR, master dimmer UI, scenes, multi-lamp, HA) — see gap doc
- GitHub remotes, push, PRs unless Stav asks
- Further Windows WinRT/Explorer/nRF grinding as the primary path
- Capturing new phone HCI unless Fan/companion frames become blocking

---

## 10. Acceptance checklist

Smoke proving **real** lamp control end-to-end:

1. [ ] Phone BT off; Week Aqua force-closed; lamp powered near Pi (or agreed host).
2. [ ] Host: BlueZ up; noble loads; `AQUALAMP_MOCK=0` + MAC/UUIDs set.
3. [ ] Scan HIT: MAC `C8:47:80:70:BB:07`, service `fff0`, `connectable: true`.
4. [ ] CLI: `npm run cli -- --red 25 --green 0 --blue 0 --uv 0` completes without GATT timeout.
5. [ ] Wire bytes match `fb f9 3b 00 00 00 55 55` (encoder / logs).
6. [ ] **Visual:** lamp leaves prior color → **dim red ~25%**.
7. [ ] Optional off: `--red 0` → `fb f9 00 00 00 00 55 55`, lamp dark/near-off.
8. [ ] Bridge on live host: `GET /health` → `{ ok: true, mock: false }`; WS `connect` → `state: connected`.
9. [ ] UI (or WS client) `setChannels` Red 100 → lamp bright red (`… eb …`); Green/Blue/UV spot-checks.
10. [ ] (Stretch) Leave UI on schedule playback 1–2 minutes; lamp visibly tracks curve (host clock).

PC mock UI may stay on `:5173` + mock bridge until step 8–9; networking (Pi bridge URL / tunnel) is a wiring decision — document what you chose.

---

## 11. Known blockers & decisions

| Topic | Decision / status |
|-------|-------------------|
| Windows GATT (CSR / CM749 / WinRT) | **Blocked** — prefer Pi + BlueZ |
| Smart App Control | Previously blocked Cursor agent tooling on aqualamp-pc; see `unblock-cursor-agent.md` if tooling fails again |
| Everyday PC `.env` | Keep `AQUALAMP_MOCK=1` until live bridge is intentional |
| Protocol gate | `PROTOCOL_CAPTURES_READY = true` — not a UUID blocker |
| Live write confirmation | Still **TODO** visually from this stack |
| Git | **Local-only**; no push unless asked |
| UI copy | **Sliders mode**; intent compose; no EDIT/LIVE |
| Fan / companions / Power-in-bridge | Open unknowns — do not block first Red-25 smoke |
| AL-2 / AL-9 | Queued product tasks: live channel write once GATT connects; Pi BlueZ host |

---

## 12. Pointers

### Store docs (Project store)

Absolute Windows base:

`C:\Users\bugas\AppData\Local\Cursor\AgentStores\cursor_agent_stores\bc-c60d5f05-ca4d-4eb0-854e-5524d1b9bb8c\files\`

Cursor-style paths:

| Doc | Path |
|-----|------|
| This handoff | `/cursor/stores/bc-c60d5f05-ca4d-4eb0-854e-5524d1b9bb8c/docs/wiring-handoff-spec.md` |
| Protocol summary | `…/docs/protocol.md` |
| Phase 0 from HCI | `…/docs/phase-0-from-logs.md` |
| Live BLE test (Windows history) | `…/docs/live-ble-test.md` |
| Connection methods tried | `…/docs/ble-connection-methods.md` |
| CM749 resume (closed) | `…/docs/ble-resume-cm749.md` |
| **Pi BlueZ smoke** | `…/docs/pi-bluez-live-smoke.md` |
| Feature gap | `…/docs/feature-gap-vs-wishlist.md` |
| Improvement plan | `…/docs/improvement-plan.md` |
| Mockup / compose model | `…/docs/mockup-next-p1.md` |
| Timeline UX | `…/docs/timeline-keyframe-ux.md` |
| Unblock agent (SAC) | `…/docs/unblock-cursor-agent.md` |
| S300 research | `…/docs/s300pro-research.md` |
| CM749 evidence | `…/media/ble-resume-cm749-result.md` |

### Key source files (absolute)

- `F:\Projects\AquaLamp\README.md`
- `F:\Projects\AquaLamp\.env.example`
- `F:\Projects\AquaLamp\packages\controller\src\protocol.ts`
- `F:\Projects\AquaLamp\packages\controller\src\WeekAquaController.ts`
- `F:\Projects\AquaLamp\packages\controller\src\types.ts`
- `F:\Projects\AquaLamp\packages\controller\src\index.ts`
- `F:\Projects\AquaLamp\apps\bridge\src\index.ts`
- `F:\Projects\AquaLamp\apps\cli\src\index.ts`
- `F:\Projects\AquaLamp\apps\web\src\hooks\useBridge.ts`
- `F:\Projects\AquaLamp\apps\web\src\lib\bridge.ts`
- `F:\Projects\AquaLamp\apps\web\src\lib\presets.ts`
- `F:\Projects\AquaLamp\apps\web\src\lib\ramps.ts`
- `F:\Projects\AquaLamp\apps\web\src\App.tsx`
- `F:\Projects\AquaLamp\scripts\live-cli.ps1`
- `F:\Projects\AquaLamp\scripts\scan-lamp.ps1`

### Captures

- `F:\Projects\AquaLamp\files\captures\20261017-125735\` (Red ladder)
- `F:\Projects\AquaLamp\files\captures\20261017-123537\` (UV / Power)
- `F:\Projects\AquaLamp\files\captures\manual-20261017-121500\` (UUIDs + RGB)

### Repo mirror of this handoff (optional)

`F:\Projects\AquaLamp\docs\wiring-handoff-spec.md`

---

## First actions for the wiring agent

1. Read this doc + `pi-bluez-live-smoke.md` + `protocol.ts`.
2. Bring up Pi (or Linux) host; do **not** start on Windows GATT.
3. Pass CLI Red-25 visual smoke (§10 steps 1–6).
4. Run bridge with `AQUALAMP_MOCK=0` on that host; verify `/health` + WS `connect`/`setChannels`.
5. Point UI `VITE_BRIDGE_WS` (or tunnel) at live bridge; Connect + Sliders mode drag = end-to-end.
6. Only then consider schedule playback reliability, Power API, Fan, or companion frames.
