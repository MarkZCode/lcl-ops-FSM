"use client";

import { quoteWhatsApp } from "@/lib/enquiryMessages";
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
import { STAGE_ORDER, statusMeta, UNASSIGNED_ENGINEER } from "@/lib/constants";
import { jobStage, isCertified, quoteStage, QUOTE_STAGES } from "@/lib/stages";
import { gbp, fmtDate, fmtDateTime, getJobLines, lineTotal, lineGross, jobDiscount, jobPayable, isAddonCode } from "@/lib/format";
import { jobFinancialsSplit } from "@/lib/finance";
import { lineSizeLabel, dateLine, certLabel, acceptanceProgress, setScopeConfirmed, scopeAccepted } from "@/lib/jobCard";
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
import EngineerBlock from "@/components/EngineerBlock";
import CertificationPanel from "@/components/CertificationPanel";
import CancelJobModal from "@/components/CancelJobModal";
import CancelServiceModal from "@/components/CancelServiceModal";
import RescheduleModal from "@/components/RescheduleModal";
import NextStepCard from "@/components/NextStepCard";
import { nextAction } from "@/lib/nextAction";
import { markJobSeen } from "@/lib/jobsView";
import { toast } from "@/lib/toast";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { quoteChecks } from "@/lib/quoteChecks";
import BookingAssist from "@/components/BookingAssist";
import { bankForJob } from "@/lib/bank";
import PaymentLedger from "@/components/PaymentLedger";
import ClientQuickActions from "@/components/ClientQuickActions";
import CongestionAuto from "@/components/CongestionAuto";
import IntakePanel from "@/components/IntakePanel";
import CertificateDesk from "@/components/CertificateDesk";
import RemedialPanel from "@/components/RemedialPanel";
import { bookingMissing, closingMissing, appointmentCertainty, priceCertainty } from "@/lib/gates";
import { greetingNow, firstName, jobSender } from "@/lib/email";
import { FaWhatsapp } from "react-icons/fa";

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addJob, jobs, clients, updateJob, removeJob, mergeBackToParentJob, cancelServices, restoreService, logActivity, mergeRemoteActivity, createRecurringJob, generateShareToken, autoNotify, email: emailSettings, templates, engineers, engineerById, hydrated, invoiceSeq, advanceInvoiceSeq, allocateInvoiceNumber } =
    useStore();
  const { can, user } = useAuth();
  const { bankAccounts, invoiceBankId, rules } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState("invoice"); // "invoice" | "quote"
  const [jobCardOpen, setJobCardOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Cancelling ONE service (not the job): which lines the dialog opens on.
  const [cancelLineIds, setCancelLineIds] = useState(null);
  // "Client will get back" — the date they said they'd come back by.
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdDate, setHoldDate] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpPrefill, setFollowUpPrefill] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [autoEmailPending, setAutoEmailPending] = useState(null); // { subject, sendFn }
  const [moreOpen, setMoreOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [emailTemplateOverride, setEmailTemplateOverride] = useState(null);
  // Other windows (e.g. Edit job after changing a sent quote) can ask for
  // the email window: window event "lcl-send-email" { jobId, template }.
  useEffect(() => {
    const on = (e) => {
      if (e.detail?.jobId !== decodeURIComponent(String(id || ""))) return;
      setEmailTemplateOverride(e.detail.template || null);
      setEmailOpen(true);
    };
    window.addEventListener("lcl-send-email", on);
    return () => window.removeEventListener("lcl-send-email", on);
  }, [id]);
  // The page is split into tabs so it shows what you came for instead of
  // everything at once. "all" is the old single long page.
  const [tab, setTabState] = useState("overview");
  useEffect(() => {
    try { const t = sessionStorage.getItem("lcl-job-tab"); if (t) setTabState(t); } catch {}
  }, []);
  const setTab = (t) => { setTabState(t); try { sessionStorage.setItem("lcl-job-tab", t); } catch {} };
  const on = (...keys) => tab === "all" || keys.includes(tab);
  // Where this job sits in the list you came from, for the ‹ › arrows.
  const [order, setOrder] = useState([]);
  useEffect(() => {
    try { setOrder(JSON.parse(sessionStorage.getItem("lcl-jobs-order") || "[]")); } catch {}
  }, [id]);

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
  // What this stage is about, so the page shows that and not everything.
  const headerDoc = job?.status === "quote" ? "quote" : ["completed", "invoiced", "paid"].includes(job?.status) ? "invoice" : null;
  // A quote the client hasn't accepted and nobody has dated: booking tools
  // stay on the Booking tab instead of crowding the overview.
  const preBooking = job?.status === "quote" && !job?.acceptedAt && !job?.scheduledAt;
  // Opening a job marks it as seen at its current version, so the list's
  // "changed since you last looked" dot means changes by someone else.
  useEffect(() => {
    if (job?.id) markJobSeen(job.id, job.updatedAt || new Date().toISOString());
  }, [job?.id, job?.updatedAt]);

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
  const jobBank = bankForJob(job, bankAccounts, invoiceBankId);
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


  // What the "Next step" card's button actually does — each suggestion in
  // lib/nextAction.js carries a `do` key, and this is the one place that
  // turns it into the real control, so the suggestion and the fix are the
  // same click.
  // Which tab each scroll target lives on — a Next step button has to switch
  // to it before it can scroll there.
  const TAB_OF = { communication: "messages", visits: "booking", documents: "documents", certificate: "documents", payment: "money", "job-details": "overview", booking: "overview" };
  const scrollToId = (id) => {
    const need = TAB_OF[id];
    if (need && tab !== "all" && !(id === "booking" && tab === "booking") && tab !== need) setTab(need);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const handleNextStep = (what, action) => {
    if (!job) return;
    if (what.startsWith("email:")) {
      setEmailTemplateOverride(what.slice(6));
      setEmailOpen(true);
      return;
    }
    switch (what) {
      case "reply":
        scrollToId("communication");
        return;
      case "reply_handled":
        updateJob(job.id, { replyHandledAt: new Date().toISOString() });
        toast("Marked as handled");
        return;
      case "confirm":
        scrollToId(isSplit(job) ? "visits" : "booking");
        return;
      case "book":
        if (isSplit(job)) scrollToId("visits");
        else if (job.engineerId && job.engineerId !== "unassigned" && !job.scheduledAt) setRescheduleOpen(true);
        else scrollToId("booking");
        return;
      case "complete":
        if (isSplit(job)) scrollToId("visits");
        else changeStatus("completed");
        return;
      case "not_done":
        setCancelLineIds(
          getJobLines(job).filter((l) => !isAddonCode(l.code) && !l.cancelled).map((l) => l.id)
        );
        return;
      case "partial":
        scrollToId("visits");
        return;
      case "invoice":
        setEmailTemplateOverride("invoice");
        setEmailOpen(true);
        return;
      case "upload":
        scrollToId("documents");
        return;
      case "edit":
        setEditOpen(true);
        return;
      case "status:scheduled":
        changeStatus("scheduled");
        return;
      case "status:paid":
        changeStatus("paid", { paidAt: new Date().toISOString() });
        logActivity(job.id, { type: "payment", title: `Marked as paid · ${gbp(job.price)}` });
        return;
      case "status:quote":
        changeStatus("quote");
        return;
      case "accept":
        acceptQuote();
        return;
      case "quote_sent":
        markQuoteSent();
        return;
      case "certcheck":
        scrollToId("certificate");
        return;
      case "intake":
        // Open the panel as well as going to it — the fields are inside.
        window.dispatchEvent(new Event("lcl-open-job-details"));
        scrollToId("job-details");
        return;
      case "access":
        scrollToId("booking");
        return;
      case "access_confirmed":
        updateJob(job.id, { accessConfirmedAt: new Date().toISOString() });
        logActivity(job.id, { type: "status", title: "Access confirmed for the appointment", by: who() });
        return;
      case "payment":
        scrollToId("payment");
        return;
      case "review_skip":
        updateJob(job.id, { reviewSkipped: true });
        return;
      case "quote_checked":
        updateJob(job.id, { quoteCheckedAt: new Date().toISOString(), quoteCheckedBy: who() });
        logActivity(job.id, { type: "status", title: "Quote checked", by: who() });
        return;
      case "wa_reply":
        replyOnWhatsApp();
        return;
      case "wa_reply_done":
        updateJob(job.id, { enquiryRepliedAt: new Date().toISOString() });
        logActivity(job.id, { type: "status", title: "Enquiry answered outside the app", by: who() });
        return;
      case "wa_nudge": {
        if (!client?.phone) return;
        const msg = quoteWhatsApp({ job, client, property, sender: jobSender(job), firstName: firstName(client.name), urgencyLine: rules?.urgencyLine });
        if (!openWhatsAppChat(client.phone, msg)) return;
        updateJob(job.id, { quoteNudgeAt: new Date().toISOString() });
        logActivity(job.id, { type: "whatsapp", title: "WhatsApp message sent with the quote (opened)", detail: msg, by: who() });
        return;
      }
      case "wa_late": {
        const phone = job.accessPhone || client?.phone;
        const msg = `${greetingNow()} ${firstName(job.accessName || client?.name)}, this is ${jobSender(job)} from Landlord Compliance London. Your engineer is running about ${job.runningLate?.minutes || 30} minutes late today — apologies for the wait. They are on their way.`;
        if (!phone || !openWhatsAppChat(phone, msg)) return;
        updateJob(job.id, { runningLate: { ...job.runningLate, toldAt: new Date().toISOString() } });
        logActivity(job.id, { type: "whatsapp", title: "Told the client the engineer is running late (WhatsApp opened)", detail: msg, by: who() });
        return;
      }
      case "late_done":
        updateJob(job.id, { runningLate: { ...job.runningLate, toldAt: new Date().toISOString() } });
        return;
      case "wa_nudge_done":
        updateJob(job.id, { quoteNudgeAt: new Date().toISOString() });
        logActivity(job.id, { type: "status", title: "Booking message sent outside the app", by: who() });
        return;
      case "quote_hold":
        setHoldOpen(true);
        return;
      case "certify":
        certify();
        return;
      case "reschedule":
        setRescheduleOpen(true);
        return;
      case "engineer":
        router.push("/engineers");
        return;
      case "decline":
        setCancelOpen(true);
        return;
      default:
    }
  };

  // ── Quote levels & the end of the flow ──
  // One-tap records for what happened outside the app, so the flow follows
  // the job instead of lagging behind it.
  const who = () => user?.name || user?.username || "";
  const acceptQuote = () => {
    if (!job) return;
    const acceptedAt = new Date().toISOString();
    const b = [
      ...blockersForScheduling(job, (eid) => engineerById(eid)?.name || "the engineer"),
      ...bookingMissing(job, { client, property }).map((m) => `add ${m.label}`),
    ];
    logActivity(job.id, { type: "status", title: "Quote accepted by the client", by: who() });
    if (!b.length) { changeStatus("scheduled", { acceptedAt }); return; }
    updateJob(job.id, { acceptedAt, quoteHoldUntil: null });
    toast.success(`Quote accepted. Next: ${b[0]}.`, { duration: 7000 });
  };
  const pinNote = () => {
    const text = window.prompt("Note to pin to the top of this job (leave empty to remove):", job.pinnedNote || "");
    if (text === null) return;
    updateJob(job.id, { pinnedNote: text.trim() });
  };
  // A new quote for the same client and property with the same services —
  // no dates, no engineer, nothing carried over from this job's history.
  const duplicateJob = () => {
    const stamp = Date.now().toString(36);
    const lines = getJobLines(job).filter((l) => !l.cancelled).map((l, i) => ({ id: `ln-${l.code}-${stamp}-${i}`, code: l.code, name: l.name, unit: l.unit, qty: l.qty || 1, ...(l.tier ? { tier: l.tier } : {}), ...(l.total != null ? { total: l.total } : {}) }));
    const made = addJob({
      clientId: job.clientId, propertyId: job.propertyId,
      lineItems: lines, services: lines.map((l) => l.code),
      quantities: Object.fromEntries(lines.map((l) => [l.code, l.qty || 1])),
      ...(job.gasAppliances ? { gasAppliances: job.gasAppliances } : {}),
      price: jobPayable({ lineItems: lines }),
      nameOnCert: job.nameOnCert || "", accessName: job.accessName || "", accessPhone: job.accessPhone || "",
      accessContacts: job.accessContacts || [], intake: job.intake || {},
      notes: `Copied from ${job.id}.`,
    });
    if (made?.id) router.push(`/jobs/${made.id}`);
  };
  // One printable page: who, where, what, when, how much.
  const printSummary = () => {
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const rows = [
      ["Job", job.id], ["Stage", statusMeta(jobStage(job))?.label || job.status],
      ["Client", client?.name], ["Phone", client?.phone], ["Email", client?.email],
      ["Property", [property?.label, property?.postcode].filter(Boolean).join(", ")],
      ["Access", [job.accessName, job.accessPhone].filter(Boolean).join(" · ")],
      ["Access notes", property?.accessNotes],
      ["Name on certificate", job.nameOnCert || client?.name],
      ["Appointment", job.scheduledAt ? dateLine(job) : "Not scheduled"],
      ["Engineer", job.engineerId && job.engineerId !== "unassigned" ? engineerById(job.engineerId)?.name : "Unassigned"],
      ["Services", getJobLines(job).filter((l) => !l.cancelled).map((l) => `${l.code === "CUSTOM" ? l.name : certLabel(l.code)}${l.tier ? ` (${l.tier})` : ""} — ${gbp(lineTotal(l))}`).join("<br>")],
      ["Total", gbp(job.price)],
      ["Notes", job.notes],
    ].filter(([, v]) => v);
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<title>${esc(job.id)}</title><body style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:32px;color:#14213D"><h1 style="font-size:20px;margin:0 0 4px">Landlord Compliance London</h1><p style="margin:0 0 20px;color:#555">Job summary · printed ${new Date().toLocaleDateString("en-GB")}</p><table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;border-bottom:1px solid #ddd;color:#555;vertical-align:top;width:170px">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid #ddd;white-space:pre-wrap">${k === "Services" ? v : esc(v)}</td></tr>`).join("")}</table></body>`);
    w.document.close();
    w.focus();
    w.print();
  };

  // Step 2 of an enquiry quote: the "we've got it" WhatsApp. Opens the
  // client's chat with the message already typed — nothing is sent until
  // they press send in WhatsApp.
  const replyOnWhatsApp = () => {
    if (!job || !client?.phone) return;
    const what = (job.services || []).filter((c) => !isAddonCode(c)).map((c) => certLabel(c)).join(" and ");
    const where = property?.postcode ? ` at ${property.postcode}` : "";
    const msg = `${greetingNow()} ${firstName(client.name)}, this is ${jobSender(job)} from Landlord Compliance London. Thank you for your enquiry${what ? ` regarding the ${what}` : ""}${where}.\n\nWe'd be happy to arrange this for you and will come back to you with the quote shortly.`;
    if (!openWhatsAppChat(client.phone, msg)) return;
    updateJob(job.id, { enquiryRepliedAt: new Date().toISOString() });
    logActivity(job.id, { type: "whatsapp", title: "WhatsApp reply to the enquiry opened", detail: msg, by: who() });
  };
  const markQuoteSent = () => {
    if (!job) return;
    updateJob(job.id, { quoteSentAt: new Date().toISOString() });
    logActivity(job.id, { type: "status", title: "Quote sent outside the app (WhatsApp / phone)", by: who() });
    toast.success("Marked as sent — it'll prompt a follow-up in 2 days.");
  };
  const saveHold = () => {
    if (!job || !holdDate) return;
    updateJob(job.id, { quoteHoldUntil: holdDate });
    logActivity(job.id, { type: "status", title: `Client will get back by ${new Date(holdDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, by: who() });
    setHoldOpen(false);
    toast.success("Parked — no chasing until then.");
  };
  // Certified = paid + the certificate issued. The end of the flow.
  const hasCertPdf = (job?.attachments || []).some(
    (f) => f?.type === "application/pdf" || /\.pdf$/i.test(f?.name || "")
  );
  const certify = () => {
    if (!job) return;
    if (job.status !== "paid") {
      toast.error("A job is certified once it's paid — mark it paid first.");
      return;
    }
    if (!hasCertPdf) {
      toast.error("Upload the certificate PDF to the job first (Documents & photos).");
      document.getElementById("documents")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Nothing is closed with loose ends: the certificate checked and sent,
    // corrections finished, any failure followed up, payments squared.
    const loose = closingMissing(job, { jobs });
    if (loose.length) {
      toast.error(`Can't close ${job.id} yet — ${loose.map((l) => l.label.toLowerCase()).join("; ")}.`, { duration: 9000 });
      return;
    }
    updateJob(job.id, { certifiedAt: new Date().toISOString() });
    logActivity(job.id, { type: "status", title: "Certified — job complete", by: who() });
    toast.success(`${job.id} certified — that's the end of the flow.`);
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
      const blockers = [
        ...blockersForScheduling(job, (id) => engineerById(id)?.name || "the engineer"),
        // …and not without the details a booking needs.
        ...bookingMissing(job, { client, property }).map((m) => `missing ${m.label}`),
      ];
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
          // The invoice went out with this email — so the job IS invoiced.
          if (invNoUsed && Number(nextJob.price) > 0) {
            updateJob(job.id, { status: "invoiced", invoicedAt: new Date().toISOString() });
          }
          logActivity(job.id, { type: "email", template: tplKey, title: `Auto-notification: ${s}${attachNote}`, detail: subject, to: client.email, meta: { messageId: data.id } });
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
      <div className="relative border-b border-navy-100 bg-white px-4 py-4 sm:px-8 lg:sticky lg:top-0 lg:z-20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800"
          >
            <FiArrowLeft /> Back to jobs
          </Link>
          {(() => {
            const i = order.indexOf(job.id);
            if (i === -1 || order.length < 2) return null;
            const prev = order[i - 1], next = order[i + 1];
            const cls = "grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-500 hover:border-brand-300 hover:text-brand-600";
            return (
              <span className="flex items-center gap-1.5 text-xs text-navy-500">
                {prev ? <Link href={`/jobs/${prev}`} className={cls} aria-label="Previous job in the list" title={prev}>‹</Link> : <span className={`${cls} opacity-30`}>‹</span>}
                <span className="tnum">{i + 1} of {order.length}</span>
                {next ? <Link href={`/jobs/${next}`} className={cls} aria-label="Next job in the list" title={next}>›</Link> : <span className={`${cls} opacity-30`}>›</span>}
              </span>
            );
          })()}
        </div>
        {/* Where the job is, at a glance: one segment per stage. */}
        <div className="absolute inset-x-0 bottom-0 flex h-[3px]" aria-hidden>
          {STAGE_ORDER.filter((s) => s !== "cancelled").map((s, i, arr) => (
            <span key={s} className={`flex-1 ${job.status === "cancelled" ? "bg-rose-300" : i <= arr.indexOf(jobStage(job)) ? "bg-brand-500" : "bg-navy-100"}`} />
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-navy-900">{job.id}</h1>
            <StatusBadge status={jobStage(job)} />
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
            {/* Time in the CURRENT stage — a job can be a month old but only
                stuck since yesterday, or new and already stuck. */}
            {(() => {
              const cur = [...(job.statusHistory || [])].reverse().find((h) => h.status === job.status && !h.exitedAt);
              if (!cur?.enteredAt || job.status === "quote" || ["paid", "cancelled"].includes(job.status)) return null;
              const d = Math.floor((Date.now() - new Date(cur.enteredAt).getTime()) / 86400000);
              if (d < 1) return null;
              return <span className={`pill ${d >= 7 ? "pill-amber" : "pill-neutral"}`} title={`In this stage since ${new Date(cur.enteredAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}>{d === 1 ? "1 day" : `${d} days`} in {statusMeta(job.status)?.label?.toLowerCase() || job.status}</span>;
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* "Client accepted" lives in the quote card just below (with
                sent / will get back / declined) — one place, not a second
                button up here. Accepting records the CLIENT'S yes; the job
                moves to Scheduled on its own once an engineer and date are
                confirmed, and Next step says what's missing. */}
            {job.status === "quote" && job.acceptedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
                <FiCheckCircle /> Accepted — booking in progress
              </span>
            )}
            {/* One document button, and only the one this stage is about:
                the quote while it's a quote, the invoice once the work is
                done. The other stays under More. */}
            {can("invoices") && headerDoc && (
              <button
                className={job.status === "completed" ? "btn-primary" : "btn-outline"}
                onClick={() => {
                  setInvoiceMode(headerDoc);
                  setInvoiceOpen(true);
                }}
              >
                {headerDoc === "quote" ? <><FiFileText /> Quote</> : <><FiDownload /> Invoice</>}
              </button>
            )}
            <button className="btn-outline" onClick={handleShare} title="Copies the client's own page for this job: they can accept the quote, send their booking details, see the appointment and download the certificate">
              {shareCopied ? <FiCheck className="text-brand-600" /> : <FiShare2 />}
              {shareCopied ? "Link copied" : "Client link"}
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
                  <div className="menu-backdrop fixed inset-0 z-10" onClick={() => setMoreOpen(false)} aria-hidden />
                  {/* Anchored LEFT by default, right-aligned only from sm up.
                      It was the other way round: right-0 hangs the menu off
                      the button's right edge and grows leftwards, and on a
                      phone the wrapped "More" button sits at the very left of
                      the action row — so the menu ran straight off the left
                      edge of the screen and every item was clipped to a
                      couple of letters. */}
                  <div className="menu-pop absolute left-0 top-full z-20 mt-1 min-w-[10.5rem] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-navy-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0">
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" title="The engineer's own page for this job: confirm or decline, on my way, running late, arrived, finished, upload the certificate" onClick={() => {
                      setMoreOpen(false);
                      const token = job.confirmToken || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
                      if (!job.confirmToken) updateJob(job.id, { confirmToken: token });
                      navigator.clipboard.writeText(`${window.location.origin}/confirm/${token}`).then(() => toast.success("Engineer link copied — send it to the engineer.")).catch(() => {});
                    }}>
                      <FiShare2 className="h-4 w-4" /> Copy engineer link
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setJobCardOpen(true); setMoreOpen(false); }}>
                      <FiClipboard className="h-4 w-4" /> Job card
                    </button>
                    {headerDoc !== "quote" && (
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setInvoiceMode("quote"); setInvoiceOpen(true); setMoreOpen(false); }}>
                        <FiFileText className="h-4 w-4" /> Quote
                      </button>
                    )}
                    {headerDoc !== "invoice" && can("invoices") && (
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setInvoiceMode("invoice"); setInvoiceOpen(true); setMoreOpen(false); }}>
                        <FiDownload className="h-4 w-4" /> Invoice
                      </button>
                    )}
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setEmailOpen(true); setMoreOpen(false); }}>
                      <FiSend className="h-4 w-4" /> Email
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setEditOpen(true); setMoreOpen(false); }}>
                      <FiEdit2 className="h-4 w-4" /> Edit
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setMoreOpen(false); pinNote(); }}>
                      <FiFileText className="h-4 w-4" /> {job.pinnedNote ? "Change pinned note" : "Pin a note"}
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setMoreOpen(false); duplicateJob(); }}>
                      <FiClipboard className="h-4 w-4" /> Duplicate
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => { setMoreOpen(false); printSummary(); }}>
                      <FiDownload className="h-4 w-4" /> Print summary
                    </button>
                    {can("deleteRecords") && (
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={() => { setConfirmDel(true); setMoreOpen(false); }}>
                        <FiTrash2 className="h-4 w-4" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-navy-100 bg-white px-4 py-2 sm:px-8">
        <div className="scroll-area flex gap-1 overflow-x-auto" role="tablist">
          {[["overview", "Overview"], ["booking", "Booking"], ["money", "Money"], ["documents", "Documents"], ["messages", "Messages"], ["all", "Everything"]].map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === k ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-50"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-navy-500">
          <strong className="tnum text-navy-900">{gbp(job.price)}</strong>
          {(() => {
            const a = nextAction(job, { client, clientEmail: client?.email || "", clientPhone: client?.phone || "", engineerName: (eid) => engineerById(eid)?.name || "the engineer", engineerExists: (eid) => engineers.some((e) => e.id === eid), engineerById: (eid) => engineers.find((e) => e.id === eid) });
            return a ? <> · Next: <span className="font-semibold text-navy-800">{a.title}</span></> : null;
          })()}
        </p>
      </div>

      {job.pinnedNote && (
        <div className="flex items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-8 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="min-w-0 whitespace-pre-wrap"><strong>Pinned:</strong> {job.pinnedNote}</p>
          <button type="button" className="shrink-0 text-xs font-semibold underline" onClick={() => updateJob(job.id, { pinnedNote: "" })}>Unpin</button>
        </div>
      )}

      <div className={`page grid grid-cols-1 gap-6 overflow-x-hidden ${tab === "messages" ? "lg:max-w-3xl" : "lg:grid-cols-[minmax(0,900px)_380px]"}`}>
        {/* Main */}
        <div className="min-w-0 space-y-6" hidden={tab === "messages"}>
          <div className="space-y-6 empty:hidden" hidden={!on("overview")}>
          {/* Quote levels — where the quote actually is, and one-tap records
              for what happened on WhatsApp or the phone. */}
          {job.status === "quote" && (() => {
            const stage = quoteStage(job, undefined, client);
            const idx = QUOTE_STAGES.findIndex((q) => q.key === stage);
            return (
              <section className="card p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUOTE_STAGES.map((q, i) => (
                    <span
                      key={q.key}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        q.key === stage
                          ? "bg-navy-800 text-white"
                          : i < idx && q.key !== "on_hold"
                            ? "bg-brand-50 text-brand-700"
                            : "bg-navy-50 text-navy-400"
                      }`}
                    >
                      {q.label}
                    </span>
                  ))}
                </div>
                {job.quoteHoldUntil && stage === "on_hold" && (
                  <p className="mt-2 text-xs text-navy-500">
                    Client will get back by {new Date(job.quoteHoldUntil).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} — no chasing until then.
                  </p>
                )}
                {stage !== "accepted" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stage === "new" && (
                      <button className="btn-outline py-1.5 text-xs" onClick={markQuoteSent}>Sent on WhatsApp / phone</button>
                    )}
                    <button className="btn-outline py-1.5 text-xs" onClick={() => setHoldOpen(true)}>Client will get back…</button>
                    <button className="btn-outline py-1.5 text-xs" onClick={acceptQuote}>Client accepted</button>
                    <button className="btn-outline py-1.5 text-xs text-rose-600" onClick={() => setCancelOpen(true)}>Client declined</button>
                  </div>
                )}
              </section>
            );
          })()}

          <CongestionAuto job={job} property={property} />
          <NextStepCard
            job={job}
            client={client}
            clientEmail={client?.email || ""}
            clientPhone={client?.phone || ""}
            engineerName={(eid) => engineerById(eid)?.name || "the engineer"}
            engineerExists={(eid) => engineers.some((e) => e.id === eid)}
            engineerById={(eid) => engineers.find((e) => e.id === eid)}
            onDo={handleNextStep}
            checks={job.status === "quote" ? quoteChecks(job, { property, jobs, client }) : []}
          />

          <div id="job-details" className="scroll-mt-24">
            <IntakePanel job={job} client={client} property={property} />
          </div>

          {/* Status workflow */}
          <section className="px-1">
            {/* The status moves by itself as things happen (accepted,
                confirmed, completed, paid, certificate sent). Changing it
                by hand is the exception, so it's folded away. */}
            <details>
            <summary className="cursor-pointer text-xs font-semibold text-navy-400 hover:text-navy-600">
              Change the status by hand <span className="font-normal">(only to correct a mistake)</span>
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {STAGE_ORDER.map((s) => {
                const meta = statusMeta(s);
                const active = jobStage(job) === s;
                return (
                  <button
                    key={s}
                    onClick={() => (s === "certified" ? certify() : changeStatus(s))}
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
            </details>
            {/* Accepted, but a leg has lost its confirmation (an engineer was
                swapped). The job stays Scheduled rather than falling back to
                Quote — so say, right here, what still needs a yes. */}
            {["scheduled", "in_progress"].includes(job.status) && isSplit(job) && (() => {
              const b = blockersForScheduling(job, (eid) => engineerById(eid)?.name || "the engineer");
              if (!b.length) return null;
              return (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <p className="font-semibold">Needs attention before the day</p>
                  <ul className="mt-1 list-disc pl-4">
                    {b.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              );
            })()}
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

          </div>
          <div className="space-y-6 empty:hidden" hidden={!on("booking")}>
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
          <div id="visits" className="scroll-mt-24">
            <VisitsPanel job={job} onCancelLines={(ids) => setCancelLineIds(ids)} />
          </div>
          {job.engineerId && job.engineerId !== "unassigned" && job.status !== "cancelled" && <CertificationPanel job={job} />}

          </div>
          <div className="space-y-6 empty:hidden" hidden={!on("overview", "money")}>
          {/* Services */}
          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Services
            </h2>
            <ul className="divide-y divide-navy-100">
              {getJobLines(job).map((l) => {
                const qty = l.qty || 1;
                const editable = !["invoiced", "paid"].includes(job.status) && can("invoices");
                const isWork = !isAddonCode(l.code);
                return (
                  <li
                    key={l.id}
                    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 text-sm ${l.cancelled ? "text-navy-400" : "text-navy-700"}`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <FiFileText className={l.cancelled ? "text-navy-300" : "text-brand-500"} />
                      <span className={l.cancelled ? "line-through" : ""}>{l.name}</span>
                      {l.cancelled && (
                        <span
                          className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
                          title={l.cancelNote || ""}
                        >
                          Not carried out · {l.cancelReasonLabel || "cancelled"} ·{" "}
                          {l.billing === "charge" ? "charged" : "not charged"}
                          {l.payEngineer ? " · engineer paid" : ""}
                        </span>
                      )}
                      {lineSizeLabel(l, job) && (
                        <span className="text-xs text-navy-400">· {lineSizeLabel(l, job)}{l.tier && lineSizeLabel(l, job) !== l.tier ? ` (${l.tier} price)` : ""}</span>
                      )}
                      {l.waived && !l.cancelled && (
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
                    <span className="ml-auto flex items-center gap-2">
                      {l.waived ? (
                        <>
                          <span className="text-navy-400 line-through">{gbp(lineGross(l))}</span>
                          <span className="text-xs font-semibold text-brand-600">£0.00</span>
                        </>
                      ) : (
                        <span className="font-medium text-navy-800">{gbp(lineTotal(l))}</span>
                      )}
                      {editable && isWork && !l.cancelled && ["scheduled", "in_progress", "completed"].includes(job.status) && (
                        <button
                          type="button"
                          onClick={() => setCancelLineIds([l.id])}
                          className="rounded-md border border-navy-200 px-2 py-1 text-[11px] font-semibold text-navy-500 hover:border-rose-300 hover:text-rose-600"
                          title="This service wasn't carried out — cancel it, or move it to a new job to rebook"
                        >
                          Not done…
                        </button>
                      )}
                      {editable && l.cancelled && (
                        <button
                          type="button"
                          onClick={() => {
                            const r = restoreService(job.id, l.id, user?.name || user?.username || "");
                            if (r?.ok) toast.success(`${l.name} restored`);
                            else toast.error(r?.error || "Couldn't restore it.");
                          }}
                          className="rounded-md border border-navy-200 px-2 py-1 text-[11px] font-semibold text-navy-500 hover:border-brand-300 hover:text-brand-600"
                          title="Undo — put this service back on the job"
                        >
                          Restore
                        </button>
                      )}
                    </span>
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
              <span className="flex items-center gap-2 text-sm text-navy-500">Total
                {(() => { const c = priceCertainty(job); return c ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.key === "confirmed" ? "bg-brand-50 text-brand-700" : "bg-amber-100 text-amber-800"}`}>{c.label}</span> : null; })()}
              </span>
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

          </div>
          <div className="space-y-6 empty:hidden" hidden={!on("money")}>
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
          <section id="payment" className="card scroll-mt-24 p-5">
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
                <span className="font-medium text-navy-800">{jobBank.accountHolder}</span>
                <span className="text-navy-400">Account no.</span>
                <span className="font-medium text-navy-800">{jobBank.accountNumber}</span>
                <span className="text-navy-400">Sort code</span>
                <span className="font-medium text-navy-800">{jobBank.sortCode}</span>
                <span className="text-navy-400">Bank</span>
                <span className="font-medium text-navy-800">{jobBank.bankName}</span>
                {jobBank.iban && (
                  <>
                    <span className="text-navy-400">IBAN</span>
                    <span className="font-mono text-[11px] font-medium text-navy-800">{jobBank.iban}</span>
                  </>
                )}
                {jobBank.bic && (
                  <>
                    <span className="text-navy-400">BIC / SWIFT</span>
                    <span className="font-mono text-[11px] font-medium text-navy-800">{jobBank.bic}</span>
                  </>
                )}
                <span className="text-navy-400">Reference</span>
                <span className="font-medium text-navy-800">{job.id}</span>
              </div>
            </div>

            <PaymentLedger
              job={job}
              client={client}
              property={property}
              onPaidInFull={() => {
                changeStatus("paid", { paidAt: new Date().toISOString() });
                logActivity(job.id, { type: "payment", title: `Paid in full · ${gbp(job.price)}` });
              }}
            />

            {/* Mark-as actions */}
            {/* Nothing to invoice or be paid for on an unaccepted quote or a
                cancelled job. */}
            <div className={`mt-3 flex-wrap gap-2 ${(job.status === "quote" && !job.acceptedAt) || job.status === "cancelled" ? "hidden" : "flex"}`}>
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

          </div>
          <div className="space-y-6 empty:hidden" hidden={!on("documents")}>
          <div id="certificate" className="scroll-mt-24">
            <CertificateDesk job={job} />
          </div>

          {/* Documents & photos */}
          <div id="documents" className="scroll-mt-24">
            <JobAttachments job={job} onSave={updateJob} />
          </div>

          </div>
          <div className="space-y-6 empty:hidden" hidden={!on("booking")}>
          {/* Outcome & follow-up (remedial / replacement) */}
          {["in_progress", "completed", "invoiced", "paid"].includes(job.status) && <JobOutcome job={job} onCreateFollowUp={createFollowUp} />}
          <RemedialPanel job={job} onCreateRemedial={createFollowUp} />

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

          </div>
          <div className="space-y-6 empty:hidden" hidden={!on("overview")}>
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Schedule + engineer */}
          <section className="card p-5" hidden={preBooking ? !on("booking") : !on("overview", "booking")}>
            <h2 className="mb-3 section-label text-sm">
              Appointment
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-navy-700">
                  <FiClock className="text-navy-400" />
                  {job.scheduledAt ? dateLine(job) : "Not scheduled"}
                  {(() => {
                    const c = appointmentCertainty(job, blockersForScheduling(job, (id) => engineerById(id)?.name || "the engineer").length === 0);
                    return c ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.key === "confirmed" ? "bg-brand-50 text-brand-700" : "bg-amber-100 text-amber-800"}`}>{c.label}</span> : null;
                  })()}
                </p>
                {/* Moving an appointment used to mean Edit → Scheduling, which
                    overwrites the date silently — nothing recorded that the job
                    had moved, or why. Its own action, with the reason logged. */}
                {job.scheduledAt && !["completed", "invoiced", "paid", "cancelled"].includes(job.status) && (
                  <button
                    onClick={() => setRescheduleOpen(true)}
                    className="shrink-0 rounded-lg border border-navy-200 px-2 py-1 text-[11px] font-semibold text-navy-600 transition hover:border-brand-300 hover:text-brand-600"
                    title="Move this job to another date and record why"
                  >
                    Reschedule
                  </button>
                )}
              </div>
              {!job.scheduledAt && (job.preferredDate || job.preferredSlot) && (
                <p className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800">
                  Client asked for: <strong>{[job.preferredDate && (/^\d{4}-\d{2}-\d{2}/.test(job.preferredDate) ? fmtDate(job.preferredDate) : job.preferredDate), job.preferredSlot].filter(Boolean).join(" · ")}</strong>
                </p>
              )}
              <BookingAssist job={job} client={client} property={property} onReschedule={() => setRescheduleOpen(true)} />
              {/* Who is doing it and whether they have said yes — one block. */}
              <EngineerBlock job={job} client={client} property={property} />
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
                {(client.preferredContact || client.billingName) && (
                  <p className="flex flex-wrap gap-1.5">
                    {client.preferredContact && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Prefers {client.preferredContact}</span>}
                    {client.billingName && <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-600">Invoices to {client.billingName}</span>}
                  </p>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    {/* The number opens their WhatsApp chat; the handset calls. */}
                    <a
                      href={`tel:${client.phone}`}
                      title="Call"
                      aria-label={`Call ${client.phone}`}
                      className="text-navy-400 hover:text-brand-600"
                    >
                      <FiPhone />
                    </a>
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(client.phone)}
                      title="Open their WhatsApp chat"
                      className="flex items-center gap-1.5 text-navy-600 hover:text-[#1ebe5b]"
                    >
                      {client.phone} <FaWhatsapp className="text-[#25D366]" />
                    </button>
                  </div>
                )}
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-2 break-all text-navy-600 hover:text-brand-600"
                >
                  <FiMail className="text-navy-400" /> {client.email}
                </a>
                {(() => {
                  const others = jobs.filter((j) => j.clientId === client.id && j.id !== job.id && !["paid", "cancelled"].includes(j.status));
                  if (!others.length) return null;
                  return (
                    <p className="text-xs text-navy-500">
                      Also open for this client:{" "}
                      {others.slice(0, 5).map((j, i) => (
                        <span key={j.id}>{i > 0 && ", "}<Link href={`/jobs/${j.id}`} className="font-semibold text-brand-600 hover:underline">{j.id}</Link></span>
                      ))}
                      {others.length > 5 ? ` and ${others.length - 5} more` : ""}
                    </p>
                  );
                })()}
                <ClientQuickActions job={job} client={client} property={property} engineerConfirmed={blockersForScheduling(job, (id) => engineerById(id)?.name || "the engineer").length === 0} />
                {property && (
                  <div className="border-t border-navy-100 pt-2.5">
                    <p className="flex items-start gap-2 text-navy-600">
                      <FiMapPin className="mt-0.5 shrink-0 text-navy-400" />
                      {String(property.label || "").toUpperCase().includes(String(property.postcode || "").toUpperCase()) ? property.label : `${property.label}, ${property.postcode}`}
                    </p>
                    {(job.accessName || job.accessPhone) && !((job.accessName || client.name) === client.name && String(job.accessPhone || client.phone || "").replace(/\D/g, "") === String(client.phone || "").replace(/\D/g, "")) && (
                      <div className="ml-6 mt-1.5 border-l-2 border-brand-200 pl-2.5 text-xs text-navy-500">
                        <p className="font-semibold text-brand-700">Access contact</p>
                        {job.accessName && <p className="mt-0.5 text-navy-700">{job.accessName}</p>}
                        {job.accessPhone && (
                          <button
                            type="button"
                            onClick={() => openWhatsAppChat(job.accessPhone)}
                            title="Open their WhatsApp chat"
                            className="flex items-center gap-1.5 text-navy-700 hover:text-[#1ebe5b]"
                          >
                            {job.accessPhone} <FaWhatsapp className="text-[#25D366]" />
                          </button>
                        )}
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
          <div id="communication" className="scroll-mt-24" hidden={!on("overview", "messages")}>
            <ActivityThread job={job} client={client} />
          </div>

          {/* Change history — who changed the price, date, engineer, status or services */}
          {(job.changeLog || []).length > 0 && (
            <details className="card p-5" hidden={!on("messages")}>
              <summary className="cursor-pointer section-label text-sm">Change history ({job.changeLog.length})</summary>
              <ul className="mt-3 space-y-2 text-xs">
                {[...job.changeLog].reverse().slice(0, 60).map((c, i) => {
                  const label = { price: "Price", discount: "Discount", status: "Status", engineerId: "Engineer", scheduledAt: "Appointment", services: "Services" }[c.field] || c.field;
                  const show = (v) => (c.field === "engineerId" ? (v === "unassigned" ? "unassigned" : engineerById(v)?.name || v) : c.field === "status" ? statusMeta(v)?.label || v : v);
                  return (
                    <li key={i} className="border-b border-navy-100 pb-2 last:border-0">
                      <span className="font-semibold text-navy-800">{label}</span>{" "}
                      <span className="text-navy-600">{show(c.from)} → {show(c.to)}</span>
                      <span className="block text-navy-400">{fmtDateTime(c.at)}{c.by ? ` · ${c.by}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
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
      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Client will get back to you"
        footer={
          <>
            <button className="btn-outline" onClick={() => setHoldOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={saveHold} disabled={!holdDate}>Park until then</button>
          </>
        }
      >
        <p className="mb-3 text-sm text-navy-600">
          When did they say they&apos;d come back? Next step stays quiet until then, and asks you to follow up the day after.
        </p>
        <div className="flex flex-wrap gap-2">
          {[3, 7, 14, 30].map((d) => {
            const v = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
            return (
              <button key={d} type="button" onClick={() => setHoldDate(v)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${holdDate === v ? "border-navy-800 bg-navy-800 text-white" : "border-navy-200 text-navy-600"}`}>
                {d === 7 ? "1 week" : d === 14 ? "2 weeks" : d === 30 ? "1 month" : `${d} days`}
              </button>
            );
          })}
          <input type="date" className="input h-9 w-auto text-sm" value={holdDate} onChange={(e) => setHoldDate(e.target.value)} />
        </div>
      </Modal>

      <CancelServiceModal
        open={!!cancelLineIds}
        onClose={() => setCancelLineIds(null)}
        job={job}
        initialLineIds={cancelLineIds || []}
        engineerName={(eid) => engineerById(eid)?.name || "the engineer"}
        onConfirm={(opts) => {
          const r = cancelServices(job.id, { ...opts, by: user?.name || user?.username || "" });
          if (!r?.ok) { toast.error(r?.error || "Couldn't update the job."); return; }
          setCancelLineIds(null);
          if (r.followUp) {
            toast.success(`Moved to ${r.followUp.id} to rebook — the rest of ${job.id} can be billed now.`);
          } else {
            toast.success("Service cancelled — job updated.");
          }
        }}
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
          // A split job's status is derived from its visits by reconcileJob;
          // forcing "scheduled" here overrode that.
          // …but only once an engineer has confirmed and the booking details
          // are in. A date on its own is an intention, not a booking.
          if (["quote", "cancelled"].includes(job.status) && !isSplit(job)
              && !blockersForScheduling({ ...job, ...patch }, (id) => engineerById(id)?.name || "the engineer").length
              && !bookingMissing(job, { client, property }).length) patch.status = "scheduled";
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
