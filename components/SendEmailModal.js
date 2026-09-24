"use client";

import { useState, useEffect, useRef } from "react";
import {
  FiSend,
  FiExternalLink,
  FiLoader,
  FiCheckCircle,
  FiPaperclip,
  FiEdit2,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import Modal from "./Modal";
import InvoiceModal from "./InvoiceModal";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { renderTemplate, buildContext } from "@/lib/email";
import { JOB_TEMPLATE_PURPOSES } from "@/lib/templates";
import { fileSrc } from "@/lib/uploads";
import { buildInvoicePrefill, overridesKey } from "@/lib/invoiceData";
import { toWhatsAppNumber } from "@/lib/whatsapp";
import { toast } from "@/lib/toast";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Compose + send an email for a job from a saved template.
// Primary path: live send via /api/send-email (Resend). Falls back to the
// user's mail app (mailto) if email isn't configured yet.
export default function SendEmailModal({
  open,
  onClose,
  job,
  client,
  property,
  defaultTemplate,
}) {
  const { templates, email, invoiceSeq, advanceInvoiceSeq, allocateInvoiceNumber, peekInvoiceNumber, logActivity, updateJob } = useStore();
  const [tplKey, setTplKey] = useState(defaultTemplate || "booking");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const initRef = useRef(null);

  // Any email can carry the quote PDF as an attachment (not just the "Quote"
  // template) — the invoice template attaches the invoice instead.
  // "Job completed" now carries the invoice in the same email (see the
  // template rewrite in lib/settings.js) — needs docType "invoice" too, or
  // the attach checkbox silently offered a quote PDF instead.
  const docType = (tplKey === "invoice" || tplKey === "job_completed") ? "invoice" : "quote";
  const edited = !!job?.[overridesKey(docType)];

  // Edits from the "Edit invoice/quote" popup are saved onto the job itself
  // (not just this popup's state), so a different billing name/address or
  // changed line items survive closing, re-opening and re-sending.
  const saveEdits = ({ invNo, ...details }) => {
    if (!job?.id) return;
    const patch = { [overridesKey(docType)]: details };
    if (docType === "invoice" && invNo && String(invNo) !== String(job.invoiceNumber || "")) {
      patch.invoiceNumber = String(invNo);
      patch.invoiceNumberAt = new Date().toISOString();
    }
    updateJob(job.id, patch);
  };
  // The certificate email sends the CERTIFICATE — the real file uploaded to
  // the job, not a generated quote or invoice PDF. Anything else would
  // attach the wrong document to the one email whose entire purpose is the
  // document.
  const isCertEmail = tplKey === "certificate";
  const certFiles = isCertEmail
    ? (job?.attachments || []).filter((f) => /pdf$/i.test(f.name || f.filename || "") || f.contentType === "application/pdf")
    : [];
  const attachable = Boolean(job) && (!isCertEmail || certFiles.length > 0);
  const docLabel = isCertEmail
    ? (certFiles.length === 1 ? "certificate" : `${certFiles.length} certificates`)
    : docType === "quote" ? "quote" : "invoice";

  const ctx = buildContext({ job, client, property, email });

  // Open on the requested template (e.g. "renewal" for reminders).
  // `templates` used to sit in this effect's dependency array — that object
  // gets a brand-new reference every time the store re-syncs in the
  // background (a focus event, the 90s refresh tick, anything), even when
  // its content hasn't changed. Each of those silently re-ran this effect
  // and forced tplKey back to defaultTemplate — so picking "Booking
  // confirmation" a few seconds after opening (which defaults to "quote")
  // would revert to Quote on its own, a real risk of sending the wrong
  // email. Now applies the default once per modal-open, exactly like the
  // template-load effect below already does — never again once you've
  // picked something yourself in this session.
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (!open) { defaultAppliedRef.current = false; return; }
    if (defaultAppliedRef.current) return;
    if (defaultTemplate && templates[defaultTemplate]) {
      setTplKey(defaultTemplate);
    }
    defaultAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTemplate]);

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = `${tplKey}-${job?.id || 'none'}`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    const tpl = templates[tplKey];
    if (!tpl) return;
    // Tick the attachment only for the emails that are ABOUT a document.
    // It defaulted to on for everything, which is how a booking
    // confirmation went out with a quote PDF stapled to it.
    setAttach(["quote", "invoice", "job_completed", "certificate"].includes(tplKey));
    setSubject(renderTemplate(tpl.subject, ctx));
    // The signature goes through renderTemplate as well. It ends with the
    // sender's name, and the body now opens with "this is {{sender}} here"
    // — signing off as someone else would give the whole thing away.
    const sig = email.signature ? `\n\n${renderTemplate(email.signature, ctx)}` : "";
    setBody(renderTemplate(tpl.body, ctx) + sig);
    setTo(client?.email || "");
    setPhone(client?.phone || "");
    setStatus("idle");
    setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tplKey, job?.id]);

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}${
    email.bccSelf && email.fromEmail
      ? `&bcc=${encodeURIComponent(email.fromEmail)}`
      : ""
  }`;

  const waHref = (() => {
    const num = toWhatsAppNumber(phone);
    if (!num) return null;
    return `https://wa.me/${num}?text=${encodeURIComponent(body)}`;
  })();

  // WhatsApp: try the Business API (auto-send); fall back to click-to-send.
  const handleWhatsApp = async () => {
    const num = toWhatsAppNumber(phone);
    if (!num) return;
    setStatus("sending");
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || "";
      const res = await fetch("/api/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: num, text: body }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("sent");
        setMessage("WhatsApp message sent.");
        if (job && logActivity) {
          logActivity(job.id, {
            type: "email",
            title: "WhatsApp sent",
            detail: body.slice(0, 300),
            to: phone,
          });
        }
        return;
      }
      if (!out.notConfigured) {
        // configured but Meta rejected (e.g. needs a template) — show + fall back
        setStatus("idle");
        setMessage(
          (out.error || "WhatsApp couldn't auto-send") + " — opening WhatsApp instead."
        );
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
    if (waHref) window.open(waHref, "_blank", "noopener");
  };

  const handleSend = async () => {
    setStatus("sending");
    setMessage("");

    // Build the PDF attachment for invoice/quote emails.
    let attachments;
    let invNoUsed = null;
    let attachedFilename = null;
    let attachFailed = false;
    if (isCertEmail && attach && certFiles.length) {
      // Fetch each stored certificate and send it as-is. No regeneration —
      // the document the client gets must be byte-for-byte the one on the
      // job, which is what an inspector will be shown.
      try {
        attachments = [];
        for (const f of certFiles) {
          const res = await fetch(fileSrc(f));
          if (!res.ok) throw new Error(`couldn't read ${f.name || "certificate"}`);
          const buf = await res.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          attachments.push({
            filename: f.name || f.filename || "certificate.pdf",
            base64: btoa(binary),
            contentType: "application/pdf",
          });
        }
        attachedFilename = attachments.map((a) => a.filename).join(", ");
      } catch (e) {
        attachFailed = true;
        attachments = undefined;
      }
    } else if (attachable && attach) {
      try {
        // Allocated against the job so the emailed PDF, the job page and
        // the payment record all quote the same invoice number.
        const invNo = docType === "invoice" ? allocateInvoiceNumber(job.id) : `Q-${job.id}`;
        const { generateInvoicePDF } = await import("@/lib/generateInvoice");
        const pdf = generateInvoicePDF(
          {
            docType,
            invNo,
            dateISO: todayISO(),
            ...buildInvoicePrefill(job, client, property, docType),
            taxOn: false,
          },
          { output: "base64" }
        );
        attachments = [
          { filename: pdf.filename, base64: pdf.base64, contentType: "application/pdf" },
        ];
        attachedFilename = pdf.filename;
        if (docType === "invoice") invNoUsed = invNo;
      } catch (e) {
        // PDF failed — send without the attachment, but say so instead of
        // silently reporting the send as fully successful.
        attachFailed = true;
      }
    }

    // "Booking confirmed ... on to be confirmed" is not a confirmation. The
    // auto-send path already refuses this; the manual one didn't, so it
    // shipped a blank date to a real client.
    if ((tplKey === "booking" || tplKey === "reminder") && !job?.scheduledAt) {
      setStatus("idle");
      setMessage("Set an appointment date on this job first — this email would go out saying \u201con to be confirmed\u201d.");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || "";
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to,
          subject,
          text: body,
          // The server maps this to the right mailbox (accounts@ for
          // invoices, bookings@ for appointments, …) — see
          // mailboxForPurpose in lib/emailProviders.js.
          purpose: tplKey,
          fromName: email.fromName,
          fromEmail: email.fromEmail,
          replyTo: email.replyTo,
          bcc: email.bccSelf ? email.fromEmail : undefined,
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Advance the invoice counter only when an invoice was actually sent.
        if (invNoUsed) advanceInvoiceSeq(invNoUsed);
        // Log it to the job's communication thread.
        if (job && logActivity) {
          logActivity(job.id, {
            type: "email",
            title: `${templates[tplKey]?.name || "Email"} sent`,
            detail: subject,
            to,
            attachment: attachedFilename || null,
            meta: { messageId: data.id },
          });
        }
        if (attachFailed) {
          // Something needs the user's attention (missing attachment) —
          // keep the modal open so the message is actually seen.
          setStatus("error");
          setMessage(
            `Email sent, but the ${docLabel} PDF failed to generate — it was NOT attached. Send it separately or retry.`
          );
        } else {
          // Fully successful — the email is already gone, nothing left to
          // review here. Close immediately instead of making the user click
          // an extra "Close" button, and hand the confirmation off to the
          // regular toast so it's still visible after the modal is gone.
          toast(
            attachedFilename
              ? `Email sent with ${attachedFilename} attached.`
              : "Email sent."
          );
          onClose();
        }
      } else if (data.notConfigured) {
        // Graceful fallback to mail app
        setStatus("error");
        setMessage(
          "Live email isn't set up yet — opening your mail app instead. (Add a Resend key in Settings to send automatically.)"
        );
        window.location.href = mailto;
      } else {
        setStatus("error");
        setMessage(data.error || "Could not send. Try the mail app instead.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Opening your mail app instead.");
      window.location.href = mailto;
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Send message"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Close
          </button>
          {waHref && (
            <button
              className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              onClick={handleWhatsApp}
            >
              <FaWhatsapp /> WhatsApp
            </button>
          )}
          <a className="btn-outline" href={mailto}>
            <FiExternalLink /> Mail app
          </a>
          <button
            className="btn-primary"
            onClick={handleSend}
            disabled={status === "sending" || !to}
          >
            {status === "sending" ? (
              <>
                <FiLoader className="animate-spin" /> Sending…
              </>
            ) : status === "sent" ? (
              <>
                <FiCheckCircle /> Sent
              </>
            ) : (
              <>
                <FiSend /> Send email
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {JOB_TEMPLATE_PURPOSES.filter((key) => templates[key]).map((key) => (
            <button
              key={key}
              onClick={() => setTplKey(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                tplKey === key
                  ? "border-navy-800 bg-navy-800 text-white"
                  : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
              }`}
            >
              {templates[key].name}
            </button>
          ))}
        </div>

        {attachable && (
          <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-sm text-navy-700">
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={attach}
                onChange={(e) => setAttach(e.target.checked)}
                className="h-4 w-4 rounded border-navy-300 text-brand-500 focus:ring-brand-400"
              />
              <FiPaperclip className="text-brand-600" />
              <span>
                Attach the <strong>{docLabel}</strong> PDF to this email
                {docType === "invoice" ? ` (No. ${peekInvoiceNumber(job?.id)})` : ""}
                {edited ? " — edited" : ""}
              </span>
            </label>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-brand-300 bg-white px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            >
              <FiEdit2 className="h-3 w-3" /> Edit
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">To (email)</label>
            <input
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
            />
          </div>
          <div>
            <label className="label">Phone (for WhatsApp)</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07xxx xxxxxx"
            />
          </div>
        </div>

        <div>
          <label className="label">Subject</label>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea
            className="input resize-none text-sm leading-relaxed"
            rows={11}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {message && (
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              status === "sent"
                ? "bg-brand-50 text-brand-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {message}
          </p>
        )}

        <p className="flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-500">
          <FiSend className="shrink-0" />
          <span>
            <strong>Send email</strong> delivers automatically once a Resend key is
            added. <strong>WhatsApp</strong> opens a pre-filled chat to the client.
            <strong> Mail app</strong> is the manual fallback.
          </span>
        </p>
      </div>

      <InvoiceModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        docType={docType}
        jobId={job?.id}
        onSave={saveEdits}
        prefill={{
          invNo: docType === "quote" ? job?.id : undefined,
          ...buildInvoicePrefill(job, client, property, docType),
        }}
      />
    </Modal>
  );
}
