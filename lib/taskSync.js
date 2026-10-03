// SERVER-ONLY. Loads everything, asks lib/taskEngine.js what the tasks
// should be, and makes it so: new tasks written and pushed to their owner,
// finished ones closed, stale ones moved on.
//
// Called the moment something happens (a new enquiry, a client reply, an
// online acceptance, an engineer confirming), every few minutes while
// anyone has the app open, and by the morning cron as the backstop.
import { supabaseAdmin } from "./supabaseAdmin";
import { sendPush, webPushConfigured } from "./webPush";
import { isQuietHours } from "./pushAll";
import { planTasks, dueAfter } from "./taskEngine";
import { taskDeepLink } from "./tasks";

const STATE_ID = "task_sync_state";
const MIN_GAP_MS = 2 * 60 * 1000;

async function rows(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select("id,data").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []).map((r) => r.data).filter(Boolean));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const ukToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

// Office staff (never engineers), with whether they're away today.
export async function loadPeople() {
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const today = ukToday();
  return (data?.users || [])
    .map((u) => {
      const role = u.app_metadata?.role;
      // Set by the person themselves in Settings, or for them by an admin.
      const until = u.user_metadata?.away_until;
      return {
        id: u.id,
        name: u.user_metadata?.name || u.email,
        role: role === "admin" ? "admin" : role === "engineer" ? "engineer" : role ? "agent" : null,
        away: typeof until === "string" && until >= today,
      };
    })
    .filter((p) => p.role === "admin" || p.role === "agent");
}

export async function runTaskSync({ force = false } = {}) {
  if (!supabaseAdmin) return { skipped: true, reason: "Supabase not configured" };
  try {
    const now = new Date();
    if (!force) {
      const { data: st } = await supabaseAdmin.from("app_settings").select("data").eq("id", STATE_ID).maybeSingle();
      const last = st?.data?.lastRunAt ? new Date(st.data.lastRunAt).getTime() : 0;
      if (now.getTime() - last < MIN_GAP_MS) return { skipped: true, reason: "Ran moments ago" };
    }
    await supabaseAdmin.from("app_settings").upsert({ id: STATE_ID, data: { lastRunAt: now.toISOString() } });

    const [jobs, clients, engineers, tasks, people, rulesRow] = await Promise.all([
      rows("jobs"), rows("clients"), rows("engineers"), rows("tasks"), loadPeople(),
      supabaseAdmin.from("app_settings").select("data").eq("id", "rules").maybeSingle(),
    ]);
    const plan = planTasks({ jobs, clients, engineers, tasks, people, now, rules: rulesRow?.data?.data });
    const nowIso = now.toISOString();
    const system = { id: "system", name: "Auto-assign" };
    const writes = [];

    for (const t of plan.create) writes.push({ id: t.id, data: t });
    for (const { task, reason } of plan.close) {
      writes.push({
        id: task.id,
        data: {
          ...task, status: "done", completedAt: nowIso, completedBy: { id: "system", name: "Auto-close" }, updatedAt: nowIso,
          updates: [...(task.updates || []), { at: nowIso, by: { id: "system", name: "Auto-close" }, kind: "status", text: reason }],
        },
      });
    }
    const moved = [];
    for (const { task, to, level, reason } of plan.move) {
      const next = {
        ...task,
        assigneeId: to.id, assigneeName: to.name,
        escalationLevel: level, priority: "urgent",
        dueAt: dueAfter(now, task.slaMinutes || 60),
        escalatedFrom: [...(task.escalatedFrom || []), { id: task.assigneeId || null, name: task.assigneeName || "", at: nowIso }],
        updatedAt: nowIso,
        updates: [...(task.updates || []), { at: nowIso, by: system, kind: "status", text: reason }],
      };
      writes.push({ id: task.id, data: next });
      moved.push(next);
    }
    // One write per task: a flagged task carries its refreshed wording too.
    const flagIds = new Set((plan.flag || []).map((f) => f.task.id));
    const fresh = new Map((plan.refresh || []).map((r) => [r.task.id, r]));
    for (const { task, title, notes } of plan.refresh || []) {
      if (flagIds.has(task.id) || plan.close.some((c) => c.task.id === task.id) || moved.some((m) => m.id === task.id)) continue;
      writes.push({ id: task.id, data: { ...task, title, notes, updatedAt: nowIso } });
    }
    const flagged = [];
    for (const { task, reason } of plan.flag || []) {
      const r = fresh.get(task.id);
      const next = {
        ...task, ...(r ? { title: r.title, notes: r.notes } : {}), flaggedAt: nowIso, priority: "urgent", escalationLevel: 2, updatedAt: nowIso,
        updates: [...(task.updates || []), { at: nowIso, by: system, kind: "status", text: reason }],
      };
      writes.push({ id: task.id, data: next });
      flagged.push(next);
    }
    if (writes.length) {
      const { error } = await supabaseAdmin.from("tasks").upsert(writes);
      if (error) throw new Error(`tasks: ${error.message}`);
    }

    // One push per person: what's new for them, and what has just landed on
    // them from someone else. Overnight only the enquiry steps go out — the
    // rest are on the board in the morning and the 8am reminder covers them.
    let pushed = 0;
    if (webPushConfigured) {
      const quiet = isQuietHours(now);
      const mine = new Map();
      const add = (id, t, kind) => {
        if (!id) return;
        if (quiet && !["check_quote", "wa_reply", "send_quote_urgent"].includes(t.actionKey)) return;
        if (!mine.has(id)) mine.set(id, []);
        mine.get(id).push({ t, kind });
      };
      for (const t of plan.create) add(t.assigneeId, t, "new");
      for (const t of moved) add(t.assigneeId, t, "moved");
      // Supervision: the admins hear about work left too long — the task
      // itself stays with the agent.
      if (flagged.length && !quiet) {
        for (const p of people.filter((x) => x.role === "admin")) for (const t of flagged) add(p.id, t, "flagged");
      }
      if (mine.size) {
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id").in("user_id", [...mine.keys()]);
        const dead = [];
        for (const sub of subs || []) {
          const list = mine.get(sub.user_id) || [];
          if (!list.length) continue;
          const urgent = list.filter((x) => x.t.priority === "urgent").length;
          const one = list.length === 1 ? list[0] : null;
          const r = await sendPush(sub, {
            title: one
              ? (one.kind === "flagged" ? `Left too long — ${one.t.assigneeName || "nobody"}` : one.kind === "moved" ? "Task moved to you — not picked up" : one.t.priority === "urgent" ? "URGENT task for you" : "New task for you")
              : list.every((x) => x.kind === "flagged") ? `${list.length} tasks left too long by the team` : `${list.length} tasks for you${urgent ? ` · ${urgent} urgent` : ""}`,
            body: one ? one.t.title : list.slice(0, 3).map((x) => x.t.title).join(" · "),
            url: one ? taskDeepLink(one.t) : "/team?tab=board",
          });
          if (r.ok) pushed++;
          if (r.gone) dead.push(sub.id);
        }
        if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
      }
    }

    const out = { ok: true, created: plan.create.length, closed: plan.close.length, moved: plan.move.length, flagged: flagged.length, pushed };
    if (out.created || out.closed || out.moved || out.flagged) console.log("[task-sync]", JSON.stringify(out));
    return out;
  } catch (err) {
    console.log("[task-sync] failed", String(err.message || err).slice(0, 200));
    return { ok: false, error: String(err.message || err) };
  }
}
