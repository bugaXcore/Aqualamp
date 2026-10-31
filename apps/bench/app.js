import { BleClient } from "./ble.js";
import { TrafficLog } from "./log.js";
import {
  buildClockFrame, buildColorFrame, buildCombinedColorFrame, buildFanFrame, buildModeFrame,
  buildPowerOffFrame, buildPowerOnFrames, buildPresetFrame, buildTimerFrame, bytesToHex, LAMP_WRITE_UUID,
} from "./protocol.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  scanAll: $("#scan-all"),
  scanPrefix: $("#scan-prefix"),
  connect: $("#connect"),
  disconnect: $("#disconnect"),
  forget: $("#forget"),
  exportReport: $("#export-report"),
  sendReport: $("#send-report"),
  reportStatus: $("#report-status"),
  testStatus: $("#test-status"),
  stopTest: $("#stop-test"),
  referenceLevel: $("#reference-level"),
  referenceLevelOutput: $("#reference-level-output"),
  testCombined: $("#test-combined"),
  fanValue: $("#fan-value"),
  sendFan: $("#send-fan"),
  syncClock: $("#sync-clock"),
  sendTimer: $("#send-timer"),
  powerOff: $("#send-power-off"),
  powerOn: $("#send-power-on"),
  mode1: $("#send-mode-1"),
  mode2: $("#send-mode-2"),
  presetSelect: $("#preset-select"),
  sendPreset: $("#send-preset"),
  timerSunrise: $("#timer-sunrise"),
  timerSunset: $("#timer-sunset"),
  timerFade: $("#timer-fade"),
  pill: $("#connection-pill"),
  connectionLabel: $("#connection-label"),
  supportNote: $("#support-note"),
  deviceName: $("#device-name"),
  deviceMeta: $("#device-meta"),
  error: $("#error-message"),
  tree: $("#gatt-tree"),
  traffic: $("#traffic-log"),
  filter: $("#traffic-filter"),
  eventCount: $("#event-count"),
};

const notificationStops = new Map();
const testButtons = [...document.querySelectorAll(".channel-test")];
const referenceButtons = [...document.querySelectorAll(".channel-reference")];
const testSteps = [0, 25, 50, 75, 100, 0];
let activeTest = null;
let connectedAt = null;

const trafficLog = new TrafficLog(renderLog);
const ble = new BleClient({
  log: trafficLog,
  onDisconnect: ({ willReconnect = false } = {}) => {
    connectedAt = null;
    setConnectionState(willReconnect ? "connecting" : "idle", willReconnect ? "Reconnecting…" : "Disconnected");
    elements.disconnect.disabled = true;
    elements.connect.disabled = !ble.device || willReconnect;
    elements.exportReport.disabled = true;
    elements.sendReport.disabled = true;
    setTestsEnabled(false);
    stopActiveTest("Disconnected; test stopped.");
    notificationStops.clear();
    renderTree([]);
  },
  onReconnect: (report) => {
    connectedAt = new Date();
    setConnectionState("connected", "Connected");
    elements.deviceMeta.textContent = `ID ${ble.device.id} · reconnected ${connectedAt.toLocaleTimeString()}`;
    elements.connect.disabled = true;
    elements.disconnect.disabled = false;
    elements.exportReport.disabled = false;
    elements.sendReport.disabled = false;
    setTestsEnabled(true);
    renderTree(report.services);
  },
});

function setConnectionState(state, label) {
  elements.pill.dataset.state = state;
  elements.connectionLabel.textContent = label;
}

