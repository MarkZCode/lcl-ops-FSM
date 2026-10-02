"use client";

import { useState, useEffect, useRef } from "react";
import {
  FiCopy,
  FiCheck,
  FiPrinter,
  FiPhone,
  FiMapPin,
  FiCalendar,
  FiFileText,
  FiLock,
  FiUserCheck,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { getJobLines, isAddonCode } from "@/lib/format";
import {
  jobCardText,
  lineSizeLabel,
  dateLine,
  certLabel,
  accessPhone,
  accessName,
  cardScopes,
  isScopeConfirmed,
  scopeAccepted,
  scopeConfirmedAt,
  setScopeConfirmed,
  nameOnCert,
} from "@/lib/jobCard";
import { visitForScope } from "@/lib/visits";

export default function JobCardModal({ open, onClose, job, client, property }) {
  const { updateJob, engineerById } = useStore();
  const [mode, setMode] = useState("quote"); // "quote" | "assigned"
  const [engFilter, setEngFilter] = useState("all"); // "all" | engineerId
  const [copied, setCopied] = useState(false);

  // Acceptance is per CARD, not per job — see lib/jobCard.
  const scopes = job ? cardScopes(job, engineerById) : [];
  const allConfirmed = scopes.length > 0 && scopes.every((sc) => scopeAccepted(job, sc));

  // Reset only when the modal OPENS. Keying this on `allConfirmed` too meant
  // confirming the last engineer snapped the view back to "All (combined)"
  // mid-task, right when you were looking at that engineer's card.
  const allConfirmedRef = useRef(allConfirmed);
  allConfirmedRef.current = allConfirmed;
  useEffect(() => {
    if (open) {
      setMode(allConfirmedRef.current ? "assigned" : "quote");
      setEngFilter("all");
      setCopied(false);
    }
  }, [open]);

  // The offer carries a link the engineer can confirm from. The token is
  // made the first time an offer card is opened for the job.
  useEffect(() => {
    if (open && job && !job.confirmToken && mode === "quote") {
      updateJob(job.id, { confirmToken: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job?.id, job?.confirmToken, mode]);

  if (!job) return null;

  const assigned = mode === "assigned";

  // Effective engineer for a line = its own engineer, else the job's engineer.
  const allLines = getJobLines(job);
  const lineEng = (l) => l.engineerId || job.engineerId || "unassigned";
  const engGroups = [...new Set(allLines.map(lineEng))];
  const multiEng = engGroups.length > 1;

  // Two ways to narrow a card down to one person's work:
  //   • engineers already differ  → filter by engineer (`eng:<id>`)
  //   • one engineer, many services → filter by service line (`line:<id>`)
  // The second case is the common one when quoting a multi-service job before
  // anyone is assigned: you still need to send just the EICR to a sparky to
  // check availability, without handing them the gas work too.
  const addonFree = allLines.filter((l) => !isAddonCode(l.code));
  const splitByLine = !multiEng && addonFree.length > 1;

  const lines = (() => {
    if (engFilter === "all") return allLines;
    if (engFilter.startsWith("line:")) {
      const id = engFilter.slice(5);
      // Keep addons (parking/congestion) with whichever single line is picked
      // so the engineer still sees what they can claim.
      return allLines.filter((l) => l.id === id || isAddonCode(l.code));
    }
    if (engFilter.startsWith("visit:")) {
      const visit = (job.visits || []).find((v) => v.id === engFilter.slice(6));
      return allLines.filter((l) => (visit?.lineIds || []).includes(l.id) || isAddonCode(l.code));
    }
    return allLines.filter((l) => lineEng(l) === engFilter);
  })();

  // Whose card is this? (a specific filter, or the single engineer on the job)
  const cardEngId = engFilter.startsWith("visit:")
    ? (job.visits || []).find((v) => v.id === engFilter.slice(6))?.engineerId || "unassigned"
    : engFilter.startsWith("line:")
      ? lineEng(allLines.find((l) => l.id === engFilter.slice(5)) || {})
      : engFilter !== "all"
        ? engFilter
        : scopes.length === 1 ? scopes[0].engineerId : null;
  const engineerName =
    cardEngId && cardEngId !== "unassigned" ? engineerById(cardEngId).name : "";

  // The scope this card represents — what gets confirmed when the engineer
  // replies. "All (combined)" isn't a card anyone accepts, so it has none.
  const currentScope =
    engFilter === "all"
      ? (scopes.length === 1 ? scopes[0] : null)
      : scopes.find((sc) => sc.key === engFilter) || null;

  // A split job's visits each have their own date and window. Showing the
  // JOB's date on every card sent Rizwan to Thursday's slot when his visit
  // was Friday. Where this card maps to exactly one visit, the card speaks
  // for that visit.
  const visit = visitForScope(job, {
    engineerId: engFilter.startsWith("line:") ? undefined : (currentScope?.engineerId || cardEngId || undefined),
    lineId: engFilter.startsWith("line:") ? engFilter.slice(5) : currentScope?.lineId,
  });
  const cardJob = visit
    ? {
        ...job,
        scheduledAt: visit.scheduledAt || job.scheduledAt,
        windowFrom: visit.windowFrom || job.windowFrom,
        windowTo: visit.windowTo || job.windowTo,
        windowPart: visit.windowPart || job.windowPart,
        notes: [job.notes, visit.notes].filter((n) => n && n.trim()).join("\n"),
      }
    : job;

  const text = jobCardText(cardJob, client, property, {
    assigned,
    lines,
    engineerName,
    confirmUrl: !assigned && job.confirmToken && typeof window !== "undefined"
      ? `${window.location.origin}/confirm/${job.confirmToken}` : "",
  });
  // Mirrors jobCardText: add-on charges (parking, congestion) are hidden on
  // OFFER cards. The preview must match the text that actually gets sent, or
  // the on-screen card quietly lies about what the engineer will receive.
  // Mirrors jobCardText: add-ons are never listed as work on a card.
  const shownLines = lines.filter((l) => !isAddonCode(l.code));
  const gas = shownLines.find((l) => l.code === "GAS");

  // An offer going out is recorded against the engineer it went to, so
  // "sent, no answer" is something the app can see.
  const recordOffer = () => {
    if (assigned || !cardEngId || cardEngId === "unassigned") return;
    const log = job.offerLog || [];
    const key = currentScope?.key || "job";
    if (log.some((o) => o.engineerId === cardEngId && o.key === key && o.status === "sent")) return;
    updateJob(job.id, { offerLog: [...log, { engineerId: cardEngId, key, status: "sent", at: new Date().toISOString() }] });
  };

  const copy = async () => {
    try {
      recordOffer();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // clipboard unavailable — ignore in prototype
    }
  };

  const sendWhatsApp = () => {
    recordOffer();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener"
    );
  };

  const printCard = () => {
    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) return;
    w.document.write(
      `<pre style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px;white-space:pre-wrap">${text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`
    );
    w.document.title = `Job card ${job.id}`;
    w.document.close();
    w.focus();
    w.print();
  };

  const setConfirmed = (key, on) => {
    if (on && !window.confirm("Has the engineer actually agreed to attend? Only press OK if they have said yes — this is what lets the client be told it's booked.")) return;
    const patch = setScopeConfirmed(job, key, on, engineerById);

    // Confirmation means an engineer accepted the work, so once every card is
    // back the job IS booked — move it out of Quote. Guarded so it can never
    // walk a job backwards out of a later stage.
    if (patch.engineerConfirmed && ["quote"].includes(job.status)) {
      patch.status = "scheduled";
    }

    updateJob(job.id, patch);
    if (key === currentScope?.key) setMode(on ? "assigned" : "quote");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Job card"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Close
          </button>
          <button className="btn-outline" onClick={printCard}>
            <FiPrinter /> Print
          </button>
          <button className="btn-outline" onClick={copy}>
            {copied ? <FiCheck className="text-brand-600" /> : <FiCopy />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            className="btn bg-[#25D366] text-white hover:bg-[#1da851]"
            onClick={sendWhatsApp}
          >
            <FaWhatsapp /> WhatsApp
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex rounded-lg border border-navy-200 bg-navy-50 p-1 text-sm font-semibold">
          <button
            className={`flex-1 rounded-md px-3 py-1.5 transition ${
              !assigned ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
            }`}
            onClick={() => setMode("quote")}
          >
            Offer card
          </button>
          <button
            className={`flex-1 rounded-md px-3 py-1.5 transition ${
              assigned ? "bg-white text-navy-900 shadow-sm" : "text-navy-500"
            }`}
            onClick={() => setMode("assigned")}
          >
            Assigned card
          </button>
        </div>

        {/* Per-engineer split. Shown whenever the job has more than one
            service — not only once the engineers already differ. You have to
            SEE that a card can be split before you think to split it, and
            sending one engineer the whole multi-service job is the mistake
            this is here to prevent. */}
        {scopes.length > 1 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-navy-600">
              {scopes.some(s => s.key.startsWith("visit:")) || new Set(scopes.map(s => s.engineerId)).size > 1
                ? "This job has services for different engineers — pick whose card to send:"
                : "Sending one service to a specific engineer? Pick their card:"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setEngFilter("all")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  engFilter === "all"
                    ? "border-navy-800 bg-navy-800 text-white"
                    : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
                }`}
              >
                All (combined)
              </button>
              {scopes.map((sc) => (
                <button
                  key={sc.key}
                  onClick={() => setEngFilter(sc.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    engFilter === sc.key
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
                  }`}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-navy-500">
          {assigned ? (
            <>
              <span className="font-semibold text-navy-700">Assigned card</span>{" "}
              — send after the engineer confirms. Includes the contact number,
              call instruction and notes.
            </>
          ) : (
            <>
              <span className="font-semibold text-navy-700">Offer card</span> —
              send to ask if they can take it. The contact number and notes stay
              hidden until they confirm.
            </>
          )}
        </p>

        {/* Visual card */}
        <div
          className={`rounded-xl border p-4 ${
            assigned
              ? "border-brand-200 bg-brand-50/40"
              : "border-navy-200 bg-white"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                assigned
                  ? "bg-brand-500 text-white"
                  : "bg-navy-800 text-white"
              }`}
            >
              {assigned ? <FiUserCheck /> : <FiFileText />}
              {assigned ? "Assigned job card" : "Job offer"}
            </span>
            <span className="text-xs font-semibold text-navy-400">{job.id}</span>
          </div>

          <div className="space-y-2.5 text-sm text-navy-800">
            {engineerName && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">
                  Engineer
                </p>
                <p className="font-semibold">{engineerName}</p>
              </div>
            )}
            {assigned ? (
              <>
                <p className="text-xs text-navy-500">
                  Name on cert:{" "}
                  <span className="font-semibold text-navy-700">
                    {nameOnCert(job, client)}
                  </span>
                </p>
                {accessName(job) && (
                  <p className="text-xs text-navy-500">
                    Access via{" "}
                    <span className="font-semibold text-navy-700">
                      {accessName(job)}
                    </span>
                  </p>
                )}
                {accessPhone(job, client) && (
                  <p className="flex items-center gap-2 font-medium text-navy-800">
                    <FiPhone className="text-brand-500" /> {accessPhone(job, client)}
                  </p>
                )}
                {job.callBefore && (
                  <p className="text-xs font-semibold text-amber-700">
                    {job.callBefore}
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 text-xs text-navy-400">
                <FiLock /> Contact number &amp; notes hidden until confirmed
              </p>
            )}

            <div className="border-t border-navy-100 pt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">
                Cert type
              </p>
              <p className="font-medium">
                {shownLines
                  .map((l) => {
                    const base = l.code === "CUSTOM" ? l.name : certLabel(l.code);
                    const size = lineSizeLabel(l);
                    return size ? `${base} (${size})` : base;
                  })
                  .join(", ") || "—"}
              </p>
              {gas && (
                <p className="text-xs text-navy-500">
                  {gas.qty || 1} appliance{(gas.qty || 1) > 1 ? "s" : ""}
                </p>
              )}
            </div>

            <p className="flex items-center gap-2">
              <FiCalendar className="text-navy-400" />
              <span className="font-medium">{dateLine(cardJob)}</span>
            </p>

            {assigned ? (
              // Assigned card needs the full address to actually attend —
              // show whatever's on file (label and/or postcode) instead of
              // hiding the whole row just because one of the two is blank,
              // and say so plainly if neither is set rather than going quiet.
              (property?.label || property?.postcode) ? (
                <p className="flex items-start gap-2">
                  <FiMapPin className="mt-0.5 shrink-0 text-navy-400" />
                  <span>
                    {[property.label, property.postcode].filter(Boolean).join(", ")}
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-amber-700">
                  <FiMapPin className="mt-0.5 shrink-0" />
                  <span>No address on file for this property — add one before sending.</span>
                </p>
              )
            ) : (
              // Offer card deliberately shows postcode only, never the full
              // street address — confidentiality until the engineer confirms.
              property?.postcode && (
                <p className="flex items-start gap-2">
                  <FiMapPin className="mt-0.5 shrink-0 text-navy-400" />
                  <span>{property.postcode}</span>
                </p>
              )
            )}

            {/* Notes, scoped to this card. Job-level notes apply to everyone
                on the job; per-line notes only appear on the card for the
                engineer actually doing that line — so a gas engineer never
                receives the EICR instructions. */}
            {assigned && (cardJob.notes?.trim() || lines.some((l) => l.notes?.trim())) && (
              <div className="border-t border-navy-100 pt-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">
                  Notes
                </p>
                {cardJob.notes?.trim() && (
                  <p className="whitespace-pre-wrap text-navy-700">{cardJob.notes.trim()}</p>
                )}
                {lines.filter((l) => l.notes?.trim()).map((l) => (
                  <p key={l.id} className="mt-1 whitespace-pre-wrap text-navy-700">
                    <span className="font-semibold">
                      {l.code === "CUSTOM" ? l.name : certLabel(l.code)}:
                    </span>{" "}
                    {l.notes.trim()}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation — one row per card. Each engineer accepts their own
            work; the job only counts as confirmed when every card is back. */}
        <div className="rounded-lg border border-navy-200 bg-navy-50/60 px-3 py-2.5">
          {scopes.length > 1 && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
              Acceptance — {scopes.filter((sc) => scopeAccepted(job, sc)).length} of {scopes.length} confirmed
            </p>
          )}

          <div className="space-y-1.5">
            {scopes.map((sc) => {
              const on = scopeAccepted(job, sc);
              const at = scopeConfirmedAt(job, sc.key);
              const isCurrent = scopes.length > 1 && currentScope?.key === sc.key;
              return (
                <div
                  key={sc.key}
                  className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 ${
                    isCurrent ? "bg-white ring-1 ring-brand-200" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${on ? "text-brand-700" : "text-navy-700"}`}>
                      {on && <FiUserCheck className="mr-1 inline -translate-y-px" />}
                      {sc.label}
                    </p>
                    {sc.sub && <p className="truncate text-[11px] text-navy-400">{sc.sub}</p>}
                  </div>
                  {on ? (
                    <div className="flex shrink-0 items-center gap-2">
                      {typeof at === "string" && (
                        <span className="text-[11px] text-navy-400">
                          {new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      <button
                        className="text-xs font-semibold text-navy-500 hover:text-navy-800"
                        onClick={() => setConfirmed(sc.key, false)}
                      >
                        Undo
                      </button>
                    </div>
                  ) : sc.engineerId && sc.engineerId !== "unassigned" ? (
                    <button
                      className="btn-primary shrink-0 py-1.5 text-xs"
                      onClick={() => setConfirmed(sc.key, true)}
                    >
                      <FiUserCheck /> Confirm
                    </button>
                  ) : (
                    // "Confirmed" with nobody assigned is a contradiction — it
                    // was possible to mark every card accepted on a job whose
                    // engineer was still Unassigned, which then reported "All
                    // engineers confirmed" against no engineer at all.
                    <span
                      className="shrink-0 text-[11px] font-semibold text-amber-700"
                      title="Assign an engineer to this work before recording their acceptance"
                    >
                      Assign an engineer first
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {scopes.length > 1 && !allConfirmed && (
            <p className="mt-2 text-[11px] text-amber-700">
              Still waiting on{" "}
              {scopes.filter((sc) => !scopeAccepted(job, sc)).map((sc) => sc.label).join(", ")}.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
