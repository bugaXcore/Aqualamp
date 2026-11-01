import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Persists the address of the lamp the user asked to remember, so connecting skips the scan. */
export class RememberedDevice {
  private readonly file: string;

  constructor(dir = process.env.AQUALAMP_DATA_DIR ?? join(homedir(), ".aqualamp")) {
    this.file = join(dir, "device.json");
  }

  get(): string | undefined {
    try {
      const { address } = JSON.parse(readFileSync(this.file, "utf8")) as { address?: unknown };
      return typeof address === "string" && address ? address : undefined;
    } catch {
      return undefined;
    }
  }

  set(address: string): void {
    if (this.get() === address) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ address }) + "\n");
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}
