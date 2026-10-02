"use client";

// Job details — the facts each service needs before it can be quoted and
// booked properly, in one place on the job.
//
// It shows only the questions that apply to the services on THIS job (gas
// asks about appliances, an FRA about floors and communal areas…), lists
// what is still missing, and writes the message asking the client for
// exactly those things and nothing else.
import { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { FiCopy, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { intakeFieldsFor, quoteMissing, bookingMissing } from "@/lib/gates";
import { greetingNow, firstName, jobSender, SENDERS } from "@/lib/email";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { serviceShort, isAddonCode } from "@/lib/format";
import { toast } from "@/lib/toast";

export const URGENCY_REASONS = [
  "Tenant moving in",
  "Failed certificate — needed before occupation",
  "Council / licensing deadline",
  "Agent deadline",
  "Property sale or remortgage",
  "Safety concern",
];
export const NO_ACCESS_FEE_DEFAULT = 20;

const sentence = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export default function IntakePanel({ job, client, property }) {
  const { updateJob, logActivity } = useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!job || ["paid", "cancelled"].includes(job.status)) return null;

  const intake = job.intake || {};
  const fields = intakeFieldsFor(job);
  const quoting = job.status === "quote" && !job.acceptedAt;
  // While quoting, ask only for what changes the price; from acceptance on,
  // everything the booking and the engineer need.
  const needQuote = quoteMissing(job, { client, property }, { all: !quoting });
  const needBooking = bookingMissing(job, { client, property });
  const missing = quoting
    ? needQuote
    : [...needBooking, ...needQuote.filter((q) => !needBooking.some((b) => b.key === q.key))];
  const set = (field, value) => updateJob(job.id, { intake: { ...intake, [field]: value } });

  // "Could you please confirm …" — only what's missing.
  const askText = () => {
    const what = (job.services || []).filter((c) => !isAddonCode(c)).map(serviceShort).join(" and ") || "your enquiry";
    const lines = missing.map((m) => `• ${m.label.replace(/^./, (c) => c.toUpperCase())}`);
    return `${greetingNow()} ${firstName(client?.name)}, ${jobSender(job)} here from Landlord Compliance London. Thank you for your enquiry regarding the ${what}.\n\nWe'd be happy to arrange this for you. Could you please confirm:\n${lines.join("\n")}\n\nOnce confirmed, we can provide the quote and available appointment times.`;
  };
  const ask = (how) => {
    const msg = askText();
    if (how === "wa") {
      if (!openWhatsAppChat(client?.phone, msg)) { toast.error("No phone number for this client."); return; }
    } else {
      navigator.clipboard.writeText(msg).then(() => toast.success("Message copied.")).catch(() => {});
    }
    updateJob(job.id, { detailsRequestedAt: new Date().toISOString() });
    logActivity(job.id, { type: how === "wa" ? "whatsapp" : "note", title: `Asked the client for missing details (${sentence(missing.map((m) => m.key))})`, detail: msg, by: user?.name || user?.username || "" });
  };

  return (
    <section className="card p-5">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="section-label text-sm">Job details</span>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${missing.length ? "text-amber-700" : "text-brand-700"}`}>
          {missing.length ? <><FiAlertTriangle /> {missing.length} still needed</> : <><FiCheckCircle /> Everything needed is here</>}
          <span className="ml-1 text-navy-400">{open ? "Hide" : "Open"}</span>
        </span>
      </button>

      {missing.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs dark:bg-amber-500/10">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Still needed {job.status === "quote" && !job.acceptedAt ? "to quote properly" : "before this can be booked"}:</p>
          <p className="mt-1 text-amber-900 dark:text-amber-100">{sentence(missing.map((m) => m.label))}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {client?.phone && (
              <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 font-semibold text-white hover:bg-[#1ebe5b]" onClick={() => ask("wa")}>
                <FaWhatsapp /> Ask on WhatsApp
              </button>
            )}
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-2.5 py-1.5 font-semibold text-navy-700 dark:bg-transparent" onClick={() => ask("copy")}>
              <FiCopy /> Copy the message
            </button>
            {job.detailsRequestedAt && <span className="self-center text-navy-500">Asked {new Date(job.detailsRequestedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
          </div>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-4 text-sm">
          {fields.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.field} className={f.input === "chips" || f.input === "text" ? "sm:col-span-2" : ""}>
                  <label className="label">{f.title}</label>
                  {f.input === "number" && (
                    <input type="number" min="0" className="input" defaultValue={intake[f.field] ?? ""} onBlur={(e) => e.target.value !== String(intake[f.field] ?? "") && set(f.field, e.target.value === "" ? "" : Number(e.target.value))} />
                  )}
                  {f.input === "text" && (
                    <input className="input" defaultValue={intake[f.field] || ""} onBlur={(e) => e.target.value !== (intake[f.field] || "") && set(f.field, e.target.value.trim())} />
                  )}
                  {f.input === "yesno" && (
                    <div className="flex gap-2">
                      {["Yes", "No"].map((v) => (
                        <button key={v} type="button" onClick={() => set(f.field, v)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${intake[f.field] === v ? "border-brand-400 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600"}`}>{v}</button>
                      ))}
                    </div>
                  )}
                  {f.input === "chips" && (
                    <div className="flex flex-wrap gap-2">
                      {f.options.map((o) => {
                        const on = (intake[f.field] || []).includes(o);
                        return (
                          <button key={o} type="button" onClick={() => set(f.field, on ? intake[f.field].filter((x) => x !== o) : [...(intake[f.field] || []), o])} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600"}`}>{o}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name on the certificate</label>
              <input className="input" defaultValue={job.nameOnCert || ""} placeholder={client?.name || ""} onBlur={(e) => e.target.value !== (job.nameOnCert || "") && updateJob(job.id, { nameOnCert: e.target.value.trim() })} />
            </div>
            <div>
              <label className="label">Messages signed by</label>
              <select className="input" value={job.senderName || ""} onChange={(e) => updateJob(job.id, { senderName: e.target.value })}>
                <option value="">Automatic ({jobSender({ id: job.id })})</option>
                {SENDERS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Is it urgent? Why</label>
              <select className="input" value={job.urgencyReason || ""} onChange={(e) => updateJob(job.id, { urgencyReason: e.target.value })}>
                <option value="">Not urgent</option>
                {URGENCY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Client&apos;s deadline</label>
              <input type="date" className="input" value={job.deadline || ""} onChange={(e) => updateJob(job.id, { deadline: e.target.value })} />
            </div>
          </div>

          <label className="flex flex-wrap items-center gap-2 text-xs text-navy-700">
            <input type="checkbox" checked={!!job.noAccessFee} onChange={(e) => updateJob(job.id, { noAccessFee: e.target.checked ? NO_ACCESS_FEE_DEFAULT : 0 })} />
            A no-access fee applies to this job
            {!!job.noAccessFee && (
              <>
                : £
                <input type="number" min="0" className="input h-8 w-20 py-0 text-xs" defaultValue={job.noAccessFee} onBlur={(e) => Number(e.target.value) !== job.noAccessFee && updateJob(job.id, { noAccessFee: Number(e.target.value) || NO_ACCESS_FEE_DEFAULT })} />
                <span className="text-navy-500">— stated on the quote</span>
              </>
            )}
          </label>
        </div>
      )}
    </section>
  );
}
