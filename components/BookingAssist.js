"use client";

// The small things that make a booking go right, in one place under the
// Appointment panel: who to give the job to, whether they're off that day,
// what else is open at the same postcode, how to get in, and the two
// on-the-day buttons — "on the way" and "no access".
import Link from "next/link";
import { FiNavigation, FiSlash, FiKey, FiUsers, FiAlertTriangle, FiMapPin } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rankEngineers, engineerUnavailable, samePostcodeJobs } from "@/lib/booking";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { greetingNow, firstName, jobSender } from "@/lib/email";
import { accessPhone, windowStr } from "@/lib/jobCard";
import { isSplit } from "@/lib/visits";
import { fmtDate, getJobLines } from "@/lib/format";
import { toast } from "@/lib/toast";


export default function BookingAssist({ job, client, property, onReschedule }) {
  const { jobs, clients, engineers, engineerById, updateJob, logActivity } = useStore();
  const { user, can } = useAuth();
  if (!job || ["completed", "invoiced", "paid", "cancelled"].includes(job.status)) return null;

  const who = user?.name || user?.username || "";
  const unassigned = !job.engineerId || job.engineerId === "unassigned";
  const suggestions = !isSplit(job) && unassigned ? rankEngineers(job, { engineers, jobs, property }) : [];
  const eng = unassigned ? null : engineerById(job.engineerId);
  const off = eng ? engineerUnavailable(eng, job.scheduledAt) : null;
  const neighbours = samePostcodeJobs(job, { jobs, clients });
  const booked = job.scheduledAt && !unassigned;
  const isToday = job.scheduledAt && new Date(job.scheduledAt).toDateString() === new Date().toDateString();

  const onTheWay = () => {
    const phone = accessPhone(job, client) || client?.phone;
    if (!phone) { toast.error("No phone number for the client or access contact."); return; }
    const name = firstName(job.accessName || client?.name);
    const msg = `${greetingNow()} ${name}, this is ${jobSender(job)} from Landlord Compliance London. Your engineer${eng?.name ? `, ${eng.name.split(" ")[0]},` : ""} is on the way to ${property?.postcode || "the property"} now${windowStr(job) ? ` and should be with you ${windowStr(job)}` : ""}. Please make sure someone is there to let them in.`;
    if (!openWhatsAppChat(phone, msg)) return;
    updateJob(job.id, { onTheWayAt: new Date().toISOString() });
    logActivity(job.id, { type: "whatsapp", title: "“On the way” message opened", detail: msg, by: who });
  };

  // The fee is whatever THIS job's quote stated — and only if it stated one.
  const NO_ACCESS_FEE = Number(job.noAccessFee) || 0;
  const noAccess = (withFee) => {
    const n = (job.noAccessCount || 0) + 1;
    const patch = { noAccessCount: n, lastNoAccessAt: new Date().toISOString() };
    if (withFee) {
      patch.lineItems = [
        ...getJobLines(job),
        { id: `ln-CUSTOM-${Date.now().toString(36)}`, code: "CUSTOM", name: "No-access call-out fee", unit: NO_ACCESS_FEE, qty: 1 },
      ];
      patch.price = Math.round(((Number(job.price) || 0) + NO_ACCESS_FEE) * 100) / 100;
    }
    updateJob(job.id, patch);
    logActivity(job.id, {
      type: "status",
      title: `No access${n > 1 ? ` (${n} times now)` : ""}${withFee ? ` — £${NO_ACCESS_FEE} call-out fee added` : ""}`,
      detail: job.scheduledAt ? `Engineer attended ${fmtDate(job.scheduledAt)} and couldn't get in.` : "",
      by: who,
    });
    toast("No access recorded — pick a new date.");
    onReschedule?.();
  };

  const show = suggestions.length || off || neighbours.length || property?.accessNotes || booked;
  if (!show) return null;

  return (
    <div className="space-y-2.5 border-t border-navy-100 pt-3 text-xs">
      {off && (
        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 font-semibold text-rose-700">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>{eng.name} is off that day{off.note ? ` (${off.note})` : ""} — reassign or reschedule.</span>
        </p>
      )}

      {suggestions.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold uppercase tracking-wide text-navy-500"><FiUsers /> Suggested engineer</p>
          <ul className="space-y-1.5">
            {suggestions.map((s, i) => (
              <li key={s.engineer.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 px-2.5 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-navy-800">{s.engineer.name}{i === 0 ? " · best fit" : ""}</span>
                  <span className="block truncate text-navy-500">{s.reasons.join(" · ")}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => updateJob(job.id, { engineerId: s.engineer.id })}
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {property?.accessNotes && (
        <p className="flex items-start gap-2 rounded-lg bg-navy-50 px-2.5 py-2 text-navy-700 dark:bg-white/[0.04]">
          <FiKey className="mt-0.5 shrink-0 text-navy-400" />
          <span><strong className="font-semibold">Access:</strong> {property.accessNotes}</span>
        </p>
      )}

      {neighbours.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-500/10">
          <FiMapPin className="mt-0.5 shrink-0" />
          <span>
            Also open at {property?.postcode}:{" "}
            {neighbours.slice(0, 4).map((j, i) => (
              <span key={j.id}>
                {i > 0 && ", "}
                <Link href={`/jobs/${j.id}`} className="font-semibold underline">{j.id}</Link>
                {j.scheduledAt ? ` (${fmtDate(j.scheduledAt)})` : ""}
              </span>
            ))}
            {" "}— book them on the same visit.
          </span>
        </p>
      )}

      {booked && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTheWay}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold ${isToday ? "border-brand-300 text-brand-700 hover:bg-brand-50" : "border-navy-200 text-navy-600 hover:border-brand-300"}`}
            title="Opens the client's WhatsApp with the message typed"
          >
            <FiNavigation /> {job.onTheWayAt ? "On the way — sent" : "Tell client: on the way"}
          </button>
          <button
            type="button"
            onClick={() => {
              updateJob(job.id, { accessConfirmedAt: job.accessConfirmedAt ? null : new Date().toISOString() });
              if (!job.accessConfirmedAt) logActivity(job.id, { type: "status", title: "Access confirmed for the appointment", by: who });
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold ${job.accessConfirmedAt ? "border-brand-300 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600 hover:border-brand-300"}`}
            title="Someone has confirmed they'll be there to let the engineer in"
          >
            <FiKey /> {job.accessConfirmedAt ? "Access confirmed" : "Mark access confirmed"}
          </button>
          <button
            type="button"
            onClick={() => noAccess(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-2.5 py-1.5 font-semibold text-navy-600 hover:border-rose-300 hover:text-rose-600"
            title="Record that nobody was in, then pick a new date"
          >
            <FiSlash /> No access
          </button>
          {can?.("invoices") && NO_ACCESS_FEE > 0 && (
            <button
              type="button"
              onClick={() => noAccess(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-2.5 py-1.5 font-semibold text-navy-600 hover:border-rose-300 hover:text-rose-600"
              title={`Record no access and add a £${NO_ACCESS_FEE} call-out fee to the job`}
            >
              <FiSlash /> No access + £{NO_ACCESS_FEE} fee
            </button>
          )}
        </div>
      )}
      {job.noAccessCount > 0 && (
        <p className="text-navy-500">No access recorded {job.noAccessCount} time{job.noAccessCount === 1 ? "" : "s"} on this job.</p>
      )}
    </div>
  );
}
