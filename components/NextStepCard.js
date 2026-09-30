"use client";

// "Next step" — the one thing this job needs from the office right now, with
// the button that does it. Anything else outstanding is listed underneath so
// nothing is invisible, but there is always exactly one obvious move.
// The rules live in lib/nextAction.js; this only renders them.

import { FiArrowRight, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import { nextActions } from "@/lib/nextAction";

const BUTTON_LABEL = {
  "email:quote": "Send quote",
  "email:followup": "Chase quote",
  "email:booking": "Send booking confirmation",
  "email:invoice": "Send invoice",
  "email:certificate": "Send certificate",
  reply: "Open conversation",
  confirm: "Go to confirmation",
  book: "Book it",
  complete: "Mark done",
  partial: "Go to visits",
  invoice: "Send invoice",
  upload: "Upload certificate",
  edit: "Edit job",
  "status:scheduled": "Mark scheduled",
  "status:paid": "Mark paid",
  "status:quote": "No — back to quote",
  accept: "Yes, accepted",
  quote_sent: "Mark it sent",
  quote_hold: "Will get back…",
  certify: "Mark certified",
};

export default function NextStepCard({ job, clientEmail, engineerName, onDo }) {
  const actions = nextActions(job, { engineerName, clientEmail });
  if (["paid", "cancelled"].includes(job.status) && !actions.length) return null;

  if (!actions.length) {
    return (
      <section className="card flex items-center gap-3 p-4 text-sm text-navy-600">
        <FiCheckCircle className="h-5 w-5 shrink-0 text-brand-500" />
        <span>Nothing needed from the office right now.</span>
      </section>
    );
  }

  const [first, ...rest] = actions;
  const urgent = first.severity === "urgent";
  return (
    <section
      className={`card overflow-hidden p-0 ${urgent ? "ring-1 ring-rose-200" : "ring-1 ring-amber-200"}`}
    >
      <div className={`flex flex-wrap items-center gap-3 p-4 ${urgent ? "bg-rose-50/70" : "bg-amber-50/70"} dark:bg-white/[0.03]`}>
        <FiAlertCircle className={`h-5 w-5 shrink-0 ${urgent ? "text-rose-500" : "text-amber-600"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Next step</p>
          <p className="text-[15px] font-semibold text-navy-900">{first.title}</p>
          {first.detail && <p className="mt-0.5 text-xs text-navy-600">{first.detail}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {first.do === "reply" && (
            <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => onDo("reply_handled", first)}>
              Already handled
            </button>
          )}
          {first.do === "complete" && (
            <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => onDo("not_done", first)}>
              Something wasn&rsquo;t done…
            </button>
          )}
          {first.alt && (
            <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => onDo(first.alt, first)}>
              {BUTTON_LABEL[first.alt] || "Other"}
            </button>
          )}
          <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => onDo(first.do, first)}>
            {BUTTON_LABEL[first.do] || "Do it"} <FiArrowRight />
          </button>
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="divide-y divide-navy-100 border-t border-navy-100">
          {rest.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.severity === "urgent" ? "bg-rose-500" : "bg-amber-500"}`} />
              <span className="min-w-0 flex-1 text-navy-700">
                <strong className="font-semibold text-navy-800">{a.title}</strong>
                {a.detail ? <span className="text-navy-500"> — {a.detail}</span> : null}
              </span>
              <button
                type="button"
                className="shrink-0 font-semibold text-brand-600 hover:text-brand-700"
                onClick={() => onDo(a.do, a)}
              >
                {BUTTON_LABEL[a.do] || "Open"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
