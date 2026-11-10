// Stocarea upload-urilor în SQLite-ul val-ului (Val Town std/sqlite).
// Păstrăm fișierul brut + rolurile corectate manual; analiza se recalculează
// de fiecare dată (e deterministă și rapidă), deci nu poate ieși din sincron.

import type { Role } from "./core/detect.ts";
import type { Store, StoredUpload } from "./app.ts";

interface SqliteLike {
  execute(q: { sql: string; args?: (string | number | null)[] }): Promise<{ rows: unknown[][] | Record<string, unknown>[] }>;
}

const TABLE = "csv_uploads_v1";

export async function sqliteStore(sqlite: SqliteLike): Promise<Store> {
  await sqlite.execute({
    sql: `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      raw TEXT NOT NULL,
      overrides TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  });

  const cell = (row: unknown, i: number, name: string) =>
    Array.isArray(row) ? row[i] : (row as Record<string, unknown>)[name];

  return {
    async save(filename, raw) {
      const id = newId();
      await sqlite.execute({ sql: `INSERT INTO ${TABLE} (id, filename, raw) VALUES (?, ?, ?)`, args: [id, filename, raw] });
      return id;
    },
    async get(id) {
      const res = await sqlite.execute({ sql: `SELECT id, filename, raw, overrides FROM ${TABLE} WHERE id = ?`, args: [id] });
      const row = res.rows[0];
      if (!row) return null;
      let overrides: Record<string, Role> = {};
      try { overrides = JSON.parse(String(cell(row, 3, "overrides") ?? "{}")); } catch { /* ignoră */ }
      return {
        id: String(cell(row, 0, "id")),
        filename: String(cell(row, 1, "filename")),
        raw: String(cell(row, 2, "raw")),
        overrides,
      } satisfies StoredUpload;
    },
    async setOverrides(id, overrides) {
      await sqlite.execute({ sql: `UPDATE ${TABLE} SET overrides = ? WHERE id = ?`, args: [JSON.stringify(overrides), id] });
    },
  };
}

// Stocarea pe Vercel: Vercel KV (Redis, prin Upstash) — cost zero pe planul gratuit,
// nicio cheie API de configurat manual (variabilele vin automat când legi un KV
// store de proiect, din Vercel Storage). Un singur key per id, TTL ca să nu
// umplem gratis cota (90 de zile e suficient pentru un demo).
const TTL_SECONDS = 60 * 60 * 24 * 90;

interface KvLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
}

export function vercelKvStore(kv: KvLike): Store {
  const key = (id: string) => `csv_uploads_v1:${id}`;
  return {
    async save(filename, raw) {
      const id = newId();
      const upload: StoredUpload = { id, filename, raw, overrides: {} };
      await kv.set(key(id), upload, { ex: TTL_SECONDS });
      return id;
    },
    async get(id) {
      return await kv.get<StoredUpload>(key(id));
    },
    async setOverrides(id, overrides) {
      const existing = await kv.get<StoredUpload>(key(id));
      if (!existing) return;
      await kv.set(key(id), { ...existing, overrides }, { ex: TTL_SECONDS });
    },
  };
}

export function memoryStore(): Store {
  const m = new Map<string, StoredUpload>();
  return {
    save(filename, raw) { const id = newId(); m.set(id, { id, filename, raw, overrides: {} }); return Promise.resolve(id); },
    get(id) { return Promise.resolve(m.get(id) ?? null); },
    setOverrides(id, overrides) { const u = m.get(id); if (u) u.overrides = overrides; return Promise.resolve(); },
  };
}

function newId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
