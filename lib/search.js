// ── GLOBAL SEARCH ────────────────────────────────────────────────────────
//
// One search box that reaches every record in the FSM: jobs, clients,
// engineers, prospects, leads and engineer recruits. The top bar used to do
// nothing but redirect to /jobs?q=… — so a landlord who was a PROSPECT, or a
// letting agent sitting in 42,000 leads, was unfindable from the one search
// box in the app, and you had to already know which list they lived in.
//
// Everything is already in memory (the store hydrates these collections), so
// this is a plain scan — no index to build or keep in step. ~58k records
// across a handful of fields is a few milliseconds; the caller debounces.

import { getJobLines } from "./format";

const norm = (v) => (v == null ? "" : String(v)).toLowerCase();

// Phone numbers are written a dozen ways — "+44 7860 822172", "07860822172"
// and "7860 822172" all being the same person. Comparing digits only, with
// the UK country code and any leading zero stripped, makes every form match.
function phoneDigits(v) {
  const d = norm(v).replace(/[^0-9]/g, "");
  if (d.startsWith("44")) return d.slice(2);
  if (d.startsWith("0")) return d.slice(1);
  return d;
}

function haystack(parts) {
  return parts.filter(Boolean).map(norm).join("   ");
}

// A record matches when EVERY word in the query appears somewhere in it, so
// "smith putney" finds the Smith job in Putney without the word order or the
// fields they came from having to line up.
function matches(hay, phones, words, digits) {
  if (digits) return phones.includes(digits) || hay.includes(digits);
  for (const w of words) if (!hay.includes(w)) return false;
  return true;
}

// Rank so the obvious answer is first: an exact id, or a title that starts
// with what was typed, beats a stray match buried in a notes field.
function score(item, termLower) {
  const title = norm(item.title);
  if (norm(item.id) === termLower) return 0;
  if (title === termLower) return 1;
  if (title.startsWith(termLower)) return 2;
  if (title.includes(termLower)) return 3;
  return 4;
}

function collect(rows, build, { words, digits, termLower, limit }) {
  const hits = [];
  for (const row of rows || []) {
    const item = build(row);
    if (!item) continue;
    if (!matches(item._hay, item._phones, words, digits)) continue;
    hits.push(item);
    // Stop once there is comfortably more than we will show — ranking still
    // has plenty to choose from, and a 42,000-row list stays instant.
    if (hits.length >= limit * 8) break;
  }
  hits.sort((a, b) => score(a, termLower) - score(b, termLower));
  return { items: hits.slice(0, limit), total: hits.length };
}

