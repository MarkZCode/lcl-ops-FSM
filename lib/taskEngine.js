// ── WHO DOES WHAT NEXT ──────────────────────────────────────────────────
//
// Tasks used to be written by a separate set of rules that ran once a day
// and knew five situations. The job page's "Next step" knows thirty. So a
// job could say "Send the invoice" while no task existed for it, and a task
// could say "Follow up quote" for a quote the notes said not to chase.
//
// This is the one brain: every open job is read with the SAME rules as Next
// step (lib/nextAction.js), and the tasks follow from that —
//   • a job needs something  → there is a task for it, with an owner;
//   • the job moves on       → the task closes by itself;
//   • nobody picks it up     → it moves to someone else, then to an admin.
// Because it reads Next step, it inherits everything Next step respects:
// "DND" and "will get back by the 15th" in the notes stop the chasing here
// too, and the back half of a job (mark done, invoice, chase payment, send
// the certificate) gets tasks like the front half always did.
//
// Pure — takes everything it needs and returns a plan. lib/taskSync.js
// loads the data, applies the plan and sends the pushes.
import { nextActions } from "./nextAction";

const MIN = 60_000;

// How long each kind of step may sit before it counts as late (minutes of
// OFFICE time). The three enquiry steps are deliberately short: a new
// enquiry answered in fifteen minutes is the one that books.
const SLA = {
  check_quote: 15,
  wa_reply: 15,
  send_quote_urgent: 30,
  reply: 60,
  quote: 8 * 60,
  book: 4 * 60,
  confirm: 4 * 60,
  close: 4 * 60,
  tell_client: 4 * 60,
  invoice: 8 * 60,
  payment: 24 * 60,
  certificate: 8 * 60,
};
// Steps that each get their own task and their own clock.
const STEP_KEYS = new Set(["check_quote", "wa_reply", "send_quote_urgent"]);
// Who a kind of work goes to first. Client-facing work goes to agents;
// booking engineers and money go to admins. Either pool falls back to the
// other when nobody in it is available.
const ADMIN_GROUPS = new Set(["book", "confirm", "invoice", "payment"]);
// Tasks made by the old daily rules, and the group each one occupies — so
// the engine doesn't raise a second task for the same thing.
const LEGACY_GROUP = { reply: "reply", quote_followup: "quote", job_unassigned: "book", job_unconfirmed: "confirm" };

export const HIGH_VALUE = 250; // a job worth this much is always urgent
const MAX_NEW_PER_RUN = 40;
const OFFICE_OPENS = 8;
const OFFICE_CLOSES = 19;

