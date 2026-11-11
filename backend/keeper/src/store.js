// The indexer's data dir (gitignored), held in memory and mirrored to disk:
//   data/history/<meme>.jsonl   one snapshot per line, ascending (compacted by `downsample`)
//   data/events/<account>.jsonl one event per line, in the order indexed
//   data/cursor.json            transactions already indexed, accounts fully backfilled
// Writes are appends, except compaction and the cursor (tmp + rename).
import fs from "node:fs";
import path from "node:path";
import { eventKey } from "./events.js";
import { downsample } from "./history.js";

const SAFE = /^[a-z0-9._-]{2,64}$/;

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a line cut by a crash: skip it
    }
  }
  return out;
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const byBlockDesc = (a, b) =>
  b.block_height - a.block_height || b.receipt_id.localeCompare(a.receipt_id) || b.log_index - a.log_index || b.data_index - a.data_index;

export class Store {
  /** `dir` null keeps everything in memory (tests). */
  constructor(dir) {
    this.dir = dir;
    this.history = new Map(); // meme -> snapshots ascending
    this.events = new Map(); // account -> events, newest first
    this.keys = new Set();
    this.cursor = { done: {}, backfilled: {} };
    if (!dir) return;
    for (const sub of ["history", "events"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    for (const f of fs.readdirSync(path.join(dir, "history"))) {
      if (f.endsWith(".jsonl")) this.history.set(f.slice(0, -6), readJsonl(path.join(dir, "history", f)).sort((a, b) => a.t - b.t));
    }
    for (const f of fs.readdirSync(path.join(dir, "events"))) {
      if (!f.endsWith(".jsonl")) continue;
      const list = [];
      for (const ev of readJsonl(path.join(dir, "events", f))) {
        const k = `${f}:${eventKey(ev)}`;
        if (this.keys.has(k)) continue; // a crash between the append and the cursor save
        this.keys.add(k);
        list.push(ev);
      }
      this.events.set(f.slice(0, -6), list.sort(byBlockDesc));
    }
    const cur = path.join(dir, "cursor.json");
    if (fs.existsSync(cur)) Object.assign(this.cursor, JSON.parse(fs.readFileSync(cur, "utf8")));
  }

  file(sub, account) {
    if (!SAFE.test(account)) throw new Error(`unsafe account id ${account}`);
    return path.join(this.dir, sub, `${account}.jsonl`);
  }

  addSnapshot(meme, snap) {
    const list = this.history.get(meme) ?? [];
    list.push(snap);
    this.history.set(meme, list);
    if (this.dir) fs.appendFileSync(this.file("history", meme), `${JSON.stringify(snap)}\n`);
  }

  /** Drops old points (keep 24 h, then 1 per 15 min) and rewrites the files that shrank. */
  compact(now) {
    for (const [meme, list] of this.history) {
      const kept = downsample(list, now);
      if (kept.length === list.length) continue;
      this.history.set(meme, kept);
      if (this.dir) writeAtomic(this.file("history", meme), kept.map((s) => `${JSON.stringify(s)}\n`).join(""));
    }
  }

  /** Adds event records (with `account`); returns how many were new. */
  addEvents(records) {
    const touched = new Set();
    let added = 0;
    for (const { account, ...ev } of records) {
      const k = `${account}.jsonl:${eventKey(ev)}`;
      if (this.keys.has(k)) continue;
      this.keys.add(k);
      if (!this.events.has(account)) this.events.set(account, []);
      this.events.get(account).push(ev);
      if (this.dir) fs.appendFileSync(this.file("events", account), `${JSON.stringify(ev)}\n`);
      touched.add(account);
      added++;
    }
    for (const a of touched) this.events.get(a).sort(byBlockDesc);
    return added;
  }

  saveCursor() {
    if (this.dir) writeAtomic(path.join(this.dir, "cursor.json"), `${JSON.stringify(this.cursor)}\n`);
  }
}
