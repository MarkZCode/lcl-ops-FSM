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
