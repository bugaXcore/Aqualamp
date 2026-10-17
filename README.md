# AquaLamp

Local control stack for a **Week Aqua S300 Pro** aquarium light: BLE controller, CLI, WebSocket bridge, and a modern web UI.

```
apps/web  →  WebSocket  →  apps/bridge  →  WeekAquaController  →  BLE (or mock)
apps/cli  ──────────────────────────────→  WeekAquaController
```

**Phase 0 (partial):** phone logs identified MAC `C8:47:80:70:BB:07` (`B3.0-S300pro-03`) and raw 3-byte write frames, but **service/characteristic UUIDs and channel mapping are still missing**. Keep **mock mode** (`AQUALAMP_MOCK=1`, the default) until those are filled.

## Prerequisites (Windows)

- Node.js 20+ and npm
- No Bluetooth hardware required for the mock demo

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
