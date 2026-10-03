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
  if ((job.visits || []).some((v) => v.engineerId === id && v.status !== "cancelled")) return true;
  return (job.lineItems || []).some((l) => l.engineerId === id);
}

// `write: false` (tests) skips creating missing job links.
export async function buildPortal(userEmail, month, { write = true } = {}) {
  const email = String(userEmail || "").toLowerCase();

  const [{ data: engRows }, { data: jobRows }, { data: payRow }] = await Promise.all([
    supabaseAdmin.from("engineers").select("data"),
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("app_settings").select("data").eq("id", "engineer_payments").maybeSingle(),
  ]);
  const engineers = (engRows || []).map((r) => r.data).filter(Boolean);
  const me = engineers.find((e) => e.email && String(e.email).toLowerCase() === email);
  if (!me) return { linked: false, email: userEmail };

  const allJobs = (jobRows || []).map((r) => r.data).filter(Boolean);
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
    try { const n = money(jobBreakdownForEngineer(job, me)); fee = n > 0 ? n : null; } catch {}
    const pc = String(p?.postcode || "").trim().toUpperCase();
    jobs.push({
      id: job.id,
      status: job.status,
      scheduledAt: job.scheduledAt || null,
      window: windowStr(job).replace(/^\((.*?)\)\s*(.*)$/, (m, range, part) => (part ? `${range} (${part})` : range)),
      services: getJobLines(job)
        .filter((l) => !isAddonCode(l.code) && !l.cancelled && lineEngineerId(job, l) === me.id)
        .map((l) => { const s = lineSizeLabel(l, job); return `${l.code === "CUSTOM" ? l.name : certLabel(l.code)}${s ? ` (${s})` : ""}`; }),
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

  return {
    linked: true,
    engineer: { id: me.id, name: me.name, color: me.color || "#0f766e" },
    jobs,
    pay: {
      month: m,
      earned: r2(row?.accrued),
      paid: r2(row?.paid),
      due: r2(row?.balance),
      jobs: (row?.jobDetails || []).map((d) => ({ jobId: d.jobId, description: d.description || "", date: d.date || null, amount: money(d), parking: Number(d.parkingReimbursed) || 0, settled: !!d.settled })),
      payments: (row?.payments || []).map((p) => ({ date: p.date || null, amount: Number(p.amount) || 0, reference: p.reference || "" })),
    },
  };
}
