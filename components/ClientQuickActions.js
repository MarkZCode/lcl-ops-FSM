"use client";

// Under the client's details on a job: the WhatsApp replies the office types
// ten times a day, ready to open with the text filled in, and one-tap call
// logging — so "I rang, no answer" is on the job instead of in someone's head.
import { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { FiPhoneCall, FiPhoneMissed, FiVoicemail } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { greetingNow, firstName, senderFor } from "@/lib/email";
import { gbp, serviceShort, isAddonCode } from "@/lib/format";
import { dateLine } from "@/lib/jobCard";
import { invoiceConfig } from "@/lib/invoiceConfig";
import { toast } from "@/lib/toast";

// {hi} = "Good morning Maisie, this is Lisa from Landlord Compliance London."
const REPLIES = [
  { key: "received", label: "We've got your enquiry", text: (c) => `${c.hi} Thank you for your enquiry — we've received it and I'm putting your quote together now. You'll have it from me shortly.` },
  { key: "need_details", label: "Ask for bedrooms / appliances", text: (c) => `${c.hi} So I can give you an exact price for the ${c.services}, could you let me know how many bedrooms the property has, and how many gas appliances (boiler, hob, fire)?` },
  { key: "quote", label: "Quote and price", text: (c) => `${c.hi} Your quote for the ${c.services}${c.postcode ? ` at ${c.postcode}` : ""} is ${c.price}, all in. We can usually offer a same-day or next-day appointment — shall I book you in?` },
  { key: "availability", label: "Offer a slot", text: (c) => `${c.hi} We have availability this week for the ${c.services}. Would a morning (8am–1pm) or an afternoon (1pm–6pm) suit you better, and which day?` },
  { key: "confirm", label: "Booking confirmed", text: (c) => `${c.hi} You're booked in: ${c.services}, ${c.when}${c.postcode ? ` at ${c.postcode}` : ""}. Please make sure someone can give access. Just message here if anything changes.` },
  { key: "access", label: "Who gives access?", text: (c) => `${c.hi} For your appointment ${c.when}, could you confirm who will let the engineer in, and the best number to reach them on the day?` },
  { key: "payment", label: "Bank details", text: (c) => `${c.hi} The total is ${c.price}. Bank transfer details — Account holder: ${invoiceConfig.bank.accountHolder}, Sort code: ${invoiceConfig.bank.sortCode}, Account number: ${invoiceConfig.bank.accountNumber}, Reference: ${c.ref}. Thank you.` },
  { key: "cert", label: "Certificate on its way", text: (c) => `${c.hi} Your ${c.services} has been completed and the certificate is being emailed to you now. Please let me know if it doesn't arrive.` },
  { key: "review", label: "Ask for a review", text: (c) => `${c.hi} Thank you for using us for your ${c.services}. If you were happy with the service, a quick Google review would mean a great deal to a small team like ours. Thank you!` },
];

const CALLS = [
  { key: "spoke", label: "Spoke", icon: FiPhoneCall, title: "Called — spoke to the client" },
  { key: "no_answer", label: "No answer", icon: FiPhoneMissed, title: "Called — no answer" },
  { key: "voicemail", label: "Voicemail", icon: FiVoicemail, title: "Called — left a voicemail" },
  { key: "missed", label: "Missed their call", icon: FiPhoneMissed, title: "Missed call from the client — call back", inbound: true },
];

export default function ClientQuickActions({ job, client, property }) {
  const { logActivity } = useStore();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  if (!job || !client?.phone) return null;
  const who = user?.name || user?.username || "";

  const ctx = {
    hi: `${greetingNow()} ${firstName(client.name)}, this is ${senderFor(job.id)} from Landlord Compliance London.`,
    services: (job.services || []).filter((c) => !isAddonCode(c)).map(serviceShort).join(" and ") || "work",
    postcode: property?.postcode || "",
    price: gbp(job.price),
    when: job.scheduledAt ? dateLine(job) : "on the agreed date",
    ref: job.invoiceNumber || job.id,
  };

  const send = (key) => {
    const r = REPLIES.find((x) => x.key === key);
    if (!r) return;
    const msg = r.text(ctx);
    if (!openWhatsAppChat(client.phone, msg)) return;
    logActivity(job.id, { type: "whatsapp", title: `WhatsApp opened — ${r.label}`, detail: msg, by: who, ...(key === "quote" ? { template: "quote" } : {}) });
  };

  const logCall = (c) => {
    logActivity(job.id, {
      type: "call",
      title: c.title,
      detail: note.trim(),
      by: who,
      ...(c.inbound ? { direction: "in" } : {}),
    });
    setNote("");
    toast("Call logged");
  };

  return (
    <div className="space-y-2 border-t border-navy-100 pt-2.5 text-xs">
      <label className="flex items-center gap-2">
        <FaWhatsapp className="shrink-0 text-[#25D366]" />
        <select className="input h-8 min-w-0 flex-1 py-0 text-xs" value="" onChange={(e) => { send(e.target.value); e.target.value = ""; }} aria-label="Open WhatsApp with a saved reply">
          <option value="">WhatsApp a saved reply…</option>
          {REPLIES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </label>
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
    </div>
  );
}
