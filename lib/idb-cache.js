// Tiny IndexedDB cache for the large tables (prospects / leads).
//
// Why: those tables are 10k+ rows. Even with parallel pagination, a cold fetch
// from Supabase is several seconds of network + a full-table `count`. On every
// page refresh the operator was staring at a spinner.
//
// Strategy — stale-while-revalidate:
//   1. On load, read the last cached snapshot from IndexedDB and render it
//      IMMEDIATELY (feels instant on refresh).
//   2. In the background, fetch fresh rows from Supabase and overwrite both the
//      React state and the cache.
//
// IndexedDB (not localStorage) because the payload is multiple MB — well over
// localStorage's ~5 MB string cap. All functions degrade to no-ops / null when
// IndexedDB is unavailable (SSR, private mode), so callers never need to guard.

const DB_NAME = "lcl-ops-cache";
const STORE = "tables";
const VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // fail soft — caller falls back to network
  });
}

// Read a cached table snapshot. Returns { rows, cachedAt } or null.
export async function readCache(table) {
  try {
    const db = await openDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(table);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Overwrite a cached table snapshot. Fire-and-forget.
export async function writeCache(table, rows) {
  try {
    const db = await openDB();
    if (!db) return;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ rows, cachedAt: Date.now() }, table);
  } catch {
    /* fail soft */
  }
}

// ---- Delete tombstones ----
// The Supabase schema has no deleted_at column — deletes are hard deletes.
// That means the hydrate-time reconcile step (which merges a stale local
// cache back against fresh cloud rows to avoid losing not-yet-synced
// creates) can't tell "new, not synced yet" apart from "deleted, cache is
// stale" — and was re-uploading deleted rows right back to Supabase.
// Tombstones close that gap: record what THIS browser deleted, for long
// enough that any stale cache (this tab or another) has certainly caught
// up, and skip resurrecting anything in that list.
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Read tombstoned ids for a table, pruning anything past the TTL.
export async function readTombstones(table) {
  try {
    const db = await openDB();
    if (!db) return [];
    const key = `${table}:tombstones`;
    const rec = await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    const list = Array.isArray(rec?.entries) ? rec.entries : [];
    const fresh = list.filter((e) => Date.now() - e.deletedAt < TOMBSTONE_TTL_MS);
    if (fresh.length !== list.length) {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ entries: fresh }, key);
    }
    return fresh.map((e) => e.id);
  } catch {
    return [];
  }
}

// Record ids as deleted so reconcile won't resurrect them. Fire-and-forget.
export async function addTombstones(table, ids) {
  if (!ids || !ids.length) return;
  try {
    const db = await openDB();
    if (!db) return;
    const key = `${table}:tombstones`;
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const existing = Array.isArray(req.result?.entries) ? req.result.entries : [];
      const now = Date.now();
      const idSet = new Set(ids);
      const kept = existing.filter((e) => !idSet.has(e.id));
      const entries = [...kept, ...ids.map((id) => ({ id, deletedAt: now }))];
      store.put({ entries }, key);
    };
  } catch {
    /* fail soft */
  }
}

// Forget tombstones for rows that were deliberately put back (restore from
// a backup), so reconcile stops removing them again on this device.
export async function removeTombstones(table, ids) {
  if (!ids || !ids.length) return;
  try {
    const db = await openDB();
    if (!db) return;
    const key = `${table}:tombstones`;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const gone = new Set(ids);
        const entries = (Array.isArray(req.result?.entries) ? req.result.entries : []).filter((e) => !gone.has(e.id));
        store.put({ entries }, key);
      };
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* fail soft */
  }
}
