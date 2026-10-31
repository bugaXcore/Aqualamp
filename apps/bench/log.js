export class TrafficLog {
  constructor(onChange = () => {}) {
    this.entries = [];
    this.onChange = onChange;
  }

  add(kind, message, data = {}) {
    this.entries.push({
      time: new Date().toISOString(),
      kind,
      message: String(message),
      ...data,
    });
    this.onChange(this.entries);
  }

  clear() {
    this.entries = [];
    this.onChange(this.entries);
  }

  asText(entries = this.entries) {
    return entries.map((entry) => `${entry.time} ${entry.kind} ${entry.message}`).join("\n");
  }

  asJson() {
    return JSON.stringify(this.entries, null, 2);
  }
}
