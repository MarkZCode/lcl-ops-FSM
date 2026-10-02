// Jobs list helpers: what a search matches, the sort orders on offer, the
// spreadsheet export, and the "changed since you last looked" record.
import { jobTags, getJobLines } from "./format";
import { jobBalance } from "./payments";

const digits = (v) => String(v || "").replace(/\D/g, "");

// Everything a search box should find a job by: reference, invoice number,
// client name/company/email, the phone number however it was typed, the
// address and postcode (with or without the space), services, notes.
export function jobHaystack(job, client) {
  const property = client?.properties?.find((p) => p.id === job.propertyId);
  const pc = String(property?.postcode || "");
  return [
    job.id, job.invoiceNumber ? `inv ${job.invoiceNumber} #${job.invoiceNumber}` : "",
    client?.name, client?.company, client?.email, client?.phone, digits(client?.phone),
    job.accessName, job.accessPhone, digits(job.accessPhone), job.nameOnCert,
    property?.label, pc, pc.replace(/\s/g, ""),
    ...(job.services || []), ...jobTags(job).map((t) => t.label), job.notes, job.pinnedNote,
    // …and what was said: the last 40 messages, calls and notes on the job.
    ...(job.activity || []).slice(-40).map((a) => `${a.title || ""} ${String(a.detail || "").slice(0, 400)}`),
  ].filter(Boolean).join(" ").toLowerCase();
}
export function matchesQuery(job, client, q) {
  const query = String(q || "").trim().toLowerCase();
  if (!query) return true;
  const hay = jobHaystack(job, client);
  // "07888 183424" should find "07888183424" and vice versa.
  const qd = digits(query);
  return hay.includes(query) || (qd.length >= 5 && hay.includes(qd)) || hay.includes(query.replace(/\s/g, ""));
}

export const SORTS = [
  { key: "default", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "value", label: "Highest value" },
  { key: "appointment", label: "Appointment date" },
  { key: "deadline", label: "Client deadline" },
  { key: "updated", label: "Recently changed" },
];
const t = (v) => (v ? new Date(v).getTime() : 0);
const far = 8.64e15;
export function sortJobs(list, key) {
  const by = {
    oldest: (a, b) => t(a.createdAt) - t(b.createdAt),
    value: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0),
    appointment: (a, b) => (t(a.scheduledAt) || far) - (t(b.scheduledAt) || far),
    deadline: (a, b) => (t(a.deadline) || far) - (t(b.deadline) || far),
    updated: (a, b) => t(b.updatedAt || b.createdAt) - t(a.updatedAt || a.createdAt),
  }[key];
  return by ? [...list].sort(by) : list;
}

// The list as a spreadsheet.
export function jobsCsv(jobs, { clients = [], engineerById, nextByJob } = {}) {
  const rows = [["Job", "Status", "Client", "Phone", "Email", "Address", "Postcode", "Services", "Engineer", "Appointment", "Price", "Owed", "Invoice", "Next step", "Created"]];
  for (const j of jobs) {
    const c = clients.find((x) => x.id === j.clientId);
    const p = c?.properties?.find((x) => x.id === j.propertyId);
    rows.push([
      j.id, j.status, c?.name || "", c?.phone || "", c?.email || "", p?.label || "", p?.postcode || "",
      jobTags(j).map((x) => x.label).join("; "),
      j.engineerId && j.engineerId !== "unassigned" ? engineerById?.(j.engineerId)?.name || "" : "",
      j.scheduledAt ? new Date(j.scheduledAt).toLocaleString("en-GB", { timeZone: "Europe/London" }) : "",
      (Number(j.price) || 0).toFixed(2), jobBalance(j).toFixed(2), j.invoiceNumber || "",
      nextByJob?.get(j.id)?.title || "",
      j.createdAt ? new Date(j.createdAt).toLocaleDateString("en-GB") : "",
    ]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
export function downloadCsv(name, csv) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Changed since you last looked (per device) ──────────────────────────
const SEEN_KEY = "lcl-jobs-seen";
function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; }
}
export function markJobSeen(id, at = new Date().toISOString()) {
  if (typeof window === "undefined" || !id) return;
  try {
    const seen = readSeen();
    seen[id] = at;
    const keys = Object.keys(seen);
    if (keys.length > 1500) for (const k of keys.slice(0, keys.length - 1500)) delete seen[k];
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {}
}
// A job counts as changed when it was updated after you last opened it. A
// job you have never opened isn't flagged — otherwise the whole list lights
// up the first time.
export function unseenIds(jobs) {
  const seen = readSeen();
  const out = new Set();
  for (const j of jobs) {
    const at = seen[j.id];
    if (at && j.updatedAt && new Date(j.updatedAt).getTime() - new Date(at).getTime() > 3000) out.add(j.id);
  }
  return out;
}

// ── Saved views (per device) ────────────────────────────────────────────
const VIEWS_KEY = "lcl-jobs-views";
export function readViews() {
  try { const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function writeViews(views) {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views.slice(0, 20))); } catch {}
}
export const LIST_COLUMNS = [
  { key: "client", label: "Client" }, { key: "postcode", label: "Postcode" }, { key: "services", label: "Services" },
  { key: "engineer", label: "Engineer" }, { key: "scheduled", label: "Scheduled" }, { key: "next", label: "Next step" },
  { key: "owner", label: "Owner" }, { key: "status", label: "Status" }, { key: "price", label: "Price" },
];
export const DEFAULT_COLUMNS = ["client", "services", "engineer", "scheduled", "next", "status", "price"];
