"use client";

// ManualDialerModal — click-to-call for a single lead (cold or prospect).
//
// Opens the device's tel: handler when the user hits "Dial", then prompts
// them to log the call outcome. Outcome → stage mapping is opinionated and
// matches the same pipeline stages used in lib/cold-leads.js + lib/prospects.js
// so the rest of the app stays in sync.

import { useState } from "react";
import { FiPhone, FiX } from "react-icons/fi";
import Modal from "./Modal";
import { toast } from "@/lib/toast";

const OUTCOMES = [
  { code: "no_answer",     label: "No answer",            note: "No answer",                          stage: "contacted" },
  { code: "voicemail",     label: "Voicemail left",       note: "Voicemail left",                     stage: "contacted" },
  { code: "spoke_warm",    label: "Spoke — interested",   note: "Spoke, interested — follow up",      stage: "replied" },
  { code: "spoke_cold",    label: "Spoke — not now",      note: "Spoke, not interested right now",    stage: "contacted" },
  { code: "booked",        label: "Booked a job",         note: "Booked a job on the call",           stage: "booked" },
  { code: "dnc",           label: "Do not call again",    note: "Asked not to be contacted",          stage: "dnc" },
];

export default function ManualDialerModal({ open, onClose, lead, onLog }) {
  const [dialed, setDialed] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [extraNote, setExtraNote] = useState("");

  if (!lead) return null;

  const phoneDigits = String(lead.phone || "").replace(/[^\d+]/g, "");
  const telHref = phoneDigits ? `tel:${phoneDigits}` : "";

  const reset = () => {
    setDialed(false);
    setOutcome("");
    setExtraNote("");
  };
  const close = () => { reset(); onClose(); };

  const dial = () => {
    if (!telHref) {
      toast.error("No phone number on this lead");
      return;
    }
    window.location.href = telHref;
    setDialed(true);
  };

  const log = () => {
    if (!outcome) { toast.error("Pick an outcome"); return; }
    const o = OUTCOMES.find((x) => x.code === outcome);
    const note = extraNote.trim() ? `${o.note} — ${extraNote.trim()}` : o.note;
    onLog?.(lead.id, { channel: "call", note }, o.stage);
    toast.success("Call logged");
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Call ${lead.name || lead.phone || ""}`}
      footer={
        <div className="flex w-full items-center gap-2">
          <button className="btn-secondary" onClick={close}>Close</button>
          {dialed && (
            <button className="btn-primary ml-auto" onClick={log} disabled={!outcome}>
              Log outcome
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Lead snapshot */}
        <div className="rounded-lg border border-navy-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-navy-900">
          <p className="font-semibold text-navy-900 dark:text-white">{lead.name || "Unknown name"}</p>
          {lead.address && <p className="text-xs text-navy-500 dark:text-slate-400">{lead.address}</p>}
          {lead.email && <p className="mt-1 text-xs text-navy-600 dark:text-slate-300">{lead.email}</p>}
          {lead.lastContactedAt && (
            <p className="mt-1 text-[11px] text-navy-400 dark:text-slate-500">
              Last contacted: {new Date(lead.lastContactedAt).toLocaleString("en-GB")}
            </p>
          )}
        </div>

        {/* Phone + dial */}
        <div className="flex items-center gap-3 rounded-lg bg-navy-50 p-3 dark:bg-white/5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-navy-900 text-white dark:bg-navy-800">
            <FiPhone />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Phone</p>
            <a href={telHref} className="block truncate text-base font-semibold text-navy-900 dark:text-white">
              {lead.phone || "—"}
            </a>
          </div>
          <button className="btn-primary shrink-0" onClick={dial} disabled={!telHref}>
            <FiPhone /> Dial
          </button>
        </div>

        {/* Outcome — appears after dialling */}
        {dialed && (
          <div className="space-y-3">
            <div>
              <label className="label">How did it go?</label>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => setOutcome(o.code)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      outcome === o.code
                        ? "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-200"
                        : "border-navy-200 bg-white text-navy-700 hover:border-navy-300 hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:text-slate-200 dark:hover:bg-white/5"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Note (optional)</label>
              <textarea
                className="input min-h-20"
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                placeholder="Anything to remember next time…"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
