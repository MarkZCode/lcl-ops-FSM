// Agent activity aggregation — powers the admin Team page.
//
// Every outreach action (call / email) is stamped with `by` (the acting user)
// in the store's logging functions. This module rolls those stamps up into a
// per-agent scorecard: calls + emails, split by section (Prospects / Leads /
// Agents), with today / this-week / all-time totals and a last-active time.
// Pure + framework-free so it's easy to reason about and test.

export const ACTIVITY_SECTIONS = [
  { key: "prospects", label: "Prospects" },
  { key: "leads", label: "Leads" },
  { key: "agents", label: "Agents" },
  { key: "recruits", label: "Recruits" },
];

// `by` may be an object {id,name,role}, a legacy string, or null/"".
function actorKey(by) {
  if (!by) return null;
  if (typeof by === "string") return by.trim() || null;
  return by.id || by.name || null;
}
function actorName(by) {
  if (!by) return "Unknown";
  if (typeof by === "string") return by;
  return by.name || by.id || "Unknown";
}

// Normalise a channel string to "call" | "email" | null (we only track these).
function channelType(ch) {
  const c = (ch || "").toLowerCase();
  if (c.includes("call") || c.includes("phone") || c === "tel") return "call";
  if (c.includes("email") || c.includes("mail")) return "email";
  return null;
}

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeek(now) {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  d.setHours(0, 0, 0, 0);
  return d;
}

// Build a Map keyed by actor → scorecard from the four log sources.
// `seedActors` (optional) pre-creates entries for known users so agents with
// zero activity still appear (admin wants to see who is NOT working).
export function buildAgentActivity(
  { prospects = [], coldLeads = [], agents = [], recruits = [] } = {},
  { now = new Date(), seedActors = [] } = {}
) {
  const today = startOfToday(now);
  const week = startOfWeek(now);
  const map = new Map();

  const blank = (key, name, role) => ({
    key,
    name,
    role: role || "agent",
    calls: 0,
    emails: 0,
    total: 0,
    today: { calls: 0, emails: 0 },
    week: { calls: 0, emails: 0 },
    bySection: {}, // section -> { calls, emails }
    lastAt: null,
  });

  // Seed known users first (so 0-activity agents are visible).
  for (const u of seedActors) {
    const key = u.id || u.name;
    if (!key || map.has(key)) continue;
    map.set(key, blank(key, u.name || u.email || u.id, u.role));
  }

  const ensure = (by) => {
    const key = actorKey(by);
    if (!key) return null;
    if (!map.has(key)) map.set(key, blank(key, actorName(by), by && by.role));
    return map.get(key);
  };

  const ingest = (section, entries) => {
    for (const e of entries || []) {
      if (!e || e.direction === "in") continue; // only outbound effort
      const type = channelType(e.channel);
      if (!type) continue;
      const stat = ensure(e.by);
      if (!stat) continue;
      const field = type === "call" ? "calls" : "emails";
      stat[field]++;
      stat.total++;
      const sec = (stat.bySection[section] ||= { calls: 0, emails: 0 });
      sec[field]++;
      const ts = e.at || e.ts;
      const d = ts ? new Date(ts) : null;
      if (d && !isNaN(d)) {
        if (d >= today) stat.today[field]++;
        if (d >= week) stat.week[field]++;
        if (!stat.lastAt || d > new Date(stat.lastAt)) stat.lastAt = d.toISOString();
      }
    }
  };

  prospects.forEach((p) => ingest("prospects", p.contactLog));
  coldLeads.forEach((l) => ingest("leads", l.contactLog));
  agents.forEach((a) => ingest("agents", a.timeline));
  recruits.forEach((r) => ingest("recruits", r.timeline));

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// Team-wide rollup for the summary strip.
export function teamTotals(rows) {
  return rows.reduce(
    (t, r) => ({
      agents: t.agents + 1,
      calls: t.calls + r.calls,
      emails: t.emails + r.emails,
      callsToday: t.callsToday + r.today.calls,
      emailsToday: t.emailsToday + r.today.emails,
      activeToday: t.activeToday + (r.today.calls + r.today.emails > 0 ? 1 : 0),
    }),
    { agents: 0, calls: 0, emails: 0, callsToday: 0, emailsToday: 0, activeToday: 0 }
  );
}

// "2h ago" / "3d ago" / "—" for the last-active column.
export function timeAgo(iso, now = new Date()) {
  if (!iso) return "—";
  const diff = Math.max(0, now - new Date(iso));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
