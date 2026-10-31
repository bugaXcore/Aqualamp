const CHECKLIST_BLE = [
  "Close the official Week Aqua app and turn off Bluetooth on your phone. The lamp accepts one connection.",
  "Keep the lamp close. A PC adapter reaches it from about 30 cm; a phone reaches further.",
  "Use Chrome or Edge on localhost or HTTPS.",
];

const CHECKLIST_BRIDGE = [
  "Close the official Week Aqua app and turn off Bluetooth on your phone. The lamp accepts one connection.",
  "Keep the lamp close to the computer running the bridge. A PC adapter reaches it from about 30 cm.",
];

/** Turns a raw failure into something the person can act on. */
export function explainError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("not found") || m.includes("no devices") || m.includes("notfound")) {
    return "No lamp found. Close the official app, power-cycle the lamp and move it closer.";
  }
  if (m.includes("cancel") || m.includes("user denied")) {
    return "No lamp was selected. Click Connect and pick the lamp named B3.0-…";
  }
  if (m.includes("gatt") || m.includes("network error") || m.includes("timed out")) {
    return "The lamp did not answer. It may be connected to another device, or too far away.";
  }
  return message;
}

export function ConnectGuide({ viaBridge }: { viaBridge: boolean }) {
  const items = viaBridge ? CHECKLIST_BRIDGE : CHECKLIST_BLE;
  return (
    <ul className="mt-2 max-w-sm list-disc space-y-1.5 pl-5 text-left text-sm text-teal-100/55">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
