// A small JSON state file so each bridge transfer is processed once across restarts.
// Written atomically (tmp + rename) after every change; never written under --dry-run.
import fs from "node:fs";

export class State {
  constructor(file, { readOnly = false } = {}) {
    this.file = file;
    this.readOnly = readOnly;
    this.data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
    this.data.transfers ??= {};
  }

  get transfers() {
    return this.data.transfers;
  }

  save() {
    if (this.readOnly) return;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`);
    fs.renameSync(tmp, this.file);
  }
}