export function globalSearch(term, data = {}, { limit = 5 } = {}) {
  const termLower = norm(term).trim();
  if (termLower.length < 2) return { groups: [], total: 0, term: termLower };

  const words = termLower.split(/\s+/).filter(Boolean);
  const asDigits = phoneDigits(term);
  // Treat the query as a phone number only when it is genuinely numeric —
  // otherwise "3 Corbetts Wharf" would search for the digit 3.
  const digits = /^[0-9+()\s-]{5,}$/.test(term.trim()) && asDigits.length >= 5 ? asDigits : "";
  const ctx = { words, digits, termLower, limit };

  const {
    jobs = [], clients = [], engineers = [],
    prospects = [], coldLeads = [], recruits = [],
    clientById,
  } = data;

  const clientName = (id) => (clientById ? clientById(id)?.name : "") || "";
  const propertyOf = (job) => {
    const c = clientById ? clientById(job.clientId) : null;
    const p = (c?.properties || []).find((x) => x.id === job.propertyId);
    return [p?.label, p?.postcode].filter(Boolean).join(", ");
  };

  const groups = [
    {
      key: "jobs",
      label: "Jobs",
      href: (j) => `/jobs/${j.id}`,
      ...collect(jobs, (j) => {
        const cn = clientName(j.clientId);
        const addr = propertyOf(j);
        const services = getJobLines(j).map((l) => l.name || l.code).join(", ");
        return {
          id: j.id,
          title: cn || j.id,
          subtitle: [j.id, services].filter(Boolean).join(" · "),
          meta: addr,
          status: j.status,
          _phones: phoneDigits(j.accessPhone),
          _hay: haystack([j.id, cn, services, addr, j.notes, j.nameOnCert, j.status, j.accessName]),
        };
      }, ctx),
    },
    {
      key: "clients",
      label: "Clients",
      href: (c) => `/clients/${c.id}`,
      ...collect(clients, (c) => ({
        id: c.id,
        title: c.name || "(no name)",
        subtitle: [c.company, c.email].filter(Boolean).join(" · "),
        meta: (c.properties || []).map((p) => p.postcode).filter(Boolean).join(", "),
        _phones: phoneDigits(c.phone),
        _hay: haystack([
          c.name, c.company, c.email, c.phone, c.notes,
          ...(c.properties || []).flatMap((p) => [p.label, p.postcode]),
        ]),
      }), ctx),
    },
    {
      key: "engineers",
      label: "Engineers",
      href: () => `/engineers`,
      ...collect(engineers, (e) => ({
        id: e.id,
        title: e.name || "(no name)",
        subtitle: [e.trade, e.company].filter(Boolean).join(" · "),
        meta: e.postcode || e.areas || "",
        _phones: phoneDigits(e.phone),
        _hay: haystack([e.name, e.trade, e.company, e.email, e.phone, e.areas, e.postcode, e.notes]),
      }), ctx),
    },
    {
      key: "prospects",
      label: "Prospects",
      href: (p) => `/prospects?q=${encodeURIComponent(term)}&open=${encodeURIComponent(p.id)}`,
      ...collect(prospects, (p) => ({
        id: p.id,
        title: p.ownerName || p.nameOnCert || "(no name)",
        subtitle: [(p.services || []).join(", "), p.monthName && `${p.monthName} ${p.year}`]
          .filter(Boolean).join(" · "),
        meta: p.address || "",
        status: p.stage,
        _phones: phoneDigits(p.ownerPhone),
        _hay: haystack([p.ownerName, p.nameOnCert, p.address, p.ownerEmail, p.ownerPhone,
          (p.services || []).join(" "), p.stage, p.description]),
      }), ctx),
    },
    {
      key: "leads",
      label: "Leads",
      href: (l) => `/leads?q=${encodeURIComponent(term)}&open=${encodeURIComponent(l.id)}`,
      ...collect(coldLeads, (l) => ({
        id: l.id,
        title: l.name || "(no name)",
        subtitle: [l.segment || l.org_type, l.email].filter(Boolean).join(" · "),
        meta: [l.address, l.area, l.postcode].filter(Boolean).join(", "),
        status: l.stage,
        _phones: phoneDigits(l.phone),
        _hay: haystack([l.name, l.email, l.phone, l.address, l.area, l.postcode,
          l.segment, l.org_type, l.category, l.website, l.stage]),
      }), ctx),
    },
    {
      key: "recruits",
      label: "Engineer recruits",
      href: () => `/engineers?tab=sourcing`,
      ...collect(recruits, (r) => ({
        id: r.id,
        title: r.contact?.name || "(no name)",
        subtitle: [(r.trade || []).join(", "), r.contact?.email].filter(Boolean).join(" · "),
        meta: r.area || "",
        status: r.stage,
        _phones: phoneDigits(r.contact?.phone),
        _hay: haystack([r.contact?.name, r.contact?.email, r.contact?.phone,
          (r.trade || []).join(" "), r.area, r.stage, r.notes]),
      }), ctx),
    },
  ].filter((g) => g.items.length > 0);

  return {
    groups,
    total: groups.reduce((s, g) => s + g.total, 0),
    term: termLower,
  };
}
