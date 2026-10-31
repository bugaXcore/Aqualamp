import { bytesToHex, describeUuid, getCharacteristicProperties, UUIDS } from "./protocol.js";

export class BleClient {
  constructor({ bluetooth = navigator.bluetooth, log, onDisconnect = () => {}, onReconnect = () => {} } = {}) {
    this.bluetooth = bluetooth;
    this.log = log;
    this.onDisconnect = onDisconnect;
    this.onReconnect = onReconnect;
    this.device = null;
    this.server = null;
    this.services = [];
    this.characteristics = new Map();
    this.queue = Promise.resolve();
    this.report = null;
    this.everConnected = false;
  }

  async requestDevice(mode) {
    if (!this.bluetooth) throw new Error("Web Bluetooth is unavailable in this browser.");
    const options = {
      optionalServices: UUIDS.optionalServices,
      ...(mode === "prefix"
        ? { filters: [{ namePrefix: "B3.0-" }] }
        : { acceptAllDevices: true }),
    };
    const device = await this.bluetooth.requestDevice(options);
    this.setDevice(device);
    this.log.add("EVT", `Selected ${device.name || "unnamed device"}.`);
    return device;
  }

  setDevice(device) {
    if (this.device) this.device.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    this.device = device;
    this.device.addEventListener("gattserverdisconnected", this.handleDisconnect);
  }

  handleDisconnect = () => {
    const shouldReconnect = this.everConnected;
    this.everConnected = false;
    this.server = null;
    this.services = [];
    this.characteristics.clear();
    this.report = null;
    this.log.add("EVT", "GATT server disconnected.");
    this.onDisconnect({ willReconnect: shouldReconnect });
    if (shouldReconnect) void this.reconnect();
  };

  async connect() {
    if (!this.device) throw new Error("Select a device first.");
    this.log.add("EVT", `Connecting to ${this.device.name || this.device.id}.`);
    try {
      this.server = await this.device.gatt.connect();
      this.everConnected = true;
      this.log.add("EVT", "GATT connection established.");
      await this.discover();
      return this.report;
    } catch (error) {
      this.log.add("ERR", `${error.name || "Error"}: ${error.message || error}`);
      throw error;
    }
  }

  async disconnect() {
    if (this.device?.gatt?.connected) {
      this.everConnected = false;
      this.device.gatt.disconnect();
    }
  }

  async reconnect() {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (!this.device) return;
      this.log.add("EVT", `Automatic reconnect attempt ${attempt} of ${maxAttempts}.`);
      try {
        this.server = await this.device.gatt.connect();
        const report = await this.discover();
        this.everConnected = true;
        this.log.add("EVT", "Automatic reconnect succeeded.");
        this.onReconnect(report);
        return;
      } catch (error) {
        this.server = null;
        this.log.add("ERR", `Reconnect ${attempt} failed: ${error.name || "Error"}: ${error.message || error}`);
      }
    }
    this.log.add("ERR", "Automatic reconnect stopped after 3 attempts. Use Connect to try again.");
    this.onDisconnect({ willReconnect: false });
  }

  async discover() {
    if (!this.server?.connected) throw new Error("Connect to a device before discovering services.");
    this.log.add("EVT", "Discovering allowed GATT services.");
    this.services = await this.server.getPrimaryServices();
    this.characteristics.clear();
    const report = [];
    for (const service of this.services) {
      const serviceData = { uuid: service.uuid, name: describeUuid(service.uuid), characteristics: [] };
      this.log.add("EVT", `Service: ${serviceData.name} (${service.uuid}).`);
      const characteristics = await service.getCharacteristics();
      for (const characteristic of characteristics) {
        this.characteristics.set(characteristic.uuid, characteristic);
        const charData = {
          uuid: characteristic.uuid,
          name: describeUuid(characteristic.uuid),
          properties: getCharacteristicProperties(characteristic.properties),
          descriptors: [],
        };
        try {
          const descriptors = await characteristic.getDescriptors();
          charData.descriptors = descriptors.map((descriptor) => ({
            uuid: descriptor.uuid,
            name: describeUuid(descriptor.uuid),
          }));
        } catch (error) {
          if (error.name !== "NotFoundError") {
            charData.descriptorError = `${error.name || "Error"}: ${error.message || error}`;
            this.log.add("ERR", `Descriptor discovery for ${characteristic.uuid}: ${charData.descriptorError}`);
          }
        }
        serviceData.characteristics.push(charData);
      }
      report.push(serviceData);
    }
    this.report = {
      exportedAt: new Date().toISOString(),
      device: { name: this.device.name || null, id: this.device.id },
      services: report,
    };
    this.log.add("EVT", `Discovery complete: ${report.length} service(s).`);
    return this.report;
  }

  characteristic(uuid) {
    const characteristic = this.characteristics.get(uuid);
    if (!characteristic) throw new Error(`Characteristic ${uuid} is no longer available.`);
    return characteristic;
  }

  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  read(uuid) {
    return this.enqueue(async () => {
      const value = await this.characteristic(uuid).readValue();
      const hex = bytesToHex(value);
      this.log.add("RX", hex || "(empty)", { uuid });
      return hex;
    });
  }

  write(uuid, data, withoutResponse = false) {
    return this.enqueue(async () => {
      const characteristic = this.characteristic(uuid);
      if (withoutResponse) {
        if (!characteristic.properties.writeWithoutResponse) throw new Error("This characteristic does not allow writes without response.");
        await characteristic.writeValueWithoutResponse(data);
      } else {
        if (!characteristic.properties.write) throw new Error("This characteristic does not allow writes with response.");
        await characteristic.writeValueWithResponse(data);
      }
      this.log.add("TX", `${bytesToHex(data)} (${withoutResponse ? "without response" : "with response"})`, { uuid });
    });
  }

  async subscribe(uuid, callback) {
    const characteristic = this.characteristic(uuid);
    const handler = (event) => {
      const hex = bytesToHex(event.target.value);
      this.log.add("RX", hex || "(empty)", { uuid });
      callback(hex);
    };
    characteristic.addEventListener("characteristicvaluechanged", handler);
    try {
      await characteristic.startNotifications();
      this.log.add("EVT", `Notifications started for ${uuid}.`);
      return async () => {
        characteristic.removeEventListener("characteristicvaluechanged", handler);
        await characteristic.stopNotifications();
        this.log.add("EVT", `Notifications stopped for ${uuid}.`);
      };
    } catch (error) {
      characteristic.removeEventListener("characteristicvaluechanged", handler);
      throw error;
    }
  }
}
