import { jobBalance } from "./payments";
// Client helpers: spotting the same person entered twice, and one timeline
// of everything that has happened with a client across all their jobs. Pure.
const digits = (v) => String(v || "").replace(/\D/g, "");

// Groups of clients that share an email or the last 10 digits of a phone.
// Returns [[clientA, clientB, …], …] — oldest record first in each group,
// because the oldest is usually the one the job history hangs off.
export function duplicateGroups(clients = []) {
  const parent = new Map(clients.map((c) => [c.id, c.id]));
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  const seen = new Map();
  for (const c of clients) {
    const keys = [];
    const email = String(c.email || "").trim().toLowerCase();
    if (email) keys.push(`e:${email}`);
    const phone = digits(c.phone).slice(-10);
    if (phone.length === 10) keys.push(`p:${phone}`);
    for (const k of keys) {
      if (seen.has(k)) parent.set(find(c.id), find(seen.get(k)));
      else seen.set(k, c.id);
    }
  }
  const groups = new Map();
  for (const c of clients) {
    const r = find(c.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)));
}

// What the kept record looks like after absorbing the duplicate: blanks
// filled from the duplicate, properties combined (one per postcode+label),
// notes joined. Property ids are preserved so the moved jobs still point at
// a real property.
export function mergedClient(keep, dup) {
  const bare = (p) => `${String(p.postcode || "").replace(/\s/g, "").toUpperCase()}|${String(p.label || "").trim().toLowerCase()}`;
  const props = [...(keep.properties || [])];
  const idMap = {};
  for (const p of dup.properties || []) {
    const hit = props.find((x) => bare(x) === bare(p));
    if (hit) idMap[p.id] = hit.id;
    else props.push(p);
  }
  const patch = { properties: props };
  for (const k of ["email", "phone", "company", "billingName", "billingEmail", "billingAddress", "preferredContact"]) {
    if (!keep[k] && dup[k]) patch[k] = dup[k];
  }
  if (dup.notes && dup.notes !== keep.notes) patch.notes = [keep.notes, dup.notes].filter(Boolean).join("\n");
  return { patch, propertyIdMap: idMap };
}

// Every message, note, status change and document across a client's jobs,
// newest first.
export function clientTimeline(jobs = []) {
  const out = [];
  for (const j of jobs) {
    out.push({ id: `${j.id}-created`, at: j.createdAt, jobId: j.id, type: "status", title: `${j.id} created`, detail: "" });
    for (const a of j.activity || []) {
      out.push({ id: `${j.id}-${a.id || a.at}`, at: a.at, jobId: j.id, type: a.type || "note", direction: a.direction, title: a.title || "", detail: a.detail || "", by: typeof a.by === "string" ? a.by : a.by?.name || "" });
    }
    for (const f of j.attachments || []) {
      out.push({ id: `${j.id}-${f.id}`, at: f.addedAt, jobId: j.id, type: "file", title: `Document added — ${f.name || "file"}`, detail: "" });
    }
  }
  return out.filter((e) => e.at).sort((a, b) => new Date(b.at) - new Date(a.at));
}

export const CONTACT_METHODS = ["WhatsApp", "Email", "Phone call"];

// ── Figures for the client list ─────────────────────────────────────────
// Lifetime value counts finished work only; "owed" is what's invoiced and
// not yet paid.
const DONE = new Set(["completed", "invoiced", "paid"]);
export function clientStats(client, jobs = []) {
  const mine = jobs.filter((j) => j.clientId === client.id);
  const won = mine.filter((j) => DONE.has(j.status));
  const ltv = won.reduce((s, j) => s + (Number(j.price) || 0), 0);
  const last = mine.map((j) => j.scheduledAt || j.createdAt).filter(Boolean).sort().pop() || null;
  return {
    jobs: mine.length,
    open: mine.filter((j) => !["paid", "cancelled"].includes(j.status)).length,
    won: won.length,
    ltv,
    avg: won.length ? ltv / won.length : 0,
    owed: mine.filter((j) => j.status === "invoiced").reduce((s, j) => s + jobBalance(j), 0),
    lastAt: last,
  };
}

export const CLIENT_TAGS = ["Portfolio landlord", "Agent", "Slow payer", "VIP", "HMO", "Commercial", "Do not chase"];
export const CONTACT_ROLES = ["Owner", "Agent", "Accounts", "Tenant", "Site contact", "Other"];

// Rows from a pasted spreadsheet → clients, with duplicates marked.
// First row is the header; columns are matched by name, in any order.
export function parseClientCsv(text, existing = []) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "Paste the header row and at least one client." };
  const split = (l) => {
    const sep = l.includes("\t") ? "\t" : ",";
    const out = []; let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const ix = { name: col("name"), email: col("email"), phone: col("phone", "mobile", "tel"), company: col("company"), address: col("address", "property"), postcode: col("postcode", "post code") };
  if (ix.name === -1) return { rows: [], error: "There needs to be a column called Name." };
  const digits = (v) => String(v || "").replace(/\D/g, "").slice(-10);
  const seenEmail = new Set(existing.map((c) => String(c.email || "").toLowerCase()).filter(Boolean));
  const seenPhone = new Set(existing.map((c) => digits(c.phone)).filter((p) => p.length === 10));
  const rows = lines.slice(1).map((l, i) => {
    const c = split(l);
    const get = (k) => (ix[k] === -1 ? "" : c[ix[k]] || "");
    const r = { n: i + 2, name: get("name"), email: get("email").toLowerCase(), phone: get("phone"), company: get("company"), address: get("address"), postcode: get("postcode").toUpperCase() };
    const p = digits(r.phone);
    r.problem = !r.name ? "No name" : (r.email && seenEmail.has(r.email)) || (p.length === 10 && seenPhone.has(p)) ? "Already a client (same email or phone)" : "";
    if (!r.problem) { if (r.email) seenEmail.add(r.email); if (p.length === 10) seenPhone.add(p); }
    return r;
  });
  return { rows, error: "" };
}