function showError(error) {
  const message = `${error.name || "Error"}: ${error.message || error}`;
  elements.error.textContent = message;
  elements.error.hidden = false;
  trafficLog.add("ERR", message);
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

function setTestsEnabled(enabled) {
  const disabled = !enabled || activeTest !== null;
  for (const button of testButtons) button.disabled = disabled;
  for (const button of referenceButtons) button.disabled = disabled;
  elements.testCombined.disabled = disabled;
  elements.sendFan.disabled = disabled;
  elements.syncClock.disabled = disabled;
  elements.sendTimer.disabled = disabled;
  for (const button of commandButtons()) button.disabled = disabled;
}

function commandButtons() {
  return [elements.powerOff, elements.powerOn, elements.mode1, elements.mode2, elements.sendPreset];
}

function setTestStatus(message, state = "") {
  elements.testStatus.textContent = message;
  elements.testStatus.dataset.state = state;
}

function stopActiveTest(message = "Sequence stopped.") {
  if (!activeTest) return;
  activeTest.abort();
  activeTest = null;
  elements.stopTest.disabled = true;
  setTestsEnabled(Boolean(ble.server?.connected));
  setTestStatus(message);
}

function waitForStep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function runColorSequence(label, frameForStep) {
  if (!ble.server?.connected) {
    setTestStatus("Connect to the lamp before running a test.", "error");
    return;
  }
  if (activeTest) return;
  const controller = new AbortController();
  activeTest = controller;
  elements.stopTest.disabled = false;
  setTestsEnabled(true);
  setTestStatus(`${label}: starting…`);
  try {
    for (let index = 0; index < testSteps.length; index += 1) {
      if (controller.signal.aborted) break;
      const percent = testSteps[index];
      await ble.write(LAMP_WRITE_UUID, frameForStep(percent), true);
      if (controller.signal.aborted) break;
      setTestStatus(`${label}: ${percent}% (${index + 1}/${testSteps.length})`);
      if (index < testSteps.length - 1) await waitForStep(900, controller.signal);
    }
    if (!controller.signal.aborted) setTestStatus(`${label}: sequence complete.`, "success");
  } catch (error) {
    setTestStatus(`${label} failed: ${error.message || error}`, "error");
    showError(error);
  } finally {
    if (activeTest === controller) {
      activeTest = null;
      elements.stopTest.disabled = true;
      setTestsEnabled(Boolean(ble.server?.connected));
    }
  }
}

function renderLog(entries) {
  const filter = elements.filter.value;
  const visible = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);
  elements.traffic.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "Waiting for a device operation…";
    elements.traffic.append(empty);
  } else {
    for (const entry of visible) {
      const row = document.createElement("div");
      row.className = "log-entry";
      const time = document.createElement("span");
      time.className = "log-time";
      time.textContent = new Date(entry.time).toLocaleTimeString();
      const kind = document.createElement("span");
      kind.className = "log-kind";
      kind.dataset.kind = entry.kind;
      kind.textContent = entry.kind;
      const message = document.createElement("span");
      message.className = "log-message";
      message.textContent = entry.message;
      row.append(time, kind, message);
      elements.traffic.append(row);
    }
    elements.traffic.scrollTop = elements.traffic.scrollHeight;
  }
  elements.eventCount.textContent = `${entries.length} event${entries.length === 1 ? "" : "s"}`;
}

function renderTree(services) {
  elements.tree.replaceChildren();
  if (!services.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const glyph = document.createElement("span");
    glyph.className = "empty-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "⌁";
    const text = document.createElement("p");
    text.textContent = "Connect to the lamp to inspect its services.";
    empty.append(glyph, text);
    elements.tree.append(empty);
    return;
  }

  for (const service of services) {
    const group = document.createElement("details");
    group.className = "service";
    group.open = service.uuid.toLowerCase() === "0000fff0-0000-1000-8000-00805f9b34fb";
    const summary = document.createElement("summary");
    const serviceName = document.createElement("span");
    serviceName.className = "service-name";
    serviceName.textContent = service.name;
    const serviceUuid = document.createElement("span");
    serviceUuid.className = "uuid";
    serviceUuid.textContent = service.uuid;
    summary.append(serviceName, serviceUuid);
    group.append(summary);

    for (const characteristicData of service.characteristics) {
      const item = document.createElement("div");
      item.className = "characteristic";
      const head = document.createElement("div");
      head.className = "characteristic-head";
      const name = document.createElement("span");
      name.className = "characteristic-name";
      name.textContent = characteristicData.name;
      head.append(name);
      item.append(head);
      const uuid = document.createElement("span");
      uuid.className = "uuid";
      uuid.textContent = characteristicData.uuid;
      item.append(uuid);
      const props = document.createElement("div");
      props.className = "props";
      props.textContent = characteristicData.properties.join(" · ") || "No supported properties";
      item.append(props);
      const controls = document.createElement("div");
      controls.className = "char-actions";

      if (characteristicData.properties.includes("read")) {
        const read = actionButton("Read", async () => {
          const value = await ble.read(characteristicData.uuid);
          setValue(item, value);
        });
        controls.append(read);
      }
      if (characteristicData.properties.includes("notify") || characteristicData.properties.includes("indicate")) {
        const subscribe = actionButton("Subscribe", async (button) => {
          if (notificationStops.has(characteristicData.uuid)) {
            await notificationStops.get(characteristicData.uuid)();
            notificationStops.delete(characteristicData.uuid);
            button.textContent = "Subscribe";
            button.classList.remove("is-on");
          } else {
            const stop = await ble.subscribe(characteristicData.uuid, (value) => setValue(item, value));
            notificationStops.set(characteristicData.uuid, stop);
            button.textContent = "Unsubscribe";
            button.classList.add("is-on");
          }
        });
        controls.append(subscribe);
      }
      item.append(controls);

      if (characteristicData.properties.includes("write") || characteristicData.properties.includes("writeWithoutResponse")) {
        const row = document.createElement("div");
        row.className = "write-row";
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", `Hex bytes to write to ${characteristicData.uuid}`);
        input.placeholder = "Hex bytes, e.g. FB F9 3B 00 00 00 55 55";
        const write = actionButton("Write", async () => {
          const bytes = parseHex(input.value);
          if (bytes.length > 0 && (bytes[0] === 0xfd || ![0xfb, 0xfc, 0xff].includes(bytes[0]))) {
            if (!window.confirm("This is an unverified or schedule frame. Send it anyway?")) return;
          }
          const withoutResponse = characteristicData.properties.includes("writeWithoutResponse")
            && !characteristicData.properties.includes("write");
          await ble.write(characteristicData.uuid, bytes, withoutResponse);
        });
        row.append(input, write);
        item.append(row);
      }

      if (characteristicData.descriptors.length) {
        const descriptorText = document.createElement("div");
        descriptorText.className = "props";
        descriptorText.textContent = `Descriptors: ${characteristicData.descriptors.map((descriptor) => descriptor.uuid).join(", ")}`;
        item.append(descriptorText);
      }
      group.append(item);
    }
    elements.tree.append(group);
  }
}

function actionButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-button";
  button.textContent = label;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await action(button);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function setValue(container, value) {
  let output = container.querySelector(".value-output");
  if (!output) {
    output = document.createElement("div");
    output.className = "value-output";
    container.append(output);
  }
  output.textContent = `Value: ${value || "(empty)"}`;
}

function parseHex(input) {
  const normalized = input.trim().replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
    throw new Error("Enter complete hexadecimal bytes, for example: FB F9 3B 00 00 00 55 55");
  }
  return Uint8Array.from(normalized.match(/.{2}/g), (pair) => Number.parseInt(pair, 16));
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function scan(mode) {
  clearError();
  try {
    await ble.requestDevice(mode);
    const device = ble.device;
    elements.deviceName.textContent = device.name || "Unnamed Bluetooth device";
    elements.deviceMeta.textContent = `ID ${device.id}`;
    elements.connect.disabled = false;
    elements.forget.disabled = false;
  } catch (error) {
    showError(error);
  }
}

elements.scanAll.addEventListener("click", () => scan("all"));
elements.scanPrefix.addEventListener("click", () => scan("prefix"));
elements.connect.addEventListener("click", async () => {
  clearError();
  setConnectionState("connecting", "Connecting…");
  elements.connect.disabled = true;
  try {
    const report = await ble.connect();
    connectedAt = new Date();
    setConnectionState("connected", "Connected");
    elements.deviceMeta.textContent = `ID ${ble.device.id} · connected ${connectedAt.toLocaleTimeString()}`;
    elements.disconnect.disabled = false;
    elements.exportReport.disabled = false;
    elements.sendReport.disabled = false;
    setTestsEnabled(true);
    renderTree(report.services.map((service) => ({
      ...service,
      characteristics: service.characteristics.map((characteristic) => ({
        ...characteristic,
        properties: characteristic.properties,
      })),
    })));
  } catch (error) {
    setConnectionState("idle", "Not connected");
    elements.connect.disabled = false;
    showError(error);
  }
});
elements.disconnect.addEventListener("click", () => ble.disconnect().catch(showError));
elements.forget.addEventListener("click", () => {
  if (ble.device?.gatt?.connected) ble.device.gatt.disconnect();
  ble.device?.removeEventListener("gattserverdisconnected", ble.handleDisconnect);
  ble.device = null;
  ble.server = null;
  ble.services = [];
  ble.characteristics.clear();
  ble.report = null;
  elements.deviceName.textContent = "No device selected";
  elements.deviceMeta.textContent = "A device name and ID will appear here.";
  elements.connect.disabled = true;
  elements.disconnect.disabled = true;
  elements.forget.disabled = true;
  elements.exportReport.disabled = true;
  elements.sendReport.disabled = true;
  setTestsEnabled(false);
  stopActiveTest("Selected device cleared.");
  setConnectionState("idle", "Not connected");
  renderTree([]);
  trafficLog.add("EVT", "Selected device forgotten for this page session.");
});
elements.exportReport.addEventListener("click", () => {
  if (!ble.report) return;
  download("aqualamp-gatt-report.json", JSON.stringify(ble.report, null, 2), "application/json");
});
elements.sendReport.addEventListener("click", async () => {
  if (!ble.report) return;
  elements.sendReport.disabled = true;
  elements.reportStatus.dataset.state = "";
  elements.reportStatus.textContent = "Sending report to this PC…";
  try {
    const report = {
      exportedAt: ble.report.exportedAt,
      device: { name: ble.report.device.name },
      services: ble.report.services,
      traffic: trafficLog.entries.slice(-2000),
    };
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Receiver returned HTTP ${response.status}`);
    elements.reportStatus.dataset.state = "success";
    elements.reportStatus.textContent = `Saved on PC as ${result.file}`;
    trafficLog.add("EVT", `GATT report sent to PC and saved as ${result.file}.`);
  } catch (error) {
    elements.reportStatus.dataset.state = "error";
    elements.reportStatus.textContent = `Report not sent: ${error.message || error}. Start the PC receiver with npm start.`;
    showError(error);
  } finally {
    elements.sendReport.disabled = false;
  }
});
for (const button of referenceButtons) {
  button.addEventListener("click", async () => {
    if (!ble.server?.connected) return;
    for (const referenceButton of referenceButtons) referenceButton.disabled = true;
    const channel = button.dataset.channel;
    const percent = Number(elements.referenceLevel.value);
    try {
      await ble.write(LAMP_WRITE_UUID, buildColorFrame(channel, percent), true);
      setTestStatus(`Sent ${channel} ${percent}%. This write has no lamp acknowledgement; the value stays set until another command or power cycle.`, "success");
    } catch (error) {
      setTestStatus(`${channel} reference write failed: ${error.message || error}`, "error");
      showError(error);
    } finally {
      for (const referenceButton of referenceButtons) {
        referenceButton.disabled = !ble.server?.connected || activeTest !== null;
      }
    }
  });
}
elements.referenceLevel.addEventListener("input", () => {
  const percent = Number(elements.referenceLevel.value);
  elements.referenceLevelOutput.value = `${percent}%`;
  for (const button of referenceButtons) {
    const name = { R: "Red", G: "Green", B: "Blue", UV: "UV" }[button.dataset.channel];
    button.textContent = `${name} ${percent}%`;
  }
});
for (const button of testButtons) {
  button.addEventListener("click", () => {
    const channel = button.dataset.channel;
    void runColorSequence(`${channel} channel`, (percent) => buildColorFrame(channel, percent));
  });
}
elements.testCombined.addEventListener("click", () => {
  void runColorSequence("All channels", buildCombinedColorFrame);
});
elements.stopTest.addEventListener("click", () => stopActiveTest());
elements.syncClock.addEventListener("click", async () => {
  const now = new Date();
  try {
    await ble.write(LAMP_WRITE_UUID, buildClockFrame(now.getHours(), now.getMinutes(), now.getSeconds()), true);
    setTestStatus(`Clock sent: ${now.toLocaleTimeString()}.`, "success");
  } catch (error) {
    setTestStatus(`Clock sync failed: ${error.message || error}`, "error");
    showError(error);
  }
});
elements.sendTimer.addEventListener("click", async () => {
  const parse = (value) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : null;
  };
  const sunrise = parse(elements.timerSunrise.value);
  const sunset = parse(elements.timerSunset.value);
  if (!sunrise || !sunset) {
    setTestStatus("Enter both sunrise and sunset times.", "error");
    return;
  }
  if (sunset.hours * 60 + sunset.minutes <= sunrise.hours * 60 + sunrise.minutes) {
    setTestStatus("Sunset must be later than sunrise. The lamp probably ignores an inverted window.", "error");
    return;
  }
  const now = new Date();
  const fade = Number(elements.timerFade.value);
  const windowMinutes = sunset.hours * 60 + sunset.minutes - (sunrise.hours * 60 + sunrise.minutes);
  if (fade > 0 && windowMinutes <= fade * 60) {
    setTestStatus(`The official app only allows this fade when the on-window is longer than ${fade * 60} minutes.`, "error");
    return;
  }
  const frame = buildTimerFrame(sunrise, sunset, fade);
  const label = `${elements.timerSunrise.value} / ${elements.timerSunset.value}, fade code ${fade}`;
  if (!window.confirm(`Send timer ${label}? The phone time is ${now.toLocaleTimeString()}. This writes the timer frame decoded from captures and is not yet confirmed.`)) return;
  elements.sendTimer.disabled = true;
  try {
    await ble.write(LAMP_WRITE_UUID, buildClockFrame(now.getHours(), now.getMinutes(), now.getSeconds()), true);
    await ble.write(LAMP_WRITE_UUID, frame, true);
    setTestStatus(`Timer ${label} sent. Check the official app to confirm.`, "success");
  } catch (error) {
    setTestStatus(`Timer send failed: ${error.message || error}`, "error");
    showError(error);
  } finally {
    elements.sendTimer.disabled = !ble.server?.connected;
  }
});
async function sendCommand(label, frames) {
  const hex = frames.map(bytesToHex).join("\n");
  if (!window.confirm(`Send ${label}? Frames taken from the official app's code, not yet confirmed:\n${hex}`)) return;
  for (const button of commandButtons()) button.disabled = true;
  try {
    for (const [index, frame] of frames.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 500));
      await ble.write(LAMP_WRITE_UUID, frame, true);
    }
    setTestStatus(`${label} sent. Note what the lamp did.`, "success");
  } catch (error) {
    setTestStatus(`${label} failed: ${error.message || error}`, "error");
    showError(error);
  } finally {
    const enabled = Boolean(ble.server?.connected) && activeTest === null;
    for (const button of commandButtons()) button.disabled = !enabled;
  }
}
elements.powerOff.addEventListener("click", () => void sendCommand("Power off", [buildPowerOffFrame()]));
elements.powerOn.addEventListener("click", () => void sendCommand("Power on (also overwrites the timer)", buildPowerOnFrames()));
elements.mode1.addEventListener("click", () => void sendCommand("Mode 1", [buildModeFrame(1)]));
elements.mode2.addEventListener("click", () => void sendCommand("Mode 2", [buildModeFrame(2)]));
elements.sendPreset.addEventListener("click", () => {
  const preset = Number(elements.presetSelect.value);
  void sendCommand(`Preset ${preset}`, [buildPresetFrame(preset - 1)]);
});
elements.sendFan.addEventListener("click", async () => {
  const rawValue = elements.fanValue.value.trim();
  if (!/^[\da-f]{2}$/i.test(rawValue)) {
    setTestStatus("Enter one raw fan byte as two hex digits (00–FF).", "error");
    return;
  }
  const value = Number.parseInt(rawValue, 16);
  const frame = buildFanFrame(value);
  if (!window.confirm(`Fan command mapping is unknown. Send FC ${rawValue.toUpperCase()} 55 55 55 55 55 55 once? Stop if the lamp behaves unexpectedly.`)) return;
  elements.sendFan.disabled = true;
  try {
    await ble.write(LAMP_WRITE_UUID, frame, true);
    setTestStatus(`Sent candidate fan value FC ${rawValue.toUpperCase()}. Its meaning is not verified.`, "success");
  } catch (error) {
    setTestStatus(`Fan probe failed: ${error.message || error}`, "error");
    showError(error);
  } finally {
    elements.sendFan.disabled = !ble.server?.connected;
  }
});
elements.filter.addEventListener("change", () => renderLog(trafficLog.entries));
$("#copy-log").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(trafficLog.asText());
    trafficLog.add("EVT", "Traffic log copied to clipboard.");
  } catch (error) {
    showError(error);
  }
});
$("#download-log").addEventListener("click", () => {
  download("aqualamp-traffic.json", trafficLog.asJson(), "application/json");
});
$("#clear-log").addEventListener("click", () => trafficLog.clear());

if (!("bluetooth" in navigator)) {
  elements.supportNote.textContent = "Web Bluetooth is not available here.";
  elements.scanAll.disabled = true;
  elements.scanPrefix.disabled = true;
} else if (!window.isSecureContext) {
  elements.supportNote.textContent = "HTTPS required for Bluetooth access.";
  elements.scanAll.disabled = true;
  elements.scanPrefix.disabled = true;
} else {
  elements.supportNote.textContent = "Bluetooth ready · select a device after tapping Scan.";
}
