"use client";

// Data store for LCL Ops.
//
// Backed by Supabase when configured (shared cloud data), otherwise falls back
// to localStorage (so the app still works with no backend). The public API
// (add/update/remove) is identical either way, so no component needs to change.
//
// Storage model: each entity is one row { id, data jsonb }. The app loads
// everything into React state on mount and filters in-memory; writes update
// state optimistically AND upsert/delete the specific row in Supabase.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { addMonths as addMo } from "date-fns";
import { jobDate } from "./stats";
import { autoStartDueVisits } from "./visits";
import { getJobLines, lineTotal, jobPayable } from "./format";
import { defaultEmailSettings, defaultTemplates, defaultAutoNotify } from "./settings";
import { defaultDocTemplates } from "./docs";
import {
  SERVICE_CATALOG,
  UNASSIGNED_ENGINEER,
  ENGINEER_COLORS,
  GAS_EXTRA_APPLIANCE,
} from "./constants";
import { supabase, supabaseConfigured } from "./supabase";
import { toast } from "./toast";
import { serviceLabel, suggestedPrice, looksLikeCompany } from "./prospects";
import { closeLinkedTasks } from "./tasks";
import { coldLeadsFromCSV } from "./cold-leads";
import { readCache, writeCache, readTombstones, addTombstones } from "./idb-cache";
import { useAuth } from "./auth";

const STORAGE_KEY = "lcl-ops-data-v1";

const DEFAULT_SERVICE_PRICES = Object.fromEntries(
  SERVICE_CATALOG.map((s) => [s.code, s.price])
);

const StoreContext = createContext(null);

// The app-wide settings bundle stored in the single `app_settings` row.
function settingsBundle(s) {
  return {
    email: s.email,
    templates: s.templates,
    docTemplates: s.docTemplates,
    companyDocs: s.companyDocs,
    invoiceSeq: s.invoiceSeq,
    servicePrices: s.servicePrices,
    autoNotify: s.autoNotify,
    // NOTE: expenses + engineerPayments are NO LONGER stored in this shared
    // singleton blob. They live in their own app_settings rows ("expenses" /
    // "engineer_payments") so an unrelated settings save can never wipe your
    // financial data. mergeSettings still reads any legacy copy here for the
    // one-time migration into the dedicated rows.
  };
}

// ---- Paginated loader — Supabase caps SELECT at 1000 rows by default. ----
// For small tables (<= 1 page expected) we just fetch page 0 and check if
// more exist. For large tables we get the count first then fire all pages
// in parallel, cutting load time from O(pages) sequential to O(1) parallel.
const PAGE = 1000;

// How long prospects/leads (57k rows between them) may stay in memory before a
// background re-sync bothers to re-download them. The 90s hydrate heartbeat is
// there to catch job/client edits made on another device; these bulk tables
// don't need that cadence and re-fetching them at it is what made the app drag.
const BIG_TABLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// The browser's native fetch() has NO default timeout — a connection that
// stalls mid-request (a flaky network path, a captive portal, certain
// VPN/proxy setups, or just browser-specific TCP/HTTP2 connection-pooling
// quirks) hangs FOREVER with no error and no completion. Supabase's client
// uses that same native fetch under the hood, so a single stuck request
// inside hydrate()'s Promise.all could leave the whole app stuck on its
// loading skeleton indefinitely — no error banner, nothing in the console,
// because nothing ever actually failed; it just never finished. This wraps
// any promise so a hang becomes a clean rejection within a bounded time,
// which the existing try/catch in hydrate() already turns into a visible,
// retryable error instead of an infinite spinner.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s waiting for ${label}`)), ms)
    ),
  ]);
}

// Returns { rows, failed }. `failed` must NEVER be treated the same as a
// genuinely empty table — a transient network/auth blip that comes back as
// zero rows would otherwise silently wipe good on-screen data (or worse,
// trip the "cloud is empty, reseed from local" path) with no indication
// anything went wrong.
// How many times a table load is retried before it counts as failed, and
// how long to wait between attempts.
//
// Every failure here surfaces as "Couldn't reach the server to load your
// data" and leaves the app with nothing on screen — and it only took ONE
// unlucky request to get there: a phone switching cell tower, a wifi
// handover, a cold Supabase connection, an ad blocker racing the first
// request. None of those are permanent, and all of them were being treated
// as fatal on the first attempt. Retrying costs a second or two in the rare
// bad case and turns the commonest cause of that banner into a blip the
// user never sees.
const LOAD_RETRIES = 3;
const RETRY_BACKOFF_MS = [400, 1200, 2500];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadAllRows(table, attempt = 0) {
  const retryOr = async (result, why) => {
    if (attempt < LOAD_RETRIES) {
      console.warn(`[supabase] ${table}: ${why} — retry ${attempt + 1}/${LOAD_RETRIES}`);
      await sleep(RETRY_BACKOFF_MS[attempt] ?? 2500);
      return loadAllRows(table, attempt + 1);
    }
    return result;
  };
  try {
    // First page + count in one request.
    const { data: first, count, error } = await supabase
      .from(table)
      .select("id, data", { count: "exact" })
      .range(0, PAGE - 1);
    if (error) {
      console.error(`[supabase] loadAllRows ${table}:`, error.message);
      return retryOr({ rows: [], failed: true }, error.message);
    }
    const rows = dedupeRows(dropMalformed(table, (first || []).map(withRowId)));
    if (!count || rows.length >= count) return { rows, failed: false };  // fits in one page

    // More pages exist — fetch them in small chunks to avoid blowing up the
    // browser's connection limits or the Supabase PostgREST connection pool
    // (which defaults to 15 concurrent connections on the free tier).
    const totalPages = Math.ceil(count / PAGE);
    let pageFailed = false;
    const pages = [];
    
    // Fetch in chunks of 3 to avoid hitting browser connection limits (Safari max 6)
    const CHUNK_SIZE = 3;
    for (let startPage = 1; startPage < totalPages; startPage += CHUNK_SIZE) {
      if (pageFailed) break;
      const chunkReqs = [];
      for (let page = startPage; page < Math.min(startPage + CHUNK_SIZE, totalPages); page++) {
        chunkReqs.push(
          supabase
            .from(table)
            .select("id, data")
            .range(page * PAGE, page * PAGE + PAGE - 1)
            .then(({ data, error: e }) => {
              if (e) {
                console.error(`[supabase] loadAllRows ${table} page ${page}:`, e.message);
                pageFailed = true;
                return [];
              }
              return (data || []).map(withRowId);
            })
        );
      }
      const chunkResults = await Promise.all(chunkReqs);
      pages.push(...chunkResults);
    }
    
    if (pageFailed) {
      // A partial table is worse than none: it looks like real data while
      // silently missing records. Retry the whole table rather than hand
      // back a half-populated list.
      return retryOr({ rows: dedupeRows(dropMalformed(table, rows.concat(...pages))), failed: true }, "a page failed");
    }
    return { rows: dedupeRows(dropMalformed(table, rows.concat(...pages))), failed: false };
  } catch (err) {
    console.error(`[supabase] loadAllRows ${table}:`, err?.message || err);
    return retryOr({ rows: [], failed: true }, err?.message || "threw");
  }
}

// A row whose `data` jsonb has no `id` can only be garbage — every write
// path (addJob, addClient, etc.) always sets one, so this means a row was
// inserted outside the app (a manual test insert, a bad script). Rendering
// it produces links like /jobs/undefined that 404. Drop it and say so, so
// bad data is visible in logs instead of silently breaking navigation.
// Reunite a row's JSON payload with its PRIMARY KEY.
//
// The loader used to `select("data")` alone and hand the raw blob onwards, so
// the row's own `id` column — the authoritative identifier the record is
// stored under — was thrown away on every read. Any blob that didn't happen to
// carry a duplicate copy of its id inside the JSON was then deleted by
// dropMalformed() below, and the record simply ceased to exist in the app:
// clients vanished from lists and every job pointing at them rendered as
// "Unknown client", while the row sat intact in the database the whole time.
//
// The blob's own id still wins when present (it is what every writer sets);
// the row id is the fallback that makes a record impossible to lose.
// Collapse duplicate rows that share the same id down to ONE.
//
// engineers and engineer_recruits were created (see supabase/schema.sql
// history) without their PRIMARY KEY ever actually being applied to the live
// table -- `create table if not exists` is a no-op once a table already
// exists, so the constraint in the schema file was never enforced. Every
// edit's sbUpsert() therefore silently degraded from an upsert into a plain
// INSERT (Postgres has no conflict target to upsert against without a unique
// constraint), leaving the OLD row behind instead of replacing it. Confirmed
// against live data: RIZWAN's engineer record had SEVEN physical rows sharing
// one id, each an earlier snapshot of his rates. Which one the app happened to
// display depended on the order Postgres returned them in -- unspecified
// without an ORDER BY, and free to differ between requests, connections, or
// devices, which is exactly why an edited rate "showed on the web version but
// not on the phone": both were reading the same duplicate-riddled table and
// landing on different physical rows.
//
// supabase/DEDUPE-AND-FIX-PRIMARY-KEYS.sql removes the duplicates permanently
// and adds the missing constraint so this can't recur. Until that's run,
// this keeps the app CORRECT in the meantime: last row wins, and where more
// than one candidate carries its own `updatedAt`, the genuinely newest one
// wins regardless of fetch order.
function dedupeRows(rows) {
  const byId = new Map();
  for (const r of rows) {
    if (!r || !r.id) continue;
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); continue; }
    const prevAt = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
    const curAt = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
    if (curAt >= prevAt) byId.set(r.id, r);
  }
  return [...byId.values()];
}

function withRowId(row) {
  const d = row?.data;
  if (!d) return d;
  return d.id ? d : { ...d, id: row.id };
}

// Only genuinely unidentifiable rows are dropped now — with withRowId() above,
// that means no JSON payload at all and no primary key either.
function dropMalformed(table, rows) {
  const clean = rows.filter((r) => r && r.id);
  if (clean.length !== rows.length) {
    console.warn(`[supabase] ${table}: dropped ${rows.length - clean.length} row(s) with no id`, rows.filter((r) => !r || !r.id));
  }
  return clean;
}

// A failed write here means the change is ONLY in local React state — it will
// vanish the moment this tab reloads or another device loads fresh from the
// server, with zero trace. That must never happen silently: console.error
// alone is invisible to whoever is actually using the app, so every failure
// (including a hard network/auth rejection that skips the {error} shape
// entirely) also surfaces a toast naming exactly what didn't save.
function reportSaveFailure(label, err) {
  const message = err?.message || String(err);
  console.error(`[supabase] ${label}:`, message);
  toast.error(`Not saved to the cloud — ${label}: ${message}. Don't refresh or switch devices until this is fixed, or the change will be lost.`);
}

// ---- Supabase row helpers (no-ops when not configured) ----

// Track when we last wrote to the DB, so the window-focus hydration trigger
// doesn't immediately pull stale data and overwrite optimistic local state
// before the server finishes processing the upsert.
let _lastWriteTime = 0;
export function notifyWrite() {
  _lastWriteTime = Date.now();
}

function sbUpsert(table, id, data, retries = 0) {
  if (!supabase) return;
  notifyWrite();
  // Guarantee the stored blob carries its own key. A caller that passes an
  // object without one (or with a stale one) is how a row ends up unreadable
  // by anything that identifies records from the JSON rather than the column.
  if (data && typeof data === "object" && data.id !== id) data = { ...data, id };
  supabase
    .from(table)
    .upsert({ id, data })
    .then(({ error }) => {
      if (error) {
        if (retries < 2) setTimeout(() => sbUpsert(table, id, data, retries + 1), 1500);
        else reportSaveFailure(`${table} ${id}`, error);
      }
    })
    .catch((err) => {
      if (retries < 2) setTimeout(() => sbUpsert(table, id, data, retries + 1), 1500);
      else reportSaveFailure(`${table} ${id}`, err);
    });
}
function sbDelete(table, ids) {
  if (!supabase || !ids || !ids.length) return;
  notifyWrite();
  supabase
    .from(table)
    .delete()
    .in("id", ids)
    .then(({ error }) => {
      if (error) reportSaveFailure(`delete ${table}`, error);
    })
    .catch((err) => reportSaveFailure(`delete ${table}`, err));
  // Fire cross-device tombstones for every table that participates in
  // hydrate-time reconcile (jobs/clients right now). Other tables (prospects,
  // leads, engineers, …) don't currently reconcile against a local cache so
  // resurrection isn't a risk there, but tombstoning them costs nothing
  // and future-proofs against extending reconcile to more tables.
  pushRemoteTombstones(table, ids);
}
function sbUpsertSettings(s) {
  if (!supabase) return;
  notifyWrite();
  supabase
    .from("app_settings")
    .upsert({ id: "singleton", data: settingsBundle(s) })
    .then(({ error }) => {
      if (error) reportSaveFailure("settings", error);
    })
    .catch((err) => reportSaveFailure("settings", err));
}

// Persist an isolated array (expenses / engineer_payments) into its OWN
// app_settings row, decoupled from the settings singleton so it can't be
// clobbered by unrelated saves. No new table needed — app_settings is keyed
// by id, so each gets its own durable row. Retries like sbUpsert (jobs/
// clients) — this used to give up after one attempt with no retry at all,
// so a single transient network blip meant the write never landed and a
// later hydrate would keep re-fetching the stale pre-edit array forever.
function sbUpsertKey(key, items, retries = 0) {
  if (!supabase) return;
  notifyWrite();
  supabase
    .from("app_settings")
    .upsert({ id: key, data: { items } })
    .then(({ error }) => {
      if (error) {
        if (retries < 2) setTimeout(() => sbUpsertKey(key, items, retries + 1), 1500);
        else reportSaveFailure(key, error);
      }
    })
    .catch((err) => {
      if (retries < 2) setTimeout(() => sbUpsertKey(key, items, retries + 1), 1500);
      else reportSaveFailure(key, err);
    });
}

// ─── Shared cross-device delete tombstones ────────────────────────────────
// Kept in an app_settings row (`deleted_ids`) so a delete on ANY device is
// respected on EVERY device. Without this, a delete on the laptop wouldn't
// stop the row from being resurrected by a stale local cache on the phone
// (the local-only tombstones in lib/idb-cache.js only protect this browser).
// Shape: { jobs: {[id]: {at: iso}}, clients: {...}, ... }
const REMOTE_TOMBSTONE_KEY = "deleted_ids";
const REMOTE_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — plenty

let _remoteTombstoneMap = null;
async function loadRemoteTombstones() {
  if (_remoteTombstoneMap) return _remoteTombstoneMap;
  if (!supabase) return (_remoteTombstoneMap = {});
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("data")
      .eq("id", REMOTE_TOMBSTONE_KEY)
      .maybeSingle();
    const raw = (data?.data && typeof data.data === "object") ? data.data : {};
    // Prune anything past the TTL to keep the blob small.
    const now = Date.now();
    const pruned = {};
    for (const [table, byId] of Object.entries(raw)) {
      if (!byId || typeof byId !== "object") continue;
      pruned[table] = {};
      for (const [id, entry] of Object.entries(byId)) {
        const at = new Date(entry?.at || 0).getTime();
        if (at && now - at < REMOTE_TOMBSTONE_TTL_MS) pruned[table][id] = entry;
      }
    }
    _remoteTombstoneMap = pruned;
  } catch {
    _remoteTombstoneMap = {};
  }
  return _remoteTombstoneMap;
}

