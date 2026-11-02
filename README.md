# AquaLamp

Controller for a **Week Aqua S300 Pro** aquarium lamp: a web UI that talks to the lamp either through a local bridge or straight from the browser over Web Bluetooth.

```
apps/web (default)  → WebSocket → apps/bridge → Lamp → SidecarTransport → Python bleak → lamp
apps/web ?transport=ble ───────────────────────→ Lamp → WebBluetoothTransport ──────────→ lamp
apps/cli ──────────────────────────────────────→ Lamp → SidecarTransport / MockTransport
```

`Lamp` (in `packages/controller`) owns the protocol: the connect sequence, latest-wins colour writes, power, modes, timer, the five-slot schedule and reconnects. A `LampTransport` only moves 8-byte frames. Protocol findings are in [docs/research/PROTOCOL.md](docs/research/PROTOCOL.md).

## Quick start (mock, no hardware)

```powershell
copy .env.example .env
npm install
npm run build -w @aqualamp/controller
npm run bridge        # terminal 1: ws://127.0.0.1:8787, mock by default
npm run web           # terminal 2: open the printed URL and click Connect
```

## Real lamp

The lamp allows one connection. Disconnect the official app, your phone and any other Chrome tab first, and keep the PC within about 30 cm.

**Option A: bridge with the Python sidecar** (works on Windows and Linux)

```powershell
pip install bleak
$env:AQUALAMP_MOCK="0"
npm run bridge
```

`LIGHT_ADDRESS` is optional. Without it the sidecar scans for a lamp named `B3.0-…`.

**Option B: Web Bluetooth from the browser** (Chrome or Edge on localhost or HTTPS)

```powershell
npm run web
```

Open `http://127.0.0.1:<port>/?transport=ble`, click Connect and pick the lamp in Chrome's chooser. No bridge or Python is needed.

**Phone (Chrome on Android)**

Pushes to `main` deploy the web app to GitHub Pages (`.github/workflows/pages.yml`; enable it once under Settings → Pages → Source: GitHub Actions). Open `https://<user>.github.io/Aqualamp/` on the phone: any page not served from localhost uses Web Bluetooth automatically (`?transport=bridge` or `?transport=ble` forces one). Turn on Location, allow Nearby devices, close the official app, then tap Connect. Use Chrome's menu → Install app to add it to the home screen. Without Pages, `adb reverse tcp:5173 tcp:5173` and `http://localhost:5173/?transport=ble` also works.

**CLI**

```powershell
npm run cli -- --red 40 --green 20 --blue 80 --uv 10   # mock unless AQUALAMP_MOCK=0
npm run cli -- --on
npm run cli -- --off
```

## Project layout

| Path | Role |
|------|------|
| `packages/controller` | `Lamp`, frame builders, calibration, schedule compiler, transports (no UI imports) |
| `apps/web` | Vite + React + Tailwind UI |
| `apps/bridge` | WebSocket bridge and `/health` |
| `apps/cli` | Command-line adapter |
| `apps/bench` | Standalone Web Bluetooth bench page used for the research |
| `tools/bleak-sidecar` | Python BLE sidecar used by the bridge and CLI |
| `tools/hwtest` | Hardware test scripts (webcam brightness rig, timing, slots, fades) |
| `docs/research` | Reverse-engineered protocol and measurements |

## Config

See `.env.example`.

| Variable | Purpose |
|----------|---------|
| `AQUALAMP_MOCK` | `1` simulates the lamp (default). `0` uses the sidecar |
| `LIGHT_ADDRESS` | Lamp address. Optional, the sidecar scans if unset |
| `BRIDGE_PORT` / `BRIDGE_HOST` | Bridge bind (default `127.0.0.1:8787`) |
| `AQUALAMP_RECONNECT_ATTEMPTS` | Retries after an unexpected drop (default 3) |
| `AQUALAMP_CALIBRATED` | Start with brightness correction on |
| `VITE_BRIDGE_WS` | UI override of the bridge URL |

## Tests

```powershell
npm test                      # controller (frames, Lamp, calibration, schedule, bridge, sidecar)
npm test -w aqualamp-bench    # bench page
```

Hardware scripts need the lamp and are run by hand, for example `python -u tools\hwtest\calibration_check.py`. They need `bleak` and `opencv-python`, and a webcam pointed at the wall.

## Bridge protocol (JSON over WebSocket)

Client → server: `connect`, `disconnect`, `setChannels`, `power {on}`, `setMode {mode}`, `setTimer {sunrise, sunset, fade}`, `setSchedule {windows}`, `setCalibrated {on}`, `getStatus`.
Server → client: `hello`, `state`, `channels`, `error`.

## What works, and how sure we are

Verified on a real S300 Pro (B3.0, firmware 6.1.2) with a locked webcam rig. Details and numbers are in [PROTOCOL.md](docs/research/PROTOCOL.md).

| Area | Status |
| --- | --- |
| Colour control (R, G, B) with brightness calibration | Verified |
| UV channel | Frames sent and accepted; the webcam can't see UV, so calibration is unverified |
| Power on and off | Verified |
| Five-slot schedule, keeps running after the BLE disconnect (PC test) | Verified |
| Same schedule after closing a phone browser tab, or after a lamp power cut | Not tested yet |
| Sunrise/sunset timer and fade codes | Library only, not in the UI. Code 0 and 1 verified; codes 2–4 stayed at a dim floor for 12 minutes, so any ramp is slower; code 5 jumps to bright |
| Fan frame (`FC`) | Sent, no visible or audible effect; the S300 Pro may not have a fan |
| The lamp's 12 built-in presets | Frames known and different, names unknown, not in the UI |
| Other Week Aqua lamp families | Not supported |
| iOS | Not supported directly (Safari has no Web Bluetooth); use the PC bridge |

The protocol work combines Bluetooth captures, hardware measurements and a read of the official Android app's frame builder for interoperability only. No code from the app is in this repository.

AquaLamp is an independent project. It is not affiliated with or endorsed by Week Aqua.

## License

[MIT](LICENSE)

## Planned

More than one lamp (the transports already take a lamp id), a Raspberry Pi bridge, and mobile packaging.
