// SERVER-ONLY. The engineer portal's ONLY source of data (used by /api/portal).
//
// An engineer's login never reads the database tables itself (the database
// refuses it — see supabase/ENGINEER-LOCKDOWN-RUN-THIS.sql). It asks this
// route, which works out who is asking from their sign-in, and hands back
// just their own jobs and their own pay, with everything else left out:
// no customer prices, no other engineers, no client list, no office notes.
//
// The address and access contact for a job are included only once that
// engineer has confirmed it.
import { supabaseAdmin } from "./supabaseAdmin";
import { getJobLines, isAddonCode } from "./format";
import { lineEngineerId, blockersForScheduling } from "./visits";
import { certLabel, lineSizeLabel, windowStr, accessContacts } from "./jobCard";
import { computeEngineerPay, jobBreakdownForEngineer } from "./stats";

const DONE = ["completed", "invoiced", "paid"];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (d) => r2((Number(d?.labour) || 0) + (Number(d?.vat) || 0) + (Number(d?.parkingReimbursed) || 0));
const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

function mine(job, id) {
  if (job.engineerId === id) return true;
  if ((job.visits || []).some((v) => (v.engineerId === id || v.eng === id) && v.status !== "cancelled")) return true;
  if ((job.lineItems || []).some((l) => l.engineerId === id)) return true;
  if (job.cardConfirmations && job.cardConfirmations[id]) return true;
  return false;
}

// `write: false` (tests) skips creating missing job links.
export async function buildPortal(userEmail, month, { write = true, engineerId = null, role = null } = {}) {
  const email = String(userEmail || "").trim().toLowerCase();

  const [{ data: engRows }, { data: jobRows }, { data: payRow }] = await Promise.all([
    supabaseAdmin.from("engineers").select("data"),
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("app_settings").select("data").eq("id", "engineer_payments").maybeSingle(),
  ]);
  const engineers = (engRows || []).map((r) => r.data).filter(Boolean);
  const allJobs = (jobRows || []).map((r) => r.data).filter(Boolean);

  let me = null;
  if (role === "admin" && engineerId) {
    me = engineers.find((e) => e.id === engineerId);
  }
  if (!me) {
    me = engineers.find((e) => e.email && String(e.email).trim().toLowerCase() === email);
  }
  if (!me && role === "admin" && engineers.length > 0) {
    // If admin is viewing, default to first engineer who has assigned jobs, or first engineer
    me = engineers.find((e) => allJobs.some((j) => j.status !== "cancelled" && mine(j, e.id))) || engineers[0];
  }
  if (!me) return { linked: false, email: userEmail };

  const myJobs = allJobs.filter((j) => j.status !== "cancelled" && mine(j, me.id));

  // Only the clients on my jobs, and only for their address and access line.
  const clientIds = [...new Set(myJobs.map((j) => j.clientId).filter(Boolean))];
  const { data: cliRows } = clientIds.length
    ? await supabaseAdmin.from("clients").select("id,data").in("id", clientIds)
    : { data: [] };
  const clients = new Map((cliRows || []).map((r) => [r.id, r.data]));

  const jobs = [];
  for (const job of myJobs) {
    const client = clients.get(job.clientId);
    const p = (client?.properties || []).find((x) => x.id === job.propertyId) || null;
    const finished = DONE.includes(job.status);
    const confirmed = finished || job.status === "in_progress" || blockersForScheduling(job).length === 0;
    // The link they confirm and update the job from; made here if missing.
    let token = job.confirmToken;
    if (!token && !finished && write) {
      token = newToken();
      const { data: fresh } = await supabaseAdmin.from("jobs").select("data").eq("id", job.id).maybeSingle();
      if (fresh?.data && !fresh.data.confirmToken) await supabaseAdmin.from("jobs").upsert({ id: job.id, data: { ...fresh.data, confirmToken: token } });
      else token = fresh?.data?.confirmToken || token;
    }
    let fee = null;
    try {
      const n = money(jobBreakdownForEngineer(job, me));
      if (n > 0) fee = n;
    } catch {}
    if (fee == null) {
      const myLines = getJobLines(job).filter((l) => !isAddonCode(l.code) && (lineEngineerId(job, l) === me.id || job.engineerId === me.id));
      const cut = me.cutPercent != null ? Number(me.cutPercent) || 40 : 40;
      const subtotal = myLines.reduce((s, l) => s + (Number(l.total) || (Number(l.unit) || 0) * (Number(l.qty) || 1)), 0);
      const est = Math.round(subtotal * (cut / 100) * 100) / 100;
      if (est > 0) fee = est;
    }

    const pc = String(p?.postcode || "").trim().toUpperCase();
    const svcLines = getJobLines(job)
      .filter((l) => !isAddonCode(l.code) && !l.cancelled && (lineEngineerId(job, l) === me.id || job.engineerId === me.id));

    jobs.push({
      id: job.id,
      status: job.status,
      scheduledAt: job.scheduledAt || (job.preferredDate ? `${job.preferredDate}T09:00:00.000Z` : null),
      window: windowStr(job).replace(/^\((.*?)\)\s*(.*)$/, (m, range, part) => (part ? `${range} (${part})` : range)),
      services: svcLines.length > 0
        ? svcLines.map((l) => { const s = lineSizeLabel(l, job); return `${l.code === "CUSTOM" ? l.name : certLabel(l.code)}${s ? ` (${s})` : ""}`; })
        : (job.services || []).filter((s) => !isAddonCode(s)).map(certLabel),
      confirmed,
      area: pc.split(" ")[0] || "",
      address: confirmed ? [p?.label, pc].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") : "",
      postcode: confirmed ? pc : "",
      contacts: confirmed ? accessContacts(job, client) : [],
      accessNotes: confirmed ? p?.accessNotes || "" : "",
      fee,
      token: finished ? "" : token,
    });
  }

  // Pay for the month asked for (default: this month).
  const m = /^\d{4}-\d{2}$/.test(month || "") ? month : new Date().toISOString().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const range = { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 0, 23, 59, 59)) };
  const payments = Array.isArray(payRow?.data) ? payRow.data : payRow?.data?.items || [];
  const row = computeEngineerPay(allJobs, range, engineers, payments).rows.find((r) => r.id === me.id);

  const upcomingJobs = jobs.filter((j) => !DONE.includes(j.status) && j.fee > 0);
  const upcomingEarned = r2(upcomingJobs.reduce((sum, j) => sum + (Number(j.fee) || 0), 0));

  return {
    linked: true,
    isAdmin: role === "admin",
    availableEngineers: role === "admin" ? engineers.map((e) => ({ id: e.id, name: e.name })) : [],
    engineer: { id: me.id, name: me.name, color: me.color || "#0f766e" },
    jobs,
    pay: {
      month: m,
      earned: r2(row?.accrued),
      paid: r2(row?.paid),
      due: r2(row?.balance),
      upcoming: upcomingEarned,
      jobs: [
        ...(row?.jobDetails || []).map((d) => ({ jobId: d.jobId, description: d.description || "", date: d.date || null, amount: money(d), parking: Number(d.parkingReimbursed) || 0, settled: !!d.settled })),
        ...upcomingJobs.map((j) => ({
          jobId: j.id,
          description: j.services?.join(", ") || j.id,
          date: j.scheduledAt,
          amount: j.fee,
          parking: 0,
          settled: false,
          isUpcoming: true,
        })),
      ],
      payments: (row?.payments || []).map((p) => ({ date: p.date || null, amount: Number(p.amount) || 0, reference: p.reference || "" })),
    },
  };
}