async function pushRemoteTombstones(table, ids) {
  if (!supabase || !ids?.length) return;
  const current = await loadRemoteTombstones();
  const nowIso = new Date().toISOString();
  current[table] = current[table] || {};
  for (const id of ids) current[table][id] = { at: nowIso };
  _remoteTombstoneMap = current;
  try {
    await supabase
      .from("app_settings")
      .upsert({ id: REMOTE_TOMBSTONE_KEY, data: current });
  } catch (err) {
    // Local tombstones (idb-cache) still protect this device; log so we
    // notice if this is failing persistently.
    console.warn("[supabase] deleted_ids push failed:", err?.message || err);
  }
}
export function _debugResetRemoteTombstones() { _remoteTombstoneMap = null; }
async function sbSeed(local) {
  if (!supabase) return;
  const ops = [];
  if (local.clients.length)
    ops.push(supabase.from("clients").upsert(local.clients.map((x) => ({ id: x.id, data: x }))));
  if (local.jobs.length)
    ops.push(supabase.from("jobs").upsert(local.jobs.map((x) => ({ id: x.id, data: x }))));
  if (local.engineers.length)
    ops.push(supabase.from("engineers").upsert(local.engineers.map((x) => ({ id: x.id, data: x }))));
  ops.push(supabase.from("app_settings").upsert({ id: "singleton", data: settingsBundle(local) }));
  const results = await Promise.all(ops);
  results.forEach((r) => r?.error && console.error("[supabase] seed:", r.error.message));
}

// Read the current localStorage snapshot (used as the fallback store AND as the
// source for the one-time first-run migration into Supabase).
function loadLocal() {
  // An EMPTY fallback, deliberately. This used to hand back a demo dataset
  // (seedClients / seedJobs / four invented engineers) whenever there was no
  // local snapshot to read — which is exactly the state a phone is in the
  // first time it opens the app. The result was a brand-new device showing
  // fake clients, fake jobs and fake engineers as though they were real
  // records, indistinguishable from live data. Showing nothing until the
  // server answers is the honest state: no data is no data.
  const fallback = {
    clients: [],
    jobs: [],
    email: defaultEmailSettings,
    templates: defaultTemplates,
    docTemplates: defaultDocTemplates,
    companyDocs: [],
    invoiceSeq: 345,
    servicePrices: { ...DEFAULT_SERVICE_PRICES },
    engineers: [],
    autoNotify: { ...defaultAutoNotify },
    prospects: [],
    coldLeads: [],
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.clients) && Array.isArray(parsed.jobs)) {
        return {
          clients: parsed.clients,
          jobs: parsed.jobs,
          email: { ...defaultEmailSettings, ...(parsed.email || {}) },
          templates: { ...defaultTemplates, ...(parsed.templates || {}) },
          docTemplates: Array.isArray(parsed.docTemplates)
            ? parsed.docTemplates
            : defaultDocTemplates,
          companyDocs: Array.isArray(parsed.companyDocs) ? parsed.companyDocs : [],
          invoiceSeq: typeof parsed.invoiceSeq === "number" ? parsed.invoiceSeq : 345,
          servicePrices: { ...DEFAULT_SERVICE_PRICES, ...(parsed.servicePrices || {}) },
          engineers: Array.isArray(parsed.engineers) ? parsed.engineers : [],
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
          engineerPayments: Array.isArray(parsed.engineerPayments) ? parsed.engineerPayments : [],
          prospects: Array.isArray(parsed.prospects) ? parsed.prospects : [],
          coldLeads: Array.isArray(parsed.coldLeads) ? parsed.coldLeads : [],
        };
      }
    }
  } catch (e) {
    // ignore corrupt storage
  }
  return fallback;
}

// One-time, idempotent clean-ups applied to saved settings on load: drop the
// old .co.uk website from the signature, strip "(inc VAT)" from client-facing
// templates, and sign templates off as "Lisa". Safe to run every load.
function cleanSettings(s) {
  const email = { ...s.email };
  const goodEmail = defaultEmailSettings.fromEmail; // landlordcompliancelondon@gmail.com
  // Fix any stale .co.uk reply/from addresses (a dead address bounces replies).
  if (!email.replyTo || /co\.uk/i.test(email.replyTo)) email.replyTo = goodEmail;
  if (!email.fromEmail || /co\.uk/i.test(email.fromEmail)) email.fromEmail = goodEmail;
  // Normalise the signature to the single canonical sign-off so it never
  // duplicates the in-body "Kind regards / company" block.
  const canonicalSig = `Kind regards,\nLisa\n${defaultEmailSettings.fromName}\n07426 409342\n${defaultEmailSettings.fromEmail}`;
  if (!email.signature || /co\.uk|www\.|^Landlord Compliance London$/i.test((email.signature || "").trim()) || !/Kind regards/i.test(email.signature || "")) {
    email.signature = canonicalSig;
  } else {
    email.signature = email.signature
      .split("\n")
      .filter((l) => !/co\.uk|www\./i.test(l))
      .join("\n");
  }
  const templates = {};
  for (const k of Object.keys(s.templates)) {
    const tpl = s.templates[k];
    let body = (tpl.body || "").replace(/ ?\(inc VAT\)/g, "");
    // Strip any in-body sign-off so the appended signature is the only one.
    // Removes a trailing "Kind regards, [Lisa,] {{company}}/Landlord Compliance London".
    body = body.replace(
      /\n+Kind regards,?\s*\n+(Lisa\s*\n+)?(\{\{company\}\}|Landlord Compliance London)\s*(\n+0?7426 409342)?\s*(\n+\S+@\S+)?\s*$/i,
      ""
    ).trimEnd();
    templates[k] = { ...tpl, body };
  }
  return { ...s, email, templates };
}

// Merge a loaded app_settings payload with defaults.
function mergeSettings(set) {
  return cleanSettings({
    email: { ...defaultEmailSettings, ...(set?.email || {}) },
    templates: { ...defaultTemplates, ...(set?.templates || {}) },
    docTemplates: Array.isArray(set?.docTemplates) ? set.docTemplates : defaultDocTemplates,
    companyDocs: Array.isArray(set?.companyDocs) ? set.companyDocs : [],
    invoiceSeq: typeof set?.invoiceSeq === "number" ? set.invoiceSeq : 345,
    servicePrices: { ...DEFAULT_SERVICE_PRICES, ...(set?.servicePrices || {}) },
    autoNotify: { ...defaultAutoNotify, ...(set?.autoNotify || {}) },
    expenses: Array.isArray(set?.expenses) ? set.expenses : [],
    engineerPayments: Array.isArray(set?.engineerPayments) ? set.engineerPayments : [],
  });
}

