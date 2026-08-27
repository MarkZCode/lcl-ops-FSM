"use client";

import { useState } from "react";
import Link from "next/link";
import { FiBell, FiSend, FiCheckCircle, FiLoader, FiAlertTriangle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { getRenewals, renewalTone, buildRenewalEmail } from "@/lib/renewals";
import { fmtDate, serviceName, isAddonCode } from "@/lib/format";

async function authedFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

export default function RenewalReminders({ withinDays = 60 }) {
  const { jobs, clients, email, logActivity } = useStore();
  const renewals = getRenewals(jobs, withinDays);
  const [sending, setSending] = useState({}); // { jobId: "idle"|"sending"|"sent"|"error" }
  const [bulkState, setBulkState] = useState("idle");

  const sendReminder = async (renewal, silent = false) => {
    const { job, expiry, days } = renewal;
    const client = clients.find((c) => c.id === job.clientId);
    if (!client?.email) return;
    const svcName = (job.services || []).filter((c) => !isAddonCode(c)).map(serviceName).join(", ") || "certificate";
    const { subject, body } = buildRenewalEmail({
      clientName: client.name,
      serviceName: svcName,
      expiryStr: fmtDate(expiry),
    });
    if (!silent) setSending((p) => ({ ...p, [job.id]: "sending" }));
    const res = await authedFetch("/api/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: client.email,
        subject,
        text: body,
        fromName: email?.fromName || "Landlord Compliance London",
        fromEmail: email?.fromEmail,
        replyTo: email?.replyTo,
        bcc: email?.bccSelf ? email?.fromEmail : undefined,
      }),
    });
    if (res.ok) {
      logActivity(job.id, { type: "email", title: "Renewal reminder sent", detail: subject, to: client.email });
      if (!silent) setSending((p) => ({ ...p, [job.id]: "sent" }));
    } else {
      if (!silent) setSending((p) => ({ ...p, [job.id]: "error" }));
    }
  };

  const sendAll = async () => {
    const eligible = renewals.filter((r) => {
      const c = clients.find((x) => x.id === r.job.clientId);
      return c?.email && !r.job.renewalReminderSent;
    });
    if (!eligible.length) return;
    setBulkState("sending");
    for (const r of eligible) await sendReminder(r, true);
    setBulkState("sent");
    setTimeout(() => setBulkState("idle"), 3000);
  };

  if (!renewals.length) {
    return (
      <div className="card p-5">
        <h2 className="mb-2 flex items-center gap-2 section-label text-sm">
          <FiBell /> Certificate Renewals
        </h2>
        <p className="text-sm text-navy-400">No certificates expiring within {withinDays} days. 🎉</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 section-label text-sm">
          <FiBell /> Certificate Renewals
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
            {renewals.length}
          </span>
        </h2>
        <button
          onClick={sendAll}
          disabled={bulkState === "sending"}
          className="btn-outline py-1.5 text-xs"
        >
          {bulkState === "sending" ? (
            <><FiLoader className="animate-spin" /> Sending all…</>
          ) : bulkState === "sent" ? (
            <><FiCheckCircle className="text-brand-600" /> All sent</>
          ) : (
            <><FiSend /> Remind all</>
          )}
        </button>
      </div>
      <ul className="divide-y divide-navy-100">
        {renewals.map(({ job, expiry, days }) => {
          const client = clients.find((c) => c.id === job.clientId);
          const tone = renewalTone(days);
          const st = sending[job.id] || "idle";
          return (
            <li key={job.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/jobs/${job.id}`} className="text-sm font-semibold text-navy-800 hover:text-brand-600">
                  {client?.name || job.id}
                </Link>
                <p className="text-xs text-navy-500">
                  {(job.services || []).filter((c) => !isAddonCode(c)).map(serviceName).join(", ")} · expires {fmtDate(expiry)}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.color}`}>
                {tone.label}
              </span>
              <button
                onClick={() => sendReminder({ job, expiry, days })}
                disabled={!client?.email || st === "sending" || st === "sent"}
                className="btn-outline shrink-0 py-1 text-xs disabled:opacity-50"
                title={client?.email ? "Send renewal reminder" : "No email on file"}
              >
                {st === "sending" ? <FiLoader className="animate-spin" /> :
                 st === "sent" ? <FiCheckCircle className="text-brand-600" /> :
                 st === "error" ? <FiAlertTriangle className="text-rose-500" /> :
                 <FiSend />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
