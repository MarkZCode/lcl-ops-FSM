"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiArrowLeft,
  FiEdit2,
  FiTrash2,
  FiMapPin,
  FiClock,
  FiPhone,
  FiMail,
  FiFileText,
  FiSend,
  FiDownload,
  FiCheckCircle,
  FiClipboard,
  FiUserCheck,
  FiRepeat,
  FiShare2,
  FiCopy,
  FiCheck,
  FiMoreHorizontal,
} from "react-icons/fi";
import { invoiceConfig } from "@/lib/invoiceConfig";
import { buildInvoicePrefill } from "@/lib/invoiceData";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { STATUS_ORDER, statusMeta, UNASSIGNED_ENGINEER } from "@/lib/constants";
import { gbp, fmtDate, getJobLines, lineTotal, lineGross, jobDiscount, jobPayable } from "@/lib/format";
import { jobFinancialsSplit } from "@/lib/finance";
import { dateLine, certLabel, acceptanceProgress } from "@/lib/jobCard";
import { computeCertExpiry } from "@/lib/renewals";
import { isSplit, getVisits, visitLines, blockersForScheduling } from "@/lib/visits";
import { supabase } from "@/lib/supabase";
import StatusBadge from "@/components/StatusBadge";
import JobModal from "@/components/JobModal";
import SendEmailModal from "@/components/SendEmailModal";
import InvoiceModal from "@/components/InvoiceModal";
import JobCardModal from "@/components/JobCardModal";
import TaskCompletionBanner from "@/components/team/TaskCompletionBanner";
import PaymentProof from "@/components/PaymentProof";
import ParkingReceipt from "@/components/ParkingReceipt";
import JobAttachments from "@/components/JobAttachments";
import ActivityThread from "@/components/ActivityThread";
import JobOutcome from "@/components/JobOutcome";
import Modal from "@/components/Modal";
import AutoEmailConfirm from "@/components/AutoEmailConfirm";
import VisitsPanel from "@/components/VisitsPanel";
import CertificationPanel from "@/components/CertificationPanel";
import CancelJobModal from "@/components/CancelJobModal";
import RescheduleModal from "@/components/RescheduleModal";
import { toast } from "@/lib/toast";

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { jobs, clients, updateJob, removeJob, mergeBackToParentJob, logActivity, mergeRemoteActivity, createRecurringJob, generateShareToken, autoNotify, email: emailSettings, templates, engineers, engineerById, hydrated, invoiceSeq, advanceInvoiceSeq, allocateInvoiceNumber } =
    useStore();
  const { can, user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState("invoice"); // "invoice" | "quote"
  const [jobCardOpen, setJobCardOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpPrefill, setFollowUpPrefill] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [autoEmailPending, setAutoEmailPending] = useState(null); // { subject, sendFn }
  const [moreOpen, setMoreOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [emailTemplateOverride, setEmailTemplateOverride] = useState(null);

  // On mount, pull the freshest version of this job from Supabase so activity
  // written by the webhook (while the app was closed/idle) is visible immediately.
  // Only merges in NEW activity entries — must never apply the fetched row
  // wholesale. This fetch can resolve a couple of seconds after mount, which
  // is easily enough time for the user to change status/engineer/etc first;
  // applying the whole (now-stale) row here used to silently revert that
  // fresh edit right back to whatever was in the cloud when the fetch fired,
  // and re-persist the stale value on top of it.
  useEffect(() => {
    if (!supabase || !id) return;
    let cancelled = false;
    supabase
      .from("jobs")
      .select("data")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const remoteActivity = data?.data?.activity;
        if (Array.isArray(remoteActivity) && remoteActivity.length) {
          mergeRemoteActivity(id, remoteActivity);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const job = jobs.find((j) => j.id === id);

  // Share link and handler — defined AFTER job so no temporal dead zone.
  const handleShare = () => {
    if (!job) return;
    let token = job.shareToken;
    if (!token) {
      token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      updateJob(job.id, { shareToken: token });
    }
    const link = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  if (!job) {
    return (
      <div className="p-8">
        <Link href="/jobs" className="btn-outline mb-6 w-fit">
          <FiArrowLeft /> Back to jobs
        </Link>
        <div className="card p-10 text-center text-navy-500">
          {hydrated
            ? "Job not found. It may have been deleted."
            : "Loading…"}
        </div>
      </div>
    );
  }

  const client = clients.find((c) => c.id === job.clientId);
  const property = client?.properties.find((p) => p.id === job.propertyId);
  // Only show engineers qualified for this job's services (e.g. a GAS-only
  // job doesn't offer EICR-only engineers). Falls back to the full roster if
  // nobody matches, so assignment is never silently blocked when a service
  // has no engineer onboarded yet or a legacy engineer record has no
  // `services` set.
  const jobServiceCodes = new Set((job.services || []).filter(Boolean));
  const qualifiedEngineers = jobServiceCodes.size
    ? engineers.filter((e) => (e.services || []).some((s) => jobServiceCodes.has(s)))
    : engineers;
  const engineerOptions = [...(qualifiedEngineers.length ? qualifiedEngineers : engineers), UNASSIGNED_ENGINEER];

  // What the "Email" button should open on by default — match the job's
  // actual stage instead of always defaulting to Booking confirmation.
  const STATUS_EMAIL_TEMPLATE = {
    quote: "quote",
    scheduled: "booking",
    in_progress: "on_the_way",
    completed: "invoice",
    invoiced: "invoice",
    paid: "receipt",
  };
  const defaultEmailTemplate = STATUS_EMAIL_TEMPLATE[job.status] || "quote";

  const handleDelete = () => {
    removeJob(job.id);
    router.push("/jobs");
  };

  // Open a new job prefilled from this one (remedial after a fail, or a
  // replacement/follow-up after an advisory), linked back to this job.
  const createFollowUp = (type) => {
    const note =
      type === "remedial"
        ? `Remedial work following ${job.id} (failed). `
        : `Follow-up / replacement after ${job.id} (advisory). `;
    setFollowUpPrefill({
      clientId: job.clientId,
      propertyId: job.propertyId,
      nameOnCert: job.nameOnCert || "",
      accessName: job.accessName || "",
      accessPhone: job.accessPhone || "",
      notes: note,
      relatedJobId: job.id,
      relationType: type,
    });
    setFollowUpOpen(true);
  };


  // Cancelling with its reason attached: same status path as every other
  // transition, plus a permanent line in the job's activity thread so the
  // "why" survives long after whoever cancelled it has forgotten.
  const confirmCancel = (patch) => {
    changeStatus("cancelled", patch);
    logActivity(job.id, {
      type: "status",
      title: `Cancelled — ${patch.cancelReasonLabel}`,
      detail: patch.cancelNote || "",
      by: user?.name || user?.username || "",
    });
    toast.success("Job cancelled — reason logged");
  };

  // Change status, auto-set cert expiry, and fire auto-notifications if enabled.
  const DONE_STATUSES = ["completed", "invoiced", "paid"];
  const changeStatus = async (s, extra = {}) => {
    // Cancelling is never a bare status flip — it goes through the reason
    // modal first, which comes back through here with the reason attached.
    if (s === "cancelled" && !extra.cancelReason) {
      setCancelOpen(true);
      return;
    }
    // A job cannot be called Scheduled while any of its services still has
    // no engineer, no date, or an engineer who hasn't confirmed. The board
    // showing "Scheduled" is what the morning is planned around — if it can
    // say that while nobody has agreed to attend, it's worse than saying
    // nothing. Blocked here rather than silently corrected, and the message
    // names the exact services so it's actionable.
    if (s === "scheduled") {
      const blockers = blockersForScheduling(job, (id) => engineerById(id)?.name || "the engineer");
      if (blockers.length) {
        toast.error(
          `Can't schedule ${job.id} yet — ${blockers.join("; ")}.`,
          { duration: 8000 }
        );
        return;
      }
    }
    const patch = { status: s, ...extra };
    if (DONE_STATUSES.includes(s) && !job.certExpiry) {
      const exp = computeCertExpiry(job);
      if (exp) patch.certExpiry = exp;
    }
    // A split job's status is normally DERIVED from its visits (see
    // lib/visits.js deriveJobStatus) — every visit fully booked = Scheduled,
    // otherwise Quote. Manually forcing "Quote" here without touching the
    // visits meant the very next visit edit recomputed "Scheduled" right back
    // (they were all still booked), so the manual change silently undid
    // itself — reported as "converting back to quote glitches back to
    // scheduled." Clearing each visit's engineer/date makes the button do
    // what it says: actually unschedule the job, not just relabel it.
    if (s === "quote" && isSplit(job)) {
      patch.visits = job.visits.map((v) => ({ ...v, engineerId: "", scheduledAt: null, status: "pending" }));
    }
    updateJob(job.id, patch);
    const nextJob = { ...job, ...patch };

    // Auto-notify the client if this status transition has auto-send enabled.
    const shouldNotify = autoNotify?.[s] && client?.email;
    if (!shouldNotify) return;

    // "Booking confirmed" is meaningless without a real appointment — sending it
    // the instant a quote is accepted (before a date/window exists) is exactly
    // the bug that shipped a blank "Date & time: to be confirmed" email to a
    // client. Skip the auto-send until an actual scheduledAt is set, and tell
    // the admin why so it's not a silent no-op.
    if (s === "scheduled" && !nextJob.scheduledAt) {
      toast.error("Set an appointment date (Edit → Scheduling) before the booking confirmation can go out.");
      return;
    }

    const tplMap = { scheduled: "booking", in_progress: "on_the_way", invoiced: "invoice", completed: "job_completed", paid: "receipt" };
    const tplKey = tplMap[s] || "booking";
    const tpl = templates?.[tplKey];
    if (!tpl) return;

    const { renderTemplate, buildContext } = await import("@/lib/email");
    const ctx = buildContext({ job: nextJob, client, property, email: emailSettings });
    const subject = renderTemplate(tpl.subject, ctx);
    // Signature rendered too — it signs off with {{sender}}, the same
    // person the body introduces.
    const body = renderTemplate(tpl.body, ctx) + (emailSettings?.signature ? `\n\n${renderTemplate(emailSettings.signature, ctx)}` : "");
    // job_completed now carries the invoice in the same email (see the
    // template rewrite in lib/settings.js) — same attachment path as a
    // dedicated Invoice send, or auto-notifying on "Completed" would fire
    // an email promising the certificate/invoice with nothing attached.
    const needsAttachment = tplKey === "invoice" || tplKey === "job_completed";

    // Show branded confirmation modal — no native browser dialogs
    setAutoEmailPending({
      subject,
      sendFn: async () => {
        let attachments;
        let attachNote = "";
        let invNoUsed = null;
        if (needsAttachment) {
          try {
            const { generateInvoicePDF } = await import("@/lib/generateInvoice");
            const { buildInvoicePrefill } = await import("@/lib/invoiceData");
            // Allocated against the job, so the emailed PDF carries the
            // same number the job page and the payment record show.
            const invNo = allocateInvoiceNumber(job.id);
            const prefill = buildInvoicePrefill(nextJob, client, property);
            const pdf = generateInvoicePDF(
              { docType: "invoice", invNo, dateISO: new Date().toISOString().slice(0, 10), ...prefill, taxOn: false },
              { output: "base64" }
            );
            attachments = [{ filename: pdf.filename, base64: pdf.base64, contentType: "application/pdf" }];
            attachNote = ` — ${pdf.filename} attached`;
            invNoUsed = invNo;
          } catch (e) {
            // Don't pretend the PDF went out when it didn't — surface it.
            attachNote = " — PDF attachment failed, sent without it (check the invoice manually)";
          }
        }

        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token || "";
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: client.email, subject, text: body, purpose: tplKey, fromName: emailSettings?.fromName, fromEmail: emailSettings?.fromEmail, replyTo: emailSettings?.replyTo, attachments }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (invNoUsed) advanceInvoiceSeq(invNoUsed);
          logActivity(job.id, { type: "email", title: `Auto-notification: ${s}${attachNote}`, detail: subject, to: client.email, meta: { messageId: data.id } });
          toast.success(`Auto-notification sent${attachNote}`);
        } else {
          toast.error(data.error || "Auto-notification failed to send — check Settings → Email.");
        }
      },
    });
  };

  return (
    <>
      <TaskCompletionBanner />
      <div className="border-b border-navy-100 bg-white px-4 py-4 sm:px-8">
        <Link
          href="/jobs"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800"
        >
          <FiArrowLeft /> Back to jobs
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900">{job.id}</h1>
            <StatusBadge status={job.status} />
            {/* Age. A quote sitting untouched for three weeks is a chase, not
                a pipeline entry — but nothing on this page said how old it
                was. Turns amber past a week, red past two, and only nags on
                quotes: an old PAID job is just history. */}
            {job.createdAt && (() => {
              const days = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86400000);
              const stale = job.status === "quote" && days >= 7;
              const veryStale = job.status === "quote" && days >= 14;
              return (
                <span
                  className={`pill ${veryStale ? "pill-rose" : stale ? "pill-amber" : "pill-neutral"}`}
                  title={`Created ${new Date(job.createdAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
                >
                  {days === 0 ? "Created today" : days === 1 ? "1 day old" : `${days} days old`}
                  {veryStale ? " · chase" : ""}
                </span>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "quote" && (
              <button
                className="btn-primary"
                onClick={() =>
                  changeStatus("scheduled", { acceptedAt: new Date().toISOString() })
                }
              >
                <FiCheckCircle /> Accept quote
              </button>
            )}
            {can("invoices") && (
              <button
                className="btn-primary"
                onClick={() => {
                  setInvoiceMode("invoice");
                  setInvoiceOpen(true);
                }}
              >
                <FiDownload /> Invoice
              </button>
            )}
            <button className="btn-outline" onClick={handleShare} title="Copy shareable client link">
              {shareCopied ? <FiCheck className="text-brand-600" /> : <FiShare2 />}
              {shareCopied ? "Copied!" : "Share"}
            </button>
            <div className="relative">
              <button
                className="btn-outline"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
              >
                <FiMoreHorizontal /> More
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} aria-hidden />
                  {/* Anchored LEFT by default, right-aligned only from sm up.
                      It was the other way round: right-0 hangs the menu off
                      the button's right edge and grows leftwards, and on a
                      phone the wrapped "More" button sits at the very left of
                      the action row — so the menu ran straight off the left
                      edge of the screen and every item was clipped to a
                      couple of letters. */}
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[10.5rem] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-navy-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0">
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setJobCardOpen(true); setMoreOpen(false); }}>
                      <FiClipboard className="h-4 w-4" /> Job card
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setInvoiceMode("quote"); setInvoiceOpen(true); setMoreOpen(false); }}>
                      <FiFileText className="h-4 w-4" /> Quote
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setEmailOpen(true); setMoreOpen(false); }}>
                      <FiSend className="h-4 w-4" /> Email
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setEditOpen(true); setMoreOpen(false); }}>
                      <FiEdit2 className="h-4 w-4" /> Edit
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={() => { setConfirmDel(true); setMoreOpen(false); }}>
                      <FiTrash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="page grid grid-cols-1 gap-6 overflow-x-hidden lg:grid-cols-[minmax(0,900px)_380px]">
        {/* Main */}
        <div className="min-w-0 space-y-6">
          {/* Status workflow */}
          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Update status
            </h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => {
                const meta = statusMeta(s);
                const active = job.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-navy-800 bg-navy-800 text-white"
                        : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
            {job.status === "cancelled" && (job.cancelReasonLabel || job.cancelNote) && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm">
                <p className="font-semibold text-rose-800">
                  Cancelled — {job.cancelReasonLabel || "reason not recorded"}
                </p>
                {job.cancelNote && <p className="mt-0.5 text-rose-700">{job.cancelNote}</p>}
                {job.cancelledAt && (
                  <p className="mt-0.5 text-[11px] text-rose-500">{fmtDate(job.cancelledAt)}</p>
                )}
              </div>
            )}
          </section>

          {/* Split Job Parent/Child Banners */}
          {(job.relatedJobId || job.parentJobId) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/90 p-4 text-blue-900 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">
                    {job.prepaidOnParent || job.billingStatus === "prepaid_on_parent" ? "Prepaid Child Job" : "Linked Child Job"}
                  </span>
                  <span className="pill pill-blue text-[11px] font-semibold">
                    Parent: #{job.relatedJobId || job.parentJobId}
                  </span>
                </div>
                <p className="text-xs text-blue-700">
                  {job.prepaidOnParent || job.billingStatus === "prepaid_on_parent"
                    ? `This job was split off from parent job #${job.relatedJobId || job.parentJobId} and is already prepaid on the main invoice.`
                    : `This job is linked to parent job #${job.relatedJobId || job.parentJobId}.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/jobs/${job.relatedJobId || job.parentJobId}`} className="btn-outline text-xs bg-white text-blue-700 border-blue-300 hover:bg-blue-100">
                  View Parent Job #{job.relatedJobId || job.parentJobId}
                </Link>
                <button
                  type="button"
                  className="btn-primary text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    const parent = mergeBackToParentJob(job.id);
                    if (parent) router.push(`/jobs/${parent.id}`);
                  }}
                >
                  🔗 Merge back to Parent Job
                </button>
              </div>
            </div>
          )}

          {job.splitOffJobId && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-amber-900 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">Incomplete service split off</span>
                  <span className="pill pill-amber text-[11px] font-semibold">Child Job: #{job.splitOffJobId}</span>
                </div>
                <p className="text-xs text-amber-700">
                  Unfinished work from this job was split off to child job #{job.splitOffJobId}.
                </p>
              </div>
              <Link href={`/jobs/${job.splitOffJobId}`} className="btn-outline text-xs bg-white text-amber-800 border-amber-300 hover:bg-amber-100">
                View Child Job #{job.splitOffJobId} →
              </Link>
            </div>
          )}

          {/* Visits — full width in the main column. */}
          <VisitsPanel job={job} />
          <CertificationPanel job={job} />

          {/* Services */}
          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Services
            </h2>
            <ul className="divide-y divide-navy-100">
              {getJobLines(job).map((l) => {
                const qty = l.qty || 1;
                return (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm text-navy-700"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <FiFileText className="text-brand-500" />
                      {l.name}
                      {l.tier && (
                        <span className="text-xs text-navy-400">· {l.tier}</span>
                      )}
                      {l.waived && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          discounted
                        </span>
                      )}
                      {qty > 1 && (
                        <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-600">
                          {l.code === "GAS" ? `${qty} appliances` : `× ${qty}`}
                        </span>
                      )}
                      {l.engineerId && l.engineerId !== job.engineerId && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                          {engineerById(l.engineerId).name}
                        </span>
                      )}
                    </span>
                    {l.waived ? (
                      <span className="flex items-center gap-2">
                        <span className="text-navy-400 line-through">{gbp(lineGross(l))}</span>
                        <span className="text-xs font-semibold text-brand-600">£0.00</span>
                      </span>
                    ) : (
                      <span className="font-medium text-navy-800">{gbp(lineTotal(l))}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {jobDiscount(job) > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-navy-100 pt-3 text-sm">
                <span className="text-navy-500">{job.discountReason || "Discount off the job"}</span>
                <span className="tnum font-semibold text-brand-700">− {gbp(jobDiscount(job))}</span>
              </div>
            )}
            <div className={`flex items-center justify-between ${jobDiscount(job) > 0 ? "mt-2 pt-2" : "mt-3 border-t border-navy-100 pt-3"}`}>
              <span className="text-sm text-navy-500">Total (inc VAT)</span>
              <span className="text-lg font-bold text-navy-900">{gbp(job.price)}</span>
            </div>

            {/* The stored price and the line items must agree, because they are
                used for DIFFERENT things: the price is what reports, margin and
                the dashboard count as revenue, while the INVOICE is built from
                the lines. When they drift, you quote one figure and bill
                another, and nothing anywhere says so. */}
            {(() => {
              const fromLines = jobPayable(job);
              const drift = (Number(job.price) || 0) - fromLines;
              if (Math.abs(drift) < 0.01) return null;
              return (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs">
                  <p className="font-semibold text-amber-900">
                    Price doesn&rsquo;t match the services
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Reports count this job as <strong>{gbp(job.price)}</strong>, but the
                    services add up to <strong>{gbp(fromLines)}</strong> — which is what an
                    invoice would bill. {drift < 0 ? "You'd bill more than you've recorded." : "You'd bill less than you've recorded."}
                  </p>
                  {can("invoices") && (
                    <button
                      className="btn-outline mt-2 py-1 text-xs"
                      onClick={() => updateJob(job.id, { price: fromLines })}
                    >
                      Set the price to {gbp(fromLines)}
                    </button>
                  )}
                </div>
              );
            })()}
          </section>

          {/* Parking receipt — always on job detail when engineer assigned */}
          {job.engineerId && job.engineerId !== "unassigned" && (
            <ParkingReceipt job={job} onSave={updateJob} />
          )}

          {/* Financials (profit card) — admin only */}
          {can("invoices") && job.price > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 section-label text-sm">
                Financials
              </h2>
              {(() => {
                const f = jobFinancialsSplit(job, engineerById);
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-navy-50 px-3 py-2 text-sm">
                      <span className="text-navy-500">Job value</span>
                      <span className="font-bold text-navy-900">{gbp(f.jobValue)}</span>
                    </div>

                    {f.shares.length === 0 && (
                      <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-500">
                        No engineer work on this job yet — nothing payable.
                      </p>
                    )}

                    {/* One row per engineer. A split job has genuinely
                        different rates per person, so it gets genuinely
                        different lines — never one blended percentage. */}
                    {f.shares.map((sh) => (
                      <div
                        key={sh.engineerId}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          sh.rateUnknown ? "border border-dashed border-navy-300 bg-navy-50" : "bg-amber-50"
                        }`}
                      >
                        {sh.rateUnknown ? (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-navy-600">
                                {sh.name}
                                {f.split && (
                                  <span className="text-navy-500">
                                    {" "}· {sh.lines.map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code))).join(", ")}
                                  </span>
                                )}
                              </span>
                              <span className="tnum shrink-0 font-semibold text-navy-400">—</span>
                            </div>
                            <p className="mt-0.5 text-xs text-navy-500">
                              {sh.reason === "no_engineer"
                                ? `No engineer assigned — their own rate applies once one is. ${gbp(sh.revenue)} of work unpriced.`
                                : `No pay rates set for ${sh.name} — set them on their engineer record before this job's cost is real.`}
                            </p>
                          </>
                        ) : sh.payType === "weekly" ? (
                          <p className="text-amber-700">
                            {sh.name} is on a weekly retainer
                            {sh.engineer?.weeklyRate ? ` (${gbp(sh.engineer.weeklyRate)}/week)` : ""} — not tied to this job
                          </p>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-amber-700">
                                {sh.name}
                                {f.split && (
                                  <span className="text-amber-600">
                                    {" "}· {sh.lines.map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code))).join(", ")}
                                  </span>
                                )}
                              </span>
                              <span className="tnum shrink-0 font-semibold text-amber-800">{gbp(sh.net)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-amber-600">
                              {sh.overridden
                                ? "Manual amount set on this job"
                                : sh.payType === "fixed_gas"
                                ? `Fixed gas rate · ${sh.applianceCount} appliance${sh.applianceCount === 1 ? "" : "s"}`
                                : sh.payType === "fixed_service"
                                ? `Fixed per service · ${sh.lines.map((l) => (l.tier ? `${certLabel(l.code)} ${l.tier}` : certLabel(l.code))).join(", ") || "per service"}`
                                : `${sh.cutPercent}% of ${gbp(sh.revenue)}`}
                            </p>
                            {sh.missingRates?.length > 0 && (
                              <p className="mt-1 text-xs font-semibold text-rose-600">
                                No {sh.missingRates.map((c) => certLabel(c)).join(", ")} rate set for {sh.name} — paid at the house default.
                              </p>
                            )}
                            {sh.vat > 0 && (
                              <div className="mt-1 flex items-center justify-between text-xs text-amber-700">
                                <span>VAT (20% on their fee)</span>
                                <span className="tnum font-semibold">{gbp(sh.vat)}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}

                    <div className="flex items-center justify-between rounded-lg bg-amber-100 px-3 py-2 text-sm">
                      <span className="font-semibold text-amber-800">
                        {f.shares.length > 1 ? "Total payable to engineers" : "Total payable to engineer"}
                      </span>
                      <span className="tnum font-bold text-amber-900">{gbp(f.engineerTotal)}</span>
                    </div>

                    {(f.parking.charged > 0 || f.parking.receiptSubmitted) && (
                      <div className="mt-2 space-y-1.5 rounded-lg border border-navy-100 p-2.5 text-xs">
                        <p className="mb-1 font-semibold uppercase tracking-wide text-navy-400">Parking summary</p>
                        <div className="flex justify-between"><span className="text-navy-500">Charged to customer</span><span className="font-medium text-navy-800">{gbp(f.parking.charged)}</span></div>
                        <div className="flex justify-between"><span className="text-navy-500">Receipt {f.parking.receiptSubmitted ? "submitted" : "not submitted"}</span><span className="font-medium text-navy-800">{f.parking.receiptSubmitted ? gbp(f.parking.receiptAmount) : "—"}</span></div>
                        <div className="flex justify-between"><span className="text-navy-500">Reimbursed to engineer</span><span className="font-medium text-brand-700">{gbp(f.parking.reimbursed)}</span></div>
                        <div className="flex justify-between border-t border-navy-100 pt-1"><span className="text-navy-500">{f.parking.retained >= 0 ? "Company retains" : "Company absorbs"}</span><span className={`font-semibold ${f.parking.retained >= 0 ? "text-navy-800" : "text-rose-600"}`}>{gbp(Math.abs(f.parking.retained))}</span></div>
                      </div>
                    )}

                    {f.companyMargin < 0 && (
                      <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                        This job LOSES money — the engineer is owed {gbp(f.engineerTotal)} on a
                        job worth {gbp(f.jobValue)}. Check the price, or their rate for this service.
                      </p>
                    )}
                    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${f.companyMargin < 0 ? "bg-rose-100" : "bg-brand-50"}`}>
                      <span className={`font-semibold ${f.companyMargin < 0 ? "text-rose-800" : "text-brand-700"}`}>
                        LCL margin (after engineer + parking)
                        {f.provisional && <span className="ml-1 font-normal text-brand-600">· provisional</span>}
                      </span>
                      <span className={`tnum font-bold ${f.companyMargin < 0 ? "text-rose-800" : "text-brand-700"}`}>{gbp(f.companyMargin)}</span>
                    </div>
                    {f.provisional && (
                      <p className="text-xs text-navy-500">
                        {f.unpriced.map((u) => u.name).join(", ")} {f.unpriced.length === 1 ? "has" : "have"} no rate
                        behind {f.unpriced.length === 1 ? "their" : "their"} work yet, so this margin will drop once
                        {f.unpriced.length === 1 ? " it is" : " they are"} priced.
                      </p>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          {/* Payment — admin only */}
          {can("payments") && (
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-label text-sm">
                Payment
              </h2>
              {job.status === "paid" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <FiCheckCircle /> Paid {job.paidAt ? `· ${fmtDate(job.paidAt)}` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Awaiting payment
                </span>
              )}
            </div>

            {/* Bank transfer details */}
            <div className="rounded-lg bg-navy-50 p-3 text-xs text-navy-600">
              <p className="font-semibold text-navy-700">Bank transfer (BACS)</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-navy-400">Account holder</span>
                <span className="font-medium text-navy-800">{invoiceConfig.bank.accountHolder}</span>
                <span className="text-navy-400">Account no.</span>
                <span className="font-medium text-navy-800">{invoiceConfig.bank.accountNumber}</span>
                <span className="text-navy-400">Sort code</span>
                <span className="font-medium text-navy-800">{invoiceConfig.bank.sortCode}</span>
                <span className="text-navy-400">Bank</span>
                <span className="font-medium text-navy-800">{invoiceConfig.bank.bankName}</span>
                {invoiceConfig.bank.iban && (
                  <>
                    <span className="text-navy-400">IBAN</span>
                    <span className="font-mono text-[11px] font-medium text-navy-800">{invoiceConfig.bank.iban}</span>
                  </>
                )}
                {invoiceConfig.bank.bic && (
                  <>
                    <span className="text-navy-400">BIC / SWIFT</span>
                    <span className="font-mono text-[11px] font-medium text-navy-800">{invoiceConfig.bank.bic}</span>
                  </>
                )}
                <span className="text-navy-400">Reference</span>
                <span className="font-medium text-navy-800">{job.id}</span>
              </div>
            </div>

            {/* Mark-as actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              {job.status !== "invoiced" && job.status !== "paid" && (
                <button
                  className="btn-outline flex-1"
                  onClick={() => {
                    changeStatus("invoiced", {
                      invoicedAt: new Date().toISOString(),
                    });
                    logActivity(job.id, {
                      type: "status",
                      title: "Marked as invoiced",
                    });
                  }}
                >
                  Mark as invoiced
                </button>
              )}
              {job.status !== "paid" ? (
                <button
                  className="btn-primary flex-1"
                  onClick={() => {
                    changeStatus("paid", { paidAt: new Date().toISOString() });
                    logActivity(job.id, {
                      type: "payment",
                      title: `Marked as paid · ${gbp(job.price)}`,
                    });
                  }}
                >
                  <FiCheckCircle /> Mark as paid
                </button>
              ) : (
                <button
                  className="btn-outline flex-1"
                  onClick={() =>
                    updateJob(job.id, { status: "completed", paidAt: null })
                  }
                >
                  Undo payment
                </button>
              )}
            </div>

            {/* Payment proof — show once invoiced/paid (or if one's already attached) */}
            {(job.status === "paid" ||
              job.status === "invoiced" ||
              job.paymentProof) && (
              <PaymentProof job={job} onSave={updateJob} />
            )}
          </section>
          )}

          {/* Documents & photos */}
          <JobAttachments job={job} onSave={updateJob} />

          {/* Outcome & follow-up (remedial / replacement) */}
          <JobOutcome job={job} onCreateFollowUp={createFollowUp} />

          {/* Recurring job */}
          {["completed","invoiced","paid"].includes(job.status) && can("invoices") && (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 section-label text-sm">
                <FiRepeat /> Recurring schedule
              </h2>
              {job.recurringNextId ? (
                <p className="text-sm text-navy-600">
                  Next job created:{" "}
                  <a href={`/jobs/${job.recurringNextId}`} className="font-semibold text-brand-600 hover:underline">
                    {job.recurringNextId}
                  </a>
                </p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-navy-600">
                      Automatically create the next job when this certificate expires.
                    </p>
                    <p className="mt-0.5 text-xs text-navy-400">
                      {job.certExpiry ? `Cert expires ${fmtDate(job.certExpiry)}` : "No expiry set yet."}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
                    <select
                      className="input py-1.5 text-xs w-full sm:w-36"
                      defaultValue="12"
                      id={`recur-months-${job.id}`}
                    >
                      <option value="12">Every 12 months</option>
                      <option value="60">Every 5 years</option>
                      <option value="6">Every 6 months</option>
                      <option value="24">Every 2 years</option>
                    </select>
                    <button
                      className="btn-outline w-full justify-center py-1.5 text-xs sm:w-auto"
                      onClick={() => {
                        const months = parseInt(document.getElementById(`recur-months-${job.id}`).value, 10);
                        const next = createRecurringJob({ ...job, recurringMonths: months });
                        if (next) updateJob(job.id, { recurringNextId: next.id });
                      }}
                    >
                      <FiRepeat /> Create next job
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Notes */}
          <section className="card p-5">
            <h2 className="mb-2 section-label text-sm">
              Notes
            </h2>
            <p className="whitespace-pre-wrap text-sm text-navy-600">
              {job.notes || "No notes added."}
            </p>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Schedule + engineer */}
          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Appointment
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-navy-700">
                  <FiClock className="text-navy-400" />
                  {job.scheduledAt ? dateLine(job) : "Not scheduled"}
                </p>
                {/* Moving an appointment used to mean Edit → Scheduling, which
                    overwrites the date silently — nothing recorded that the job
                    had moved, or why. Its own action, with the reason logged. */}
                {!["completed", "invoiced", "paid", "cancelled"].includes(job.status) && (
                  <button
                    onClick={() => setRescheduleOpen(true)}
                    className="shrink-0 rounded-lg border border-navy-200 px-2 py-1 text-[11px] font-semibold text-navy-600 transition hover:border-brand-300 hover:text-brand-600"
                    title="Move this job to another date and record why"
                  >
                    Reschedule
                  </button>
                )}
              </div>
              {(() => {
                // Acceptance is per engineer now, so the badge has to say how
                // many are in — "Engineer confirmed" on a three-engineer job
                // where only one replied was the exact wrong message.
                const { done, total, all } = acceptanceProgress(job, engineerById);
                if (done === 0) return null;
                return (
                  <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    all ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    <FiUserCheck />
                    {all
                      ? total > 1 ? "All engineers confirmed" : "Engineer confirmed"
                      : `${done} of ${total} engineers confirmed`}
                  </p>
                );
              })()}
              <div>
                <label className="label">Assigned engineer</label>
                {isSplit(job) ? (
                  <div className="space-y-2 rounded-lg bg-navy-50 p-3 text-xs text-navy-700">
                    <p className="font-semibold text-navy-800">Assigned per visit ({getVisits(job).length} visits):</p>
                    {getVisits(job).map((v, idx) => {
                      const eng = engineers.find((e) => e.id === v.engineerId);
                      const lines = visitLines(job, v);
                      const lineNames = lines.map((l) => certLabel(l.code) || l.name).join(", ");
                      return (
                        <div key={v.id} className="flex items-center justify-between border-b border-navy-100/60 pb-1.5 last:border-0 last:pb-0">
                          <span className="truncate pr-2">
                            Visit {idx + 1}{lineNames ? ` (${lineNames})` : ""}:
                          </span>
                          <span className="shrink-0 font-semibold text-navy-900">
                            {eng ? eng.name : "Unassigned"}
                          </span>
                        </div>
                      );
                    })}
                    <p className="pt-1 text-[11px] text-navy-400">
                      Manage engineer assignments per visit in the Visits panel.
                    </p>
                  </div>
                ) : (
                  <select
                    className="input"
                    value={job.engineerId}
                    onChange={(e) => {
                      const nextEngineerId = e.target.value;
                      const oldEngineerId = job.engineerId;
                      const lineItems = Array.isArray(job.lineItems)
                        ? job.lineItems.map((l) =>
                            l.engineerId === oldEngineerId
                              ? { ...l, engineerId: nextEngineerId }
                              : l
                          )
                        : job.lineItems;
                      updateJob(job.id, { engineerId: nextEngineerId, lineItems });
                    }}
                  >
                    {engineerOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.trade ? ` · ${e.trade}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {job.certExpiry && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Certificate expires {fmtDate(job.certExpiry)}
                </p>
              )}
            </div>
          </section>

          {/* Client */}
          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Client
            </h2>
            {client ? (
              <div className="space-y-2.5 text-sm">
                <Link
                  href={`/clients/${client.id}`}
                  className="font-semibold text-navy-900 hover:text-brand-600"
                >
                  {client.name}
                </Link>
                {client.company && (
                  <p className="text-navy-500">{client.company}</p>
                )}
                <a
                  href={`tel:${client.phone}`}
                  className="flex items-center gap-2 text-navy-600 hover:text-brand-600"
                >
                  <FiPhone className="text-navy-400" /> {client.phone}
                </a>
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-2 break-all text-navy-600 hover:text-brand-600"
                >
                  <FiMail className="text-navy-400" /> {client.email}
                </a>
                {property && (
                  <div className="border-t border-navy-100 pt-2.5">
                    <p className="flex items-start gap-2 text-navy-600">
                      <FiMapPin className="mt-0.5 shrink-0 text-navy-400" />
                      {property.label}, {property.postcode}
                    </p>
                    {(job.accessName || job.accessPhone) && (
                      <div className="ml-6 mt-1.5 border-l-2 border-brand-200 pl-2.5 text-xs text-navy-500">
                        <p className="font-semibold text-brand-700">Access contact</p>
                        {job.accessName && <p className="mt-0.5 text-navy-700">{job.accessName}</p>}
                        {job.accessPhone && <p className="text-navy-700">{job.accessPhone}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-navy-500">Client not found.</p>
            )}
          </section>

          {/* Communication thread */}
          <ActivityThread job={job} client={client} />
        </div>
      </div>

      <AutoEmailConfirm
        open={!!autoEmailPending}
        clientName={client?.name}
        email={client?.email}
        subject={autoEmailPending?.subject}
        onConfirm={() => { autoEmailPending?.sendFn(); setAutoEmailPending(null); }}
        onCancel={() => setAutoEmailPending(null)}
      />
      <CancelJobModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        job={job}
        onConfirm={confirmCancel}
      />
      <JobModal open={editOpen} onClose={() => setEditOpen(false)} job={job} />
      <JobModal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        prefillNew={followUpPrefill}
      />
      <SendEmailModal
        open={emailOpen}
        onClose={() => { setEmailOpen(false); setEmailTemplateOverride(null); }}
        job={job}
        client={client}
        property={property}
        defaultTemplate={emailTemplateOverride || defaultEmailTemplate}
      />
      <JobCardModal
        open={jobCardOpen}
        onClose={() => setJobCardOpen(false)}
        job={job}
        client={client}
        property={property}
      />
      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        job={job}
        onConfirm={({ scheduledAt, windowPart, windowFrom, windowTo, reason, note, notify }) => {
          const wasAt = job.scheduledAt;
          const patch = { scheduledAt, windowPart, windowFrom, windowTo };
          // A job that had slipped back to quote/cancelled is booked again by
          // rescheduling it — otherwise it moves date but stays off the board.
          if (["quote", "cancelled"].includes(job.status)) patch.status = "scheduled";
          // Every visit on a split job moves with the job. Rescheduling the
          // parent and leaving the visits on the old date would put the job in
          // two places at once on the dispatch board.
          if (isSplit(job)) {
            patch.visits = job.visits.map((v) =>
              v.status === "completed" || v.status === "cancelled"
                ? v
                : { ...v, scheduledAt, windowPart, windowFrom, windowTo }
            );
          }
          updateJob(job.id, patch);
          logActivity(job.id, {
            type: "status",
            title: `Rescheduled — ${reason}`,
            detail: `${wasAt ? fmtDate(wasAt) : "unscheduled"} → ${fmtDate(scheduledAt)}${note ? ` · ${note}` : ""}`,
            by: user?.name || user?.username || "",
          });
          setRescheduleOpen(false);
          toast.success("Job rescheduled");
          // The auto-notify machinery lives inside changeStatus and is tied to
          // a status TRANSITION — a reschedule isn't one (the job was already
          // scheduled and still is). Rather than duplicate that send logic,
          // open the normal email composer on the booking template so the new
          // date goes out with a chance to read it first.
          if (notify && client?.email) {
            setEmailTemplateOverride("booking");
            setEmailOpen(true);
          }
        }}
      />

      <InvoiceModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        docType={invoiceMode}
        jobId={job.id}
        prefill={{
          // Quotes use the job id as the reference; invoices get a number
          // allocated against the job itself (see allocateInvoiceNumber).
          invNo: invoiceMode === "quote" ? job.id : undefined,
          // Includes any name/address/line edits saved from Edit invoice.
          ...buildInvoicePrefill(job, client, property, invoiceMode),
        }}
      />

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete job?"
        footer={
          <>
            <button className="btn-outline" onClick={() => setConfirmDel(false)}>
              Cancel
            </button>
            <button
              className="btn bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDelete}
            >
              Delete {job.id}
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This will permanently remove <strong>{job.id}</strong> from the system.
          This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
