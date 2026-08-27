// Today panel ranking — composite score across all 4 demand modules
// (handoff doc §4.1). Higher = more urgent. Top 6 surface on the dashboard.
//
// Score per item = base_by_type + urgency_boost + value_boost − cooldown_penalty
//
//   base_by_type:
//     letting_agent     = 1000
//     warm_prospect     = 800
//     engineer_recruit  = 700
//     cold_lead         = 200
//   urgency_boost:
//     next_action_at overdue:                +500
//     cert expiring ≤30d (prospects only):   +400
//     cert expiring 30–60d (prospects only): +200
//   value_boost:
//     letting_agent portfolio_size ≥ 10: +300
//     letting_agent portfolio_size ≥ 25: +500
//   cooldown_penalty:
//     contacted in last 48h, no reply: −200

import { nextRenewalDue } from "./prospects";
import { annualValue } from "./agents";

const HOURS_48 = 48 * 60 * 60 * 1000;
const DAYS_30 = 30 * 86400000;
const DAYS_60 = 60 * 86400000;

function isOverdue(nextActionAt, now) {
  if (!nextActionAt) return false;
  return new Date(nextActionAt).getTime() < now.getTime();
}

function recentlyContactedNoReply(item, now) {
  const last = item.lastContactedAt || item.last_attempt_at;
  if (!last) return false;
  const lastTs = new Date(last).getTime();
  // "no reply" proxy: still in new/contacted stage AND last contact within 48h
  const noReply = ["new", "contacted"].includes(item.stage);
  return noReply && now.getTime() - lastTs < HOURS_48;
}

export function scoreProspect(p, now = new Date()) {
  let s = 800;
  if (isOverdue(p.nextActionAt, now)) s += 500;
  const due = nextRenewalDue(p, now);
  if (due) {
    const ms = due - now;
    if (ms <= DAYS_30) s += 400;
    else if (ms <= DAYS_60) s += 200;
  }
  if (recentlyContactedNoReply(p, now)) s -= 200;
  // Booked/won prospects shouldn't be in the queue.
  if (["booked", "won", "dnc", "lost_dormant", "dormant"].includes(p.stage)) s -= 5000;
  return s;
}

export function scoreAgent(a, now = new Date()) {
  let s = 1000;
  if (isOverdue(a.nextActionAt, now)) s += 500;
  const portfolio = Number(a.portfolio_size) || (a.properties?.length ?? 0);
  if (portfolio >= 25) s += 500;
  else if (portfolio >= 10) s += 300;
  if (recentlyContactedNoReply(a, now)) s -= 200;
  if (["dormant", "active"].includes(a.stage)) s -= 3000; // active = happy, dormant = parked
  return s;
}

export function scoreLead(l, now = new Date()) {
  let s = 200;
  if (isOverdue(l.next_action_at, now)) s += 500;
  if (recentlyContactedNoReply(l, now)) s -= 200;
  if (["dnc", "booked", "won", "lost_dormant", "engaged"].includes(l.stage)) s -= 5000;
  if (!l.phone && !l.email) s -= 5000; // can't act on it
  return s;
}

export function scoreRecruit(r, now = new Date()) {
  let s = 700;
  if (isOverdue(r.next_action_at, now)) s += 500;
  if (recentlyContactedNoReply(r, now)) s -= 200;
  if (["onboarded", "active"].includes(r.stage)) s -= 5000;
  return s;
}