// ── Office hours (UK). Clocks don't run overnight. ──────────────────────
function ukParts(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
export function officeOpen(now) {
  const { hour } = ukParts(now);
  return hour >= OFFICE_OPENS && hour < OFFICE_CLOSES;
}
// `minutes` of office time from `from` → the moment it's due.
export function dueAfter(from, minutes) {
  let t = new Date(from).getTime();
  let left = minutes;
  for (let guard = 0; guard < 4000 && left > 0; guard++) {
    const { hour, minute } = ukParts(new Date(t));
    if (hour < OFFICE_OPENS || hour >= OFFICE_CLOSES) {
      // Jump to the next quarter-hour until the office opens.
      t += (15 - (minute % 15)) * MIN;
      continue;
    }
    const untilClose = (OFFICE_CLOSES - hour) * 60 - minute;
    const step = Math.min(left, untilClose);
    t += step * MIN;
    left -= step;
  }
  return new Date(t).toISOString();
}

const isAuto = (t) => !!t?.autoKey;
const isOpen = (t) => t && t.status !== "done";
const humanTouched = (t) =>
  t.status === "in_progress" || !!t.snoozedUntil ||
  (t.updates || []).some((u) => u?.by?.id && u.by.id !== "system");

// Routine follow-ups that can wait behind everything else.
const LOW_KEYS = new Set(["chase_quote", "check_in", "close_stale", "review", "chase_details", "was_sent"]);

function priorityFor(action, job, now) {
  if (action.severity === "urgent") return "urgent";
  if (job.urgencyReason) return "urgent";
  if (job.deadline && new Date(`${job.deadline}T23:59:59Z`).getTime() - now.getTime() < 5 * 86400_000) return "urgent";
  if ((Number(job.price) || 0) >= HIGH_VALUE) return "urgent";
  const soon = (iso) => iso && new Date(iso).getTime() - now.getTime() < 3 * 86400_000 && new Date(iso).getTime() > now.getTime() - 86400_000;
  if (soon(job.scheduledAt) || soon(job.certExpiry)) return "urgent";
  return LOW_KEYS.has(action.key) ? "low" : "normal";
}

// Least busy available person in the pool; ties go to whoever has fewer
// urgent tasks, then by id so the choice is stable.
function pick(pool, load, exclude) {
  const ok = pool.filter((p) => !p.away && p.id !== exclude);
  if (!ok.length) return null;
  return [...ok].sort((a, b) =>
    (load.get(a.id)?.open || 0) - (load.get(b.id)?.open || 0) ||
    (load.get(a.id)?.urgent || 0) - (load.get(b.id)?.urgent || 0) ||
    a.id.localeCompare(b.id)
  )[0];
}

/**
 * people: [{ id, name, role: "admin"|"agent", away: boolean }]
 * Returns { create: [task], close: [{ task, reason }], move: [{ task, to, level, reason }] }
 */
export function planTasks({ jobs = [], clients = [], engineers = [], tasks = [], people = [], now = new Date() }) {
  const nowIso = now.toISOString();
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const engById = new Map(engineers.map((e) => [e.id, e]));
  const admins = people.filter((p) => p.role === "admin");
  const agents = people.filter((p) => p.role === "agent");
  const poolFor = (group) => {
    const first = ADMIN_GROUPS.has(group) ? admins : agents;
    const second = ADMIN_GROUPS.has(group) ? agents : admins;
    return first.some((p) => !p.away) ? first : second.some((p) => !p.away) ? second : [...first, ...second];
  };

  // Current workload, kept up to date as this run hands work out.
  const load = new Map();
  const bump = (id, urgent) => {
    if (!id) return;
    const l = load.get(id) || { open: 0, urgent: 0 };
    l.open += 1;
    if (urgent) l.urgent += 1;
    load.set(id, l);
  };
  for (const t of tasks) if (isOpen(t) && t.assigneeId) bump(t.assigneeId, t.priority === "urgent");

  const openByJob = new Map();
  const lastOwnerByJob = new Map();
  const doneRecently = new Set(); // autoKeys a person closed in the last 24h
  for (const t of tasks) {
    if (t?.linkedTo?.kind !== "job") continue;
    const id = t.linkedTo.id;
    if (isOpen(t)) {
      if (!openByJob.has(id)) openByJob.set(id, []);
      openByJob.get(id).push(t);
    }
    if (isAuto(t) && t.assigneeId) {
      const prev = lastOwnerByJob.get(id);
      if (!prev || (t.createdAt || "") > prev.at) lastOwnerByJob.set(id, { id: t.assigneeId, at: t.createdAt || "" });
    }
    if (isAuto(t) && t.status === "done" && t.completedBy?.id && t.completedBy.id !== "system"
        && now.getTime() - new Date(t.completedAt || 0).getTime() < 86400_000) {
      doneRecently.add(t.autoKey);
    }
  }

  const create = [];
  const close = [];
  const wanted = []; // candidates, sorted before the per-run cap

  for (const job of jobs) {
    if (!job?.id) continue;
    const client = clientById.get(job.clientId);
    const actions = nextActions(job, {
      now,
      clientEmail: client?.email || "",
      clientPhone: client?.phone || "",
      client,
      engineerName: (id) => engById.get(id)?.name || "the engineer",
      engineerExists: (id) => engById.has(id),
      engineerById: (id) => engById.get(id),
    });

    // One task per group — the most urgent action in it (nextActions is
    // already sorted). The enquiry steps are keyed by step so each gets its
    // own clock.
    const byKey = new Map();
    for (const a of actions) {
      if (!a.group || a.key === "no_contact" || a.key === "idle") continue;
      const key = `${job.id}|${a.group}|${STEP_KEYS.has(a.key) ? a.key : ""}`;
      if (!byKey.has(key)) byKey.set(key, a);
    }

    const open = openByJob.get(job.id) || [];
    // Close auto tasks whose reason has gone.
    for (const t of open) {
      if (isAuto(t) && !byKey.has(t.autoKey)) close.push({ task: t, reason: "No longer needed — the job has moved on." });
    }
    const taken = new Set(open.filter(isAuto).map((t) => t.autoKey));
    const legacyGroups = new Set(open.map((t) => LEGACY_GROUP[t.source]).filter(Boolean));

    for (const [key, a] of byKey) {
      if (taken.has(key) || legacyGroups.has(a.group) || doneRecently.has(key)) continue;
      wanted.push({ key, a, job, client });
    }
  }

  const rank = (w) => ({ urgent: 0, normal: 1, low: 2 }[priorityFor(w.a, w.job, now)]);
  wanted.sort((x, y) => rank(x) - rank(y) || (Number(y.job.price) || 0) - (Number(x.job.price) || 0));

  for (const { key, a, job, client } of wanted.slice(0, MAX_NEW_PER_RUN)) {
    const priority = priorityFor(a, job, now);
    const pool = poolFor(a.group);
    // Same face: whoever last held a task on this job, then whoever last
    // wrote to the client on it, if they're around and in the right pool.
    const prevId = lastOwnerByJob.get(job.id)?.id;
    const lastBy = [...(job.activity || [])].reverse().find((x) => x.direction !== "in" && x.by && ["email", "whatsapp", "call"].includes(x.type))?.by;
    const lastName = typeof lastBy === "string" ? lastBy : lastBy?.name;
    const owner =
      pool.find((p) => p.id === prevId && !p.away) ||
      pool.find((p) => lastName && p.name === lastName && !p.away) ||
      pick(pool, load) || pool[0] || null;
    const sla = SLA[a.key] || SLA[a.group] || 8 * 60;
    const dueAt = dueAfter(now, sla);
    const value = Number(job.price) || 0;
    const task = {
      id: `tk-a-${key.replace(/[^A-Za-z0-9]+/g, "-")}-${ukParts(now).date.replace(/-/g, "")}`,
      title: `${a.title.replace(/^Step \d of \d — /, "").replace(/^./, (c) => c.toUpperCase())} — ${client?.name || job.id}`,
      notes: [a.detail, value ? `Job value £${value.toFixed(2)}` : ""].filter(Boolean).join("\n"),
      assigneeId: owner?.id || null,
      assigneeName: owner?.name || "Everyone",
      dueDate: ukParts(new Date(dueAt)).date,
      dueAt,
      slaMinutes: sla,
      priority,
      reminderCadence: sla <= 60 ? "once" : "daily",
      linkedTo: { kind: "job", id: job.id, label: `${job.id} · ${client?.name || ""}`.trim() },
      status: "open",
      source: `next_${a.group}`,
      autoKey: key,
      actionKey: a.key,
      escalationLevel: 0,
      autoAssign: true,
      createdBy: { id: "system", name: "Auto-assign" },
      createdAt: nowIso,
      updatedAt: nowIso,
      updates: [{
        at: nowIso, by: { id: "system", name: "Auto-assign" }, kind: "status",
        text: owner
          ? (owner.id === prevId ? "You already hold this job — kept with you." : lastName && owner.name === lastName ? "You were last in touch with this client." : "Given to whoever has the fewest open tasks.")
          : "Nobody is available — open to everyone.",
      }],
    };
    create.push(task);
    bump(task.assigneeId, priority === "urgent");
  }

  // ── Not picked up → move it on. Only during office hours, only tasks
  // nobody has touched, twice at most: first to a colleague, then to an
  // admin. After that it stays put, marked urgent.
  const move = [];
  if (officeOpen(now)) {
    const closing = new Set(close.map((c) => c.task.id));
    for (const t of tasks) {
      if (!isOpen(t) || !isAuto(t) || closing.has(t.id) || !t.dueAt) continue;
      if (humanTouched(t) || (t.escalationLevel || 0) >= 2) continue;
      if (new Date(t.dueAt).getTime() > now.getTime()) continue;
      const level = (t.escalationLevel || 0) + 1;
      const group = String(t.source || "").replace(/^next_/, "");
      const pool = level >= 2 ? (admins.some((p) => !p.away) ? admins : poolFor(group)) : poolFor(group);
      // Nobody else in that pool (one admin, say) → anyone else who's in.
      const to = pick(pool, load, t.assigneeId) || pick(people, load, t.assigneeId);
      if (!to) continue;
      move.push({ task: t, to, level, reason: `Not picked up in time — moved from ${t.assigneeName || "nobody"} to ${to.name}.` });
      bump(to.id, true);
    }
  }

  return { create, close, move };
}
