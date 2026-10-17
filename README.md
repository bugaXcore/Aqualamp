# AquaLamp

Local control stack for a **Week Aqua S300 Pro** aquarium light: BLE controller, CLI, WebSocket bridge, and a modern web UI.

```
apps/web  →  WebSocket  →  apps/bridge  →  WeekAquaController  →  BLE (or mock)
apps/cli  ──────────────────────────────→  WeekAquaController
```

**Phase 0 (advanced):** MAC + GATT UUIDs (`FFF0` / `FFF2`) and CustomMode R/G/B sample frames are known from a full HCI snoop. **0–100 scaling, UV, Fan, and Power mapping are still missing.** Keep **mock mode** (`AQUALAMP_MOCK=1`, the default) until Capture #2 fills those gaps.

## Prerequisites (Windows)

- Node.js 20+ and npm
- No Bluetooth hardware required for the mock demo
- For **capturing real light commands**: an Android phone, USB cable, and [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) (`adb`) — or use `files\platform-tools\adb.exe` if present

## Capture light commands (beginner)

You already have the lamp **connected in the Week Aqua phone app**. We need to record what the app sends when you move the sliders. You do **not** need to understand Bluetooth.

HCI snoop should stay **Enabled**. Between each step below, pause ~3 seconds. Prefer **Custom Mode** (not presets).

### Capture #1 — done

CustomMode R / G / B switches → recovered `fb f9 RR GG BB XX 55 55` samples and UUIDs. Report under `files\captures\manual-20261017-121500\`.

### Capture #2 — goals (do this next)

Stay in **Custom Mode**. One channel family at a time. Note the step number if you jot anything down.

1. **Red mid-levels (scaling):** set G=B=UV=0, Fan=0, Power=100 (or default). Then Red → **25**, wait → **50**, wait → **75**, wait → **100**, wait. (Optional: Red → **0** at the end.)
2. **UV-only:** set R=G=B=0. UV → **0**, wait → **100**, wait. (Optional: UV → **50** in the middle.)
3. **Fan 0 vs 100:** with a fixed simple color (e.g. Red 50, others 0), Fan → **0**, wait → **100**, wait. (On S-series Fan may do nothing visually — still move the slider so we see the bytes.)
4. **Power sweeps at fixed RGB:** set a fixed CustomMode color (e.g. R=50, G=0, B=0, UV=0, Fan=0). Then Power → **25**, wait → **50**, wait → **75**, wait → **100**, wait. (Optional: Power → **0**.)

Then pull logs (script or manual bugreport) and parse.

### Exact commands (PowerShell)

From `F:\Projects\AquaLamp`:

```powershell
cd F:\Projects\AquaLamp
npm install
npm run capture
```

That single command runs capture + parse. Follow the **Capture #2** checklist above (the on-screen script list may be shorter — prefer this README). Press Enter when finished.

You can also capture **manually**: Developer options → Bluetooth HCI snoop log ON → do the moves → share a bugreport ZIP into `files\captures\<folder>\` → `npm run capture:parse`.

Reports land in:

```text
F:\Projects\AquaLamp\files\captures\<timestamp>\capture-report.md
```

### Phone setup (once)

1. On the phone: **Settings → About phone** → tap **Build number** 7 times (enables Developer options).
2. **Settings → Developer options → USB debugging** = ON.
3. **Enable Bluetooth HCI snoop log** = ON (needed for full frames).
4. Plug USB into this PC. On the phone, tap **Allow** if asked.
5. Optional check: `adb devices` should show one line ending with `device`.

If `adb` is missing, put Platform Tools in `files\platform-tools\` (so `adb.exe` is there), or install system-wide and add to PATH.

### Optional: nRF Connect (UUIDs only)

**nRF Connect** is a free app from Nordic Semiconductor on the Play Store. It is **not** required — UUIDs (`FFF0`/`FFF1`/`FFF2`) are already known from Capture #1.

### Split commands (if needed)

```powershell
npm run capture:android   # checklist + pull logs only
npm run capture:parse     # parse latest folder into capture-report.md
```

## Mock end-to-end (Windows)

From the repo root:

```powershell
copy .env.example .env
npm install
npm run build -w @aqualamp/controller
```

**Terminal 1 — bridge**

```powershell
$env:AQUALAMP_MOCK="1"
npm run bridge
```

You should see: `AquaLamp bridge listening on ws://127.0.0.1:8787 (mock=true)`.

**Terminal 2 — web UI**

```powershell
npm run web
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Click **Connect**, then dial Red / Green / Blue / White (0–100). The UI talks only to the bridge.

**CLI smoke (optional)**

```powershell
$env:AQUALAMP_MOCK="1"
npm run cli -- --red 40 --green 20 --blue 80 --white 10
```

## Project layout

| Path | Role |
|------|------|
| `packages/controller` | `WeekAquaController` + `encodeChannels` (no CLI/UI imports) |
| `apps/cli` | Thin CLI adapter |
| `apps/bridge` | WebSocket + `/health` JSON |
| `apps/web` | Vite + React + TypeScript + Tailwind UI |

## Config

See `.env.example`:

| Variable | Purpose |
|----------|---------|
| `AQUALAMP_MOCK` | `1` = simulate BLE (default for local demo) |
| `LIGHT_ADDRESS` | Device MAC (**BLOCKER** for real BLE) |
| `SERVICE_UUID` / `CHARACTERISTIC_UUID` | GATT ids (**BLOCKER**) |
| `BRIDGE_PORT` / `BRIDGE_HOST` | Bridge bind (default `127.0.0.1:8787`) |
| `AQUALAMP_AUTO_RECONNECT` | Bridge defaults on; CLI off unless set |
| `VITE_BRIDGE_WS` | Optional UI override (default `ws://127.0.0.1:8787`) |

## Real BLE (Linux control box)

1. Paste hex captures and set `PROTOCOL_CAPTURES_READY = true` in `packages/controller/src/protocol.ts`.
2. Set real `LIGHT_ADDRESS`, `SERVICE_UUID`, `CHARACTERISTIC_UUID` in `.env`.
3. Set `AQUALAMP_MOCK=0`.
4. Install BlueZ; ensure the adapter is up. `@abandonware/noble` typically needs capabilities / permissions on Linux (e.g. run with appropriate access to the HCI device).
5. macOS/Windows BLE via noble is less reliable than Linux — prefer a Linux box for hardware control.

Real mode fails loudly while placeholders or empty protocol tables remain.

## Tests

```powershell
npm test
```

## Bridge protocol (JSON)

Client → server: `connect` | `disconnect` | `setChannels` | `getStatus`  
Server → client: `hello` | `state` | `channels` | `error`
