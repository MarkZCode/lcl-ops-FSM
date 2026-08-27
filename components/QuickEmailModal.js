"use client";

// QuickEmailModal — in-app email composer for outreach contacts (prospects,
// agents, leads). Sends via /api/send-email so it goes from
// landlordcompliancelondon@gmail.com — never opens the user's native Mail.app.
//
// Pre-fills subject/body from a template purpose if provided, otherwise
// expects subject/body via props.

import { useEffect, useState, useRef } from "react";
import { FiSend } from "react-icons/fi";
import Modal from "./Modal";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { getTemplate, renderTemplate } from "@/lib/templates";

export default function QuickEmailModal({
  open, onClose, contact, purpose, defaultSubject, defaultBody, onSent,
  campaignLabel,
}) {
  const { templates, email } = useStore();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const initRef = useRef(null);

  // Rebuild template on each open / contact change.
  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = `${purpose || 'none'}-${contact?.email || 'no-email'}`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    if (purpose) {
      const tpl = getTemplate(templates, purpose);
      const r = renderTemplate(tpl, {
        client_name: contact?.name?.split(/\s+/)[0] || "there",
        fullname: contact?.name || "there",
        company: email?.fromName || "Landlord Compliance London",
        address: contact?.address || "",
        service: contact?.service || "",
        lastDone: contact?.lastDone || "",
        phone: "07426 409342",
      });
      setSubject(r.subject);
      // Always append the configured signature ("Kind regards, Lisa, …")
      // so every outreach email signs off consistently.
      setBody(r.body + (email?.signature ? `\n\n${email.signature}` : ""));
    } else {
      setSubject(defaultSubject || "");
      setBody((defaultBody || "") + (email?.signature ? `\n\n${email.signature}` : ""));
    }
  }, [open, purpose, contact?.email, contact?.name, defaultSubject, defaultBody]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!contact?.email) { toast.error("No email address"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body required"); return; }
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || "";
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: contact.email,
          subject,
          text: body,
          fromName: email?.fromName,
          replyTo: email?.replyTo,
          prospectId: contact.id, // shared log table — reuses prospectId column for any recipient id
          campaignLabel: campaignLabel || "manual",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // This send call uses the exact same server-side sendEmailRaw() as
        // the bulk campaign path — if the server returned ok:true here, Gmail
        // genuinely accepted it for delivery. If it's not showing in Gmail's
        // own Sent view, check /email-log instead — that page reads directly
        // from the email_sends table this send just wrote to, independent of
        // whatever account/tab/label view is open in Gmail.
        toast.success(`Email sent to ${contact.email} — logged in Email log${data.id ? ` (id ${data.id.slice(0, 12)}…)` : ""}`);
        onSent?.();
        onClose();
      } else {
        toast.error(data.error || `Send failed (${res.status})`);
      }
    } catch (err) {
      toast.error(`Send failed — ${err?.message || "network error"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Email ${contact?.name || contact?.email || ""}`}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary flex items-center gap-2" onClick={send} disabled={sending}>
          <FiSend /> {sending ? "Sending…" : "Send"}
        </button>
      </>}>
      <div className="space-y-3">
        <div className="rounded-lg bg-navy-50 p-2 text-xs dark:bg-white/5">
          <span className="font-semibold text-navy-700 dark:text-slate-200">To:</span>{" "}
          <span className="text-navy-600 dark:text-slate-300">{contact?.email || "—"}</span>
          <span className="ml-3 text-navy-500">·</span>
          <span className="ml-3 font-semibold text-navy-700 dark:text-slate-200">From:</span>{" "}
          <span className="text-navy-600 dark:text-slate-300">{email?.fromEmail || "landlordcompliancelondon@gmail.com"}</span>
        </div>
        <div>
          <label className="label">Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input min-h-44" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-[11px] text-navy-500 dark:text-slate-400">
            Sent from your linked Gmail · auto-signed off as Lisa from your settings signature.
          </p>
        </div>
      </div>
    </Modal>
  );
}
