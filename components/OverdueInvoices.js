"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiAlertTriangle, FiSend, FiCheckCircle, FiLoader } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { gbp, fmtDate } from "@/lib/format";
import { differenceInDays } from "date-fns";
import { invoiceConfig } from "@/lib/invoiceConfig";

async function authedFetch(url, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

export default function OverdueInvoices({ overdueDays = 7 }) {
  const { jobs, clients, email: emailSettings, templates, logActivity } = useStore();
  const [sending, setSending] = useState({});

  const overdue = useMemo(() => {
    const now = new Date();
    return jobs
      .filter((j) => {
        if (j.status !== "invoiced") return false;
        if (!j.invoicedAt) return false;
        return differenceInDays(now, new Date(j.invoicedAt)) >= overdueDays;
      })
      .sort((a, b) => new Date(a.invoicedAt) - new Date(b.invoicedAt));
  }, [jobs, overdueDays]);

  if (!overdue.length) return null;

  const sendChaser = async (job) => {
    const client = clients.find((c) => c.id === job.clientId);
    if (!client?.email) return;
    setSending((p) => ({ ...p, [job.id]: "sending" }));
    const daysLate = differenceInDays(new Date(), new Date(job.invoicedAt));
    const body =
      `Hi ${client.name},\n\nThis is a friendly reminder that invoice ${job.id} for ${gbp(job.price)} ` +
      `was sent ${daysLate} days ago and is still awaiting payment.\n\n` +
      `Please transfer to:\nAccount: ${invoiceConfig.bank.accountHolder}\nSort code: ${invoiceConfig.bank.sortCode}\nAccount no: ${invoiceConfig.bank.accountNumber}\nBank: ${invoiceConfig.bank.bankName}\nIBAN: ${invoiceConfig.bank.iban}\nReference: ${job.id}\n\n` +
      // Same remittance address as the invoice PDF — a chaser that asks for
      // money should say where to confirm it, and say the same thing the
      // invoice does.
      `Once paid, please send remittance confirmation to ${invoiceConfig.remittanceEmail}.\n\n` +
      `If you have already paid, please ignore this message or let us know.\n\n` +
      `Kind regards,\nLisa\nLandlord Compliance London\n07426 409342`;
    const res = await authedFetch("/api/send-email", {
      method: "POST",
      body: JSON.stringify({
        to: client.email,
        subject: `Payment reminder — ${job.id}`,
        text: body,
        fromName: emailSettings?.fromName || "Landlord Compliance London",
        fromEmail: emailSettings?.fromEmail,
        replyTo: emailSettings?.replyTo,
      }),
    });
    if (res.ok) {
      logActivity(job.id, { type: "email", title: "Payment chaser sent", detail: `${daysLate} days overdue`, to: client.email });
      setSending((p) => ({ ...p, [job.id]: "sent" }));
    } else {
      setSending((p) => ({ ...p, [job.id]: "error" }));
    }
  };

  return (
    <div className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 section-label text-sm">
        <FiAlertTriangle className="text-amber-500" /> Overdue invoices
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
          {overdue.length}
        </span>
      </h2>
      <ul className="divide-y divide-navy-100">
        {overdue.map((job) => {
          const client = clients.find((c) => c.id === job.clientId);
          const daysLate = differenceInDays(new Date(), new Date(job.invoicedAt));
          const st = sending[job.id] || "idle";
          return (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <Link href={`/jobs/${job.id}`} className="text-sm font-semibold text-navy-800 hover:text-brand-600">
                  {client?.name || job.id}
                </Link>
                <p className="text-xs text-navy-500">
                  {job.id} · {gbp(job.price)} · invoiced {fmtDate(job.invoicedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {daysLate}d overdue
                </span>
                <button
                  onClick={() => sendChaser(job)}
                  disabled={!client?.email || st === "sending" || st === "sent"}
                  className="btn-outline shrink-0 py-1 text-xs disabled:opacity-50"
                  title={client?.email ? "Send payment chaser" : "No email on file"}
                >
                  {st === "sending" ? <FiLoader className="animate-spin" /> :
                   st === "sent" ? <FiCheckCircle className="text-brand-600" /> :
                   <FiSend />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
