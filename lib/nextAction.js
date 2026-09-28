// ── WHAT DOES THIS JOB NEED FROM US NEXT? ───────────────────────────────
//
// Things were falling through because nothing in the app said, for any given
// job, what the office is supposed to do about it today: a quote nobody
// chased, an engineer who never confirmed, a job finished on Tuesday still
// sitting as In progress on Friday, an invoice never sent, a certificate
// uploaded and never emailed.
//
// This reads a job and returns its outstanding actions, most urgent first.
// The job page shows the first one as "Next step" with the button that does
// it; the Jobs page groups every open job by its next step so the day's work
// is one list.
//
// Pure — reads the job and the clock, never writes. Each action carries a
// `do` key the UI maps to a real control (open the email on a template,
// confirm an engineer, mark complete…), so the suggestion and the fix are the
// same click.
import { getJobLines, isAddonCode } from "./format";
import { isSplit, getVisits, isVisitLive, blockersForScheduling, visitProgress } from "./visits";

const DAY = 86400_000;

// Buckets the Jobs page groups by. Order = the order of the day.
export const ACTION_GROUPS = [
  { key: "reply", label: "Reply to client", tone: "rose" },
  { key: "close", label: "Mark done", tone: "rose" },
  { key: "book", label: "Book / assign", tone: "amber" },
  { key: "confirm", label: "Engineer to confirm", tone: "amber" },
  { key: "quote", label: "Send / chase quote", tone: "blue" },
  { key: "tell_client", label: "Tell the client", tone: "blue" },
  { key: "invoice", label: "Invoice", tone: "purple" },
  { key: "payment", label: "Chase payment", tone: "purple" },
  { key: "certificate", label: "Certificate", tone: "green" },
];

// Template names as they appear in activity titles ("Quote sent",
// "Auto-notification: scheduled"), for entries logged before activities
// carried their template key.
const TEMPLATE_TITLES = {
  quote: ["Quote sent"],
  followup: ["Quote follow-up sent"],
  booking: ["Booking confirmation sent", "Auto-notification: scheduled"],
  reminder: ["Appointment reminder sent"],
  invoice: ["Invoice sent", "Job completed sent", "Auto-notification: invoiced", "Auto-notification: completed"],
  certificate: ["Certificate issued sent"],
};

// When did we last send this template on this job? null if never.
export function lastSent(job, template) {
  const titles = TEMPLATE_TITLES[template] || [];
  let latest = null;
  for (const a of job?.activity || []) {
    if (a.direction === "in") continue;
    const hit =
      a.template === template ||
      titles.some((t) => String(a.title || "").startsWith(t));
    if (hit && (!latest || new Date(a.at) > new Date(latest))) latest = a.at;
  }
  return latest;
}

// Most recent email of any kind we sent on this job.
export function lastOutboundEmail(job) {
  let latest = null;
  for (const a of job?.activity || []) {
    if (a.direction === "in" || a.type !== "email") continue;
    if (!latest || new Date(a.at) > new Date(latest)) latest = a.at;
  }
  return latest;
}

// The client wrote to us and nobody has written back since.
export function unansweredReply(job) {
  let lastIn = null;
  let lastOut = null;
  for (const a of job?.activity || []) {
    // The enquiry email that CREATED the quote isn't a reply to chase —
    // answering it is "Send the quote", which is already the next step.
    if (a.direction === "in" && a.handledBy === "enquiry") continue;
    if (a.direction === "in") {
      if (!lastIn || new Date(a.at) > new Date(lastIn.at)) lastIn = a;
    } else if (a.type === "email" || a.type === "whatsapp" || a.type === "call") {
      if (!lastOut || new Date(a.at) > new Date(lastOut)) lastOut = a.at;
    }
  }
  if (!lastIn) return null;
  if (lastOut && new Date(lastOut) > new Date(lastIn.at)) return null;
  if (job?.replyHandledAt && new Date(job.replyHandledAt) >= new Date(lastIn.at)) return null;
  return lastIn;
}

const hasCertificate = (job) =>
  (job?.attachments || []).some(
    (f) => f?.type === "application/pdf" || f?.contentType === "application/pdf" || /\.pdf$/i.test(f?.name || "")
  );

// End of the (London) day the appointment was on — "overdue to close" starts
// the morning after, not the minute the arrival window opens.
function endOfApptDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
  return new Date(`${day}T23:59:59Z`).getTime() + 60 * 60 * 1000; // generous across BST
}

const ago = (iso, now) => Math.floor((now - new Date(iso).getTime()) / DAY);

