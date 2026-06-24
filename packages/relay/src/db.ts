import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { VoiceboxEvent, Filter } from "./types.js";

let db: SqlJsDatabase;
let dbPath: string;

export async function initDb(path = "voicebox-relay.db") {
  dbPath = path;
  const SQL = await initSqlJs();

  if (existsSync(path)) {
    const buffer = readFileSync(path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA journal_mode = WAL;");

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      pubkey TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      kind INTEGER NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      sig TEXT NOT NULL,
      received_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_events_pubkey ON events(pubkey)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_pubkey_kind ON events(pubkey, kind)");

  db.run(`
    CREATE TABLE IF NOT EXISTS event_tags (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      tag_key TEXT NOT NULL,
      tag_value TEXT NOT NULL,
      PRIMARY KEY (event_id, tag_key, tag_value)
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_event_tags_key_value ON event_tags(tag_key, tag_value)");

  saveDb();
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
}

export function insertEvent(event: VoiceboxEvent): boolean {
  // Check duplicate
  const existing = db.exec("SELECT id FROM events WHERE id = ?", [event.id]);
  if (existing.length > 0 && existing[0].values.length > 0) return false;

  db.run(
    `INSERT INTO events (id, pubkey, created_at, kind, content, tags_json, sig)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.pubkey,
      event.created_at,
      event.kind,
      event.content,
      JSON.stringify(event.tags),
      event.sig,
    ]
  );

  for (const tag of event.tags) {
    if (tag.length >= 2) {
      db.run(
        "INSERT OR IGNORE INTO event_tags (event_id, tag_key, tag_value) VALUES (?, ?, ?)",
        [event.id, tag[0], tag[1]]
      );
    }
  }

  saveDb();
  return true;
}

export function queryEvents(filters: Filter[]): VoiceboxEvent[] {
  if (filters.length === 0) return [];

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  for (const filter of filters) {
    const filterConditions: string[] = [];

    if (filter.ids && filter.ids.length > 0) {
      filterConditions.push(
        `id IN (${filter.ids.map(() => "?").join(",")})`
      );
      params.push(...filter.ids);
    }

    if (filter.authors && filter.authors.length > 0) {
      filterConditions.push(
        `pubkey IN (${filter.authors.map(() => "?").join(",")})`
      );
      params.push(...filter.authors);
    }

    if (filter.kinds && filter.kinds.length > 0) {
      filterConditions.push(
        `kind IN (${filter.kinds.map(() => "?").join(",")})`
      );
      params.push(...filter.kinds);
    }

    if (filter.since !== undefined) {
      filterConditions.push("created_at >= ?");
      params.push(filter.since);
    }

    if (filter.until !== undefined) {
      filterConditions.push("created_at <= ?");
      params.push(filter.until);
    }

    for (const [key, values] of Object.entries(filter)) {
      if (key.startsWith("#") && values && values.length > 0) {
        const tagKey = key.slice(1);
        filterConditions.push(
          `id IN (SELECT event_id FROM event_tags WHERE tag_key = ? AND tag_value IN (${values.map(() => "?").join(",")}))`
        );
        params.push(tagKey, ...values);
      }
    }

    if (filterConditions.length > 0) {
      conditions.push(`(${filterConditions.join(" AND ")})`);
    }
  }

  if (conditions.length === 0) return [];

  let sql = `SELECT * FROM events WHERE ${conditions.join(" OR ")} ORDER BY created_at DESC`;

  const limit = filters.find((f) => f.limit !== undefined)?.limit;
  if (limit !== undefined) {
    sql += " LIMIT ?";
    params.push(limit);
  }

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const events: VoiceboxEvent[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    events.push(rowToEvent(row as any));
  }
  stmt.free();

  return events;
}

function rowToEvent(row: any): VoiceboxEvent {
  return {
    id: row.id,
    pubkey: row.pubkey,
    created_at: row.created_at,
    kind: row.kind,
    content: row.content,
    tags: JSON.parse(row.tags_json),
    sig: row.sig,
  };
}

export function getEvent(id: string): VoiceboxEvent | null {
  const stmt = db.prepare("SELECT * FROM events WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return rowToEvent(row as any);
  }
  stmt.free();
  return null;
}
