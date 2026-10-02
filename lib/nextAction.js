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
import { getJobLines, isAddonCode, jobPayable, gbp } from "./format";
import { isSplit, getVisits, isVisitLive, isVisitConfirmed, blockersForScheduling, visitProgress, jobEngineerIds } from "./visits";
import { engineerDocIssues } from "./engineerDocs";
import { quoteMissing, bookingMissing } from "./gates";

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
  review_request: ["Review request sent"],
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
    if (a.direction === "in" || !["email", "whatsapp"].includes(a.type)) continue;
    if (!latest || new Date(a.at) > new Date(latest)) latest = a.at;
  }
  return latest;
}

// ── What the office wrote in the job's notes ─────────────────────────
//
// The team records where a quote stands in plain words — "hasn't replied
// back to the quote yet", "will reach back on her own, DND", "wants it done
// in a week or 2", "still waiting for handover". Ignoring that is how Next
// step kept saying "Send the quote" for quotes that were obviously sent.
//
// Read conservatively: only the office's own notes count. A job created from
// a website or email enquiry starts with the CLIENT's message in its notes
// ("could you quote for three appliances?") — that's not a status update and
// is skipped while it's still the enquiry text.
const NOTE_RULES = [
  // Order matters: the most decisive signal wins.
  { signal: "declined", re: /\b(not interested|went (with )?elsewhere|found (someone|another)|too expensive|declined|no longer (need|requir)|cancel(led)? (it|the job))/i },
  { signal: "dnd", re: /\bdnd\b|do not (disturb|chase|contact)|don'?t (chase|contact|call)/i },
  { signal: "client_will_revert", re: /\b(will|'ll|to)\s+(reach|get|come)\s+back|\brevert\b|let us know|get back to (us|me)|waiting (for|on) (the )?(handover|keys|tenant|completion|landlord|agent|freeholder)|\bhandover\b/i },
  { signal: "wants_timing", re: /\b(in|within|next)\s+(a\s+|one\s+|two\s+|\d\s+)?(week|weeks|fortnight|month|months)\b|week or (two|2)|last week of|end of (the )?(month|week|january|february|march|april|may|june|july|august|september|october|november|december)|\b(one|two|1|2)\s*(to\s*\w+\s*)?months?\b/i },
  { signal: "sent_no_reply", re: /(hasn'?t|has not|not|no|haven'?t)\s+(yet\s+)?(replied|respond|responded|got back|come back|reply|response|heard)|quote (was )?(sent|given|emailed|whatsapp)|sent (the |a |him |her |them )?(quote|price)|\bchas(ed|ing)\b|followed up/i },
];

export function noteSignals(job) {
  const text = String(job?.notes || "").trim();
  if (!text) return { signals: [], text: "" };
  // Still the enquiry itself? (website / email intake put the client's words here)
  if (["website", "email"].includes(job?.source)) {
    const enquiry = (job.activity || []).find((a) => /enquiry/i.test(a?.title || ""));
    const body = String(enquiry?.detail || "");
    const head = text.replace(/\s+/g, " ").slice(0, 60);
    if (!enquiry || body.replace(/\s+/g, " ").includes(head) || /^subject:/i.test(text)) return { signals: [], text };
  }
  const signals = NOTE_RULES.filter((r) => r.re.test(text)).map((r) => r.signal);
  return { signals, text };
}

const quoteNote = (t) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > 70 ? `${s.slice(0, 70)}…` : s;
};

// How we know the quote went out — so the card can say it, not just assert it.
export function quoteSentEvidence(job) {
  const fmt = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let best = null;
  const consider = (at, how) => { if (at && (!best || at > best.at)) best = { at, how }; };
  consider(job?.quoteSentAt, "marked as sent");
  const tpl = lastSent(job, "quote");
  consider(tpl, "quote emailed from the app");
  for (const a of job?.activity || []) {
    if (a.direction === "in") continue;
    if (a.type === "whatsapp" && a.template === "quote") consider(a.at, "sent on WhatsApp");
    else if (a.type === "email" && a.meta?.via === "webmail") consider(a.at, `you replied from ${a.by || "webmail"}`);
    else if (a.type === "email" && /synced/i.test(a.title || "")) consider(a.at, "emailed from Gmail");
  }
  if (!best) return null;
  return { at: best.at, text: `${best.how} on ${fmt(best.at)}` };
}

const AUTO_REPLY = /out of (the )?office|automatic reply|auto[- ]?reply|autoreply|on annual leave|i am (currently )?away|delivery status notification|undeliverable|mail delivery (failed|subsystem)|do not reply to this (email|message)/i;

// The client wrote to us and nobody has written back since.
export function unansweredReply(job) {
  let lastIn = null;
  let lastOut = null;
  for (const a of job?.activity || []) {
    // The enquiry email that CREATED the quote isn't a reply to chase —
    // answering it is "Send the quote", which is already the next step.
    if (a.direction === "in" && a.handledBy === "enquiry") continue;
    // Out-of-office messages and delivery notices aren't a person asking
    // for something.
    if (a.direction === "in" && AUTO_REPLY.test(`${a.title || ""} ${String(a.detail || "").slice(0, 400)}`)) continue;
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

export function nextActions(job, ctx = {}) {
  const { now = new Date(), engineerName = (id) => id, clientEmail, clientPhone, engineerExists, engineerById, client } = ctx;
  // Only when the caller handed over the client record can the missing
  // details be worked out; without it those rules simply don't fire.
  const property = client ? (client.properties || []).find((p) => p.id === job?.propertyId) || null : undefined;
  const missing = client && job ? quoteMissing(job, { client, property }) : [];
  if (!job) return [];
  const out = [];
  const t = now.getTime();
  const push = (a) => out.push({ severity: "normal", ...a });
  const status = job.status;
  const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const today = now.toISOString().slice(0, 10);

  // 1. A client waiting on us beats everything else.
  const reply = unansweredReply(job);
  if (reply) {
    // The first line that actually says something — not the subject, a
    // "Hi Lisa," greeting, or the quoted "On … wrote:" header.
    const said = String(reply.detail || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^subject:/i.test(l) && !/^>/.test(l) && !/^on .+wrote:?$/i.test(l)
        && !/^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^.?!]{0,30}[,!]?$/i.test(l))[0] || "";
    const days = Math.round((new Date(today) - new Date(new Date(reply.at).toISOString().slice(0, 10))) / DAY);
    push({
      key: "reply", group: "reply", severity: "urgent",
      title: "Reply to the client",
      detail: `They wrote ${days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}${said ? `: “${said.slice(0, 90)}”` : "."}`,
      do: "reply",
      alt: "reply_handled",
    });
  }

  if (status === "cancelled") return out;

  const realLines = getJobLines(job).filter((l) => !isAddonCode(l.code) && !l.cancelled);
  const { signals, text: note } = noteSignals(job);
  const has = (sig) => signals.includes(sig);
  const noteRef = note ? `Your note: “${quoteNote(note)}”` : "";

  // 2. No way to reach the client at all.
  if ((clientEmail !== undefined || clientPhone !== undefined) && !clientEmail && !clientPhone && status !== "paid") {
    push({ key: "no_contact", group: "quote", title: "Add the client's email or phone", detail: "There's no way to send them anything from here.", do: "edit" });
  }

  // ── QUOTE (not yet accepted) ──
  if (status === "quote" && !job.acceptedAt) {
    const hold = job.quoteHoldUntil || null;
    const ev = quoteSentEvidence(job);
    const chasedAt = lastSent(job, "followup") || job.quoteChasedAt || null;
    const chaseCount = (job.activity || []).filter((x) => x.template === "followup" || /follow-up sent/i.test(x.title || "")).length;

    if (!realLines.length) {
      // 3. Nothing to quote yet.
      push({ key: "add_services", group: "quote", title: "Add the services", detail: "This quote has nothing on it yet.", do: "edit" });
    } else if (has("declined")) {
      // 4. Notes say they said no.
      push({ key: "close_declined", group: "quote", title: "Close this quote as declined?", detail: noteRef, do: "decline" });
    } else if (has("dnd")) {
      // 5. Do not chase — nothing to do until they come back.
    } else if (hold && today <= hold) {
      // 6. Parked until a date the client gave.
    } else if (hold && today > hold) {
      // 7. That date has come and gone.
      push({
        key: "hold_over", group: "quote", severity: "urgent",
        title: "Follow up — they were getting back to you",
        detail: `They said they'd come back by ${fmtDay(hold)}.`,
        do: "email:followup", alt: "quote_hold",
      });
    } else if (has("wants_timing") && !has("client_will_revert")) {
      // 8. They want it done, on their timing — that's a booking, not a chase.
      push({
        key: "agree_date", group: "book", severity: "urgent",
        title: "Agree a date with the client",
        detail: `${noteRef} Mark it accepted and book it in.`,
        do: "accept", alt: "quote_hold",
      });
    } else if (has("client_will_revert")) {
      // 9. They'll come back to us — quiet for two weeks, then a gentle check-in.
      const since = ago(job.updatedAt || job.createdAt || now.toISOString(), t);
      if (since >= 14) {
        push({ key: "check_in", group: "quote", title: "Check in with the client", detail: `${noteRef} (${since} days ago)`, do: "email:followup", alt: "quote_hold" });
      }
    } else if (!ev && !has("sent_no_reply")) {
      // 10. No record the quote went anywhere. New today → send it. Older →
      // it was probably sent another way, so ask rather than tell.
      const age = ago(job.createdAt || now.toISOString(), t);
      // A quote the app built itself from a website/email enquiry goes out
      // in three steps, in this order: a person checks it, the client gets
      // a WhatsApp reply so they know we've got it, then the quote is sent
      // with the booking-urgency message. Only for the first week — past
      // that it falls through to "Was the quote sent?" like any other.
      const auto = ["website", "email"].includes(job.source) && age < 7;
      const askedDays = job.detailsRequestedAt ? ago(job.detailsRequestedAt, t) : null;
      if (missing.length && askedDays != null) {
        // Asked the client and still waiting on them: nothing to send yet.
        // Two days of silence earns one nudge.
        if (askedDays >= 2) {
          push({ key: "chase_details", group: "quote", title: "Chase the missing details", detail: `Asked ${askedDays} days ago — still need ${missing.map((m) => m.label).slice(0, 3).join(", ")}.`, do: "intake", alt: "quote_hold" });
        }
      } else if (auto && !job.quoteCheckedAt) {
        push({
          key: "check_quote", group: "quote", severity: "urgent",
          title: "Step 1 of 3 — check the quote",
          detail: `Built automatically from ${job.source === "email" ? "an email" : "a website"} enquiry. Check the services, property size and price (parking is included) against what they wrote.`,
          do: "quote_checked", alt: "edit",
        });
      } else if (missing.length && age < 14) {
        // The quote can't be right without these — ask before pricing.
        push({
          key: "details_required", group: "quote", severity: auto ? "urgent" : "normal",
          title: "Ask for the missing details",
          detail: `Before quoting, we still need ${missing.map((m) => m.label).slice(0, 4).join(", ")}.`,
          do: "intake",
        });
      } else if (auto && clientPhone && !job.enquiryRepliedAt && !job.detailsRequestedAt) {
        // (Asking for the missing details WAS the first reply — no second
        // "we've got your enquiry" message after it.)
        push({
          key: "wa_reply", group: "quote", severity: "urgent",
          title: "Step 2 of 3 — reply to the client on WhatsApp",
          detail: "Let them know we've got their enquiry and the quote is on its way.",
          do: "wa_reply", alt: "wa_reply_done",
        });
      } else if (auto) {
        push({
          key: "send_quote_urgent", group: "quote", severity: "urgent",
          title: `Step ${clientPhone && !job.detailsRequestedAt ? "3 of 3" : "2 of 2"} — send the quote`,
          detail: "Checked and ready — send it to the client.",
          do: "email:quote", alt: "quote_sent",
        });
      } else if (age < 1) {
        push({ key: "send_quote", group: "quote", title: "Send the quote", detail: "New enquiry — no quote sent yet.", do: "email:quote", alt: "quote_sent" });
      } else {
        push({
          key: "was_sent", group: "quote", severity: age >= 2 ? "urgent" : "normal",
          title: "Was the quote sent?",
          detail: `No record of it going out (email, WhatsApp or a note) in ${age} days. Sent it another way? Mark it sent — otherwise send it now.`,
          do: "quote_sent", alt: "email:quote",
        });
      }
    } else {
      // 11–12. Sent, no decision: chase at 2 days, urgently at 5, and after
      // three weeks and a chase, suggest closing it rather than let it rot.
      const basis = ev?.text || noteRef;
      const lastTouch = [ev?.at, chasedAt].filter(Boolean).sort().slice(-1)[0] || job.updatedAt || job.createdAt;
      const since = ago(lastTouch, t);
      const sentDays = ev?.at ? ago(ev.at, t) : null;
      // The quote never goes alone: a short WhatsApp goes with it, asking
      // them to reply soon so a slot can be held. Offered for two days
      // after the quote went out, once.
      if (clientPhone && !job.quoteNudgeAt && sentDays != null && sentDays < 2) {
        push({
          key: "quote_nudge", group: "quote", severity: "urgent",
          title: "Send the booking message with the quote",
          detail: "The quote has gone — follow it on WhatsApp so they reply and get booked in.",
          do: "wa_nudge", alt: "wa_nudge_done",
        });
      }
      if (sentDays != null && sentDays >= 30) {
        // The quote says it's valid for 30 days. Past that the price isn't
        // a promise any more — send a fresh one or close it.
        push({ key: "quote_expired", group: "quote", title: "Quote expired — re-quote or close it", detail: `Sent ${sentDays} days ago; quotes are valid for 30.`, do: "email:quote", alt: "decline" });
      } else if (since >= 21 && chaseCount >= 1) {
        push({ key: "close_stale", group: "quote", title: "No reply in 3 weeks — close it?", detail: `Chased ${chaseCount}×, last ${since} days ago.`, do: "decline", alt: "email:followup" });
      } else if (since >= 2) {
        push({
          key: "chase_quote", group: "quote", severity: since >= 5 ? "urgent" : "normal",
          title: chasedAt ? "Chase the quote again" : "Chase the quote",
          detail: `${chasedAt ? `Last chased ${since} days ago` : `Sent — ${basis}`}. No decision yet.`,
          do: "email:followup", alt: "quote_hold",
        });
      }
    }
    return out;
  }

  const appt = job.scheduledAt ? new Date(job.scheduledAt).getTime() : null;

  // ── BOOKING (accepted, scheduled, under way) ──
  if (["quote", "scheduled", "in_progress"].includes(status)) {
    const blockers = blockersForScheduling(job, engineerName);
    // 13. The appointment date went by and it was never actually booked —
    // a job stuck forever unless someone rebooks it with the client.
    const missed = isSplit(job)
      ? getVisits(job).filter((v) => isVisitLive(job, v) && v.scheduledAt && new Date(v.scheduledAt).getTime() < t
          && !["in_progress", "completed"].includes(v.status) && !isVisitConfirmed(v))
      : (appt && appt < t && (status === "quote" || !job.engineerId || job.engineerId === "unassigned") ? [{ scheduledAt: job.scheduledAt }] : []);
    if (missed.length) {
      push({
        key: "missed_appt", group: "book", severity: "urgent",
        title: "Reschedule — that appointment was never confirmed",
        detail: `${fmtDay(missed[0].scheduledAt)} has passed without a confirmed engineer. Agree a new date with the client.`,
        do: "reschedule",
      });
    }
    for (const b of blockers) {
      const confirm = /hasn't confirmed/.test(b);
      const noDate = /no appointment date/.test(b);
      if (missed.length && (confirm || /no engineer/.test(b))) continue;
      if (confirm && status === "in_progress") continue;
      const soon = appt && appt - t < 2 * DAY && appt > t;
      push({
        key: `block:${b}`, group: confirm ? "confirm" : "book",
        severity: soon || (job.acceptedAt && ago(job.acceptedAt, t) >= 2) ? "urgent" : "normal",
        // 14–16. Engineer to confirm (and if it's within 48h, reschedule as
        // the fallback); no engineer; no date.
        title: confirm ? (soon ? "Engineer hasn't confirmed — confirm or reschedule" : "Get the engineer to confirm")
          : noDate ? "Book a date" : "Assign an engineer",
        detail: soon ? `${b}. Appointment is ${fmtDay(job.scheduledAt)} — if they can't, rebook with the client.` : b,
        do: confirm ? "confirm" : "book",
        ...(confirm && soon ? { alt: "reschedule" } : {}),
      });
    }
    if (status === "quote" && job.acceptedAt && !blockers.length) {
      push({ key: "schedule", group: "book", title: "Mark it scheduled", detail: "Accepted and fully booked.", do: "status:scheduled" });
    }
    // 17. The engineer on the job has been removed.
    if (engineerExists && job.engineerId && job.engineerId !== "unassigned" && !engineerExists(job.engineerId)) {
      push({ key: "eng_gone", group: "book", severity: "urgent", title: "Reassign — that engineer was removed", detail: "The engineer on this job no longer exists.", do: "book" });
    }
  }

  // 37. Accepted or booked, but the booking itself is missing something —
  // the address, who lets the engineer in, a number to reach them on. An
  // engineer can confirm from their link at any time, so this is checked
  // here rather than trusted to a button having been pressed in order.
  if (client && ["quote", "scheduled"].includes(status) && (job.acceptedAt || status === "scheduled") && (!appt || appt > t)) {
    const need = bookingMissing(job, { client, property });
    if (need.length) {
      push({
        key: "booking_details", group: "book", severity: "urgent",
        title: "Add the booking details",
        detail: `Still missing ${need.map((m) => m.label).join(", ")}.`,
        do: "intake",
      });
    }
  }

  // 30. Someone on this job has lapsed or missing paperwork for it (a gas
  // job on an expired Gas Safe card is the one that ends in real trouble).
  if (engineerById && ["quote", "scheduled", "in_progress"].includes(status) && (!appt || appt > t - DAY)) {
    for (const eid of jobEngineerIds(job)) {
      if (!eid || eid === "unassigned") continue;
      const eng = engineerById(eid);
      if (!eng) continue;
      const bad = engineerDocIssues(eng, now).filter((i) => i.kind === "expired" || (i.kind === "missing" && i.type !== "insurance"));
      if (bad.length) {
        push({
          key: `eng_docs:${eid}`, group: "book", severity: bad.some((i) => i.kind === "expired") ? "urgent" : "normal",
          title: `Check ${eng.name}'s paperwork`,
          detail: bad.map((i) => `${i.label} ${i.kind === "expired" ? `expired ${new Date(i.expiresAt).toLocaleDateString("en-GB")}` : "not on file"}`).join(" · "),
          do: "engineer",
        });
      }
    }
  }

  // 18. Booked without the client's acceptance on record (upcoming only).
  const apptAhead = !!appt && appt > t;
  if (status === "scheduled" && !job.acceptedAt && apptAhead) {
    push({
      key: "confirm_accept", group: "book", severity: "urgent",
      title: "Has the client accepted?",
      detail: "This job is booked, but the client's acceptance was never recorded.",
      do: "accept", alt: "status:quote",
    });
  }

  // 19. Accepted and booked, but the client hasn't been told when.
  // Never before every engineer on the job has confirmed: the client is
  // not told "booked" until someone has actually agreed to attend.
  const engineersConfirmed = blockersForScheduling(job, engineerName).length === 0
    && !(client && bookingMissing(job, { client, property }).length);
  if (["scheduled", "in_progress"].includes(status) && job.acceptedAt && apptAhead && engineersConfirmed && !lastSent(job, "booking")) {
    push({
      key: "booking_email", group: "tell_client",
      severity: appt - t < 2 * DAY ? "urgent" : "normal",
      title: "Send the booking confirmation",
      detail: `The client hasn't been sent ${fmtDay(job.scheduledAt)}'s date and arrival window.`,
      do: "email:booking",
    });
  }
  // 20. Appointment tomorrow — a reminder cuts no-access visits.
  if (status === "scheduled" && apptAhead && appt - t < 30 * 60 * 60 * 1000 && lastSent(job, "booking") && !lastSent(job, "reminder")) {
    push({ key: "reminder", group: "tell_client", title: "Send the appointment reminder", detail: `Appointment ${fmtDay(job.scheduledAt)} — a reminder the day before cuts no-access visits.`, do: "email:reminder" });
  }

  // 32. Appointment within two days and nobody has confirmed that someone
  // will be there to let the engineer in.
  if (status === "scheduled" && apptAhead && appt - t < 2 * DAY && !job.accessConfirmedAt) {
    push({
      key: "access", group: "tell_client", severity: appt - t < DAY ? "urgent" : "normal",
      title: "Confirm access for the appointment",
      detail: `${fmtDay(job.scheduledAt)} — check someone will be there to let the engineer in.`,
      do: "access", alt: "access_confirmed",
    });
  }

  // 33. The client gave a deadline and the work isn't booked inside it.
  if (job.deadline && ["quote", "scheduled"].includes(status)) {
    const left = Math.ceil((new Date(`${job.deadline}T23:59:59Z`).getTime() - t) / DAY);
    const bookedInTime = job.scheduledAt && job.scheduledAt.slice(0, 10) <= job.deadline;
    if (left <= 5 && !bookedInTime) {
      push({
        key: "deadline", group: "book", severity: "urgent",
        title: left < 0 ? "The client's deadline has passed" : left === 0 ? "The client's deadline is today" : `The client's deadline is in ${left} day${left === 1 ? "" : "s"}`,
        detail: `${job.urgencyReason ? `${job.urgencyReason}. ` : ""}Needed by ${fmtDay(`${job.deadline}T12:00:00Z`)} and not booked before then.`,
        do: "book",
      });
    }
  }

  // 21. The appointment day is over and the job still reads as open.
  if (["scheduled", "in_progress"].includes(status)) {
    const visits = getVisits(job).filter((v) => isVisitLive(job, v) && v.status !== "completed");
    const overdue = visits.filter((v) => {
      const end = endOfApptDay(v.scheduledAt || job.scheduledAt);
      return end && end < t && (!isSplit(job) || ["scheduled", "in_progress"].includes(v.status));
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

  // 22. Part done: book the rest (if it has no date), or bill what's done.
  if (isSplit(job) && status === "in_progress") {
    const p = visitProgress(job);
    if (p.done > 0 && !p.allDone) {
      const undated = getVisits(job).filter((v) => isVisitLive(job, v) && v.status !== "completed" && !v.scheduledAt).length;
      push({
        key: "partial", group: undated ? "book" : "invoice",
        title: undated ? "Book the rest of the job" : "Bill what's done, rebook the rest",
        detail: `${p.done} of ${p.total} visits done${undated ? ` — ${undated} still has no date` : ""}.`,
        do: "partial",
      });
    }
  }

  // 23. Billed with a visit left open (last 14 days).
  if (["invoiced", "paid"].includes(status) && isSplit(job)) {
    const open = getVisits(job).filter((v) => isVisitLive(job, v) && v.status !== "completed");
    const past = open.filter((v) => v.scheduledAt && endOfApptDay(v.scheduledAt) < t && t - new Date(v.scheduledAt).getTime() <= 14 * DAY);
    if (past.length) {
      push({
        key: "open_visit", group: "close", severity: "urgent",
        title: past.length > 1 ? "Close the finished visits" : "Close the finished visit",
        detail: `This job is ${status}, but ${past.length} visit${past.length > 1 ? "s are" : " is"} still open — mark done, or record what wasn't.`,
        do: "partial",
      });
    }
  }

  // 24. The price and the services disagree — the invoice would bill a
  // different figure from what reports count.
  if (["quote", "scheduled", "in_progress", "completed"].includes(status) && realLines.length && Number(job.price) > 0) {
    const fromLines = jobPayable(job);
    if (Math.abs((Number(job.price) || 0) - fromLines) >= 0.01) {
      push({ key: "price_drift", group: "invoice", title: "Price doesn't match the services", detail: `Job says ${gbp(job.price)}, services add up to ${gbp(fromLines)}.`, do: "edit" });
    }
  }

  // ── Finished: invoice → payment → certificate ──
  if (status === "completed") {
    if (!(Number(job.price) > 0)) {
      // 25. Nothing to invoice without a price.
      push({ key: "price", group: "invoice", title: "Set the price", detail: "Work is done but the job has no price — there's nothing to invoice yet.", do: "edit" });
    } else {
      // 26. Done but not billed.
      push({
        key: "invoice", group: "invoice", severity: job.completedAt && ago(job.completedAt, t) >= 2 ? "urgent" : "normal",
        title: "Send the invoice",
        detail: job.completedAt ? `Completed ${ago(job.completedAt, t) === 0 ? "today" : `${ago(job.completedAt, t)}d ago`} — nothing billed yet.` : "Work is done — nothing's been billed.",
        do: "invoice", alt: "status:paid",
      });
    }
  }
  if (status === "invoiced") {
    // 27. Payment chasing, escalating: 7 → 14 → 30 days.
    const autoChased = job.paymentChasedAt && ago(job.paymentChasedAt, t) < 6;
    const since = autoChased ? null : job.invoicedAt ? ago(job.invoicedAt, t) : null;
    if (since != null && since >= 30) {
      push({ key: "chase_payment", group: "payment", severity: "urgent", title: "30+ days unpaid — call the client", detail: `Invoiced ${since} days ago. Already paid? Mark it paid.`, do: "email:invoice", alt: "status:paid" });
    } else if (since != null && since >= 7) {
      push({ key: "chase_payment", group: "payment", severity: since >= 14 ? "urgent" : "normal", title: "Chase payment", detail: `Invoiced ${since} days ago, still unpaid. Already paid? Mark it paid.`, do: "email:invoice", alt: "status:paid" });
    }
  }
  // 34. Work done a day or more ago and no certificate has come in from
  // the engineer yet.
  if (["completed", "invoiced"].includes(status) && realLines.length && !hasCertificate(job)) {
    const doneAt = job.completedAt || job.invoicedAt;
    const d = doneAt ? ago(doneAt, t) : null;
    if (d != null && d >= 1 && d <= 30) {
      push({ key: "doc_pending", group: "certificate", severity: d >= 3 ? "urgent" : "normal", title: "Chase the engineer for the certificate", detail: `Work was completed ${d} day${d === 1 ? "" : "s"} ago and no document has been uploaded.`, do: "upload" });
    }
  }
  // 35. A correction to a certificate was asked for and isn't finished.
  const openAmend = (job.amendments || []).filter((a) => !a.resolvedAt);
  if (openAmend.length) {
    push({ key: "amendment", group: "certificate", severity: "urgent", title: "Certificate correction outstanding", detail: openAmend.map((a) => a.what).join("; ").slice(0, 140), do: "upload" });
  }
  // 36. A payment came in that doesn't match the invoice.
  if (job.paymentMismatch && !job.paymentMismatch.resolvedAt) {
    push({ key: "mismatch", group: "payment", severity: "urgent", title: "Payment doesn't match the invoice", detail: job.paymentMismatch.note || "", do: "payment" });
  }

  // 28. Paid → certificate → Certified (recent work only).
  const paidAt = job.paidAt || job.invoicedAt || job.completedAt || job.scheduledAt;
  const recent = paidAt && t - new Date(paidAt).getTime() <= 14 * DAY;
  if (status === "paid" && !isCertified(job) && realLines.length && recent) {
    if (!hasCertificate(job)) {
      push({ key: "upload_cert", group: "certificate", title: "Upload the certificate", detail: "Paid — upload the certificate and send it to finish the job.", do: "upload" });
    } else if (openAmend.length) {
      // Being corrected — "Certificate correction outstanding" above covers it.
    } else if (!job.certCheckedAt) {
      // It can't be sent until someone has checked it against the job.
      push({ key: "check_cert", group: "certificate", title: "Check the certificate", detail: "It's uploaded — tick the checklist in the Certificate panel, then send it.", do: "certcheck" });
    } else {
      push({ key: "send_cert", group: "certificate", title: "Send the certificate", detail: "Paid and uploaded — send it to the client to finish the job.", do: "email:certificate", alt: "certify" });
    }
  }

  // 31. Certified a few days ago and nobody has asked for a review. Asked
  // once, while the job is still fresh; "Skip" stops it asking again.
  if (isCertified(job) && !job.reviewSkipped && !lastSent(job, "review_request")
      && !(job.activity || []).some((a) => /review/i.test(a.title || ""))) {
    const certAt = job.certifiedAt || job.certificateSentAt;
    const d = certAt ? ago(certAt, t) : null;
    if (d != null && d >= 3 && d <= 30) {
      push({ key: "review", group: "tell_client", title: "Ask for a review", detail: `Certificate went out ${d} days ago — a good moment to ask.`, do: "email:review_request", alt: "review_skip" });
    }
  }

  // 29. Nothing else flagged, but an open job hasn't moved in two weeks.
  if (!out.length && ["quote", "scheduled", "in_progress"].includes(status) && (!appt || appt < t)) {
    const idle = ago(job.updatedAt || job.createdAt || now.toISOString(), t);
    if (idle >= 14) {
      push({ key: "idle", group: "book", title: `No progress in ${idle} days`, detail: "Nothing has changed on this job for two weeks — what's the next step?", do: "edit" });
    }
  }

  const rank = { urgent: 0, normal: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function nextAction(job, ctx) {
  return nextActions(job, ctx)[0] || null;
}

// ── Stages (re-exported by lib/stages.js) ──

export function isCertified(job) {
  return job?.status === "paid" && !!(job.certifiedAt || job.certificateSentAt);
}

export function jobStage(job, now = new Date()) {
  if (!job) return "quote";
  return isCertified(job) ? "certified" : liveStatus(job, now);
}

export const QUOTE_STAGES = [
  { key: "new", label: "New enquiry" },
  { key: "details", label: "Details required" },
  { key: "sent", label: "Quote sent" },
  { key: "chasing", label: "Following up" },
  { key: "on_hold", label: "Will get back" },
  { key: "accepted", label: "Accepted · booking" },
];

// When was the quote sent? Only real evidence counts (see quoteSentEvidence):
// our quote email, a WhatsApp quote, a webmail/Gmail reply, or "mark sent".
export function quoteSentAt(job) {
  return quoteSentEvidence(job)?.at || null;
}

// `client` is optional: with it, "Details required" clears as soon as the
// missing details have been filled in, rather than when the quote goes out.
export function quoteStage(job, now = new Date(), client) {
  if (!job || job.status !== "quote") return null;
  if (job.acceptedAt) return "accepted";
  const { signals } = noteSignals(job);
  if (job.quoteHoldUntil && new Date(job.quoteHoldUntil) >= new Date(now.toISOString().slice(0, 10))) return "on_hold";
  if (signals.includes("dnd") || signals.includes("client_will_revert")) return "on_hold";
  if (lastSent(job, "followup") || job.quoteChasedAt) return "chasing";
  if (quoteSentAt(job) || signals.includes("sent_no_reply") || signals.includes("wants_timing")) return "sent";
  // Asked the client for what's missing and waiting to hear back.
  if (job.detailsRequestedAt) {
    if (!client) return "details";
    const property = (client.properties || []).find((p) => p.id === job.propertyId) || null;
    if (quoteMissing(job, { client, property }).length) return "details";
  }
  return "new";
}

// What the app should SHOW for a job's stage, live. A booked job whose
// appointment time has arrived reads "In progress" straight away — the
// background check that saves it can lag (it runs while someone has the app
// open, and a daily server backstop), and "why isn't it in progress?" was the
// visible symptom of that lag.
export function liveStatus(job, now = new Date()) {
  if (job?.status !== "scheduled") return job?.status;
  if (isSplit(job)) {
    const due = (job.visits || []).some((v) => isVisitLive(job, v) && isVisitConfirmed(v) && v.scheduledAt && new Date(v.scheduledAt).getTime() <= now.getTime() && v.status !== "completed");
    return due ? "in_progress" : "scheduled";
  }
  const booked = job.scheduledAt && job.engineerId && job.engineerId !== "unassigned";
  return booked && new Date(job.scheduledAt).getTime() <= now.getTime() ? "in_progress" : "scheduled";
}