// Build the ranked Today queue across all modules. Returns top N items, each
// with { id, type, score, title, subtitle, href, raw }.
export function todayQueue({ prospects = [], agents = [], leads = [], recruits = [] }, n = 6) {
  const now = new Date();
  const items = [];

  for (const p of prospects) {
    const score = scoreProspect(p, now);
    if (score < 200) continue;
    const due = nextRenewalDue(p, now);
    const days = due ? Math.ceil((due - now) / 86400000) : null;
    items.push({
      id: `p:${p.id}`, type: "prospect", score, raw: p,
      title: p.nameOnCert || p.ownerName || "—",
      subtitle: days != null
        ? `${days < 0 ? `${Math.abs(days)}d overdue` : `${days}d to renewal`} · ${(p.services?.[0] || p.primaryService || "CONFIRM")}`
        : (p.address || ""),
      href: "/prospects",
    });
  }
  for (const a of agents) {
    const score = scoreAgent(a, now);
    if (score < 200) continue;
    const portfolio = Number(a.portfolio_size) || (a.properties?.length ?? 0);
    items.push({
      id: `a:${a.id}`, type: "agent", score, raw: a,
      title: a.agency_name,
      subtitle: `${portfolio || 0} properties · £${annualValue(a).toLocaleString()}/yr est. · ${a.stage}`,
      href: "/agents",
    });
  }
  for (const l of leads) {
    const score = scoreLead(l, now);
    if (score < 100) continue;
    items.push({
      id: `l:${l.id}`, type: "lead", score, raw: l,
      title: l.name || l.phone || "—",
      subtitle: `${l.address || ""}${l.segment ? ` · ${l.segment.replace("_", " ")}` : ""}`,
      href: "/leads",
    });
  }
  for (const r of recruits) {
    const score = scoreRecruit(r, now);
    if (score < 200) continue;
    items.push({
      id: `r:${r.id}`, type: "recruit", score, raw: r,
      title: r.contact?.name || "—",
      subtitle: `${(r.trade || []).join("/") || "—"} · ${r.stage}`,
      href: "/engineers",
    });
  }

  items.sort((x, y) => y.score - x.score);
  return items.slice(0, n);
}

// "Needs Your Decision" for admin/founder role (handoff §4.1B).
export function needsDecision({ agents = [], recruits = [], jobs = [], engineers = [] }) {
  const out = [];
  const now = Date.now();

  // Recruits at agreement_signed (founder needs to schedule meeting / set rate)
  for (const r of recruits) {
    if (r.stage === "agreement_signed") {
      out.push({
        id: `r:${r.id}`, type: "recruit", priority: 1, raw: r,
        title: r.contact?.name || "—",
        reason: "Agreement signed — schedule meeting + rate card",
        href: "/engineers",
      });
    }
  }
  // Big agents at engaged (founder may want to weigh in on proposal)
  for (const a of agents) {
    const portfolio = Number(a.portfolio_size) || (a.properties?.length ?? 0);
    if (a.stage === "engaged" && portfolio >= 10) {
      out.push({
        id: `a:${a.id}`, type: "agent", priority: 2, raw: a,
        title: a.agency_name,
        reason: `${portfolio}-property agency at Engaged — proposal review`,
        href: "/agents",
      });
    }
  }
  // Jobs stuck >7 days in one status
  const SEVEN_DAYS = 7 * 86400000;
  for (const j of jobs) {
    const history = j.statusHistory;
    if (!Array.isArray(history) || !history.length) continue;
    const current = history[history.length - 1];
    if (current.exitedAt) continue; // already moved on
    const enteredAt = new Date(current.enteredAt).getTime();
    if (now - enteredAt > SEVEN_DAYS) {
      const days = Math.floor((now - enteredAt) / 86400000);
      out.push({
        id: `j:${j.id}`, type: "job", priority: 3, raw: j,
        title: j.id,
        reason: `Stuck in "${current.status}" for ${days} days`,
        href: `/jobs/${j.id}`,
      });
    }
  }
  // Coverage alerts: derive from engineers list
  const covered = new Set();
  for (const e of engineers || []) {
    if (e.archived) continue;
    for (const s of e.services || []) covered.add(s);
  }
  // Hardcode the core service set we care about coverage for
  const CORE = ["GAS", "EICR", "EPC", "FRA", "PAT"];
  for (const code of CORE) {
    if (!covered.has(code)) {
      out.push({
        id: `cov:${code}`, type: "coverage", priority: 0, raw: { code },
        title: `${code} coverage`,
        reason: "0 active engineers — can't sell this service line",
        href: "/engineers",
      });
    }
  }

  out.sort((a, b) => a.priority - b.priority);
  return out;
}