export function nextActions(job, { now = new Date(), engineerName = (id) => id, clientEmail } = {}) {
  if (!job) return [];
  const out = [];
  const t = now.getTime();
  const push = (a) => out.push({ severity: "normal", ...a });
  const status = job.status;

  // A client waiting on us beats everything else.
  const reply = unansweredReply(job);
  if (reply) {
    push({
      key: "reply", group: "reply", severity: "urgent",
      title: "Reply to the client",
      detail: `They wrote ${ago(reply.at, t) === 0 ? "today" : `${ago(reply.at, t)}d ago`}: “${String(reply.detail || "").split("\n")[0].slice(0, 90)}”`,
      do: "reply",
    });
  }

  if (status === "cancelled") return out;

  const realLines = getJobLines(job).filter((l) => !isAddonCode(l.code) && !l.cancelled);

  // ── Quote stage ──
  if (status === "quote" && !job.acceptedAt) {
    // Mail sent straight from Gmail is synced onto the job as "Email sent
    // (synced)". At the quote stage that email IS the quote, so it counts —
    // otherwise every quote sent outside the app reads as never sent.
    const sent = lastSent(job, "quote") || lastOutboundEmail(job);
    const chased = lastSent(job, "followup");
    if (!realLines.length) {
      push({ key: "add_services", group: "quote", title: "Add the services", detail: "This quote has nothing on it yet.", do: "edit" });
    } else if (!sent) {
      push({
        key: "send_quote", group: "quote", severity: ago(job.createdAt || now.toISOString(), t) >= 1 ? "urgent" : "normal",
        title: "Send the quote",
        detail: clientEmail ? "Not sent to the client yet." : "Not sent yet — and there's no email on the client.",
        do: "email:quote",
      });
    } else {
      const since = ago(chased || sent, t);
      if (since >= 2) {
        push({
          key: "chase_quote", group: "quote", severity: since >= 5 ? "urgent" : "normal",
          title: chased ? "Chase the quote again" : "Chase the quote",
          detail: `${chased ? "Last chased" : "Sent"} ${since} days ago, no decision yet.`,
          do: "email:followup",
        });
      }
    }
    // Staffing ahead of acceptance is fine, but not required yet.
    return out;
  }

  // ── Booking: accepted, or scheduled / under way ──
  if (["quote", "scheduled", "in_progress"].includes(status)) {
    const blockers = blockersForScheduling(job, engineerName);
    // Once the appointment time has come, asking for a confirmation is
    // pointless — the question is whether the work got done (below).
    const started = status === "in_progress" || (!isSplit(job) && job.scheduledAt && new Date(job.scheduledAt).getTime() <= t);
    for (const b of blockers) {
      const confirm = /hasn't confirmed/.test(b);
      if (confirm && started) continue;
      push({
        key: `block:${b}`, group: confirm ? "confirm" : "book",
        severity: job.scheduledAt && new Date(job.scheduledAt).getTime() - t < 2 * DAY ? "urgent" : "normal",
        title: confirm ? "Get the engineer to confirm" : /no appointment date/.test(b) ? "Book a date" : "Assign an engineer",
        detail: b,
        do: confirm ? "confirm" : "book",
      });
    }
    if (status === "quote" && job.acceptedAt && !blockers.length) {
      push({ key: "schedule", group: "book", title: "Mark it scheduled", detail: "Accepted and fully booked.", do: "status:scheduled" });
    }
  }

  // Booked, confirmed, but the client hasn't been told when.
  if (["scheduled", "in_progress"].includes(status) && job.scheduledAt && !lastSent(job, "booking")) {
    const upcoming = new Date(job.scheduledAt).getTime() > t;
    if (upcoming) {
      push({
        key: "booking_email", group: "tell_client",
        severity: new Date(job.scheduledAt).getTime() - t < 2 * DAY ? "urgent" : "normal",
        title: "Send the booking confirmation",
        detail: "The client hasn't been sent the date and arrival window.",
        do: "email:booking",
      });
    }
  }

  // The appointment day is over and the job still reads as open.
  if (["scheduled", "in_progress"].includes(status)) {
    const visits = getVisits(job).filter((v) => isVisitLive(job, v) && v.status !== "completed");
    const overdue = visits.filter((v) => {
      const end = endOfApptDay(v.scheduledAt || job.scheduledAt);
      return end && end < t;
    });
    if (overdue.length) {
      const days = Math.max(...overdue.map((v) => ago(v.scheduledAt || job.scheduledAt, t)));
      push({
        key: "close", group: "close", severity: "urgent",
        title: isSplit(job) && overdue.length < visits.length ? "Close the finished visit" : "Mark it complete",
        detail: `The appointment was ${days <= 1 ? "yesterday" : `${days} days ago`} — mark it done, or record what wasn't.`,
        do: "complete",
      });
    }
  }

  // Part done: the rest needs a date, or the done part needs billing.
  if (isSplit(job) && status === "in_progress") {
    const p = visitProgress(job);
    if (p.done > 0 && !p.allDone) {
      push({
        key: "partial", group: "invoice",
        title: "Bill what's done, rebook the rest",
        detail: `${p.done} of ${p.total} visits done.`,
        do: "partial",
      });
    }
  }

  // ── Finished: invoice, certificate, payment ──
  if (status === "completed") {
    push({
      key: "invoice", group: "invoice", severity: job.completedAt && ago(job.completedAt, t) >= 2 ? "urgent" : "normal",
      title: "Send the invoice",
      detail: "Work is done — nothing's been billed.",
      do: "invoice",
    });
  }
  if (status === "invoiced") {
    const since = job.invoicedAt ? ago(job.invoicedAt, t) : null;
    if (since != null && since >= 7) {
      push({
        key: "chase_payment", group: "payment", severity: since >= 14 ? "urgent" : "normal",
        title: "Chase payment",
        detail: `Invoiced ${since} days ago, still unpaid.`,
        do: "email:invoice",
      });
    }
  }
  // Certificates: only for recently finished work. Older jobs were handled
  // before certificates lived on the job (they went out by hand), and
  // listing months of those would bury today's real to-do under history.
  const finishedAt = job.completedAt || job.paidAt || job.invoicedAt || job.scheduledAt;
  const recent = finishedAt && t - new Date(finishedAt).getTime() <= 14 * DAY;
  if (["completed", "invoiced", "paid"].includes(status) && realLines.length && recent) {
    if (!hasCertificate(job)) {
      push({ key: "upload_cert", group: "certificate", title: "Upload the certificate", detail: "No certificate PDF on this job yet.", do: "upload" });
    } else if (!job.certificateSentAt && !lastSent(job, "certificate") && status === "paid") {
      push({ key: "send_cert", group: "certificate", title: "Send the certificate", detail: "Paid, and the certificate hasn't gone to the client.", do: "email:certificate" });
    }
  }

  const rank = { urgent: 0, normal: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function nextAction(job, ctx) {
  return nextActions(job, ctx)[0] || null;
}
