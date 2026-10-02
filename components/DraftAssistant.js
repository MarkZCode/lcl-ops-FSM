"use client";

// "Draft a reply" on a job: say what you need (or paste what the client
// wrote), get a message written from this job's live record under LCL's
// own rules, then edit it and send it yourself. Nothing is sent from here.
import { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { FiEdit3, FiCopy, FiLoader } from "react-icons/fi";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { jobSender, firstName } from "@/lib/email";
import { gbp, getJobLines, isAddonCode, serviceName, fmtDateTime } from "@/lib/format";
import { dateLine } from "@/lib/jobCard";
import { blockersForScheduling } from "@/lib/visits";
import { bankForJob } from "@/lib/bank";
import { jobBalance } from "@/lib/payments";
import { quoteMissing } from "@/lib/gates";
import { statusMeta } from "@/lib/constants";
import { toast } from "@/lib/toast";

// The job, reduced to what a client message can need. First name only, no
// phone numbers, no engineer rates, no margin, no internal notes.
function recordFor(job, client, property, { engineerById, bank }) {
  const lines = getJobLines(job).filter((l) => !l.cancelled);
  const confirmed = blockersForScheduling(job, (id) => engineerById(id)?.name || "the engineer").length === 0;
  const isPdf = (f) => f?.type === "application/pdf" || /\.pdf$/i.test(f?.name || "");
  const thread = (job.activity || [])
    .filter((a) => ["email", "whatsapp", "call"].includes(a.type) || a.direction === "in")
    .slice(-8)
    .map((a) => `${fmtDateTime(a.at)} — ${a.direction === "in" ? "CLIENT" : "US"} (${a.type}): ${String(a.title || "")}${a.detail ? ` — ${String(a.detail).replace(/\s+/g, " ").slice(0, 400)}` : ""}`);
  return [
    `Job reference: ${job.invoiceNumber ? `${job.id} (invoice ${job.invoiceNumber})` : job.id}`,
    `Client's first name: ${firstName(client?.name)}`,
    `Stage: ${statusMeta(job.status)?.label || job.status}${job.acceptedAt ? " — quote accepted by the client" : job.status === "quote" ? " — quote not accepted yet" : ""}`,
    `Services: ${lines.filter((l) => !isAddonCode(l.code)).map((l) => `${l.code === "CUSTOM" ? l.name : serviceName(l.code)}${l.tier ? ` (${l.tier})` : ""}`).join("; ") || "none yet"}`,
    `Property: ${[property?.label, property?.postcode].filter(Boolean).join(", ") || "not given yet"}`,
    `Total price: ${gbp(job.price)}${job.noAccessFee ? ` (a £${job.noAccessFee} no-access fee applies if nobody gives access)` : ""}`,
    `Appointment: ${job.scheduledAt ? `${dateLine(job)} — ${confirmed ? "CONFIRMED by the engineer" : "NOT confirmed by the engineer yet (do not call it booked)"}` : job.preferredDate ? `none set; the client asked for ${job.preferredDate}` : "none set"}`,
    `Access confirmed: ${job.accessConfirmedAt ? "yes" : "no"}`,
    job.deadline ? `Client's deadline: ${job.deadline}${job.urgencyReason ? ` (${job.urgencyReason})` : ""}` : "",
    job.status === "quote" ? `Details still missing from the client: ${quoteMissing(job, { client, property }).map((m) => m.label).join("; ") || "none"}` : "",
    `Payment: ${job.status === "paid" ? "paid in full" : ["invoiced", "completed"].includes(job.status) ? `${gbp(jobBalance(job))} outstanding${job.invoicedAt ? `, invoice sent ${fmtDateTime(job.invoicedAt)}` : ", invoice not sent yet"}` : "not invoiced yet"}`,
    ["invoiced", "completed", "paid"].includes(job.status) ? `Bank details on the invoice: account holder ${bank.accountHolder}, sort code ${bank.sortCode}, account number ${bank.accountNumber}` : "",
    `Certificate: ${!(job.attachments || []).some(isPdf) ? "not received from the engineer yet" : (job.amendments || []).some((a) => !a.resolvedAt) ? "being corrected by the engineer" : !job.certCheckedAt ? "received, not yet checked" : job.certificateSentAt || job.certifiedAt ? "sent to the client" : "checked, ready to send"}`,
    (job.findings || []).filter((f) => !f.voidedAt).length ? `Engineer's findings (exactly as recorded): ${job.findings.filter((f) => !f.voidedAt).map((f) => `${f.code}: ${f.text}`).join("; ")}` : "",
    thread.length ? `Recent messages, oldest first:\n${thread.join("\n")}` : "No messages logged yet.",
  ].filter(Boolean).join("\n");
}

export default function DraftAssistant({ job, client, property }) {
  const { engineerById, bankAccounts, invoiceBankId, logActivity } = useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!job || !client) return null;

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/assistant/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
        body: JSON.stringify({
          channel, ask, sender: jobSender(job),
          record: recordFor(job, client, property, { engineerById, bank: bankForJob(job, bankAccounts, invoiceBankId) }),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.notConfigured) { setError("The assistant isn't switched on yet — it needs an Anthropic API key added to the server."); return; }
      if (!r.ok) throw new Error(d.error || "Couldn't draft that.");
      setDraft(d.text);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const who = user?.name || user?.username || "";
  const sendWa = () => {
    if (!openWhatsAppChat(client.phone, draft)) { toast.error("No phone number for this client."); return; }
    logActivity(job.id, { type: "whatsapp", title: "WhatsApp opened — drafted reply", detail: draft, by: who });
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => { setOpen(true); setDraft(""); setError(""); }}>
        <FiEdit3 /> Draft a reply
      </button>
      <Modal open={open} onClose={() => setOpen(false)} wide title={`Draft a reply — ${job.id}`} footer={
        <>
          <button className="btn-outline" onClick={() => setOpen(false)}>Close</button>
          {draft && <button className="btn-outline" onClick={() => navigator.clipboard.writeText(draft).then(() => toast.success("Draft copied."))}><FiCopy /> Copy</button>}
          {draft && channel === "whatsapp" && client.phone && <button className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={sendWa}><FaWhatsapp /> Open in WhatsApp</button>}
          <button className="btn-primary" disabled={busy || ask.trim().length < 3} onClick={run}>{busy ? <><FiLoader className="animate-spin" /> Writing…</> : draft ? "Write it again" : "Write the draft"}</button>
        </>
      }>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            {[["whatsapp", "WhatsApp"], ["email", "Email"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setChannel(k)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${channel === k ? "border-brand-400 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600"}`}>{l}</button>
            ))}
          </div>
          <div>
            <label className="label">What should the message do? Or paste what the client wrote.</label>
            <textarea className="input resize-y" rows={4} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={"e.g. Tell them the certificate is waiting on payment.\nor: “I never got your quote, I've been waiting two days.”"} />
          </div>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          {draft && (
            <div>
              <label className="label">Draft — read it and change anything before sending</label>
              <textarea className="input resize-y" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <p className="mt-1 text-[11px] text-navy-400">Written from this job&apos;s record only. Anything in [brackets] is a gap for you to fill. It is not sent until you send it.</p>
            </div>
          )}
          <p className="text-[11px] text-navy-400">The job&apos;s details (first name, services, property, price, dates and recent messages) are sent to the assistant to write this.</p>
        </div>
      </Modal>
    </>
  );
}
