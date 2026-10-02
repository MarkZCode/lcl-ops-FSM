"use client";

import { useState, useEffect, useRef } from "react";
import {
  FiSend,
  FiExternalLink,
  FiLoader,
  FiCheckCircle,
  FiPaperclip,
  FiEdit2,
  FiUploadCloud,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import Modal from "./Modal";
import InvoiceModal from "./InvoiceModal";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { renderTemplate, buildContext } from "@/lib/email";
import { JOB_TEMPLATE_PURPOSES } from "@/lib/templates";
import { fileSrc, uploadFile } from "@/lib/uploads";
import { buildInvoicePrefill, overridesKey } from "@/lib/invoiceData";
import { toWhatsAppNumber, cleanWhatsAppText } from "@/lib/whatsapp";
import { bankForJob } from "@/lib/bank";
import { blockersForScheduling } from "@/lib/visits";
import { bookingMissing } from "@/lib/gates";
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
  const { templates, email, invoiceSeq, advanceInvoiceSeq, allocateInvoiceNumber, peekInvoiceNumber, logActivity, updateJob, generateShareToken, bankAccounts, invoiceBankId, engineerById } = useStore();
  // The account this job's invoice carries: the one already used, else the
  // one currently selected for new invoices.
  const bank = bankForJob(job, bankAccounts, invoiceBankId);
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
    // Changing an invoice that has already gone out is a correction, and a
    // correction is recorded: what was changed and why.
    if (docType === "invoice" && job.invoicedAt) {
      const why = window.prompt("This invoice has already been sent. What is being corrected, and why?");
      if (!why || why.trim().length < 3) return;
      patch.invoiceCorrections = [...(job.invoiceCorrections || []), { at: new Date().toISOString(), reason: why.trim() }];
      logActivity(job.id, { type: "payment", title: "Invoice corrected", detail: why.trim() });
    }
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
  // Uploads store the MIME type as `type` (see lib/uploads.js) — matching
  // only on `contentType` meant a genuinely attached certificate was
  // invisible here unless its filename happened to end in .pdf.
  const isPdf = (f) =>
    f?.type === "application/pdf" ||
    f?.contentType === "application/pdf" ||
    /\.pdf$/i.test(f?.name || f?.filename || "");
  const certFiles = isCertEmail ? (job?.attachments || []).filter(isPdf) : [];
  const attachable = Boolean(job) && (!isCertEmail || certFiles.length > 0);
  // The certificate email with no certificate on the job is the case that
  // used to show nothing at all — no checkbox, no explanation, no way in.
  const certMissing = isCertEmail && Boolean(job) && certFiles.length === 0;
  const [uploading, setUploading] = useState(false);
  const certInputRef = useRef(null);

  // Upload a certificate straight from this modal and save it onto the job,
  // exactly where "Documents & photos" puts it — so it is on the job record
  // for the inspector as well as on this email.
  const addCertificate = async (fileList) => {
    const incoming = Array.from(fileList || []).filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "")
    );
    if (!incoming.length || !job?.id) return;
    setUploading(true);
    try {
      let next = [...(job.attachments || [])];
      for (const file of incoming) {
        if (file.size > 9 * 1024 * 1024) {
          toast.error(`"${file.name}" is too large (max 9 MB).`);
          continue;
        }
        const up = await uploadFile(file, `jobs/${job.id}`);
        next = [
          {
            id: "att-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            ...up,
            addedAt: new Date().toISOString(),
          },
          ...next,
        ];
      }
      updateJob(job.id, { attachments: next });
      setAttach(true);
      toast.success("Certificate attached to the job.");
    } catch (e) {
      toast.error("Upload failed — try again from Documents & photos on the job.");
    } finally {
      setUploading(false);
    }
  };
  const docLabel = isCertEmail
    ? (certFiles.length === 1 ? "certificate" : `${certFiles.length} certificates`)
    : docType === "quote" ? "quote" : "invoice";

  const ctx = buildContext({ job, client, property, email, bank });
  // A booking confirmation tells the client it's booked. It doesn't go until
  // every engineer on the job has actually confirmed.
  const bookingBlockers = job && ["booking", "reminder"].includes(tplKey) ? [...blockersForScheduling(job, (id) => engineerById(id)?.name || "the engineer")] : [];
  if (job && ["booking", "reminder"].includes(tplKey)) {
    for (const m of bookingMissing(job, { client, property })) bookingBlockers.push(`missing ${m.label}`);
  }
  const bookingBlocked = bookingBlockers.length > 0;
  // One reason this message must not go yet, by ANY route — the email
  // button, the WhatsApp button or the mail app. Empty when it's fine.
  const blockedReason = bookingBlocked
    ? `the booking isn't confirmed yet: ${bookingBlockers.join("; ")}.`
    : isCertEmail && job && (job.amendments || []).some((a) => !a.resolvedAt)
      ? "a correction to this certificate is still open."
      : isCertEmail && job && !job.certCheckedAt
        ? "the certificate hasn't been checked yet. Tick the checklist in the Certificate panel on the job first."
        : "";

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
    // A quote carries the link where the client can accept it in one tap.
    let acceptLine = "";
    if (tplKey === "quote" && job?.id && job.status === "quote" && !job.acceptedAt && typeof window !== "undefined") {
      const token = job.shareToken || generateShareToken(job.id);
      if (token) acceptLine = `\n\nYou can view and accept your quote online here: ${window.location.origin}/share/${token}`;
    }
    // What the quote and the booking say about a missed appointment — only
    // when this job carries the condition.
    const fee = Number(job?.noAccessFee) || 0;
    const noAccessLine = fee > 0 && ["quote", "booking"].includes(tplKey)
      ? `\n\nPlease note: if nobody is available to give access at the booked time, a £${fee} no-access fee applies.` : "";
    // The engineer's courtesy call, when one has been arranged.
    const callLine = tplKey === "booking" && job?.callBefore && !/no call/i.test(job.callBefore)
      ? `\n\nYour engineer will ${job.callBefore.replace(/^Call/i, "call")}.` : "";
    setBody(renderTemplate(tpl.body, ctx) + callLine + noAccessLine + acceptLine + sig);
    // Invoices go to the billing email when the client has one.
    setTo((["invoice", "job_completed"].includes(tplKey) && client?.billingEmail) || client?.email || "");
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

  // WhatsApp links. These are plain <a> links, opened by the click itself:
  // the old button awaited a server call first and only then called
  // window.open, which browsers block once the click has "expired", so
  // nothing opened at all.
  //   phone    → wa.me (opens the WhatsApp / Business app)
  //   computer → WhatsApp Web (works in any browser, and opens in the
  //              installed WhatsApp web app) or the desktop app
  const waNum = toWhatsAppNumber(phone);
  const waText = encodeURIComponent(cleanWhatsAppText(body));
  const waLinks = waNum
    ? {
        mobile: `https://wa.me/${waNum}?text=${waText}`,
        // Through /wa.html so an installed WhatsApp Web window can't
        // swallow the link and open without the chat (see public/wa.html).
        web: `/wa.html#p=${waNum}&t=${waText}`,
        app: `whatsapp://send?phone=${waNum}&text=${waText}`,
      }
    : null;
  const waHref = waLinks?.mobile || null;
  const isPhone = typeof navigator !== "undefined" && /iphone|ipad|android|mobile/i.test(navigator.userAgent);
  const [waPref, setWaPref] = useState(() => {
    try { return localStorage.getItem("lcl-wa-pref") || "web"; } catch { return "web"; }
  });

  // What was sent moves the job forward — the office runs a lot of this over
  // WhatsApp and email, and the app should follow what actually happened
  // instead of waiting for someone to also click the matching status:
  //   quote → quote sent · follow-up → chased · booking confirmation → the
  //   client has accepted · job completed / invoice → Invoiced · payment
  //   received → Paid · certificate sent (attached) → Certified once paid.
  // (A job "Williams" was worked, invoiced and paid while still sitting on
  // Quote because none of these moved it.)
  const advanceOnSend = ({ certificateAttached = false } = {}) => {
    if (!job) return;
    const iso = new Date().toISOString();
    const RANK = { quote: 0, scheduled: 1, in_progress: 2, completed: 3, invoiced: 4, paid: 5 };
    const r = RANK[job.status];
    const patch = {};
    if (tplKey === "quote" && job.status === "quote") patch.quoteSentAt = iso;
    if (tplKey === "followup" && job.status === "quote") patch.quoteChasedAt = iso;
    if (tplKey === "booking" && !job.acceptedAt) patch.acceptedAt = iso;
    if ((tplKey === "invoice" || tplKey === "job_completed") && r != null && r < 4 && Number(job.price) > 0) {
      patch.status = "invoiced";
    }
    if (tplKey === "receipt" && r != null && r < 5) patch.status = "paid";
    if (tplKey === "certificate" && certificateAttached) {
      patch.certificateSentAt = iso;
      if (job.status === "paid" || patch.status === "paid") patch.certifiedAt = iso;
    }
    if (Object.keys(patch).length) updateJob(job.id, patch);
  };

  // Called as the WhatsApp link opens (it navigates by itself — nothing here
  // may block it). Logs the message on the job and moves the flow on.
  const onWhatsAppOpened = (which) => {
    if (which && which !== "mobile") {
      try { localStorage.setItem("lcl-wa-pref", which); } catch {}
      setWaPref(which);
    }
    if (job && logActivity) {
      logActivity(job.id, {
        type: "whatsapp",
        template: tplKey,
        title: `${templates[tplKey]?.name || "Message"} sent on WhatsApp`,
        detail: body.slice(0, 300),
        to: phone,
      });
    }
    advanceOnSend();
  };

  const handleSend = async () => {
    if (blockedReason) {
      setStatus("error");
      setMessage(`Not sent — ${blockedReason}`);
      return;
    }
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
        // The job remembers which account its invoice went out with.
        if (docType === "invoice" && job.invoiceBankId !== bank.id) updateJob(job.id, { invoiceBankId: bank.id });
        const { generateInvoicePDF } = await import("@/lib/generateInvoice");
        const pdf = generateInvoicePDF(
          {
            docType,
            invNo,
            dateISO: todayISO(),
            ...buildInvoicePrefill(job, client, property, docType),
            taxOn: false,
            bank,
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
    // The certificate email exists to deliver the certificate. Sending it
    // with nothing attached tells the client to "find the certificate
    // attached" next to an empty paperclip — worse than not sending.
    if (isCertEmail && (!attachments || !attachments.length)) {
      setStatus("idle");
      setMessage(
        attachFailed
          ? "The certificate couldn't be read back from storage — re-upload it and try again."
          : "Upload the certificate PDF first — this email promises an attachment."
      );
      return;
    }

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
            // The template key is what "has the booking confirmation gone
            // out?" is answered from (lib/nextAction.js) — matching on the
            // title broke whenever a template was renamed.
            template: tplKey,
            title: `${templates[tplKey]?.name || "Email"} sent`,
            detail: subject,
            to,
            attachment: attachedFilename || null,
            meta: { messageId: data.id },
          });
        }
        // Sending the invoice IS invoicing. A finished job whose invoice had
        // gone out still sat on Completed until someone remembered to press
        // "Mark as invoiced" — so it showed up as "to invoice" forever, and
        // the payment chase never started.
        advanceOnSend({ certificateAttached: isCertEmail && !!attachedFilename });
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
          {waLinks && isPhone && !blockedReason && (
            <a
              className="btn bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              href={waLinks.mobile}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onWhatsAppOpened("mobile")}
            >
              <FaWhatsapp /> WhatsApp
            </a>
          )}
          {waLinks && !isPhone && !blockedReason && (
            <span className="inline-flex overflow-hidden rounded-full">
              <a
                className="btn rounded-none bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                href={waPref === "app" ? waLinks.app : waLinks.web}
                target={waPref === "app" ? undefined : "_blank"}
                rel="noopener noreferrer"
                onClick={() => onWhatsAppOpened(waPref)}
                title={waPref === "app" ? "Opens the WhatsApp desktop app" : "Opens WhatsApp Web (or your installed WhatsApp web app)"}
              >
                <FaWhatsapp /> {waPref === "app" ? "WhatsApp app" : "WhatsApp Web"}
              </a>
              <a
                className="btn rounded-none border-l border-white/30 bg-[#1ebe5b] px-3 text-xs text-white hover:bg-[#19a950]"
                href={waPref === "app" ? waLinks.web : waLinks.app}
                target={waPref === "app" ? "_blank" : undefined}
                rel="noopener noreferrer"
                onClick={() => onWhatsAppOpened(waPref === "app" ? "web" : "app")}
                title={waPref === "app" ? "Use WhatsApp Web instead" : "Use the WhatsApp desktop app instead"}
              >
                {waPref === "app" ? "Web" : "App"}
              </a>
            </span>
          )}
{!blockedReason && (          <a className="btn-outline" href={mailto}>
            <FiExternalLink /> Mail app
          </a>)}
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
        {blockedReason && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
            This can&apos;t be sent yet — {blockedReason}
          </p>
        )}
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
                {edited && !isCertEmail ? " — edited" : ""}
              </span>
            </label>
            {isCertEmail ? (
              <button
                type="button"
                onClick={() => certInputRef.current?.click()}
                disabled={uploading}
                className="flex shrink-0 items-center gap-1 rounded-md border border-brand-300 bg-white px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
              >
                <FiUploadCloud className="h-3 w-3" /> {uploading ? "Uploading…" : "Replace / add"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-brand-300 bg-white px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
              >
                <FiEdit2 className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
        )}

        {/* The certificate template with no certificate on the job. It used
            to render nothing at all, which read as "certificates aren't
            supported" — so upload it from right here. */}
        {certMissing && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addCertificate(e.dataTransfer.files);
            }}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/70 px-3 py-3 text-sm text-navy-700"
          >
            <FiPaperclip className="shrink-0 text-amber-600" />
            <span className="min-w-0 flex-1">
              <strong>No certificate is on this job yet.</strong> Upload the signed
              PDF (CP12, EICR…) and it will be attached here and saved to the job.
            </span>
            <button
              type="button"
              onClick={() => certInputRef.current?.click()}
              disabled={uploading}
              className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
            >
              <FiUploadCloud className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload certificate"}
            </button>
          </div>
        )}

        {isCertEmail && certFiles.length > 0 && (
          <ul className="-mt-1 space-y-1 pl-1 text-xs text-navy-500">
            {certFiles.map((f) => (
              <li key={f.id || f.name} className="truncate">
                <a
                  href={fileSrc(f)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:text-brand-600"
                >
                  {f.name || f.filename}
                </a>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={certInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            addCertificate(e.target.files);
            e.target.value = "";
          }}
        />

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
