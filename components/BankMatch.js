"use client";

// Paste rows from online banking; each one is matched to the unpaid invoice
// it pays, by reference and amount. Nothing is marked paid until you press
// the button on that row. Shown on Jobs → Invoiced.
import { useMemo, useState } from "react";
import Link from "next/link";
import { FiCheckCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { gbp } from "@/lib/format";
import { parseBankLines, matchPayments, jobBalance } from "@/lib/payments";

export default function BankMatch() {
  const { jobs, clients, updateJob, logActivity } = useStore();
  const { user, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState({});

  const results = useMemo(
    () => (text.trim() ? matchPayments(parseBankLines(text), jobs, clients) : []),
    [text, jobs, clients]
  );
  if (!can?.("payments")) return null;

  const who = user?.name || user?.username || "";
  const today = new Date().toISOString().slice(0, 10);

  const apply = (r) => {
    const job = r.match.job;
    const payments = [...(job.payments || []), { id: "pay-" + Date.now().toString(36), amount: r.line.amount, date: today, method: "Bank transfer", ref: "Matched from bank statement", by: who }];
    const left = jobBalance({ ...job, payments });
    updateJob(job.id, left <= 0 ? { payments, status: "paid", paidAt: new Date().toISOString() } : { payments });
    logActivity(job.id, { type: "payment", title: `${left <= 0 ? "Paid in full" : "Part payment"} · ${gbp(r.line.amount)} (matched from bank statement)`, detail: r.line.text, by: who });
    setDone((d) => ({ ...d, [r.line.id]: left <= 0 ? "paid" : "part" }));
  };

  const matched = results.filter((r) => r.match).length;

  return (
    <div className="mb-4 rounded-xl border border-navy-100 bg-white p-3 text-sm dark:bg-white/[0.03]">
      <button type="button" className="flex w-full items-center justify-between font-semibold text-navy-800" onClick={() => setOpen((o) => !o)}>
        <span>Match bank payments to invoices</span>
        <span className="text-xs text-brand-600">{open ? "Close" : "Open"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <textarea
            className="input resize-y font-mono text-xs"
            rows={5}
            placeholder={"Paste the rows from your bank statement here — one payment per line, e.g.\n02 Oct  FASTER PAYMENT  M QUINN JOB-4821  169.99"}
            value={text}
            onChange={(e) => { setText(e.target.value); setDone({}); }}
          />
          {results.length > 0 && (
            <>
              <p className="text-xs text-navy-500">{matched} of {results.length} lines matched an unpaid invoice. Check each one before marking it.</p>
              <ul className="divide-y divide-navy-100">
                {results.map((r) => (
                  <li key={r.line.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-navy-600">{r.line.text}</span>
                      {r.match ? (
                        <span className={r.match.exact ? "text-brand-700" : "text-amber-700"}>
                          → <Link href={`/jobs/${r.match.job.id}`} className="font-semibold underline">{r.match.job.id}</Link>
                          {" · "}{clients.find((c) => c.id === r.match.job.clientId)?.name || ""} · {r.match.why}
                        </span>
                      ) : (
                        <span className="text-navy-400">No unpaid invoice matches this line.</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <strong className="text-navy-900">{gbp(r.line.amount)}</strong>
                      {r.match && (done[r.line.id] ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-brand-700"><FiCheckCircle /> {done[r.line.id] === "paid" ? "Marked paid" : "Part payment saved"}</span>
                      ) : (
                        <button type="button" className="btn-outline py-1 text-xs" onClick={() => apply(r)}>
                          {r.match.exact ? "Mark paid" : "Record payment"}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