export function StoreProvider({ children }) {
  // Start empty; hydrate() fills from Supabase (or localStorage) on mount, so
  // there's no flash of demo data before the real data loads.
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [email, setEmail] = useState(defaultEmailSettings);
  const [templates, setTemplates] = useState(defaultTemplates);
  const [docTemplates, setDocTemplates] = useState(defaultDocTemplates);
  const [companyDocs, setCompanyDocs] = useState([]);
  const [invoiceSeq, setInvoiceSeq] = useState(345);
  const [servicePrices, setServicePrices] = useState(DEFAULT_SERVICE_PRICES);
  // Start empty; hydrate() fills from the DB. Never re-inject sample engineers.
  const [engineers, setEngineers] = useState([]);
  const [autoNotify, setAutoNotify] = useState(defaultAutoNotify);
  const [expenses, setExpenses] = useState([]);
  const [engineerPayments, setEngineerPayments] = useState([]);
  // expenses/engineerPayments durability: each mutator persists directly
  // (writeCache + sbUpsertKey) at the moment of the edit, and attemptHydrate
  // below merges the IndexedDB cache with the cloud fetch BY ID (never a
  // wholesale "trust this array or that one" choice) — an id present in
  // either source survives. See the merge comment in attemptHydrate for why
  // a recency-based trust window (an earlier version of this fix) was
  // itself unsafe.
  const [prospects, setProspects] = useState([]);
  const [coldLeads, setColdLeads] = useState([]);
  const [agents, setAgents] = useState([]);
  const [recruits, setRecruits] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  // true once prospects + coldLeads finish streaming in (phase 2)
  const [prospectsReady, setProspectsReady] = useState(false);
  const [coldLeadsReady, setColdLeadsReady] = useState(false);
  // Set whenever a hydrate attempt bails out (failed fetch, expired session,
  // or a suspicious all-empty response) instead of applying real data. A
  // toast alone was too easy to miss — someone could land on an empty-looking
  // page moments after the toast auto-dismissed with no idea anything went
  // wrong. Any component can read this via useStore() and show a persistent,
  // actionable banner (see components/SyncErrorBanner.js) until a retry
  // succeeds. Cleared on the next successful hydrate.
  const [loadError, setLoadError] = useState(null);
  // Have the inputs every PROFIT figure depends on actually arrived?
  //
  // Revenue needs only jobs, which phase 0 paints from cache — so the money
  // tiles render happily while engineers, expenses and engineer payments are
  // still empty, and every cost subtracts zero. The screen then states, in
  // large green type, that Net Profit equals Revenue and Engineer Cost is
  // £0.00. That isn't a slow load, it's a false statement about the
  // business, and it looked identical to a real month with no costs.
  //
  // Nothing derived from costs may be shown until this is true.
  const [financeReady, setFinanceReady] = useState(false);

  // Who is acting right now — stamped onto every call/email/contact log so the
  // admin Team page can attribute outreach activity per agent. Kept in a ref so
  // the (deps-free) logging callbacks always read the current user.
  const { user } = useAuth();
  const actorRef = useRef(null);
  // Fingerprints of the last-applied clients/jobs/engineers arrays. The
  // re-sync effect below re-hydrates every 90s AND on every tab/app focus —
  // by far the most common case is that nothing actually changed server-side
  // between two consecutive syncs, but applyAll() used to call setJobs/
  // setClients/setEngineers with a brand-new array reference every single
  // time regardless, which re-renders every list/board/calendar screen that
  // reads them. On a phone that's the exact "goes janky for a moment when I
  // switch back to the app" feel. Skipping the setState call when the
  // fingerprint hasn't moved means React's Object.is bail-out (for the
  // untouched setters) keeps those consumers from re-rendering at all.
  // Fingerprint the rows' actual CONTENT, not just id + timestamp.
  //
  // The timestamp-only version of this was a real data-loss bug: engineer
  // records carry no updatedAt/createdAt at all, so every engineer hashed to
  // "eng-xxx:" and the signature never moved when their details changed. A
  // tab could therefore never learn about an edit made anywhere else — and
  // because EngineerModal seeds its form from whatever the store currently
  // holds, the next save from that stale tab wrote the old (blank) bank
  // fields straight back over the good ones. Content hashing means a table
  // with no timestamps is still tracked correctly.
  //
  // Cost is one JSON pass per table per hydrate (every 90s / on refocus) —
  // far cheaper than the full re-render of every list and board that it
  // prevents, which is the whole point of the check.
  const lastSigRef = useRef({});
  const rowsSig = (rows) => {
    let h = 5381;
    const s = JSON.stringify(rows || []);
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return `${(rows || []).length}:${h}`;
  };
  // Holds the current hydrate() function so OTHER effects (focus/visibility/
  // interval, below) can re-trigger the exact same fetch-reconcile-apply
  // pipeline used on mount — not a second, drifted copy of it. See the
  // "re-sync on focus" effect further down for why this exists: without it,
  // each browser tab/device only ever fetched data once on load and never
  // again, so a job created on one device silently never appeared on
  // another until that tab was manually reloaded.
  const hydrateRef = useRef(null);
  // When the big tables (prospects/leads) last came down off the network, and
  // whether they're in memory at all — see the Phase 2 throttle in hydrate().
  const lastBigSyncRef = useRef(0);
  const prospectsReadyRef = useRef(false);
  // True once a hydrate has genuinely succeeded against the server. Decides
  // whether a later failure is "quietly retry" or "warn the operator".
  const hasGoodDataRef = useRef(false);
  // Exposed via useStore() so the SyncErrorBanner's "Retry" button (and
  // anywhere else) can trigger the exact same fetch-reconcile-apply pipeline
  // on demand, without knowing anything about its internals.
  // Mirror the readiness flag into a ref so hydrate() (which runs outside
  // React's render cycle) can test it without re-creating itself.
  useEffect(() => { prospectsReadyRef.current = prospectsReady; }, [prospectsReady]);

  // Retry is an explicit user action — it must bypass the Phase 2 throttle,
  // or pressing it after a failure would skip the very fetch that failed.
  const retryHydrate = useCallback(() => {
    lastBigSyncRef.current = 0;
    hydrateRef.current?.();
  }, []);

  // Prospects (14.5k rows / ~12MB) and leads (42.5k rows / ~25MB) are 37 of
  // the 38MB this app downloads, across ~58 paginated requests — the server
  // caps every request at 1000 rows, so that request count cannot be reduced.
  //
  // Every page load paid that bill, including the Dashboard, Jobs, Reports and
  // Settings, none of which touch either table. That is most of why the app
  // felt slow, and why the 20s load timeout fired. They are now fetched only
  // when something actually needs them: the pages that show them call
  // requestBigTables() on mount, and so does the global search the first time
  // it is used. The local IndexedDB cache is still painted instantly either
  // way, so a browser that has seen them before still shows them at once.
  // Tracked SEPARATELY because the two tables have different customers: the
  // dashboard needs prospects for its renewals count but never touches leads,
  // and the engineers page is the other way round. Asking for both would make
  // the landing page pay 25MB it has no use for.
  const wantProspectsRef = useRef(false);
  const wantLeadsRef = useRef(false);
  const requestBigTables = useCallback((which = "all") => {
    const p = which === "all" || which === "prospects";
    const l = which === "all" || which === "leads";
    if ((!p || wantProspectsRef.current) && (!l || wantLeadsRef.current)) return;
    if (p) wantProspectsRef.current = true;
    if (l) wantLeadsRef.current = true;
    lastBigSyncRef.current = 0; // force the throttle to allow this fetch
    hydrateRef.current?.();
  }, []);
  useEffect(() => {
    actorRef.current = user
      ? { id: user.id, name: user.name || user.username || user.email, role: user.role }
      : null;
  }, [user]);

  // Hydrate (client only). Supabase if configured, else localStorage.
  useEffect(() => {
    let cancelled = false;

    const applyAll = (d) => {
      const clientsSig = rowsSig(d.clients);
      if (lastSigRef.current.clients !== clientsSig) {
        lastSigRef.current.clients = clientsSig;
        setClients(d.clients);
      }
      const normalizedJobs = (d.jobs || []).map((j) => ({ ...j, services: Array.isArray(j?.services) ? j.services : [] }));
      const jobsSig = rowsSig(normalizedJobs);
      if (lastSigRef.current.jobs !== jobsSig) {
        lastSigRef.current.jobs = jobsSig;
        setJobs(normalizedJobs);
      }
      setEmail(d.email);
      setTemplates(d.templates);
      setDocTemplates(d.docTemplates);
      setCompanyDocs(d.companyDocs);
      // NEVER let a re-hydrate walk the invoice counter BACKWARDS. hydrate()
      // re-runs on demand (requestBigTables calls it), and a plain assignment
      // here reset the counter to whatever the server last knew — discarding
      // any number allocated since, so the next invoice reused one that had
      // already gone out. Monotonic: take the server's value only when it is
      // ahead of ours (another device invoiced something).
      setInvoiceSeq((prev) => Math.max(prev || 0, d.invoiceSeq || 0));
      setServicePrices(d.servicePrices);
      const rawEngineers = d.engineers || [];
      const cleanEngineers = [];
      const seenEngIds = new Set();
      for (const e of rawEngineers) {
        if (e && e.id && !seenEngIds.has(e.id)) {
          seenEngIds.add(e.id);
          cleanEngineers.push(e);
        }
      }
      const engineersSig = rowsSig(cleanEngineers);
      if (lastSigRef.current.engineers !== engineersSig) {
        lastSigRef.current.engineers = engineersSig;
        setEngineers(cleanEngineers);
      }
      if (d.autoNotify) setAutoNotify(d.autoNotify);
      if (d.expenses) setExpenses(d.expenses);
      if (d.engineerPayments) setEngineerPayments(d.engineerPayments);
      // `d.prospects !== undefined` rather than a plain truthy check — an
      // omitted key (caller intentionally not touching this table) must stay
      // a no-op, but a genuinely truthy `[]` should NOT be silently treated
      // the same as "don't touch". A caller passing `[]` in the future is a
      // real (if unusual) "clear it" request and should actually apply.
      if (d.prospects !== undefined) setProspects(d.prospects.map((p) =>
        // Backfill isAgent for older rows so the new tabs work without re-import.
        p.isAgent === undefined ? { ...p, isAgent: looksLikeCompany(p.ownerName) } : p
      ));
      if (d.coldLeads !== undefined) setColdLeads(d.coldLeads);
      if (d.agents) setAgents(d.agents);
      if (d.recruits) setRecruits(d.recruits);
    };

    async function attemptHydrate() {
      if (!supabaseConfigured) {
        // NEVER silently fall through to seed data here.
        //
        // This path used to load the demo dataset (Priya Sharma, Daniel
        // O'Connor, 7 fake jobs) and set hydrated=true with no error at all.
        // The app then looked completely normal while showing fabricated
        // records — which is indistinguishable from "my real data vanished",
        // and took weeks to spot because nothing anywhere said the backend
        // wasn't connected.
        //
        // It happens whenever NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are absent
        // from the build — e.g. a Preview deployment, or a PWA installed from
        // a URL whose environment never had those vars set.
        //
        // Now it fails loudly and shows nothing rather than something false.
        applyAll({
          clients: [], jobs: [], engineers: [], agents: [], recruits: [],
          email: defaultEmailSettings, templates: defaultTemplates,
          docTemplates: defaultDocTemplates, companyDocs: [], invoiceSeq: 345,
          servicePrices: { ...DEFAULT_SERVICE_PRICES },
          prospects: [], coldLeads: [], expenses: [], engineerPayments: [],
        });
        setLoadError(
          `Not connected to the database — this build has no Supabase credentials, ` +
          `so NO real data can load. Nothing here is your live data. ` +
          `Check you're on ${typeof window !== "undefined" ? "https://lcl-ops.vercel.app" : "the production URL"} ` +
          `and not an old preview/localhost install.`
        );
        setHydrated(true);
        setProspectsReady(true);
        setColdLeadsReady(true);
        return;
      }
      {
        // ── Phase 0: paint cached jobs/clients instantly (refresh feels live) ──
        // The dashboard KPIs read from jobs + clients. Painting the last cached
        // copy and flipping `hydrated` means a refresh shows numbers right away,
        // then the network load below overwrites them. Does NOT touch prospects
        // (handled by the phase-2 cache) so nothing gets clobbered.
        const [jobCache, cliCache, jobTombstones, cliTombstones, expCache, payCache, engCache] = await withTimeout(
          Promise.all([
            readCache("jobs"),
            readCache("clients"),
            readTombstones("jobs"),
            readTombstones("clients"),
            readCache("expenses"),
            readCache("engineer_payments"),
            readCache("engineers"),
          ]),
          10_000,
          "local cache read"
        );
        if (cancelled) return;
        const jobTombSet = new Set(jobTombstones);
        const cliTombSet = new Set(cliTombstones);
        if (jobCache?.rows?.length || cliCache?.rows?.length) {
          if (jobCache?.rows?.length) setJobs(jobCache.rows.filter((j) => !jobTombSet.has(j.id)).map((j) => ({ ...j, services: Array.isArray(j?.services) ? j.services : [] })));
          if (cliCache?.rows?.length) setClients(cliCache.rows.filter((c) => !cliTombSet.has(c.id)));
          // Engineers, expenses and payments MUST be painted here too, not
          // just jobs and clients.
          //
          // This phase flips `hydrated`, so the dashboard renders from it.
          // Every profit figure is revenue MINUS engineer cost MINUS
          // expenses — and engineer cost is computed by walking the
          // engineers roster, so with any of these three empty the
          // subtractions are zero and Net Profit and True Profit both
          // render as an exact copy of Revenue. That is not a rounding
          // drift, it is three identical numbers stacked down the screen,
          // and it persisted for as long as phase 1 took to land (forever,
          // if it failed). The expenses/payments caches were already being
          // READ right above and then never used; engineers had no cache at
          // all. Now all three are cached on every load and applied here, so
          // the first paint is the real P&L rather than a gross figure
          // wearing a profit label.
          if (engCache?.rows?.length) {
            // Same de-duplication applyAll does — the engineers table has
            // genuine duplicate rows per engineer (see
            // supabase/DEDUPE-AND-FIX-PRIMARY-KEYS.sql), so painting the
            // cache raw would list RIZWAN ten times for a beat.
            const seenEng = new Set();
            setEngineers(engCache.rows.filter((e) => e?.id && !seenEng.has(e.id) && seenEng.add(e.id)));
          }
          if (expCache?.rows?.length) setExpenses(expCache.rows);
          if (payCache?.rows?.length) setEngineerPayments(payCache.rows);
          // Engineers are what engineer cost is computed FROM, so they're the
          // one that decides whether a profit figure can be shown at all.
          if (engCache?.rows?.length) setFinanceReady(true);
          setHydrated(true);
        }

        // ── Phase 1: small tables + settings (fast, ~200-400 ms) ──────────────
        // Load these first so the UI can render immediately. Prospects and leads
        // are large (10k+ rows / 15+ paginated pages) and load in phase 2.
        // Split into two sequential batches instead of firing all 9 requests
        // at once — Safari's per-origin connection limit (a long-known
        // WebKit quirk, already worked around for the prospects/leads fetch
        // below) can stall a big burst of simultaneous requests indefinitely
        // in exactly the way withTimeout() now catches, but avoiding the
        // burst in the first place means fewer retries needed to begin with.
        // engineer_recruits is deliberately NOT in here (it was still in
        // this Promise.all while the comment said otherwise — five promises
        // destructured into four variables, so its result was thrown away
        // and the table fetched a SECOND time below; every cold start and
        // every focus re-sync paid for it twice and waited on it once). It
        // is the single
        // biggest table on the blocking path (1,200+ rows against ~120 for
        // clients+jobs+engineers combined) and nothing on the screen the app
        // opens on needs it — only the Engineers "sourcing pipeline" tab and
        // Campaigns read it. Blocking every cold start on it, on a phone,
        // is what turned a slow connection into "Couldn't reach the server"
        // with nothing rendered. It now loads in the background below and
        // fills itself in when it arrives.
        const [cliR, jobR, engR, agtR] = await withTimeout(
          Promise.all([
            loadAllRows("clients"),
            loadAllRows("jobs"),
            loadAllRows("engineers"),
            loadAllRows("letting_agents"),
          ]),
          // 60s, not 20s. This is five full-table fetches in one Promise.all
          // over whatever connection the phone happens to have; 20s was
          // aborting requests that were still healthy and mid-flight, turning
          // a slow load into a hard failure with nothing on screen.
          60_000,
          "clients/jobs/engineers/agents"
        );
        if (cancelled) return;
        // allSettled, not all. These five are independent, and one slow row
        // used to abort the other four — the whole batch shares a single
        // timeout, so a hung `expenses` fetch took settings, session and
        // tombstones down with it and the app landed with no costs at all.
        // Each is now retried once on its own before being given up on.
        const settle = async (label, fn) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              return await withTimeout(fn(), 20_000, label);
            } catch (err) {
              if (attempt) {
                console.warn(`[hydrate] ${label} failed twice:`, err?.message || err);
                return null;
              }
              await new Promise((r) => setTimeout(r, 800));
            }
          }
          return null;
        };
        const [s, expRow, payRow, sessionRes, remoteTombs] = await Promise.all([
          settle("settings", () => supabase.from("app_settings").select("data").eq("id", "singleton").maybeSingle()),
          settle("expenses", () => supabase.from("app_settings").select("data").eq("id", "expenses").maybeSingle()),
          settle("engineer payments", () => supabase.from("app_settings").select("data").eq("id", "engineer_payments").maybeSingle()),
          settle("session", () => supabase.auth.getSession()),
          settle("tombstones", () => loadRemoteTombstones()),
        ]);
        // Merge the cross-device tombstone list with anything this browser
        // recorded locally. Delete-on-any-device suppresses everywhere.
        const remoteJobDeleted = Object.keys(remoteTombs?.jobs || {});
        const remoteCliDeleted = Object.keys(remoteTombs?.clients || {});
        const remoteEngDeleted = new Set(Object.keys(remoteTombs?.engineers || {}));
        const mergedJobTombs = [...new Set([...(jobTombstones || []), ...remoteJobDeleted])];
        const mergedCliTombs = [...new Set([...(cliTombstones || []), ...remoteCliDeleted])];
        if (cancelled) return;

        const cli = cliR.rows, job = jobR.rows, agt = agtR.rows;
        // Fire-and-forget: never blocks first paint, never fails the load.
        let rec = [];
        loadAllRows("engineer_recruits").then((r) => {
          if (cancelled || r.failed) return;
          rec = r.rows;
          if (r.rows.length) setRecruits(r.rows);
        });
        // Engineers have no local IndexedDB cache/reconcile step (unlike
        // jobs/clients), so a deleted engineer (e.g. the seed/demo roster —
        // James Okafor, Priya Nair, Tomasz Kowalski) could previously
        // resurrect forever: an old-code device re-uploads it, and nothing
        // downstream ever re-checked the tombstone list against what
        // actually loaded. Filter AND actively purge here, same pattern as
        // the jobs/clients reconcile below.
        const resurrectedEngIds = engR.rows.filter((e) => remoteEngDeleted.has(e.id)).map((e) => e.id);
        if (resurrectedEngIds.length) {
          console.warn("[reconcile] purging resurrected engineer(s):", resurrectedEngIds);
          sbDelete("engineers", resurrectedEngIds);
        }
        const eng = engR.rows.filter((e) => !remoteEngDeleted.has(e.id));
        // Row-level security means an invalid/expired session doesn't error —
        // every table just comes back successfully empty, indistinguishable
        // from "the cloud genuinely has nothing" unless we check the session
        // itself. Getting this wrong is exactly how "no prospects yet" happens
        // while 14,000+ rows sit untouched on the server.
        // `sessionRes === null` means the CALL gave up, which is a network
        // problem — not proof the login expired. Telling someone to sign out
        // and back in over a dropped request is how a working session gets
        // thrown away, so only an answered call that genuinely contains no
        // session counts.
        const noSession = sessionRes !== null && !sessionRes?.data?.session;

        if (cliR.failed || jobR.failed || engR.failed || noSession) {
          // Never treat this as "the cloud is empty." Bail out here rather
          // than falling through to either the reseed branch or applyAll()
          // with a failed/unauthenticated dataset — both would show (or
          // push) an empty picture over whatever Phase 0 already painted.
          const msg = noSession
            ? "Your login session has expired, so nothing loaded from the server. Sign out and back in — don't re-enter any data first."
            : "Couldn't reach the server to load your data. This is often a browser extension (ad/content blocker) blocking requests — try disabling it for this site, or check your connection.";
          toast.error(msg);
          setLoadError(msg);
          setHydrated(true);
          setProspectsReady(true);
          setColdLeadsReady(true);
          return;
        }

        const set = s.data ? s.data.data : null;
        const empty = cli.length === 0 && job.length === 0 && eng.length === 0 && !set;

        if (empty) {
          // This account has real, ongoing production data — it is NEVER
          // legitimately empty. A previous version of this code trusted an
          // all-zero response as "genuinely empty, first-time setup" and
          // silently reseeded from this device's local fallback — which on
          // a device that's never used the localStorage path is itself
          // empty, so the visible result was a totally blank app with zero
          // error shown anywhere. That silent-reseed behavior is now gone
          // entirely: an all-empty response is ALWAYS treated as a failure
          // needing investigation, never as valid state to apply. Whatever
          // is actually causing Supabase to return zero rows for THIS
          // session (mismatched project config, an auth/session problem
          // invisible to the noSession check above, a network intermediary
          // altering the response, etc.) needs a human to look at the exact
          // diagnostics below rather than the app guessing and hiding it.
          const msg = `Got an empty response from the server for an account that has real data (clients:${cli.length} jobs:${job.length} engineers:${eng.length} settings:${set ? "present" : "MISSING"}, session:${sessionRes?.data?.session ? "present" : "MISSING"}). This is never trusted as genuinely empty — nothing was changed or reseeded. Retry, or if this repeats, share this exact message.`;
          console.error("[supabase] suspicious empty hydrate:", { cliLen: cli.length, jobLen: job.length, engLen: eng.length, hasSet: !!set, hasSession: !!sessionRes?.data?.session, url: process.env.NEXT_PUBLIC_SUPABASE_URL });
          toast.error(msg);
          setLoadError(msg);
          setHydrated(true);
          setProspectsReady(true);
          setColdLeadsReady(true);
          return;
        }

        const merged = mergeSettings(set);
        // MERGE cloud + local cache by id — never a binary "trust this whole
        // array or that one" choice. A binary choice can go wrong in BOTH
        // directions and each one already happened in testing:
        //   - trusting the cloud fetch: loses an edit whose network write
        //     hadn't landed yet (the original bug).
        //   - trusting "recent cache" wholesale: if THIS edit's IndexedDB
        //     write got cut off by a refresh (killed instantly — unlike a
        //     network request already in flight, which browsers often let
        //     finish server-side even after navigation starts) while the
        //     network write for the SAME edit actually succeeded, the cache
        //     is now the STALE one — but its timestamp still reads "recent"
        //     because of an EARLIER edit, so a recency check alone wrongly
        //     prefers the stale cache over the now-correct cloud data.
        // A union by id can't make either mistake: any id present in EITHER
        // source survives, so a not-yet-synced local add and an
        // already-synced cloud add both show up regardless of which side
        // "won" the race.
        //
        // DELETED rows are the one thing a union must NOT resurrect. "In the
        // cache but not in the cloud" is exactly what a row deleted on
        // another device looks like, so without this check the union added
        // it straight back — and the sbUpsertKey below then pushed it to the
        // cloud, making the resurrection permanent and undoing the delete
        // everywhere. Reported repeatedly: an expense deleted on one device
        // reappears after a reload or a few days, quietly changing the
        // month's totals. The tombstone list is the authority on what was
        // deleted; a cached copy is not.
        const mergeById = (cloudRows, cacheRows, tombstonedIds) => {
          const cloud = Array.isArray(cloudRows) ? cloudRows : [];
          const cache = Array.isArray(cacheRows) ? cacheRows : [];
          const dead = tombstonedIds || new Set();
          // A tombstoned row must go even if the CLOUD still carries it —
          // another device may not have pushed its delete yet.
          const live = dead.size ? cloud.filter((r) => !dead.has(r?.id)) : cloud;
          if (!cache.length) return live.length === cloud.length ? cloud : live;
          const byId = new Map(live.map((r) => [r.id, r]));
          let changed = live.length !== cloud.length;
          for (const r of cache) {
            if (r && r.id && !byId.has(r.id) && !dead.has(r.id)) { byId.set(r.id, r); changed = true; }
          }
          return changed ? [...byId.values()] : cloud;
        };
        // Defensively unwrap an unexpected extra {data: ...} layer around a
        // row's real content. Confirmed via direct, unmediated database
        // reads that the STORED value is always the plain {items:[...]}
        // shape — but on at least one real account this exact row arrived
        // client-side wrapped as {data: {items:[...]}}, with jobs/clients
        // requests unaffected. That selective pattern (only rows whose
        // request URL contains "expenses"/"engineer_payments") points at
        // something between the network and this code — most likely a
        // browser extension or antivirus/security tool that intercepts and
        // re-wraps responses it flags as financial — not a real change in
        // what's stored. Unwrap it here so the app works either way.
        const unwrapExtraLayer = (raw) =>
          raw && typeof raw === "object" && !Array.isArray(raw.items) &&
          raw.data && typeof raw.data === "object" && Array.isArray(raw.data.items)
            ? raw.data
            : raw;
        const expData = unwrapExtraLayer(expRow?.data);
        const payData = unwrapExtraLayer(payRow?.data);
        const cloudExpenses = expData?.items ?? (merged.expenses?.length ? merged.expenses : []);
        const cloudEngineerPayments = payData?.items ?? (merged.engineerPayments?.length ? merged.engineerPayments : []);
        const deadExpenses = new Set(Object.keys(remoteTombs?.expenses || {}));
        const deadPayments = new Set(Object.keys(remoteTombs?.engineer_payments || {}));
        const expenses = mergeById(cloudExpenses, expCache?.rows, deadExpenses);
        const engineerPayments = mergeById(cloudEngineerPayments, payCache?.rows, deadPayments);
        if (!expRow?.data && merged.expenses?.length) sbUpsertKey("expenses", merged.expenses);
        if (!payRow?.data && merged.engineerPayments?.length) sbUpsertKey("engineer_payments", merged.engineerPayments);
        // Cache had rows the cloud didn't — push the merged (superset) array
        // so the cloud catches up instead of staying permanently short.
        if (expenses !== cloudExpenses) sbUpsertKey("expenses", expenses);
        if (engineerPayments !== cloudEngineerPayments) sbUpsertKey("engineer_payments", engineerPayments);

        // Reconcile cloud data with local cached rows to ensure newly created or edited items
        // that haven't synced to Supabase yet (or where cloud returned stale data) are preserved.
        //
        // This USED to guess: a local-only row less than 5 minutes old was treated as
        // "genuinely still syncing" and kept; anything older was presumed a ghost from a
        // stale cache and PERMANENTLY DROPPED, with no warning to anyone. That guess is
        // exactly how real, invoiced jobs got destroyed — a save that failed silently (a
        // dropped connection, a backgrounded tab, poor signal in the field) sits in the
        // local cache same as any other unsynced write, and the very next time the app was
        // opened more than five minutes later, reconcile read "not in the cloud, more than
        // 5 minutes old" and quietly deleted it from local state too, so the next
        // writeCache pass erased it from the cache as well. Nothing anywhere told the
        // owner their job had been thrown away.
        //
        // A row that only exists locally is now ALWAYS treated as unsynced work to push,
        // never as a presumed ghost — the cost of that (a stray old test row from a
        // genuinely broken build resurfacing once) is trivial next to the cost of the
        // alternative (silently destroying real business data with no error, no toast, no
        // trace). Tombstoned rows (explicitly deleted by the user) are still never
        // resurrected — this only changes what happens to rows nobody ever asked to delete.
        const now = Date.now();
        const reconcileRows = (cloudRows, localRows, table, tombstones) => {
          const tombSet = new Set(tombstones || []);
          // Deleted-here-but-not-yet-caught-up-elsewhere rows can still be
          // sitting in `cloudRows` (a delete that hadn't landed when this
          // read fired, or another tab racing a re-upload) — strip them
          // before anything else runs so they can never survive reconcile.
          // ALSO actively hard-delete them from cloud so an old-code device
          // (running pre-tombstone JS from a stale cache) that keeps trying
          // to resurrect a tombstoned row gets its work continuously undone.
          // Without this, ghosts loop forever: old-code device re-uploads,
          // new-code device hides but doesn't delete, next hydrate sees it
          // in cloud again.
          const resurrectedIds = tombSet.size ? cloudRows.filter((r) => tombSet.has(r.id)).map((r) => r.id) : [];
          if (resurrectedIds.length) {
            console.warn(`[reconcile] purging ${resurrectedIds.length} resurrected ${table} row(s):`, resurrectedIds);
            sbDelete(table, resurrectedIds);
          }
          const cleanCloudRows = tombSet.size ? cloudRows.filter((r) => !tombSet.has(r.id)) : cloudRows;
          if (!localRows || !localRows.length) return cleanCloudRows;
          const cloudMap = new Map(cleanCloudRows.map((r) => [r.id, r]));
          const merged = [...cleanCloudRows];
          for (const local of localRows) {
            if (tombSet.has(local.id)) continue; // deleted here — never resurrect
            if (!cloudMap.has(local.id)) {
              // Local-only, not tombstoned: always treat as unsynced work and
              // push it, never as a presumed ghost to discard. See the note above.
              merged.unshift(local);
              sbUpsert(table, local.id, local);
              console.warn(`[reconcile] ${table} ${local.id} was only in the local cache — re-pushing to the cloud now.`);
            } else {
              // Item exists in both cloud and local cache. If local has a newer timestamp, preserve it!
              const cloud = cloudMap.get(local.id);
              const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
              const cloudTime = new Date(cloud.updatedAt || cloud.createdAt || 0).getTime();
              if (localTime > cloudTime) {
                const idx = merged.findIndex((r) => r.id === local.id);
                if (idx !== -1) merged[idx] = local;
                sbUpsert(table, local.id, local);
              }
            }
          }
          // Deduplicate the final merged array to prevent ghosts from duplicating forever
          const dedupe = [];
          const seen = new Set();
          for (const r of merged) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              dedupe.push(r);
            }
          }
          return dedupe;
        };

        const safeJobs = reconcileRows(job, jobCache?.rows || [], "jobs", mergedJobTombs);
        const safeClients = reconcileRows(cli, cliCache?.rows || [], "clients", mergedCliTombs);

        // Apply phase 1 immediately — UI unblocks here. Deliberately omits
        // prospects/coldLeads — those are handled by the phase-2 cache below.
        // They used to be passed as `[]` "placeholders", which looked inert
        // but wasn't: applyAll's `if (d.prospects) setProspects(...)` treats
        // an empty array as truthy, so every re-hydrate (tab focus, window
        // focus, the 90s backstop interval — not just the initial page load)
        // wiped the whole Prospects list to zero for a moment before phase 2
        // repainted it a beat later. That's the exact "list flashes to zero
        // then instantly comes back" symptom — it was firing on every
        // refocus throughout a session, not just on load.
        applyAll({
          clients: safeClients,
          jobs: safeJobs,
          engineers: eng,
          agents: agt,
          recruits: rec,  // may be [] — filled in by the background load above
          ...merged,
          expenses,
          engineerPayments,
        });
        if (!cancelled) {
          setHydrated(true);
          setLoadError(null);
          hasGoodDataRef.current = true;
          // Only claim the profit figures are computable if the things they
          // are computed FROM actually came back. Engineers drive engineer
          // cost; the two settings rows drive expenses and payments. A null
          // row here means the fetch gave up, not that the business has no
          // expenses — and the difference is the whole point.
          //
          // Sticky, never downgraded once true. This hydrate() re-runs on
          // every focus/visibility change and every 2 minutes (see the
          // re-sync effect below) — a phone waking from background is
          // exactly when one of these three fetches is most likely to blip.
          // Recomputing financeReady from scratch on every cycle meant a
          // single transient failure on an ALREADY-PROVEN-GOOD dashboard
          // flipped it back to false and brought the "costs haven't loaded"
          // banner back over real, correct figures — reported as the banner
          // showing up "always". Once the real cost data has been seen this
          // session, a later blip is a reason to keep quietly retrying, not
          // to tell the user their loaded numbers are now unproven.
          const financeGood = eng.length > 0 && expRow !== null && payRow !== null;
          if (financeGood) setFinanceReady(true);
        }
        // Cache the fresh phase-1 snapshots for the next refresh.
        writeCache("jobs", safeJobs);
        writeCache("clients", safeClients);
        // Seed the caches phase 0 now paints from. Expenses and payments
        // were only ever written on a local edit, so a device that had
        // never edited one had nothing to paint; engineers was never cached
        // at all.
        writeCache("engineers", eng);
        writeCache("expenses", expenses);
        writeCache("engineer_payments", engineerPayments);

        // ── Phase 2: large tables — stale-while-revalidate ────────────────────
        //
        // THROTTLED. hydrate() re-runs every 90s and on every tab focus, and
        // it used to re-download prospects (14.5k rows) and leads (42.5k rows)
        // in full every single time — tens of megabytes of JSON fetched,
        // parsed, diffed and re-cached while someone was just trying to use
        // the app. That is most of why the FSM felt sluggish, and why the
        // "couldn't load your data" timeout fired: the heartbeat was still
        // saturating the connection when the next one started.
        //
        // These tables are bulk imports — they change when someone imports or
        // works a lead, not minute to minute — so a re-sync inside the TTL
        // keeps what's already in memory. Real edits still write through
        // immediately (see updateProspect/updateColdLead), so nothing an
        // operator does waits on this.
        const bigStale = Date.now() - lastBigSyncRef.current > BIG_TABLE_TTL_MS;
        if (!bigStale && prospectsReadyRef.current) {
          if (!cancelled) setLoadError(null);
          return;
        }
        // Step A: paint the last cached snapshot from IndexedDB instantly, so a
        // refresh shows prospects immediately instead of a multi-second spinner.
        const normProspects = (rows) => rows.map((p) =>
          p.isAgent === undefined ? { ...p, isAgent: looksLikeCompany(p.ownerName) } : p
        );
        const [proCache, cldCache] = await withTimeout(
          Promise.all([
            readCache("prospects"),
            readCache("leads"),
          ]),
          10_000,
          "prospects/leads cache read"
        );
        if (cancelled) return;
        if (proCache?.rows?.length) setProspects(normProspects(proCache.rows));
        if (cldCache?.rows?.length) setColdLeads(cldCache.rows);
        // If we painted SOMETHING from cache, drop the skeleton right away.
        if (proCache?.rows?.length) { setProspectsReady(true); prospectsReadyRef.current = true; }
        if (cldCache?.rows?.length) setColdLeadsReady(true);

        // Nothing on screen needs these yet — the cache above has already
        // painted whatever this browser had. Skip the 37MB.
        if (!wantProspectsRef.current && !wantLeadsRef.current) {
          if (!cancelled) setLoadError(null);
          return;
        }

        // Step B: fetch fresh rows in the background and overwrite state + cache.
        // Run these sequentially to avoid overwhelming Safari's 6-connection limit,
        // which can cause fetches to hang indefinitely if we spawn 10 concurrent requests.
        // Each table is fetched only if something asked for it; the other keeps
        // whatever the cache painted, so it is never blanked by being skipped.
        const SKIPPED = { rows: null, failed: false, skipped: true };
        const proR = wantProspectsRef.current ? await loadAllRows("prospects") : SKIPPED;
        const cldR = wantLeadsRef.current ? await loadAllRows("leads") : SKIPPED;

        if (cancelled) return;
        // Only a run that fetched BOTH tables successfully counts as a full
        // sync; otherwise the next request for the missing one would be
        // throttled away and never load.
        if (!proR.failed && !cldR.failed && !proR.skipped && !cldR.skipped) lastBigSyncRef.current = Date.now();

        // --- ONE-TIME MIGRATION FOR LARGE TABLES ---
        // The initial sbSeed() omitted these tables. If the cloud is empty but the user's
        // browser has thousands of rows in localStorage, we must push them up now so they
        // aren't lost to the void.
        const local = loadLocal();
        const token = sessionRes?.data?.session?.access_token;
        const migrateTable = async (table, items, endpoint) => {
          if (!items || !items.length) return false;
          console.log(`[migration] Pushing ${items.length} ${table} from local to cloud...`);
          const CHUNK = 1500;
          for (let i = 0; i < items.length; i += CHUNK) {
            const slice = items.slice(i, i + CHUNK);
            if (token && endpoint) {
              await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ [table === "leads" ? "leads" : "prospects"]: slice }),
              }).catch(() => {});
            } else {
              await supabase.from(table).upsert(slice.map((x) => ({ id: x.id, data: x })));
            }
          }
          return true;
        };

        if (!proR.skipped && !proR.failed && proR.rows.length === 0 && local.prospects?.length > 0) {
          proR.rows = local.prospects;
          migrateTable("prospects", local.prospects, "/api/prospects/upsert").catch(console.error);
        }
        if (!cldR.skipped && !cldR.failed && cldR.rows.length === 0 && local.coldLeads?.length > 0) {
          cldR.rows = local.coldLeads;
          migrateTable("leads", local.coldLeads, "/api/leads/upsert").catch(console.error);
        }
        if (!agtR.failed && agt.length === 0 && local.agents?.length > 0) {
          setAgents(local.agents);
          migrateTable("letting_agents", local.agents, null).catch(console.error);
        }
        if (rec.length === 0 && local.recruits?.length > 0) {
          setRecruits(local.recruits);
          migrateTable("engineer_recruits", local.recruits, null).catch(console.error);
        }
        // -------------------------------------------
        // A failed refetch must never overwrite the good cache-painted state
        // from Step A with an empty list — that's exactly how a transient
        // network/auth blip turns into "all my prospects are gone".
        // `skipped` = nothing on screen asked for this table, so it was never
        // fetched. Leave the cache-painted state exactly as it is: writing
        // here would blank it, and toasting would report a failure that never
        // happened.
        if (proR.skipped) {
          // nothing to do
        } else if (proR.failed) {
          toast.error("Couldn't refresh prospects from the server — showing the last cached copy.");
        } else {
          setProspects(normProspects(proR.rows));
          writeCache("prospects", proR.rows);
        }
        if (cldR.skipped) {
          // nothing to do
        } else if (cldR.failed) {
          toast.error("Couldn't refresh leads from the server — showing the last cached copy.");
        } else {
          setColdLeads(cldR.rows);
          writeCache("leads", cldR.rows);
        }
        // Only mark a table "ready" once it has genuinely been loaded — the
        // skeletons and the search's "still loading" hint depend on it.
        if (!cancelled) {
          if (!proR.skipped) { setProspectsReady(true); prospectsReadyRef.current = true; }
          if (!cldR.skipped) setColdLeadsReady(true);
        }
      }
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Retries attemptHydrate on any thrown error (a genuine timeout/network
    // failure — the internal noSession/empty/failed branches above handle
    // themselves and don't throw) with backoff before giving up. This is
    // what makes a transient hang SELF-HEAL instead of requiring a manual
    // click on the retry banner: the exact class of failure this targets —
    // a stalled connection — is now also fixed at the transport level (see
    // lib/supabase.js's AbortController-based fetch), so a retry a couple
    // seconds later has a genuinely different, unstuck connection pool to
    // work with, not just another attempt doomed to hang the same way.
    async function hydrate() {
      const ATTEMPTS = 3;
      const DELAYS_MS = [2000, 5000];
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          await attemptHydrate();
          return; // success (or a handled degraded state that returned normally)
        } catch (err) {
          console.error(`[supabase] hydrate attempt ${attempt}/${ATTEMPTS} failed:`, err);
          if (cancelled) return;
          if (attempt < ATTEMPTS) {
            await sleep(DELAYS_MS[attempt - 1]);
            if (cancelled) return;
            continue;
          }
          // A BACKGROUND re-sync failing is not a data emergency.
          //
          // This used to fire regardless: a single flaky 90s heartbeat (or one
          // slow response tripping the timeout) replaced perfectly good,
          // already-loaded cloud data with `loadLocal()` and shouted "this is
          // NOT your real data" across the top of the screen — while the real
          // data was sitting right there a moment earlier. That's the glitch
          // that appears "after a while": it needs a working session first.
          //
          // So: if we already have good data on screen, keep it, stay quiet,
          // and let the next heartbeat try again. The alarming fallback is
          // reserved for a COLD start, where there genuinely is nothing to
          // show and the operator must know the screen isn't trustworthy.
          if (hasGoodDataRef.current) {
            console.warn(`[supabase] background re-sync failed, keeping loaded data:`, err?.message || err);
            return;
          }
          // NEVER fabricate data for a real account.
          //
          // This used to call applyAll(loadLocal()), whose fallback was the
          // demo dataset in lib/seed.js — invented clients and jobs ("Helen
          // Whitfield, 9 Northcote Rd"). That file is now deleted and
          // loadLocal() returns empty arrays, so there is no demo data left
          // anywhere to fall back TO. On a phone that failed to reach the
          // operator was shown a normal-looking Jobs list of PEOPLE WHO DO NOT
          // EXIST, with a banner above it as the only clue. That is worse than
          // showing nothing: it's indistinguishable from real work at a
          // glance, it can be acted on, and it makes the whole app look
          // broken and untrustworthy when the numbers don't match.
          //
          // Fail honestly instead: nothing is loaded, the error stands, and
          // Retry is the way forward. The IndexedDB cache (real data from a
          // previous session, painted in Phase 0 above) is the only fallback
          // that's ever legitimate, and it has already been applied if present.
          const msg = `Couldn't load your data from the server after ${ATTEMPTS} tries (${err?.message || "unknown error"}). Nothing is shown rather than risk showing you the wrong figures — check your connection and hit Retry.`;
          toast.error(msg);
          setLoadError(msg);
          setHydrated(true);
          setProspectsReady(true);
          setColdLeadsReady(true);
        }
      }
    }

    hydrateRef.current = hydrate;
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-sync from Supabase whenever this tab/device becomes active again, and
  // on a backstop interval for devices where focus events don't fire
  // reliably (some PWA/Electron wrappers). This is THE fix for "a job I
  // created on my phone never shows up on my desktop" — previously data was
  // fetched exactly once, on initial page load, and never again. A tab or
  // installed app left open for hours (or days) would silently drift further
  // and further behind reality, including showing jobs/clients that were
  // deleted elsewhere (their local React state just never learned about it).
  // Calls the SAME hydrate() defined above — not a second, simplified
  // refetch path — so focus-triggered refreshes go through the identical
  // reconcile + tombstone-purge logic as the initial load.
  useEffect(() => {
    if (!supabaseConfigured) return;
    // 45s, not 5 minutes. Phase 1 is now genuinely small — five small
    // tables and three settings rows, with the 1,200-row recruits table off
    // this path and the big tables behind their own TTL — so a re-sync on
    // focus costs a few hundred KB, not tens of megabytes. 5 minutes was
    // sized for the old heavy hydrate and meant picking the phone up right
    // after a change on the desktop showed the old numbers anyway.
    const MIN_GAP_MS = 45 * 1000;
    let lastRun = Date.now();
    const maybeRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRun < MIN_GAP_MS) return;
      // Prevent focus-triggered hydration if we just wrote to the DB,
      // avoiding a race where we pull the old state before the upsert completes
      // and overwrite the optimistic UI.
      // Skip only while a write of OUR OWN could still be in flight. This
      // used to reuse MIN_GAP_MS, which meant any local edit blocked
      // incoming changes for the whole window after it.
      if (now - _lastWriteTime < 10 * 1000) return;
      lastRun = now;
      hydrateRef.current?.();
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    // 2m backstop — catches devices that never fire focus/visibility events
    // (some PWA installs) and keeps a tab that's just sitting open, never
    // blurred, from drifting stale over a long shift. At 15 minutes, a
    // second person booking a job could be invisible for a quarter of an
    // hour on a screen someone was actively watching.
    const interval = setInterval(maybeRefresh, 2 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
      clearInterval(interval);
    };
  }, []);

  // ── AUTO-START DUE JOBS ──────────────────────────────────────────────
  // A booked job whose appointment time has arrived moves itself to
  // In progress without anyone needing to remember to tap the status button.
  // Checked on load, on every focus/visibility change (the same triggers the
  // general re-sync already uses) and every 5 minutes while the tab stays
  // open — a job starting at 1pm shouldn't still read "Scheduled" at 1:20
  // just because nobody happened to switch tabs in between. The cron at
  // /api/cron/auto-start-jobs is the backstop for when nobody has the app
  // open at all when a job's start time passes.
  useEffect(() => {
    if (!hydrated) return;
    const sweep = () => {
      for (const job of jobsRef.current) {
        const patch = autoStartDueVisits(job);
        if (patch) updateJob(job.id, patch);
      }
    };
    sweep();
    document.addEventListener("visibilitychange", sweep);
    window.addEventListener("focus", sweep);
    const interval = setInterval(sweep, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", sweep);
      window.removeEventListener("focus", sweep);
      clearInterval(interval);
    };
  }, [hydrated]);

  // ── LIVE SYNC ────────────────────────────────────────────────────────
  // Subscribe to row changes on the two tables that actually change during a
  // shift, so a job booked or completed on one device appears on every other
  // one in about a second.
  //
  // Before this the app was purely poll-based: re-hydrate on focus, plus a
  // 15-minute backstop. Two people working the same day therefore spent most
  // of it looking at each other's stale data, and the only way to see a change
  // was to leave the app and come back — which is a large part of why it felt
  // like it was showing the wrong thing.
  //
  // Patches the single changed row into state rather than re-running the whole
  // hydrate: a 38MB refetch to learn that one job's status moved is exactly
  // the cost this is meant to remove.
  useEffect(() => {
    if (!hydrated || !supabaseConfigured || !supabase) return;

    // Our OWN writes come back as events too. Ignoring anything that lands
    // right after a local write stops a remote echo from clobbering optimistic
    // UI mid-edit (the same guard the focus re-sync uses).
    const isOwnEcho = () => Date.now() - _lastWriteTime < 3000;

    const applyRow = (setter, cacheKey) => (payload) => {
      const row = payload.new ?? payload.old;
      const id = row?.id;
      if (!id) return;
      if (payload.eventType === "DELETE") {
        setter((prev) => {
          if (!prev.some((x) => x.id === id)) return prev;
          const next = prev.filter((x) => x.id !== id);
          writeCache(cacheKey, next);
          return next;
        });
        return;
      }
      const data = payload.new?.data;
      if (!data) return;
      if (isOwnEcho()) return;
      setter((prev) => {
        const existing = prev.find((x) => x.id === id);
        // Never let an older copy overwrite a newer one — events can arrive
        // out of order, and the local copy may be a fresher optimistic write.
        if (existing?.updatedAt && data.updatedAt && new Date(data.updatedAt) <= new Date(existing.updatedAt)) {
          return prev;
        }
        const next = existing
          ? prev.map((x) => (x.id === id ? { ...x, ...data } : x))
          : [data, ...prev];
        writeCache(cacheKey, next);
        return next;
      });
    };

    // app_settings holds expenses and engineer payments as one row each
    // ({ items: [...] }), so they can't go through applyRow — but they are
    // exactly the figures that make a profit number wrong when they're
    // stale, so they belong on the live channel rather than waiting for the
    // next re-sync.
    const applySettingsRow = (payload) => {
      const row = payload.new;
      const items = row?.data?.items;
      if (!Array.isArray(items) || isOwnEcho()) return;
      if (row.id === "expenses") { setExpenses(items); writeCache("expenses", items); }
      if (row.id === "engineer_payments") { setEngineerPayments(items); writeCache("engineer_payments", items); }
    };

    const channel = supabase
      .channel("lcl-ops-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, applyRow(setJobs, "jobs"))
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, applyRow(setClients, "clients"))
      .on("postgres_changes", { event: "*", schema: "public", table: "engineers" }, applyRow(setEngineers, "engineers"))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, applySettingsRow)
      .subscribe((status) => {
        // Realtime has to be enabled per-table on the Supabase side. If it
        // isn't, this never errors — it just goes quiet — so say so once
        // rather than leaving it looking like it works.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[supabase] live sync unavailable — falling back to focus/interval refresh.");
        }
      });

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [hydrated]);

  // localStorage persistence — ONLY when Supabase isn't configured.
  useEffect(() => {
    if (!hydrated || supabaseConfigured) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          clients,
          jobs,
          email,
          templates,
          docTemplates,
          companyDocs,
          invoiceSeq,
          servicePrices,
          engineers,
          expenses,
          engineerPayments,
          prospects,
          coldLeads,
        })
      );
    } catch (e) {
      // storage full / unavailable — ignore
    }
  }, [clients, jobs, email, templates, docTemplates, companyDocs, invoiceSeq, servicePrices, engineers, expenses, engineerPayments, prospects, coldLeads, hydrated]);

  // Settings → Supabase (single row) when configured.
  useEffect(() => {
    if (!hydrated || !supabaseConfigured) return;
    sbUpsertSettings({ email, templates, docTemplates, companyDocs, invoiceSeq, servicePrices, autoNotify });
  }, [email, templates, docTemplates, companyDocs, invoiceSeq, servicePrices, autoNotify, hydrated]);

  // Sync main collections to IndexedDB cache so they're immediately available on refresh
  // before the cloud roundtrip completes (and safeguards against data loss if offline).
  useEffect(() => {
    if (!hydrated) return;
    writeCache("jobs", jobs);
  }, [jobs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeCache("clients", clients);
  }, [clients, hydrated]);

  // Expenses + engineer payments persist directly from their own mutators
  // below (addExpense/updateExpense/removeExpense/addEngineerPayment/
  // removeEngineerPayment) — see the comment there for why a reactive
  // watcher effect here was actually the bug, not a safety net.

  // ---- Jobs API ----
  const jobsRef = useRef([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const addJob = useCallback((job) => {
    // A 4-digit random id is only ~9,000 values — collide with an existing
    // job and sbUpsert silently overwrites it (same id = same row). Check
    // against what's currently loaded before picking one.
    const existing = new Set(jobsRef.current.map((j) => j.id));
    let id;
    do {
      id = "JOB-" + Math.floor(1000 + Math.random() * 9000);
    } while (existing.has(id));
    const now = new Date().toISOString();
    const newJob = {
      id,
      status: "quote",
      engineerId: "unassigned",
      scheduledAt: null,
      price: 0,
      notes: "",
      services: [],
      certExpiry: null,
      createdAt: now,
      updatedAt: now,
      ...job,
    };
    setJobs((prev) => {
      const next = [newJob, ...prev];
      writeCache("jobs", next);
      return next;
    });
    sbUpsert("jobs", id, newJob);
    toast(`Job created · ${id}`);
    return newJob;
  }, []);

  const updateJob = useCallback((id, patch) => {
    setJobs((prev) => {
      const next = prev.map((j) => {
        if (j.id !== id) return j;
        const now = new Date().toISOString();
        const merged = { ...j, ...patch, updatedAt: now };
        // statusHistory — append on every status change so we can compute
        // time-in-status and flag jobs stuck >7 days (handoff §4.7).
        if (patch.status && patch.status !== j.status) {
          const prevHistory = Array.isArray(j.statusHistory) ? j.statusHistory : [];
          const lastIdx = prevHistory.length - 1;
          const closed = lastIdx >= 0 && !prevHistory[lastIdx].exitedAt
            ? [...prevHistory.slice(0, lastIdx), { ...prevHistory[lastIdx], exitedAt: now }]
            : prevHistory;
          merged.statusHistory = [...closed, { status: patch.status, enteredAt: now, exitedAt: null, by: "" }];
        }
        sbUpsert("jobs", id, merged);
        // Auto-close linked tasks the moment the underlying job progresses:
        //   • Terminal status (completed/paid/cancelled) → close everything
        //   • Engineer assigned → close job_unassigned auto-tasks
        //   • Quote left the quote stage → close quote_followup auto-tasks
        if (patch.status && ["completed", "paid", "cancelled"].includes(patch.status)) {
          closeLinkedTasks({
            supabase, kind: "job", id,
            reason: `Job ${patch.status} — task closed.`,
            actor: actorRef.current,
          }).catch(() => {});
        } else if (patch.status && j.status === "quote" && patch.status !== "quote") {
          closeLinkedTasks({
            supabase, kind: "job", id, sources: ["quote_followup"],
            reason: `Quote moved to ${patch.status} — task closed.`,
            actor: actorRef.current,
          }).catch(() => {});
        }
        if (patch.engineerId && patch.engineerId !== "unassigned" && patch.engineerId !== j.engineerId) {
          closeLinkedTasks({
            supabase, kind: "job", id, sources: ["job_unassigned"],
            reason: "Engineer assigned — task closed.",
            actor: actorRef.current,
          }).catch(() => {});
        }
        return merged;
      });
      writeCache("jobs", next);
      return next;
    });
    toast("Saved");
  }, []);

  const removeJob = useCallback((id) => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== id);
      writeCache("jobs", next);
      return next;
    });
    addTombstones("jobs", [id]);
    sbDelete("jobs", [id]);
    toast("Job deleted", "delete");
  }, []);

  // Create the "next" recurring job for an annual/periodic certificate.
  const createRecurringJob = useCallback((sourceJob) => {
    const months = sourceJob.recurringMonths || 12;
    const baseDate = sourceJob.certExpiry
      ? new Date(sourceJob.certExpiry)
      : sourceJob.scheduledAt
      ? addMo(new Date(sourceJob.scheduledAt), months)
      : addMo(new Date(), months);
    const recurringJob = {
      clientId: sourceJob.clientId,
      propertyId: sourceJob.propertyId,
      services: sourceJob.services || [],
      lineItems: sourceJob.lineItems,
      quantities: sourceJob.quantities,
      gasAppliances: sourceJob.gasAppliances,
      nameOnCert: sourceJob.nameOnCert,
      accessName: sourceJob.accessName,
      accessPhone: sourceJob.accessPhone,
      callBefore: sourceJob.callBefore,
      engineerId: sourceJob.engineerId,
      price: sourceJob.price,
      notes: `Recurring from ${sourceJob.id}`,
      status: "quote",
      recurringMonths: months,
      recurringFromId: sourceJob.id,
      scheduledAt: baseDate.toISOString(),
      windowFrom: sourceJob.windowFrom,
      windowTo: sourceJob.windowTo,
      windowPart: sourceJob.windowPart,
    };
    return addJob(recurringJob);
  }, [addJob]);

  // Part of a job got done, part didn't — the gas engineer completed the CP12
  // but the EICR couldn't be carried out on the day.
  //
  // Before this, a split job simply refused to be invoiced until EVERY visit
  // was complete (readyToInvoice in lib/visits.js), so there was no way to
  // bill the work that HAD been done without either faking the outstanding
  // visit as complete or hand-editing the line items. Both lose the fact that
  // a service is still owed to the customer.
  //
  // This moves the unfinished work OFF the job and onto its own linked job:
  //   • the original keeps only the completed services, and can be invoiced
  //     immediately for exactly what was carried out;
  //   • the outstanding service becomes a real job sitting in the pipeline as
  //     a quote, so it can be rescheduled (or cancelled with a reason) and
  //     never silently disappears.
  // Returns the new job, or null when there is nothing outstanding to move.
  const splitOffIncompleteWork = useCallback((jobId) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (!job) return null;

    const visits = Array.isArray(job.visits) ? job.visits : [];
    const outstanding = visits.filter((v) => v.status !== "completed" && v.status !== "cancelled");
    const finished = visits.filter((v) => v.status === "completed");
    if (!outstanding.length || !finished.length) return null;

    const moveIds = new Set(outstanding.flatMap((v) => v.lineIds || []));
    if (!moveIds.size) return null;

    const allLines = getJobLines(job);
    const movedLines = allLines.filter((l) => moveIds.has(l.id));
    const keptLines = allLines.filter((l) => !moveIds.has(l.id));
    if (!movedLines.length || !keptLines.length) return null;

    const movedCodes = [...new Set(movedLines.map((l) => l.code).filter(Boolean))];
    const keptCodes = [...new Set(keptLines.map((l) => l.code).filter(Boolean))];

    const isParentPaidOrInvoiced = ["invoiced", "paid"].includes(job.status);

    // The outstanding work, as its own job. Deliberately a QUOTE with no date
    // and no engineer: it genuinely is not booked, and the customer may not
    // even want it rebooked — that is a conversation, not an assumption.
    const followUp = addJob({
      clientId: job.clientId,
      propertyId: job.propertyId,
      services: movedCodes,
      lineItems: movedLines,
      quantities: job.quantities,
      gasAppliances: job.gasAppliances,
      nameOnCert: job.nameOnCert,
      accessName: job.accessName,
      accessPhone: job.accessPhone,
      callBefore: job.callBefore,
      engineerId: "",
      price: Math.max(0, movedLines.reduce((s, l) => s + lineTotal(l), 0)),
      status: "quote",
      notes: `Not completed on ${job.id} — needs rescheduling.`,
      relatedJobId: job.id,
      relationType: "not_completed",
      prepaidOnParent: isParentPaidOrInvoiced,
      parentJobId: job.id,
      billingStatus: isParentPaidOrInvoiced ? "prepaid_on_parent" : "unbilled",
      scheduledAt: null,
    });

    // What's left on the original: only the finished work, only the finished
    // visits, repriced. If the job was already invoiced or paid, we preserve its status
    // and full invoiced price so payment records stay 100% matched.
    const keptJob = { ...job, lineItems: keptLines };
    const newPrice = isParentPaidOrInvoiced ? (job.price || jobPayable(keptJob)) : jobPayable(keptJob);
    const newStatus = isParentPaidOrInvoiced ? job.status : "completed";

    updateJob(job.id, {
      lineItems: keptLines,
      services: keptCodes,
      visits: finished,
      price: newPrice,
      status: newStatus,
      splitOffJobId: followUp?.id || null,
    });

    return followUp;
  }, [addJob, updateJob]);

  // Merge a split-off child job back into its parent job
  const mergeBackToParentJob = useCallback((childJobId) => {
    const child = jobsRef.current.find((j) => j.id === childJobId);
    if (!child) return null;

    const parentId = child.relatedJobId || child.parentJobId;
    if (!parentId) return null;

    const parent = jobsRef.current.find((j) => j.id === parentId);
    if (!parent) return null;

    const parentLines = getJobLines(parent);
    const childLines = getJobLines(child);
    
    // Combine line items avoiding duplicate IDs
    const parentLineIds = new Set(parentLines.map((l) => l.id));
    const combinedLines = [...parentLines];
    for (const l of childLines) {
      if (!parentLineIds.has(l.id)) combinedLines.push(l);
    }
    const combinedCodes = [...new Set(combinedLines.map((l) => l.code).filter(Boolean))];

    // Combine visits
    const parentVisits = Array.isArray(parent.visits) ? [...parent.visits] : [];
    const childVisits = Array.isArray(child.visits) ? [...child.visits] : [];
    
    // If child had no explicit visits array but had engineer/scheduledAt, create visit
    if (!childVisits.length && childLines.length) {
      childVisits.push({
        id: "vis-" + Date.now().toString(36),
        lineIds: childLines.map((l) => l.id),
        engineerId: child.engineerId || "unassigned",
        scheduledAt: child.scheduledAt || null,
        windowFrom: child.windowFrom || "",
        windowTo: child.windowTo || "",
        windowPart: child.windowPart || "",
        status: child.status === "completed" ? "completed" : "scheduled",
        notes: child.notes || "",
      });
    }

    const combinedVisits = [...parentVisits, ...childVisits];
    const tempJob = { ...parent, lineItems: combinedLines };
    const newPrice = jobPayable(tempJob);

    updateJob(parent.id, {
      lineItems: combinedLines,
      services: combinedCodes,
      visits: combinedVisits,
      price: newPrice,
      splitOffJobId: null,
    });

    removeJob(childJobId);
    toast(`Job ${childJobId} merged back into ${parent.id}`, "success");
    return parent;
  }, [updateJob, removeJob]);

  // Generate (or return existing) a share token for a job.
  const generateShareToken = useCallback((jobId) => {
    let token;
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        token = j.shareToken || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        const merged = { ...j, shareToken: token };
        sbUpsert("jobs", jobId, merged);
        return merged;
      })
    );
    return token;
  }, []);

  // Update local state only — no Supabase write, no toast.
  // Used by real-time subscriptions to avoid write→event→write loops.
  const patchJobLocal = useCallback((id, patch) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...patch } : j))
    );
  }, []);

  // Append an entry to a job's communication/activity thread.
  const logActivity = useCallback((jobId, entry) => {
    const full = {
      id: "act-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: new Date().toISOString(),
      ...entry,
    };
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== jobId) return j;
        const merged = { ...j, activity: [...(j.activity || []), full] };
        sbUpsert("jobs", jobId, merged);
        return merged;
      })
    );
  }, []);

  // Merge in activity entries fetched straight from Supabase (e.g. the job
  // detail page's on-mount "catch up on webhook activity" check) WITHOUT
  // touching any other field. That fetch can resolve seconds after mount —
  // long enough for the user to have already changed status/engineer/etc
  // locally — so applying the fetched row wholesale (the old behaviour)
  // would silently stomp that fresh edit back to whatever was in the cloud
  // when the fetch fired, AND re-persist the stale value via sbUpsert. This
  // only ever adds activity ids this tab doesn't already have.
  const mergeRemoteActivity = useCallback((jobId, remoteActivity) => {
    if (!remoteActivity || !remoteActivity.length) return;
    setJobs((prev) => {
      let changed = false;
      const next = prev.map((j) => {
        if (j.id !== jobId) return j;
        const knownIds = new Set((j.activity || []).map((a) => a.id));
        const fresh = remoteActivity.filter((a) => a && a.id && !knownIds.has(a.id));
        if (!fresh.length) return j;
        changed = true;
        const merged = { ...j, activity: [...(j.activity || []), ...fresh] };
        sbUpsert("jobs", jobId, merged);
        return merged;
      });
      if (changed) writeCache("jobs", next);
      return changed ? next : prev;
    });
  }, []);

  // ---- Clients API ----
  const addClient = useCallback((client) => {
    const id = "cl-" + Date.now().toString(36);
    const now = new Date().toISOString();
    const newClient = {
      id,
      name: "",
      company: "",
      email: "",
      phone: "",
      type: "Landlord",
      properties: [],
      notes: "",
      createdAt: now,
      updatedAt: now,
      ...client,
    };
    setClients((prev) => {
      const next = [newClient, ...prev];
      writeCache("clients", next);
      return next;
    });
    sbUpsert("clients", id, newClient);
    toast("Client added");
    return newClient;
  }, []);

  const updateClient = useCallback((id, patch) => {
    setClients((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const now = new Date().toISOString();
        const merged = { ...c, ...patch, updatedAt: now };
        sbUpsert("clients", id, merged);
        return merged;
      });
      writeCache("clients", next);
      return next;
    });
    toast("Saved");
  }, []);

  const removeClient = useCallback((id) => {
    setClients((prev) => {
      const next = prev.filter((c) => c.id !== id);
      writeCache("clients", next);
      return next;
    });
    addTombstones("clients", [id]);
    sbDelete("clients", [id]);
    toast("Client deleted", "delete");
    setJobs((prev) => {
      const removed = prev.filter((j) => j.clientId === id).map((j) => j.id);
      addTombstones("jobs", removed);
      sbDelete("jobs", removed);
      const nextJobs = prev.filter((j) => j.clientId !== id);
      writeCache("jobs", nextJobs);
      return nextJobs;
    });
  }, []);

  // ---- Prospects API (renewal-outreach pipeline) ----
  // Bulk import — route through the service-role endpoint so a bad RLS rule
  // or expired session never silently drops imported rows. Chunked to stay
  // under the 2000/request cap. Surfaces a toast if persistence fails so the
  // operator knows their import didn't survive.
  const importProspects = useCallback((incoming) => {
    let added = 0, skipped = 0;
    setProspects((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const fresh = [];
      for (const p of incoming) {
        if (seen.has(p.id)) { skipped++; continue; }
        seen.add(p.id);
        fresh.push(p);
        added++;
      }
      // Server-side persistence — fire-and-await chunks; surface failures.
      if (fresh.length && supabase) {
        (async () => {
          try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token;
            if (!token) {
              // No session at all — fall back to direct upsert (will likely fail RLS).
              const { error } = await supabase
                .from("prospects")
                .upsert(fresh.map((x) => ({ id: x.id, data: x })));
              if (error) toast.error(`Save failed: ${error.message} — your import may not survive a refresh.`);
              return;
            }
            const CHUNK = 1500;
            let savedTotal = 0, failedTotal = 0;
            for (let i = 0; i < fresh.length; i += CHUNK) {
              const slice = fresh.slice(i, i + CHUNK);
              const res = await fetch("/api/prospects/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ prospects: slice }),
              });
              const j = await res.json().catch(() => ({}));
              if (!res.ok) { failedTotal += slice.length; console.error("[prospects/upsert]", j.error || res.status); }
              else savedTotal += j.count || slice.length;
            }
            if (failedTotal > 0) {
              toast.error(`Saved ${savedTotal} · ${failedTotal} failed to persist — refresh will lose those rows.`);
            }
          } catch (err) {
            toast.error("Cloud save failed — your import may not survive a refresh.");
            console.error("[prospects] persist failed:", err);
          }
        })();
      }
      
      const next = fresh.length ? [...fresh, ...prev] : prev;
      writeCache("prospects", next);
      return next;
    });
    
    // If they manually import data, show it instantly even if background sync is still running.
    setProspectsReady(true);

    return { added, skipped };
  }, []);

  const updateProspect = useCallback((id, patch) => {
    setProspects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        sbUpsert("prospects", id, merged);
        // Terminal stages fulfil any open outreach task on this prospect:
        // no point chasing a booked customer or a DNC lead.
        if (patch.stage && (patch.stage === "booked" || patch.stage === "dnc")) {
          closeLinkedTasks({
            supabase, kind: "prospect", id,
            reason: patch.stage === "booked" ? "Prospect booked — chase closed." : "Prospect marked Do Not Contact — chase closed.",
            actor: actorRef.current,
          }).catch(() => {});
        }
        return merged;
      })
    );
  }, []);

  // Append a contact-log entry and advance the stage in one go.
  const logProspectContact = useCallback((id, entry, stage) => {
    setProspects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const merged = {
          ...p,
          contactLog: [{ at: new Date().toISOString(), by: actorRef.current, ...entry }, ...(p.contactLog || [])],
          lastContactedAt: new Date().toISOString(),
          ...(stage ? { stage } : {}),
        };
        sbUpsert("prospects", id, merged);
        // Logging any outbound contact fulfils an auto-generated renewal
        // chase task (that was the whole point of it). Other manual tasks
        // stay open — only the "prospect_renewal" source auto-closes here.
        if (entry && entry.direction !== "in") {
          closeLinkedTasks({
            supabase, kind: "prospect", id,
            sources: ["prospect_renewal"],
            reason: `Outreach logged (${entry.channel || "contact"}) — auto-closed.`,
            actor: actorRef.current,
          }).catch(() => {});
        }
        // Same terminal-stage rule as updateProspect if this log also
        // moves the stage forward.
        if (stage === "booked" || stage === "dnc") {
          closeLinkedTasks({
            supabase, kind: "prospect", id,
            reason: stage === "booked" ? "Prospect booked — chase closed." : "Prospect marked Do Not Contact — chase closed.",
            actor: actorRef.current,
          }).catch(() => {});
        }
        return merged;
      })
    );
  }, []);

  const removeProspect = useCallback((id) => {
    setProspects((prev) => prev.filter((p) => p.id !== id));
    sbDelete("prospects", [id]);
  }, []);

  // Durable delete — confirm server-side BEFORE clearing the screen.
  const clearProspects = useCallback(async (ids) => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { toast("Session expired — sign in again; nothing was deleted.", "delete"); return; }
        const res = await fetch("/api/prospects/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(ids ? { ids } : { all: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast(`Couldn't delete (${res.status}): ${j.error || "try again"}`, "delete");
          return;
        }
      } catch (err) {
        toast("Delete failed — check your connection. Nothing was removed.", "delete");
        return;
      }
    }
    setProspects((prev) => (ids ? prev.filter((p) => !new Set(ids).has(p.id)) : []));
    toast(ids ? `Deleted ${ids.length} prospect${ids.length !== 1 ? "s" : ""}` : "All prospects deleted", "delete");
  }, []);

  // Turn a "yes" prospect into a real Client + Job in one step — no re-typing,
  // no data loss. Matches an existing client by email/phone if one exists,
  // otherwise creates one (with a property from the prospect's address). The
  // job is created as a Quote, prefilled with the renewal service(s) and the
  // price that was offered, ready to schedule. The prospect is linked + marked
  // booked so it's never re-contacted.
  const convertProspectToJob = useCallback((prospectId, { upliftPct = 0, status = "quote" } = {}) => {
    const p = prospects.find((x) => x.id === prospectId);
    if (!p) return null;
    if (p.convertedJobId) {
      toast("Already converted to " + p.convertedJobId, "error");
      return null;
    }

    const emailKey = (p.contactEmail || "").trim().toLowerCase();
    const phone = p.ownerPhone || p.tenantPhone || "";
    let client = clients.find(
      (c) =>
        (emailKey && (c.email || "").trim().toLowerCase() === emailKey) ||
        (phone && (c.phone || "") === phone)
    );

    const propertyLabel = p.address || "Property";
    let propertyId;
    if (client) {
      const existingProp = (client.properties || []).find(
        (pr) => (pr.label || "").trim().toLowerCase() === propertyLabel.trim().toLowerCase()
      );
      if (existingProp) {
        propertyId = existingProp.id;
      } else {
        propertyId = "pr-" + Date.now().toString(36);
        updateClient(client.id, {
          properties: [...(client.properties || []), { id: propertyId, label: propertyLabel, postcode: "", area: "", beds: 0 }],
        });
      }
    } else {
      propertyId = "pr-" + Date.now().toString(36);
      client = addClient({
        name: p.ownerName || p.nameOnCert || "Prospect",
        email: p.contactEmail || "",
        phone: p.ownerPhone || "",
        type: "Landlord",
        properties: [{ id: propertyId, label: propertyLabel, postcode: "", area: "", beds: 0 }],
        notes: `Converted from prospect (${p.year || "—"} renewal list, source: ${p.source || "import"}).`,
      });
    }

    const services = p.services && p.services.length ? p.services : ["CONFIRM"];
    const price = suggestedPrice(p, upliftPct) ?? p.invoiceAmount ?? 0;
    const lineItems = [
      {
        id: "ln-renewal-" + Date.now().toString(36),
        code: "CUSTOM",
        name: `Renewal: ${services.map(serviceLabel).join(", ")}`,
        unit: price,
        qty: 1,
        total: price,
      },
    ];

    const job = addJob({
      clientId: client.id,
      propertyId,
      nameOnCert: p.nameOnCert || p.ownerName || "",
      lineItems,
      services,
      price,
      status,
      notes: `Renewal from outreach. Last done ${p.jobDate || "—"}, last invoice ${
        p.invoiceAmount != null ? `£${p.invoiceAmount.toFixed(2)}` : "—"
      }. Prospect ${p.id}.`,
      prospectId: p.id,
    });

    const merged = {
      ...p,
      stage: status === "scheduled" ? "booked" : "interested",
      convertedJobId: job.id,
      convertedAt: new Date().toISOString(),
      contactLog: [
        { at: new Date().toISOString(), channel: "convert", note: `Converted to job ${job.id}` },
        ...(p.contactLog || []),
      ],
    };
    setProspects((prev) => prev.map((x) => (x.id === p.id ? merged : x)));
    sbUpsert("prospects", p.id, merged);

    return { client, job, prospect: merged };
  }, [prospects, clients, addClient, updateClient, addJob]);

  // ---- Cold Leads API ----
  // Import scraped leads from CSV. Dedupes by content-hash id — safe to call
  // multiple times with partial-year batches; existing rows are never touched.
  const importColdLeads = useCallback((leads) => {
    let added = 0, skipped = 0;
    let freshSnapshot = [];
    setColdLeads((prev) => {
      const seen = new Set(prev.map((l) => l.id));
      const fresh = [];
      for (const l of leads) {
        if (seen.has(l.id)) { skipped++; continue; }
        seen.add(l.id);
        fresh.push(l);
        added++;
      }
      freshSnapshot = fresh;
      if (fresh.length && supabase) {
        // Chunk into 1500-row batches — a single upsert with 40k rows exceeds
        // Supabase's request size limit and fails silently.
        (async () => {
          try {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token;
            const CHUNK = 1500;
            let savedTotal = 0, failedTotal = 0;
            for (let i = 0; i < fresh.length; i += CHUNK) {
              const slice = fresh.slice(i, i + CHUNK);
              if (token) {
                const res = await fetch("/api/leads/upsert", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ leads: slice }),
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok) { failedTotal += slice.length; console.error("[leads/upsert]", j.error || res.status); }
                else savedTotal += j.count || slice.length;
              } else {
                const { error } = await supabase
                  .from("leads")
                  .upsert(slice.map((x) => ({ id: x.id, data: x })));
                if (error) { failedTotal += slice.length; console.error("[leads direct upsert]", error.message); }
                else savedTotal += slice.length;
              }
            }
            if (failedTotal > 0) {
              toast.error(`Saved ${savedTotal} · ${failedTotal} failed — refresh may lose those rows.`);
            } else {
              // Cache was already written synchronously.
            }
          } catch (err) {
            console.error("[importColdLeads persist]", err);
          }
        })();
      }
      const next = fresh.length ? [...fresh, ...prev] : prev;
      writeCache("leads", next);
      return next;
    });

    setColdLeadsReady(true);
    return { added, skipped };
  }, []);

  const updateColdLead = useCallback((id, patch) => {
    setColdLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...patch };
        sbUpsert("leads", id, merged);
        return merged;
      })
    );
  }, []);

  const logColdLeadContact = useCallback((id, entry, newStage) => {
    setColdLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const now = new Date().toISOString();
        const merged = {
          ...l,
          lastContactedAt: now,
          contactLog: [{ at: now, by: actorRef.current, ...entry }, ...(l.contactLog || [])],
          ...(newStage ? { stage: newStage } : {}),
        };
        sbUpsert("leads", id, merged);
        return merged;
      })
    );
  }, []);

  const removeColdLead = useCallback((id) => {
    setColdLeads((prev) => prev.filter((l) => l.id !== id));
    sbDelete("leads", [id]);
  }, []);

  // Delete leads DURABLY: confirm the server delete BEFORE clearing the screen,
  // so the UI never shows "empty" while the database still has the rows (which
  // is what made deletes "come back" on refresh). Surfaces any failure loudly.
  const clearColdLeads = useCallback(async (ids) => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { toast("Session expired — sign in again; nothing was deleted.", "delete"); return; }
        const res = await fetch("/api/leads/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(ids ? { ids } : { all: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast(`Couldn't delete (${res.status}): ${j.error || "try again"}`, "delete");
          return; // DB unchanged → leave the UI as-is (truthful)
        }
      } catch (err) {
        toast("Delete failed — check your connection. Nothing was removed.", "delete");
        return;
      }
    }
    setColdLeads((prev) => (ids ? prev.filter((l) => !new Set(ids).has(l.id)) : []));
    toast(ids ? `Deleted ${ids.length} lead${ids.length !== 1 ? "s" : ""}` : "All leads deleted", "delete");
  }, []);

  // ---- Letting Agents API (Phase 2.2) ----
  const importAgents = useCallback((rows) => {
    let added = 0, skipped = 0;
    setAgents((prev) => {
      const seen = new Set(prev.map((a) => a.id));
      const fresh = [];
      for (const a of rows) {
        if (seen.has(a.id)) { skipped++; continue; }
        seen.add(a.id); fresh.push(a); added++;
      }
      if (fresh.length && supabase) {
        supabase.from("letting_agents")
          .upsert(fresh.map((x) => ({ id: x.id, data: x })))
          .then((r) => r?.error && console.error("[supabase] importAgents:", r.error.message));
      }
      return [...fresh, ...prev];
    });
    return { added, skipped };
  }, []);

  const upsertAgent = useCallback((agent) => {
    setAgents((prev) => {
      const idx = prev.findIndex((a) => a.id === agent.id);
      const next = idx >= 0 ? [...prev.slice(0, idx), agent, ...prev.slice(idx + 1)] : [agent, ...prev];
      sbUpsert("letting_agents", agent.id, agent);
      return next;
    });
  }, []);

  const updateAgent = useCallback((id, patch) => {
    setAgents((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const merged = { ...a, ...patch };
      sbUpsert("letting_agents", id, merged);
      return merged;
    }));
  }, []);

  const logAgentContact = useCallback((id, entry, newStage) => {
    setAgents((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const now = new Date().toISOString();
      const merged = {
        ...a,
        lastContactedAt: now,
        timeline: [
          { ts: now, channel: entry?.channel || "note", direction: entry?.direction || "out", note: entry?.note || "", by: entry?.by || actorRef.current },
          ...(a.timeline || []),
        ],
        ...(newStage ? { stage: newStage } : {}),
      };
      sbUpsert("letting_agents", id, merged);
      return merged;
    }));
  }, []);

  const removeAgent = useCallback((id) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    sbDelete("letting_agents", [id]);
  }, []);

  // Revert a Promote-from-prospect (or Promote-from-lead) action. Drops the
  // managed-agent record so the source prospect/lead reappears in the
  // "From Prospects" / "From Leads" tab and can be promoted again.
  // For a Raw-CSV agent that was promoted to Managed, demote: keep the
  // record but reset tier+stage so it returns to the Raw CSV tab.
  const unpromoteAgent = useCallback((id) => {
    setAgents((prev) => {
      const a = prev.find((x) => x.id === id);
      if (!a) return prev;
      if (a.originId) {
        sbDelete("letting_agents", [id]);
        return prev.filter((x) => x.id !== id);
      }
      const merged = { ...a, agentTier: "raw", stage: "new" };
      sbUpsert("letting_agents", id, merged);
      return prev.map((x) => x.id === id ? merged : x);
    });
  }, []);

  const clearAgents = useCallback(async (ids) => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { toast("Session expired — sign in again; nothing was deleted.", "delete"); return; }
        const res = await fetch("/api/agents/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(ids ? { ids } : { all: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast(`Couldn't delete (${res.status}): ${j.error || "try again"}`, "delete");
          return;
        }
      } catch (err) {
        toast("Delete failed — check your connection. Nothing was removed.", "delete");
        return;
      }
    }
    setAgents((prev) => (ids ? prev.filter((a) => !new Set(ids).has(a.id)) : []));
    toast(ids ? `Deleted ${ids.length} agent${ids.length !== 1 ? "s" : ""}` : "All agents deleted", "delete");
  }, []);

  // ---- Engineer Recruits API (Phase 3.2) ----
  const importRecruits = useCallback((rows) => {
    let added = 0, skipped = 0;
    setRecruits((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const fresh = [];
      for (const r of rows) {
        if (seen.has(r.id)) { skipped++; continue; }
        seen.add(r.id); fresh.push(r); added++;
      }
      if (fresh.length && supabase) {
        supabase.from("engineer_recruits")
          .upsert(fresh.map((x) => ({ id: x.id, data: x })))
          .then((r) => r?.error && console.error("[supabase] importRecruits:", r.error.message));
      }
      return [...fresh, ...prev];
    });
    return { added, skipped };
  }, []);

  const upsertRecruit = useCallback((r) => {
    setRecruits((prev) => {
      const idx = prev.findIndex((x) => x.id === r.id);
      const next = idx >= 0 ? [...prev.slice(0, idx), r, ...prev.slice(idx + 1)] : [r, ...prev];
      sbUpsert("engineer_recruits", r.id, r);
      return next;
    });
  }, []);

  const updateRecruit = useCallback((id, patch) => {
    setRecruits((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      sbUpsert("engineer_recruits", id, merged);
      return merged;
    }));
  }, []);

  const logRecruitContact = useCallback((id, entry, newStage) => {
    setRecruits((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const now = new Date().toISOString();
      const merged = {
        ...r,
        lastContactedAt: now,
        timeline: [
          { ts: now, channel: entry?.channel || "note", direction: entry?.direction || "out", note: entry?.note || "", by: entry?.by || actorRef.current },
          ...(r.timeline || []),
        ],
        ...(newStage ? { stage: newStage } : {}),
      };
      sbUpsert("engineer_recruits", id, merged);
      return merged;
    }));
  }, []);

  const removeRecruit = useCallback((id) => {
    setRecruits((prev) => prev.filter((r) => r.id !== id));
    sbDelete("engineer_recruits", [id]);
  }, []);

  const clearRecruits = useCallback(async (ids) => {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { toast("Session expired — sign in again; nothing was deleted.", "delete"); return; }
        const res = await fetch("/api/recruits/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(ids ? { ids } : { all: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast(`Couldn't delete (${res.status}): ${j.error || "try again"}`, "delete");
          return;
        }
      } catch (err) {
        toast("Delete failed — check your connection. Nothing was removed.", "delete");
        return;
      }
    }
    setRecruits((prev) => (ids ? prev.filter((r) => !new Set(ids).has(r.id)) : []));
    toast(ids ? `Deleted ${ids.length} recruit${ids.length !== 1 ? "s" : ""}` : "All recruits deleted", "delete");
  }, []);

  // ---- Settings API (synced via the settings effect) ----
  const updateEmail = useCallback((patch) => {
    setEmail((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTemplate = useCallback((key, patch) => {
    setTemplates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const resetTemplates = useCallback(() => {
    setTemplates(defaultTemplates);
  }, []);

  // ---- Document templates API ----
  const addDocTemplate = useCallback((doc) => {
    const newDoc = {
      id: "doc-" + Date.now().toString(36),
      name: "Untitled document",
      category: "Other",
      body: "",
      ...doc,
    };
    setDocTemplates((prev) => [...prev, newDoc]);
    return newDoc;
  }, []);

  const updateDocTemplate = useCallback((id, patch) => {
    setDocTemplates((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  }, []);

  const removeDocTemplate = useCallback((id) => {
    setDocTemplates((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // ---- Company documents API ----
  const addCompanyDoc = useCallback((doc) => {
    const newDoc = {
      id: "cdoc-" + Date.now().toString(36),
      name: "",
      category: "Other",
      note: "",
      addedAt: new Date().toISOString(),
      ...doc,
    };
    setCompanyDocs((prev) => [newDoc, ...prev]);
    return newDoc;
  }, []);

  const removeCompanyDoc = useCallback((id) => {
    setCompanyDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // ---- Invoice numbering ----
  const advanceInvoiceSeq = useCallback((usedNo) => {
    const n = parseInt(usedNo, 10);
    setInvoiceSeq((prev) => (isNaN(n) ? prev + 1 : Math.max(prev, n + 1)));
  }, []);

  // Allocate THE invoice number for a job, once, and keep it forever.
  //
  // Every invoice in the app previously read `String(invoiceSeq)` fresh at the
  // moment the PDF was built and never wrote it anywhere, so:
  //   • the same job produced a different number every time you re-opened it
  //     (an invoice number has to be stable — it's the customer's reference
  //     and it's what the payment gets reconciled against), and
  //   • the counter only lived in React state until a settings write landed.
  //     requestBigTables() re-runs hydrate(), and hydrate calls
  //     setInvoiceSeq(d.invoiceSeq) — which reset the counter straight back to
  //     whatever the server still had before the increment was ever saved.
  //     Verified against live data: 9 paid jobs, invoiceSeq still sitting at
  //     its 345 default, and not one job carrying an invoice number.
  //
  // Now: first invoice for a job takes the next number, writes it onto the job
  // (so it survives refreshes, re-hydrates and device changes) and advances
  // the counter. Every later call for that same job returns the stored number.
  const allocateInvoiceNumber = useCallback((jobId) => {
    const job = jobsRef.current.find((j) => j.id === jobId);
    if (job?.invoiceNumber) return String(job.invoiceNumber);

    // The counter on its own is NOT enough, and this is the second half of
    // the same bug. The number is written onto the job by updateJob (its own
    // row, saved immediately), while the counter is saved by a DIFFERENT,
    // debounced write (sbUpsertSettings). Close the tab, lose connection, or
    // have that settings write fail, and the job keeps its number while the
    // counter snaps back to the server's older value on the next hydrate —
    // so the next invoice reuses a number that has already gone out.
    // Confirmed against live data: the counter was sitting at 346 while 353
    // had already been issued, which would have reused 346-353 all over
    // again.
    //
    // The jobs are the durable record of what has actually been issued, so
    // the next number is taken from BOTH: whichever of the counter and the
    // highest number in use is further ahead. That makes it self-healing —
    // a counter that falls behind can no longer hand out a duplicate.
    const highestIssued = jobsRef.current.reduce((max, j) => {
      const n = Number(j.invoiceNumber);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    let assigned;
    setInvoiceSeq((prev) => {
      assigned = Math.max(Number(prev) || 0, highestIssued + 1);
      return assigned + 1;
    });
    const no = String(assigned);
    if (jobId) {
      updateJob(jobId, { invoiceNumber: no, invoiceNumberAt: new Date().toISOString() });
    }
    return no;
  }, [updateJob]);

  // ---- Service catalogue pricing ----
  // Flat-price services only (PAT/BOILER/EMLIGHT/FSC) — unchanged from
  // before. Tiered services and GAS use the two setters below instead.
  const updateServicePrice = useCallback((code, price) => {
    setServicePrices((prev) => ({
      ...prev,
      [code]: price === "" ? "" : Number(price),
    }));
  }, []);

  // One tier's price for a tiered service (EICR/EPC/FRA/ALARM/FIREPANEL) —
  // merges into whatever's already overridden for that service so editing
  // one tier never clobbers another.
  const updateServiceTierPrice = useCallback((code, tierLabel, price) => {
    setServicePrices((prev) => {
      const existing = prev[code];
      const tierMap = existing && typeof existing === "object" ? existing : {};
      return { ...prev, [code]: { ...tierMap, [tierLabel]: price === "" ? "" : Number(price) } };
    });
  }, []);

  // GAS's "1st appliance" (base) or "each extra appliance" (extra) price.
  const updateGasPrice = useCallback((field, price) => {
    setServicePrices((prev) => {
      const existing = prev.GAS && typeof prev.GAS === "object" ? prev.GAS : {};
      return { ...prev, GAS: { ...existing, [field]: price === "" ? "" : Number(price) } };
    });
  }, []);

  const resetServicePrices = useCallback(() => {
    setServicePrices({ ...DEFAULT_SERVICE_PRICES });
  }, []);

  const updateAutoNotify = useCallback((key, value) => {
    setAutoNotify((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ---- Expenses API ----
  // Each mutator persists DIRECTLY, right here, synchronous with the state
  // update — same pattern addJob/updateJob already use for jobs. This used
  // to persist via a separate `useEffect` watching [expenses, hydrated]
  // instead: that fires on ANY change to the array, with no way to tell
  // "the user just edited this" apart from "hydrate just reset this from a
  // stale fetch" — so a hydrate-driven reset would itself get re-persisted,
  // permanently erasing whatever the user had just entered. Persisting only
  // from the mutators that actually represent a real edit removes that
  // ambiguity at the root instead of guarding against it after the fact.
  // Also mirrored to IndexedDB (writeCache) synchronously, same tick as the
  // state update — NOT just the network write. The network write is the
  // slow part (a real round-trip); if the user refreshes before it lands
  // (killing the in-flight request entirely, with nothing left to retry
  // it), the IndexedDB write already committed and survives the reload, so
  // the next hydrate can recover the edit and re-push it. Without this,
  // expenses/payments had NO durability at all if a save got cut off by a
  // refresh — unlike jobs/clients, which have always had this cache.
  const addExpense = useCallback((exp) => {
    const id = "exp-" + Date.now().toString(36);
    const created = { id, name: "", amount: 0, category: "Operations", date: new Date().toISOString().slice(0, 10), recurring: false, ...exp };
    setExpenses((prev) => {
      const next = [created, ...prev];
      writeCache("expenses", next);
      sbUpsertKey("expenses", next);
      return next;
    });
    return created;
  }, []);
  const updateExpense = useCallback((id, patch) => {
    setExpenses((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      writeCache("expenses", next);
      sbUpsertKey("expenses", next);
      return next;
    });
  }, []);
  const removeExpense = useCallback((id) => {
    // Tombstone FIRST. Writing the shortened array alone is not a delete:
    // any device still holding the row in its cache will union it back in
    // on its next load and push it to the cloud. See mergeById in hydrate().
    pushRemoteTombstones("expenses", [id]);
    setExpenses((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeCache("expenses", next);
      sbUpsertKey("expenses", next);
      return next;
    });
  }, []);

  // ---- Engineer payments (weekly pay runs) ----
  const addEngineerPayment = useCallback((payment) => {
    const id = "epay-" + Date.now().toString(36);
    const base = {
      id,
      engineerId: "",
      periodStart: "",
      periodEnd: "",
      periodLabel: "",
      // `amount` is ALWAYS the engineer's earnings — what lands in their
      // account and what settles their balance. The bank's transfer fee is
      // tracked alongside it, never folded in: rolling it into `amount`
      // would make every settled engineer look overpaid by the fee.
      amount: 0,
      transferFee: 0,
      amountSent: 0,
      paidAt: new Date().toISOString(),
      notes: "",
      proof: null,
      ...payment,
      id,
    };
    // Backfill the derived figures so a caller that only supplies `amount`
    // (or an older code path) still produces a complete, correct record.
    const fee = Number(base.transferFee) || 0;
    const created = {
      ...base,
      amount: Number(base.amount) || 0,
      transferFee: fee,
      amountSent: base.amountSent
        ? Number(base.amountSent) || 0
        : Math.round(((Number(base.amount) || 0) + fee) * 100) / 100,
    };
    setEngineerPayments((prev) => {
      const next = [created, ...prev];
      writeCache("engineer_payments", next);
      sbUpsertKey("engineer_payments", next);
      return next;
    });
    // The bank fee was previously only ever a derived number (totalTransferFees,
    // computed fresh from engineerPayments every time the P&L rendered) tacked
    // onto "Company expenses" without ever appearing as a real row anyone could
    // see, edit, or delete — the expense LIST and the expense TOTAL silently
    // disagreed by however many fees had accrued. Logging it as a real expense
    // the moment it's incurred means it's a genuine dated line item that the
    // existing month/week/day/range filtering (expensesForRange) already
    // handles correctly, same as any other expense.
    //
    // Dated to the JOB's own period, not the payment date — same rule as
    // engineer labour cost (computeEngineerPay's totalAccrued). The fee only
    // exists because that job's engineer needed paying; a job done in July
    // but paid in August must not pull its £0.74 fee into August's expenses,
    // irrespective of when the transfer actually happened. When one payment
    // covers several jobs (possibly from different periods), the fee is
    // attributed to the EARLIEST of their dates — a transfer only happens
    // once, so it has to land somewhere, and the earliest job is the one that
    // had been waiting longest to be settled.
    if (fee > 0) {
      const coveredJobs = (created.jobIds || [])
        .map((jid) => jobsRef.current.find((j) => j.id === jid))
        .filter(Boolean);
      const dates = coveredJobs.map((j) => jobDate(j)).filter(Boolean);
      const feeDate = dates.length
        ? new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString().slice(0, 10)
        : created.paidAt.slice(0, 10);
      addExpense({
        name: `Bank transfer fee — ${created.notes || created.jobIds?.join(", ") || "engineer payment"}`,
        amount: fee,
        category: "Bank Transfer Fees",
        date: feeDate,
        recurring: false,
        linkedPaymentId: id,
      });
    }
    toast("Engineer payment recorded");
    return created;
  }, [addExpense]);

  const removeEngineerPayment = useCallback((id) => {
    setEngineerPayments((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeCache("engineer_payments", next);
      sbUpsertKey("engineer_payments", next);
      return next;
    });
    // Remove the fee expense logged alongside this payment — otherwise
    // deleting a payment leaves a orphaned "Bank transfer fee" behind that no
    // longer corresponds to any real transfer.
    pushRemoteTombstones("engineer_payments", [id]);
    setExpenses((prev) => {
      const linked = prev.find((e) => e.linkedPaymentId === id);
      if (!linked) return prev;
      pushRemoteTombstones("expenses", [linked.id]);
      const next = prev.filter((e) => e.id !== linked.id);
      writeCache("expenses", next);
      sbUpsertKey("expenses", next);
      return next;
    });
    toast("Payment removed", "delete");
  }, []);

  // ---- Engineers API ----
  // Mirrors the jobs pattern — lets updateEngineer read the live list without
  // taking `engineers` as a dependency (which would re-create the callback,
  // and every consumer's memo, on every engineer change).
  const engineersRef = useRef([]);
  useEffect(() => {
    engineersRef.current = engineers;
  }, [engineers]);

  const addEngineer = useCallback(
    (eng) => {
      const id = "eng-" + Date.now().toString(36);
      const color =
        eng.color || ENGINEER_COLORS[engineers.length % ENGINEER_COLORS.length];
      const created = {
        id,
        name: "",
        trade: "",
        type: "Individual",
        company: "",
        phone: "",
        email: "",
        postcode: "",
        areas: "",
        services: [],
        cutPercent: 40,
        notes: "",
        color,
        ...eng,
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setEngineers((prev) => [...prev, created]);
      sbUpsert("engineers", id, created);
      toast("Engineer added");
      return created;
    },
    [engineers.length]
  );

  const updateEngineer = useCallback((id, patch) => {
    // The server write is deliberately NOT fired from inside the setState
    // updater. React may invoke an updater more than once, or discard and
    // replay it, so a network call in there is neither guaranteed-once nor
    // guaranteed-to-run. Compute the merged row against the current ref,
    // persist it, then update state.
    const current = engineersRef.current.find((e) => e.id === id);
    if (!current) return;
    // Stamp a version. Engineer rows historically carried no timestamps at
    // all, which left nothing anywhere in the app able to tell an old copy
    // from a new one — see the rowsSig comment above for what that cost.
    const merged = { ...current, ...patch, updatedAt: new Date().toISOString() };
    sbUpsert("engineers", id, merged);
    setEngineers((prev) => prev.map((e) => (e.id === id ? merged : e)));
    toast("Saved");
  }, []);

  const removeEngineer = useCallback((id) => {
    setEngineers((prev) => prev.filter((e) => e.id !== id));
    sbDelete("engineers", [id]);
    toast("Engineer deleted", "delete");
    // Unassign any jobs that pointed at the removed engineer.
    setJobs((prev) =>
      prev.map((j) => {
        if (j.engineerId !== id) return j;
        const merged = { ...j, engineerId: "unassigned" };
        sbUpsert("jobs", j.id, merged);
        return merged;
      })
    );
  }, []);

  const engineerById = useCallback(
    (id) => {
      if (!id || id === "unassigned") return UNASSIGNED_ENGINEER;
      return engineers.find((e) => e.id === id) || UNASSIGNED_ENGINEER;
    },
    [engineers]
  );

  // A job-list render calls this once per card — with `clients.find(...)`
  // that's an O(jobs × clients) scan every time the list repaints, which on
  // a phone-sized CPU is real, felt lag once either list grows past a
  // couple hundred rows. A Map lookup is O(1) per card instead.
  const clientsByIdMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const clientById = useCallback((id) => clientsByIdMap.get(id) || null, [clientsByIdMap]);

  // Full customer-facing price system — not just one flat number per
  // service. Three shapes for servicePrices[code], mirroring the same
  // {flat number | {label: price}} pattern already used for engineer pay
  // rates (see EngineerModal.js / lib/finance.js's rateForLine):
  //   - GAS: { base, extra } — 1st-appliance price + each-extra-appliance
  //     price, since Gas is priced by appliance count, not a size tier.
  //   - Tiered services (EICR/EPC/FRA/ALARM/FIREPANEL): { [tierLabel]: price }
  //     overriding each individual tier's price.
  //   - Flat services (PAT/BOILER/EMLIGHT/FSC): a plain number, unchanged.
  // This is the ONE place these overrides get applied — JobModal.js reads
  // tiers/price from this computed `catalog`, never straight from
  // SERVICE_CATALOG, so every job-creation screen picks up custom pricing
  // automatically with no changes needed there.
  const catalog = useMemo(
    () =>
      SERVICE_CATALOG.map((s) => {
        const override = servicePrices[s.code];
        if (s.code === "GAS") {
          const gasOverride = override && typeof override === "object" ? override : {};
          const legacyFlat = typeof override === "number" ? override : null; // pre-migration shape
          return {
            ...s,
            price: gasOverride.base != null && gasOverride.base !== ""
              ? Number(gasOverride.base)
              : (legacyFlat != null ? legacyFlat : s.price),
            gasExtra: gasOverride.extra != null && gasOverride.extra !== ""
              ? Number(gasOverride.extra)
              : GAS_EXTRA_APPLIANCE,
          };
        }
        if (s.tiers?.length) {
          const tierOverrides = override && typeof override === "object" ? override : {};
          return {
            ...s,
            tiers: s.tiers.map((t) => ({
              ...t,
              price: tierOverrides[t.label] != null && tierOverrides[t.label] !== ""
                ? Number(tierOverrides[t.label])
                : t.price,
            })),
          };
        }
        return {
          ...s,
          price: override === "" || override == null ? s.price : Number(override),
        };
      }),
    [servicePrices]
  );

  const value = useMemo(
    () => ({
      clients,
      jobs,
      email,
      templates,
      docTemplates,
      companyDocs,
      invoiceSeq,
      servicePrices,
      catalog,
      engineers,
      hydrated,
      loadError,
      financeReady,
      retryHydrate,
      prospectsReady, coldLeadsReady, requestBigTables,
      addJob,
      updateJob,
      removeJob,
      patchJobLocal,
      createRecurringJob,
      splitOffIncompleteWork,
      mergeBackToParentJob,
      generateShareToken,
      logActivity,
      mergeRemoteActivity,
      autoNotify,
      updateAutoNotify,
      addClient,
      updateClient,
      removeClient,
      updateEmail,
      updateTemplate,
      resetTemplates,
      addDocTemplate,
      updateDocTemplate,
      removeDocTemplate,
      addCompanyDoc,
      removeCompanyDoc,
      advanceInvoiceSeq,
      allocateInvoiceNumber,
      updateServicePrice,
      updateServiceTierPrice,
      updateGasPrice,
      resetServicePrices,
      addEngineer,
      updateEngineer,
      removeEngineer,
      engineerById,
      clientById,
      expenses,
      addExpense,
      updateExpense,
      removeExpense,
      engineerPayments,
      addEngineerPayment,
      removeEngineerPayment,
      prospects,
      importProspects,
      updateProspect,
      logProspectContact,
      removeProspect,
      clearProspects,
      convertProspectToJob,
      coldLeads,
      importColdLeads,
      updateColdLead,
      logColdLeadContact,
      removeColdLead,
      clearColdLeads,
      agents,
      importAgents,
      upsertAgent,
      updateAgent,
      logAgentContact,
      removeAgent,
      unpromoteAgent,
      clearAgents,
      recruits,
      importRecruits,
      upsertRecruit,
      updateRecruit,
      logRecruitContact,
      removeRecruit,
      clearRecruits,
    }),
    [
      clients,
      jobs,
      email,
      templates,
      docTemplates,
      companyDocs,
      invoiceSeq,
      servicePrices,
      catalog,
      engineers,
      hydrated,
      loadError,
      financeReady,
      retryHydrate,
      prospectsReady, coldLeadsReady, requestBigTables,
      addJob,
      updateJob,
      removeJob,
      patchJobLocal,
      createRecurringJob,
      splitOffIncompleteWork,
      mergeBackToParentJob,
      generateShareToken,
      logActivity,
      mergeRemoteActivity,
      autoNotify,
      updateAutoNotify,
      addClient,
      updateClient,
      removeClient,
      updateEmail,
      updateTemplate,
      resetTemplates,
      addDocTemplate,
      updateDocTemplate,
      removeDocTemplate,
      addCompanyDoc,
      removeCompanyDoc,
      advanceInvoiceSeq,
      allocateInvoiceNumber,
      updateServicePrice,
      updateServiceTierPrice,
      updateGasPrice,
      resetServicePrices,
      addEngineer,
      updateEngineer,
      removeEngineer,
      engineerById,
      clientById,
      expenses,
      addExpense,
      updateExpense,
      removeExpense,
      engineerPayments,
      addEngineerPayment,
      removeEngineerPayment,
      prospects,
      importProspects,
      updateProspect,
      logProspectContact,
      removeProspect,
      clearProspects,
      convertProspectToJob,
      coldLeads,
      importColdLeads,
      updateColdLead,
      logColdLeadContact,
      removeColdLead,
      clearColdLeads,
      agents,
      importAgents,
      upsertAgent,
      updateAgent,
      logAgentContact,
      removeAgent,
      unpromoteAgent,
      clearAgents,
      recruits,
      importRecruits,
      upsertRecruit,
      updateRecruit,
      logRecruitContact,
      removeRecruit,
      clearRecruits,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// Convenience selectors
export function useClient(id) {
  const { clients } = useStore();
  return clients.find((c) => c.id === id) || null;
}

export function useJob(id) {
  const { jobs } = useStore();
  return jobs.find((j) => j.id === id) || null;
}
