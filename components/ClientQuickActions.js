"use client";

// Under the client's details on a job: the messages the office sends every
// day, ready with this job's facts filled in; the playbooks for the usual
// disputes; one-tap call logging; and the full record of what was sent and
// when, for the "you never replied" conversation.
import { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { FiPhoneCall, FiPhoneMissed, FiVoicemail, FiCopy, FiLifeBuoy, FiList } from "react-icons/fi";
import Modal from "./Modal";
import DraftAssistant from "./DraftAssistant";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { greetingNow, firstName, jobSender } from "@/lib/email";
import { gbp, serviceShort, isAddonCode, fmtDateTime } from "@/lib/format";
import { dateLine } from "@/lib/jobCard";
import { bankForJob } from "@/lib/bank";
import { toast } from "@/lib/toast";

// {hi}  = "Good morning Maisie, Lisa here from Landlord Compliance London."
// Facts only: nothing here promises a slot, a result or a turnaround that
// isn't on the job.
const REPLIES = [
  { key: "received", label: "New enquiry — received", text: (c) => `${c.hi} Thank you for your enquiry regarding the ${c.services}.\n\nWe'd be happy to arrange this for you and will come back to you with the quote shortly.` },
  { key: "quote", label: "Quote", template: "quote", text: (c) => `${c.hiShort}\n\nWe've prepared your quote for the ${c.services}.\n\nJob: ${c.ref}\nProperty: ${c.where}\nPrice: ${c.price}\n\nTo arrange the booking, please confirm:\n• Full property address\n• Certificate name\n• Tenant/access contact and number\n• Preferred date/time\n\nOnce confirmed, we can proceed with the booking.` },
  { key: "availability", label: "Ask for a preferred slot", text: (c) => `${c.hi} For the ${c.services}, which day would suit you, and would you prefer a morning (8am–1pm) or an afternoon (1pm–6pm) appointment? We'll confirm the slot once the engineer has accepted it.` },
  { key: "confirm", label: "Booking confirmed", needsConfirmed: true, text: (c) => `${c.hi} Your ${c.services} is confirmed for ${c.when}${c.where ? ` at ${c.where}` : ""}. Job reference: ${c.ref}. Please make sure someone is available to give access.` },
  { key: "access", label: "Who gives access?", text: (c) => `${c.hi} For your appointment ${c.when}, could you confirm who will let the engineer in, and the best number to reach them on the day?` },
  { key: "payment", label: "Payment follow-up", text: (c) => `${greetingNow()} ${c.first}, just a quick follow-up regarding the invoice sent for the ${c.services}. Kindly check the invoice and arrange payment using the bank details shown, with ${c.ref} as the payment reference. Once payment is received, we can proceed with the certificate.` },
  { key: "bank", label: "Bank details", text: (c) => `${c.hi} The total is ${c.price}. Bank transfer details — Account holder: ${c.bank.accountHolder}, Sort code: ${c.bank.sortCode}, Account number: ${c.bank.accountNumber}, Reference: ${c.ref}. Thank you.` },
  { key: "cert", label: "Certificate completed", text: (c) => `Hi ${c.first}, your ${c.services} has now been completed and the document has been emailed to you. Thank you for your cooperation.` },
  { key: "delay", label: "Delay update", text: (c) => `Hi ${c.first}, just an update regarding your ${c.services}. There has been a delay due to [reason]. The latest confirmed option is [confirmed option]. We apologise for the inconvenience and will keep you updated.` },
  { key: "review", label: "Ask for a review", text: (c) => `${c.hi} Thank you for using us for your ${c.services}. If you were happy with the service, a quick Google review would mean a great deal to a small team like ours. Thank you!` },
];

// What to do, in order, when a client raises one of the usual problems —
// and a calm first reply to start from. The steps come first on purpose:
// check the facts before saying anything.
const PLAYBOOKS = [
  {
    key: "not_received", label: "“I never got your quote / email”",
    steps: ["Open the message history below and find what was actually sent, and when.", "Don't say it was delivered unless the record shows it.", "Send it again.", "Offer to send it on WhatsApp as well, so there's a second record."],
    reply: (c) => `Hi ${c.first}, thank you for letting me know, and apologies for the inconvenience. I've checked our records and resent it to you just now. I'm also sending it here on WhatsApp so you have it in both places. Please let me know once you've received it.`,
  },
  {
    key: "account", label: "Payment / bank account problem",
    steps: ["Open the invoice and read the bank details on it.", "Confirm the account and the reference with the client — only what's on the current invoice.", "If the payment failed, check whether another approved account exists before offering one.", "Never give account details from memory or from an old invoice."],
    reply: (c) => `Hi ${c.first}, thank you for flagging this. The details on your current invoice are — Account holder: ${c.bank.accountHolder}, Sort code: ${c.bank.sortCode}, Account number: ${c.bank.accountNumber}, Reference: ${c.ref}. Could you let me know exactly what happened when you tried to pay, so I can look into it?`,
  },
  {
    key: "cert_delay", label: "“Where is my certificate?”",
    steps: ["Check the Certificate panel: has the document arrived, been checked, been sent?", "Check payment status if the certificate is released after payment.", "Give only the turnaround that is actually confirmed for this job.", "Explain the engineer carries out the inspection and we then receive and check the document."],
    reply: (c) => `Hi ${c.first}, thank you for your patience. The inspection was carried out by our engineer, and we then receive and check the document before it's issued. The current position on yours is: [confirmed status]. I'll update you as soon as it's ready.`,
  },
  {
    key: "engineer", label: "No update from the engineer",
    steps: ["Check the engineer's status on the job — offered, accepted, on the way.", "Don't say “booked” unless the engineer has confirmed.", "Give the latest confirmed status, and say when you'll next update them."],
    reply: (c) => `Hi ${c.first}, I've checked on this for you. The latest confirmed position is: [confirmed status]. I'll come back to you by [time] with an update either way.`,
  },
  {
    key: "angry", label: "Upset or angry customer",
    steps: ["Acknowledge the issue first.", "State only facts you have verified on the job.", "Say what has already been done.", "Say the next action and when.", "Keep it calm; don't argue the point.", "Log the conversation on the job."],
    reply: (c) => `Hi ${c.first}, I'm sorry about this — I understand why it's frustrating. Here is where things stand: [verified facts]. So far we have [actions taken]. The next step is [next action], and I'll update you by [time].`,
  },
];

const CALLS = [
  { key: "spoke", label: "Spoke", icon: FiPhoneCall, title: "Called — spoke to the client" },
  { key: "no_answer", label: "No answer", icon: FiPhoneMissed, title: "Called — no answer" },
  { key: "voicemail", label: "Voicemail", icon: FiVoicemail, title: "Called — left a voicemail" },
  { key: "missed", label: "Missed their call", icon: FiPhoneMissed, title: "Missed call from the client — call back", inbound: true },
];

// Everything said to and by the client on this job, oldest first, as text.
export function chronology(job, clientName) {
  const rows = (job.activity || [])
    .filter((a) => ["email", "whatsapp", "call"].includes(a.type) || a.direction === "in")
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map((a) => {
      const who = a.direction === "in" ? `${clientName || "Client"} → us` : `Us → ${clientName || "client"}`;
      const how = a.type === "whatsapp" ? "WhatsApp" : a.type === "call" ? "Call" : a.type === "email" ? "Email" : "Message";
      const first = String(a.detail || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^subject:/i.test(l))[0] || "";
      return `${fmtDateTime(a.at)} · ${how} · ${who}\n  ${a.title || ""}${first ? `\n  “${first.slice(0, 160)}”` : ""}${a.to ? `\n  To: ${a.to}` : ""}`;
    });
  return rows.length ? `Message record for ${job.id}\n\n${rows.join("\n\n")}` : "";
}

export default function ClientQuickActions({ job, client, property, engineerConfirmed = true }) {
  const { logActivity, bankAccounts, invoiceBankId } = useStore();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [book, setBook] = useState(null);
  const [history, setHistory] = useState(false);
  if (!job || !client) return null;
  const who = user?.name || user?.username || "";
  const first = firstName(client.name);
  const sender = jobSender(job);

  const ctx = {
    first,
    hi: `${greetingNow()} ${first}, ${sender} here from Landlord Compliance London.`,
    hiShort: `Hi ${first}, ${sender} here from Landlord Compliance London.`,
    services: (job.services || []).filter((c) => !isAddonCode(c)).map(serviceShort).join(" and ") || "work",
    where: [property?.label && property.label !== property.postcode ? property.label : "", property?.postcode].filter(Boolean).join(", "),
    price: gbp(job.price),
    when: job.scheduledAt ? dateLine(job) : "on the agreed date",
    ref: job.invoiceNumber || job.id,
    bank: bankForJob(job, bankAccounts, invoiceBankId),
  };

  const open = (label, msg, extra = {}) => {
    if (!client.phone) { navigator.clipboard.writeText(msg).then(() => toast.success("No phone number — message copied instead.")).catch(() => {}); return; }
    if (!openWhatsAppChat(client.phone, msg)) return;
    logActivity(job.id, { type: "whatsapp", title: `WhatsApp opened — ${label}`, detail: msg, by: who, ...extra });
  };
  const send = (key) => {
    const r = REPLIES.find((x) => x.key === key);
    if (!r) return;
    if (r.needsConfirmed && !engineerConfirmed) { toast.error("The engineer hasn't confirmed yet — don't tell the client it's booked."); return; }
    open(r.label, r.text(ctx), r.template ? { template: r.template } : {});
  };

  const logCall = (c) => {
    logActivity(job.id, { type: "call", title: c.title, detail: note.trim(), by: who, ...(c.inbound ? { direction: "in" } : {}) });
    setNote("");
    toast("Call logged");
  };

  const record = history ? chronology(job, client.name) : "";

  return (
    <div className="space-y-2 border-t border-navy-100 pt-2.5 text-xs">
      <label className="flex items-center gap-2">
        <FaWhatsapp className="shrink-0 text-[#25D366]" />
        <select className="input h-8 min-w-0 flex-1 py-0 text-xs" value="" onChange={(e) => { send(e.target.value); e.target.value = ""; }} aria-label="Open WhatsApp with a saved reply">
          <option value="">WhatsApp a saved reply…</option>
          {REPLIES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <FiLifeBuoy className="shrink-0 text-navy-400" />
        <select className="input h-8 min-w-0 flex-1 py-0 text-xs" value="" onChange={(e) => { setBook(PLAYBOOKS.find((p) => p.key === e.target.value) || null); e.target.value = ""; }} aria-label="Handle a problem">
          <option value="">Handle a problem…</option>
          {PLAYBOOKS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
      <DraftAssistant job={job} client={client} property={property} />
      <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-navy-600 hover:text-brand-600" onClick={() => setHistory(true)}>
        <FiList /> Message record for this job
      </button>
      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-navy-400">Log a call</p>
        <input className="input mb-1.5 h-8 py-0 text-xs" placeholder="What was said (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {CALLS.map((c) => (
            <button key={c.key} type="button" onClick={() => logCall(c)} className="inline-flex items-center gap-1 rounded-lg border border-navy-200 px-2 py-1 font-semibold text-navy-600 hover:border-brand-300 hover:text-brand-600">
              <c.icon className="h-3 w-3" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <Modal open={!!book} onClose={() => setBook(null)} title={book?.label || ""} footer={
        <>
          <button className="btn-outline" onClick={() => setBook(null)}>Close</button>
          <button className="btn-outline" onClick={() => navigator.clipboard.writeText(book.reply(ctx)).then(() => toast.success("Reply copied."))}><FiCopy /> Copy reply</button>
          <button className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]" onClick={() => { open(`problem: ${book.label}`, book.reply(ctx)); setBook(null); }}><FaWhatsapp /> Open in WhatsApp</button>
        </>
      }>
        {book && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-navy-900">Do these first, in order:</p>
            <ol className="list-decimal space-y-1 pl-5 text-navy-700">{book.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="font-semibold text-navy-900">A reply to start from — fill in the brackets with what you verified:</p>
            <p className="whitespace-pre-line rounded-lg bg-navy-50 p-3 text-navy-800 dark:bg-white/[0.04]">{book.reply(ctx)}</p>
          </div>
        )}
      </Modal>

      <Modal open={history} onClose={() => setHistory(false)} wide title={`Message record — ${job.id}`} footer={
        <>
          <button className="btn-outline" onClick={() => setHistory(false)}>Close</button>
          <button className="btn-primary" disabled={!record} onClick={() => navigator.clipboard.writeText(record).then(() => toast.success("Record copied."))}><FiCopy /> Copy</button>
        </>
      }>
        <p className="mb-2 text-xs text-navy-500">Every email, WhatsApp and call logged on this job, oldest first. This is what the app recorded as sent — an email leaving here is not proof it was read.</p>
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-xs text-navy-800 dark:bg-white/[0.04]">{record || "Nothing has been sent or received on this job yet."}</pre>
      </Modal>
    </div>
  );
}
