"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiMail, FiSend, FiX, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import Modal from "./Modal";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";
import { serviceLabel, suggestedPrice, nextRenewalDue } from "@/lib/prospects";

// Server-side cap (mirror of /api/send-email DAILY_CAP) — we cap at 400 to
// keep headroom under Gmail's ~500/day soft limit. The server enforces this
// hard; this constant only drives the warning shown in the UI.
const DAILY_CAP = 400;
const SEND_DELAY_MS = 1500; // throttle so Gmail doesn't flag the burst as spam

const DEFAULT_SUBJECT = "{{service}} renewal due — {{address}}";
const DEFAULT_BODY =
  "Hi {{name}},\n\n" +
  "This is Lisa from Landlord Compliance London. I noticed the {{service}} at {{address}} " +
  "is coming up for renewal{{renewal}} — I wanted to get in touch before it lapses.\n\n" +
  "We cover the full range of compliance certs across London — Gas Safety (CP12), EICR, EPC, " +
  "FRA, PAT and Fire Alarm servicing — and can usually get an engineer out within 24–48 hours, " +
  "with the signed certificate emailed over the same day.\n\n" +
  "If you'd like a fixed quote or to get it booked in, just reply to this email or call us on " +
  "07426 409342 and we'll arrange a time that works around the tenant.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

const LONG_CYCLE_SUBJECT = "Checking in on your {{service}} at {{address}}";
const LONG_CYCLE_BODY =
  "Hi {{name}},\n\n" +
  "This is Lisa from Landlord Compliance London. I wanted to check in on your {{service}} at {{address}} and see how it's going.\n\n" +
  "If anything needs to be changed, fixed, or if a new inspection needs to be done, we can get it covered for you. Other than that, if a Gas Safety (CP12), EPC, PAT or any other service is needed, we've got you covered.\n\n" +
  "Our engineers are 100% certified, and we can usually book you in within the same week. We also deliver the signed certificate within 24 hours of the visit.\n\n" +
  "If you'd like a fixed quote or to get it booked in, just reply to this email or call us on " +
  "07426 409342.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

// For prospects whose last job on file is 2+ years stale (2024, 2023, 2022…
// against the current 2026), the DEFAULT/LONG_CYCLE copy's "coming up for
// renewal" framing gets less credible the older the data is — we genuinely
// don't know the property's current status that far out. Softer, service-
// agnostic check-in copy instead: note what's on file, offer to help keep
// things compliant, no claim about exact timing or that we personally did
// the original work.
const STALE_SUBJECT = "Checking your {{service}} compliance at {{address}}";
const STALE_BODY =
  "Hi {{name}},\n\n" +
  "This is Lisa from Landlord Compliance London. I wanted to check in on the {{service}} at {{address}} and make sure the property is fully compliant.\n\n" +
  "If it's due for renewal, or if anything needs fixing, updating, or a new inspection, we're happy to help get it sorted — we cover Gas Safety Certificates (CP12), EICR, EPC, Fire Risk Assessments, PAT Testing and Fire Alarm/Emergency Lighting servicing across London.\n\n" +
  "If you'd like a fixed quote or to get anything booked in, just reply to this email or call us on 07426 409342.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

const GENERAL_OFFER_SUBJECT = "Compliance services for your property at {{address}}";
const GENERAL_OFFER_BODY =
  "Hi {{name}},\n\n" +
  "This is Lisa from Landlord Compliance London. I'm getting in touch to offer our compliance services for your property at {{address}}.\n\n" +
  "We cover Gas Safety Certificates (CP12), EICR, EPC, Fire Risk Assessments, PAT Testing and Fire Alarm/Emergency Lighting servicing across London.\n\n" +
  // GAS is the one service here we can credibly put a timeframe on — it
  // renews every 12 months without fail, so "might be coming up" is a fair,
  // soft claim. Everything else stays renewal-date-free — we don't
  // actually know the status of a service we've never been told about.
  "If it's been a year or so since your last Gas Safety Certificate, it might be coming up for renewal soon — worth getting that booked in. For anything else, we're happy to check what's needed and get it sorted for you.\n\n" +
  "We highly recommend keeping all property compliances fully up to date — many landlords are currently facing fines due to late or missing compliances. Our engineers are 100% certified, and we can usually book you in within the same week, with the signed certificate delivered within 24 hours of the visit.\n\n" +
  "If you'd like a fixed quote or to get anything booked in, just reply to this email or call us on 07426 409342.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

function mergeFields(tpl, p, { upliftPct, company }) {
  const due = nextRenewalDue(p);
  const sp = suggestedPrice(p, upliftPct);
  const service = p.services.map(serviceLabel).join(", ") || "compliance certificate";
  const map = {
    name: p.nameOnCert || p.ownerName || "there",
    service,
    address: p.address || "your property",
    lastDone: p.jobDate || "last year",
    renewal: due ? ` around ${due.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "",
    lastInvoice: p.invoiceAmount != null ? `£${p.invoiceAmount.toFixed(2)}` : "",
    suggested: sp != null ? `£${sp.toFixed(2)}` : "",
    priceLine: sp != null ? ` for ${"£" + sp.toFixed(2)}` : "",
    company: company || "Landlord Compliance London",
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (map[k] != null ? map[k] : ""));
}

// Chase copy must match the tone/claims of whichever PRIMARY template sent
// it — a generic "quick follow-up" chase was going out regardless of
// whether the primary was the urgent Gas/EPC deadline copy, the neutral
// EICR/FRA check-in, the soft stale-lead check-in, or the general offer.
// Each variant below mirrors its primary's framing exactly (same claims
// allowed/disallowed) rather than reverting to one-size-fits-all follow-up.
const DEFAULT_CHASE_SUBJECT = "Quick follow-up — {{service}} at {{address}}";
const DEFAULT_CHASE_BODY =
  "Hi {{name}},\n\n" +
  "It's Lisa from Landlord Compliance London — just following up on my note about the {{service}} at {{address}}.\n\n" +
  "I know compliance deadlines can sneak up — if it would help, we can turn this around quickly " +
  "with minimal disruption to the tenant. Engineer out within 48 hours, cert back the same day.\n\n" +
  "Happy to send a fixed quote first if that's easier — just reply with a good time to call.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

const LONG_CYCLE_CHASE_SUBJECT = "Following up — {{service}} at {{address}}";
const LONG_CYCLE_CHASE_BODY =
  "Hi {{name}},\n\n" +
  "It's Lisa from Landlord Compliance London — just following up on my note about the {{service}} at {{address}}.\n\n" +
  "If anything needs sorting or a new inspection is needed, happy to get it booked in whenever's convenient — just reply or call.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

const STALE_CHASE_SUBJECT = "Following up — {{service}} at {{address}}";
const STALE_CHASE_BODY =
  "Hi {{name}},\n\n" +
  "It's Lisa from Landlord Compliance London — just following up to check in on the {{service}} at {{address}}.\n\n" +
  "If it's due for renewal or anything needs sorting, happy to help whenever's convenient — just reply or call.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

const GENERAL_OFFER_CHASE_SUBJECT = "Following up — compliance services for {{address}}";
const GENERAL_OFFER_CHASE_BODY =
  "Hi {{name}},\n\n" +
  "It's Lisa from Landlord Compliance London — just following up on my note about compliance services for {{address}} (Gas Safety CP12, EICR, EPC, FRA, PAT and Fire Alarm servicing).\n\n" +
  "If it's been a while since your last Gas Safety Certificate, it might be worth getting that booked in — happy to check anything else that's due too.\n\n" +
  "Many landlords are currently facing fines due to late or missing compliances, so it's worth getting everything checked. Happy to send a fixed quote — just reply or call.\n\n" +
  "Kind regards,\nLisa\n{{company}}";

export default function ProspectCampaign({ open, onClose, recipients, email, onLog, title = "Renewal campaign · Prospects" }) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [uplift, setUplift] = useState(0);
  const [bccSelf, setBccSelf] = useState(true);
  // Locked ON, not a togglable preference — after prospects got emailed
  // multiple times, "skip already contacted" is no longer something an
  // operator (or agent) can turn off from this modal. The server enforces
  // it too (see /api/campaigns/enqueue's live lastContactedAt check), so
  // this isn't just a client-side courtesy — it can't be bypassed by
  // spoofing the request either.
  const skipContacted = true;
  // Deliberate, narrow escape hatch for skipContacted: a hand-picked resend
  // to a small, specific set of people (testing, "they say they never got
  // it, resend with edited copy") is a real, legitimate case — but it must
  // stay an explicit per-send choice, never a persisted preference, or it
  // quietly becomes the same accidental-mass-resend hole this was built to
  // close. Only offered at all when the recipient list is small (see
  // OVERRIDE_MAX below) and always resets to off on reopen. The server
  // enforces the same cap independently — this checkbox can't be used to
  // sneak an override into a real bulk blast even if someone edits the
  // request by hand.
  const [overrideContacted, setOverrideContacted] = useState(false);
  const OVERRIDE_MAX = 10;
  const [campaignLabel, setCampaignLabel] = useState("");
  // Follow-up chase scheduling
  const [chaseOn, setChaseOn] = useState(true);
  const [chaseDays, setChaseDays] = useState(3);
  const [chaseSubject, setChaseSubject] = useState(DEFAULT_CHASE_SUBJECT);
  const [chaseBody, setChaseBody] = useState(DEFAULT_CHASE_BODY);
  const [sending, setSending] = useState(false);
  // Once a queue POST has succeeded, the send button is permanently retired
  // for this modal instance — no amount of re-clicking (by this user or
  // anyone else at the keyboard) can queue the same recipients a second
  // time. Reopening the modal (fresh recipients from the parent list, which
  // by then reflects the real "contacted" state) is the only way to send
  // again. This is what actually stops the double-send: the server-side
  // dedup only closes the gap on retries after a delay, but a re-click a
  // second after the first click was landing before either row's status
  // could change — this flag closes that instantly, client-side.
  const [queuedOnce, setQueuedOnce] = useState(false);
  const [progress, setProgress] = useState(null); // {sent, failed, total, scheduled}
  const [quota, setQuota] = useState(null);       // { sentToday, dailyCap, remaining }
  const stopRef = useRef(false);

  // Reset the lock whenever the modal is freshly opened with a new recipient
  // set — otherwise a second campaign later in the same session would find
  // itself permanently disabled from the last one.
  useEffect(() => {
    if (open) { setQueuedOnce(false); setProgress(null); setOverrideContacted(false); }
  }, [open]);

  // Pull today's quota from the server whenever the modal opens or after a
  // send finishes, so the user always sees an accurate "X / 400" number.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token || "";
        const res = await fetch("/api/email-log?limit=1", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!cancelled && json?.quota) setQuota(json.quota);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Auto-select template based on service type AND how stale the prospect's
  // data is. Prospects carry their service codes as `services` (an array,
  // e.g. ["EICR"]) with `primaryService` as a fallback — there is no
  // singular `service` field, so this check was silently always false and
  // every campaign defaulted to the Gas/EPC copy regardless of which
  // service the recipients were actually filtered by.
  useEffect(() => {
    if (!open) return;
    const isGeneralOffer = (recipients || []).some(p => {
      const codes = (p.services?.length ? p.services : [p.primaryService]).filter(Boolean);
      return codes.some((c) => /REMEDIAL|CONFIRM/i.test(String(c)));
    });
    // 2+ years since the last job on file — "coming up for renewal" gets
    // less credible the older the data is (we don't know the property's
    // current status that far out), regardless of which service it is.
    // Takes priority over the EICR/FRA long-cycle copy for the same reason.
    const isStale = (recipients || []).some(p => {
      if (!p.jobDate) return false;
      const y = new Date(p.jobDate).getFullYear();
      if (!y || Number.isNaN(y)) return false;
      return new Date().getFullYear() - y >= 2;
    });
    const isLongCycle = (recipients || []).some(p => {
      const codes = (p.services?.length ? p.services : [p.primaryService]).filter(Boolean);
      return codes.some((c) => /EICR|FRA|FIRE/i.test(String(c)));
    });
    if (isGeneralOffer) {
      setSubject(GENERAL_OFFER_SUBJECT);
      setBody(GENERAL_OFFER_BODY);
      setChaseSubject(GENERAL_OFFER_CHASE_SUBJECT);
      setChaseBody(GENERAL_OFFER_CHASE_BODY);
    } else if (isStale) {
      setSubject(STALE_SUBJECT);
      setBody(STALE_BODY);
      setChaseSubject(STALE_CHASE_SUBJECT);
      setChaseBody(STALE_CHASE_BODY);
    } else if (isLongCycle) {
      setSubject(LONG_CYCLE_SUBJECT);
      setBody(LONG_CYCLE_BODY);
      setChaseSubject(LONG_CYCLE_CHASE_SUBJECT);
      setChaseBody(LONG_CYCLE_CHASE_BODY);
    } else {
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
      setChaseSubject(DEFAULT_CHASE_SUBJECT);
      setChaseBody(DEFAULT_CHASE_BODY);
    }
  }, [open, recipients]);

  // The override is only offered at all for a small, hand-picked list — a
  // real bulk send never qualifies, so there's no way to "accidentally"
  // resend to a whole segment by leaving this checked.
  const canOverrideContacted = (recipients?.length || 0) > 0 && (recipients?.length || 0) <= OVERRIDE_MAX;

  // Eligible = has an email, not DNC/won, not already contacted — unless the
  // operator explicitly opted into resending to this specific small list.
  const eligible = useMemo(() => {
    const allowContacted = overrideContacted && canOverrideContacted;
    return (recipients || []).filter((p) => {
      if (!p.contactEmail || !/@/.test(p.contactEmail)) return false;
      if (p.stage === "dnc" || p.stage === "won") return false;
      if (!allowContacted && p.lastContactedAt) return false;
      return true;
    });
  }, [recipients, overrideContacted, canOverrideContacted]);

  // Breakdown of WHY the excluded ones were excluded — shown before send so
  // the "X eligible" number is auditable instead of a black box. This is
  // computed from the same recipients prop the eligible list uses, so it's
  // only as fresh as the client's local data — the server re-checks
  // lastContactedAt against the live prospect record independently at
  // enqueue time regardless of what this shows.
  const skipBreakdown = useMemo(() => {
    let noEmail = 0, dncWon = 0, alreadyContacted = 0;
    (recipients || []).forEach((p) => {
      if (!p.contactEmail || !/@/.test(p.contactEmail)) { noEmail++; return; }
      if (p.stage === "dnc" || p.stage === "won") { dncWon++; return; }
      if (p.lastContactedAt) { alreadyContacted++; return; }
    });
    return { noEmail, dncWon, alreadyContacted };
  }, [recipients]);

  const preview = eligible[0]
    ? {
        subject: mergeFields(subject, eligible[0], { upliftPct: uplift, company: email?.fromName }),
        body: mergeFields(body, eligible[0], { upliftPct: uplift, company: email?.fromName }),
        to: eligible[0].contactEmail,
      }
    : null;

  const remainingToday = quota ? quota.remaining : DAILY_CAP;
  const willExhaustQuota = eligible.length > remainingToday;
  const overCap = eligible.length > DAILY_CAP;
  const effectiveLabel = campaignLabel.trim() || subject.slice(0, 80);

  const send = () => {
    if (!eligible.length) { toast.error("No eligible recipients"); return; }
    if (sending || queuedOnce) return; // already sent/queued (or mid-send) — refuse a second fire
    if (eligible.length <= OVERRIDE_MAX) return sendImmediate();
    return sendQueued();
  };

  // Small, hand-picked lists (≤OVERRIDE_MAX) send immediately — one real,
  // awaited /api/send-email call per recipient, right now, with genuine
  // per-recipient success/failure. This is deliberately NOT the queue path:
  // a one-off deliberate resend (which is exactly what the "include already
  // contacted" override exists for) needs to actually confirm delivery in
  // this session, not depend on a cron tick or self-chain firing later —
  // that dependency is precisely what made the original "FSM says sent but
  // nothing arrived" bug so hard to pin down. Bulk campaigns (>OVERRIDE_MAX
  // recipients) still use the drip queue below — that's genuinely the right
  // tool once you're sending to dozens/hundreds of people.
  const sendImmediate = async () => {
    setSending(true);
    setProgress({ sent: 0, failed: 0, total: eligible.length, scheduled: 0, queued: false, immediate: true });

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token || "";

    let sentCount = 0, failedCount = 0;
    const sentProspects = [];
    const failures = [];
    for (const p of eligible) {
      if (stopRef.current) break;
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            to: p.contactEmail,
            subject: mergeFields(subject, p, { upliftPct: uplift, company: email?.fromName }),
            text: mergeFields(body, p, { upliftPct: uplift, company: email?.fromName }),
            fromName: email?.fromName,
            replyTo: email?.replyTo,
            bcc: bccSelf ? email?.fromEmail : undefined,
            prospectId: p.id,
            campaignLabel: effectiveLabel,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          sentCount++;
          sentProspects.push(p);
          onLog?.(p.id, { channel: "email", note: `Campaign send · ${effectiveLabel}` }, p.stage === "new" ? "contacted" : undefined);
        } else {
          failedCount++;
          failures.push({ to: p.contactEmail, error: data?.error || `HTTP ${res.status}` });
          // Gmail's own daily cap was hit — every remaining recipient would
          // fail the exact same way, so stop here instead of working through
          // the rest with doomed sends.
          if (data?.quotaReached) { stopRef.current = true; }
        }
      } catch (err) {
        failedCount++;
        failures.push({ to: p.contactEmail, error: err?.message || "network error" });
      }
      setProgress({ sent: sentCount, failed: failedCount, total: eligible.length, scheduled: 0, queued: false, immediate: true, failures: [...failures] });
      if (!stopRef.current) await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }

    // Schedule chases for whoever actually got the primary — reuses the
    // queue endpoint's chase logic via primariesAlreadySent, which skips
    // primary insertion/dedup entirely (those people were just individually,
    // successfully sent above) and only inserts the follow-up rows.
    let chaseCount = 0;
    if (chaseOn && chaseSubject.trim() && chaseBody.trim() && sentProspects.length) {
      try {
        const chasePrimaries = sentProspects.map((p) => ({
          prospectId: p.id,
          toEmail: p.contactEmail,
          subject: mergeFields(subject, p, { upliftPct: uplift, company: email?.fromName }),
          body: mergeFields(body, p, { upliftPct: uplift, company: email?.fromName }),
          data: {
            name: p.nameOnCert || p.ownerName || "there",
            service: p.services?.map(serviceLabel).join(", ") || "compliance certificate",
            address: p.address || "your property",
            lastDone: p.jobDate || "last year",
            company: email?.fromName || "Landlord Compliance London",
          },
        }));
        const res = await fetch("/api/campaigns/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            campaignLabel: effectiveLabel,
            primaries: chasePrimaries,
            fromName: email?.fromName,
            replyTo: email?.replyTo,
            bcc: bccSelf ? email?.fromEmail : null,
            primariesAlreadySent: true,
            chase: { enabled: true, delayDays: Number(chaseDays) || 3, subjectTemplate: chaseSubject, bodyTemplate: chaseBody },
          }),
        });
        const data = await res.json().catch(() => ({}));
        chaseCount = data?.chases || 0;
      } catch {
        toast.error("Sent, but the follow-up chase couldn't be scheduled — set it up manually if needed.");
      }
    }

    setQueuedOnce(true);
    setProgress({ sent: sentCount, failed: failedCount, total: eligible.length, scheduled: chaseCount, queued: true, immediate: true, failures });
    const chaseBit = chaseCount ? ` · ${chaseCount} follow-up${chaseCount === 1 ? "" : "s"} scheduled in ${chaseDays}d` : "";
    if (sentCount && !failedCount) {
      toast.success(`Sent to ${sentCount}${chaseBit}.`);
    } else if (sentCount && failedCount) {
      toast.error(`Sent to ${sentCount}, ${failedCount} failed — ${failures[0]?.error || "see Email log"}.`);
    } else {
      toast.error(`Nothing sent — ${failures[0]?.error || "all attempts failed"}.`);
    }
    setSending(false);
  };

  // Single POST to /api/campaigns/enqueue — inserts every primary AND every
  // chase into Supabase's email_queue in one go. Once this returns, the tab
  // can close (or die, or reload) and the cron worker still ships every
  // email on schedule. No more "campaign died at 60/121 because I locked my
  // phone" — nothing depends on this browser after the POST completes. Only
  // used for genuinely large lists — see sendImmediate above for the small,
  // hand-picked case.
  const sendQueued = async () => {
    setSending(true);
    setProgress({ sent: 0, failed: 0, total: eligible.length, scheduled: 0, queued: false, immediate: false });

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token || "";

    // Build the primary list with subject/body already merged per-recipient.
    // Data blob carries merge vars so the server can still interpolate the
    // chase templates at chase-send time (if any of them need it).
    const primaries = eligible.map((p) => {
      const vars = {
        name: p.nameOnCert || p.ownerName || "there",
        service: p.services?.map(serviceLabel).join(", ") || "compliance certificate",
        address: p.address || "your property",
        lastDone: p.jobDate || "last year",
        company: email?.fromName || "Landlord Compliance London",
      };
      return {
        prospectId: p.id,
        toEmail: p.contactEmail,
        subject: mergeFields(subject, p, { upliftPct: uplift, company: email?.fromName }),
        body: mergeFields(body, p, { upliftPct: uplift, company: email?.fromName }),
        data: vars,
      };
    });

    try {
      const res = await fetch("/api/campaigns/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          campaignLabel: effectiveLabel,
          primaries,
          fromName: email?.fromName,
          replyTo: email?.replyTo,
          bcc: bccSelf ? email?.fromEmail : null,
          dripSeconds: 2,
          overrideContacted: overrideContacted && canOverrideContacted,
          chase: chaseOn && chaseSubject.trim() && chaseBody.trim()
            ? { enabled: true, delayDays: Number(chaseDays) || 3,
                subjectTemplate: chaseSubject, bodyTemplate: chaseBody }
            : { enabled: false },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        // "No valid rows" with a non-zero skipped count means the server's
        // live dedup (already contacted / already emailed / replied / dnc)
        // caught every single recipient — e.g. the client's local copy still
        // showed them as eligible, but the real record had already moved on
        // since the page loaded. Previously this just toasted an error and
        // reset to the exact same "Send to N" button, with no visible change
        // — an operator who didn't catch the toast would see nothing
        // different and reasonably assume the click did nothing. Now it's
        // shown as a persistent, explained, locked-out state instead.
        const skipped = data?.skipped;
        if (skipped?.total > 0) {
          setProgress({ total: 0, queued: true, blocked: true, skipped });
          setQueuedOnce(true);
          toast.error(`Nothing sent — all ${skipped.total} recipient${skipped.total === 1 ? "" : "s"} already handled. See details below.`);
        } else {
          toast.error(`Couldn't queue campaign — ${data?.error || res.status}`);
        }
        setSending(false);
        return;
      }

      setQueuedOnce(true);

      // Intentionally do NOT flip every recipient to "contacted" here — that
      // was misleading when only some of them had actually sent yet. The
      // queue processor updates each prospect's stage + lastContactedAt in
      // step with the real send (see /api/email-queue/process). "Contacted"
      // in the pipeline now grows in lockstep with the Sent folder.

      setProgress({
        sent: 0, failed: 0, total: data.primaries || eligible.length,
        scheduled: data.chases || 0, queued: true,
        firstSendAt: data.firstSendAt, lastSendAt: data.lastSendAt,
        skipped: data.skipped || null,
      });
      const chaseBit = data.chases ? ` + ${data.chases} follow-up${data.chases === 1 ? "" : "s"} in ${chaseDays}d` : "";
      const bccBit = data.bcc ? ` · BCC ${data.bcc}` : "";
      const skipBit = data.skipped?.total
        ? ` · skipped ${data.skipped.total} (already emailed/replied/won)`
        : "";
      toast.success(`Queued ${data.primaries} email${data.primaries === 1 ? "" : "s"}${chaseBit}${skipBit}${bccBit} — safe to close the tab.`);
    } catch (err) {
      toast.error(`Couldn't queue campaign — ${err.message || err}`);
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    if (sending) { stopRef.current = true; return; }
    setProgress(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={title} wide
      footer={
        <div className="flex w-full items-center gap-2">
          {sending ? (
            <button className="btn-secondary" onClick={() => (stopRef.current = true)}>
              <FiX /> Stop
            </button>
          ) : (
            <button className="btn-secondary" onClick={close}>Close</button>
          )}
          <button
            className="btn-primary ml-auto flex items-center gap-2"
            onClick={send}
            disabled={sending || queuedOnce || !eligible.length}
          >
            {queuedOnce ? (
              progress?.blocked
                ? <><FiAlertTriangle /> Nothing sent — reopen to refresh</>
                : progress?.immediate
                ? <><FiCheckCircle /> Sent — close or reopen to send again</>
                : <><FiCheckCircle /> Queued — close or reopen to send again</>
            ) : (
              <><FiSend /> {sending ? (eligible.length <= OVERRIDE_MAX ? "Sending…" : "Queueing…") : `Send to ${eligible.length}`}</>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4">
        {/* recipient summary — broken down so the count is auditable, not a black box */}
        <div className="rounded-lg bg-navy-50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <FiMail className="text-brand-600" />
            <span className="text-navy-700">
              <strong>{eligible.length}</strong> eligible recipient{eligible.length === 1 ? "" : "s"}
              {recipients && recipients.length !== eligible.length && (
                <span className="text-navy-400"> of {recipients.length} in this selection</span>
              )}
            </span>
          </div>
          {recipients && recipients.length !== eligible.length && (
            <p className="mt-1 pl-6 text-xs text-navy-500">
              Excluded:
              {skipBreakdown.alreadyContacted > 0 && ` ${skipBreakdown.alreadyContacted} already contacted;`}
              {skipBreakdown.dncWon > 0 && ` ${skipBreakdown.dncWon} do-not-contact / won;`}
              {skipBreakdown.noEmail > 0 && ` ${skipBreakdown.noEmail} no valid email;`}
              {" "}the server independently re-checks each one&rsquo;s live contact record at send time too.
            </p>
          )}
        </div>

        {/* Live daily quota — server-enforced */}
        {quota && (
          <div className="rounded-lg border border-navy-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-navy-900">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-semibold text-navy-700 dark:text-slate-200">
                Today&rsquo;s quota: {quota.sentToday} / {quota.dailyCap}
              </span>
              <span className="text-navy-500">{quota.remaining} remaining</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100 dark:bg-white/10">
              <div
                className={`h-full ${
                  quota.sentToday / quota.dailyCap >= 0.9 ? "bg-red-500"
                  : quota.sentToday / quota.dailyCap >= 0.7 ? "bg-amber-500"
                  : "bg-brand-500"
                }`}
                style={{ width: `${Math.min(100, (quota.sentToday / quota.dailyCap) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {willExhaustQuota && !sending && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            <span>
              Only <strong>{remainingToday}</strong> sends left in today&rsquo;s cap.
              The first {remainingToday} will go out now; the rest will be rejected and need to wait
              until midnight UTC. To split safely, filter by a single <strong>renewal month</strong>
              before sending.
            </span>
          </div>
        )}

        {/* Campaign label — groups these sends in the email log */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-navy-700">Campaign label (optional)</label>
          <input
            className="input"
            value={campaignLabel}
            onChange={(e) => setCampaignLabel(e.target.value)}
            placeholder="e.g. June 2026 renewals — Gas"
          />
          <p className="mt-1 text-xs text-navy-500">
            Used to group sends together in the Email log so you can track replies by batch.
            Defaults to the subject line if left blank.
          </p>
        </div>

        {/* subject + body */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-semibold text-navy-700">Subject</label>
            <div className="flex gap-1.5">
              <button
                className="rounded border border-navy-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100"
                onClick={() => {
                  setSubject(DEFAULT_SUBJECT); setBody(DEFAULT_BODY);
                  setChaseSubject(DEFAULT_CHASE_SUBJECT); setChaseBody(DEFAULT_CHASE_BODY);
                }}
              >
                Gas/EPC Template
              </button>
              <button
                className="rounded border border-navy-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100"
                onClick={() => {
                  setSubject(LONG_CYCLE_SUBJECT); setBody(LONG_CYCLE_BODY);
                  setChaseSubject(LONG_CYCLE_CHASE_SUBJECT); setChaseBody(LONG_CYCLE_CHASE_BODY);
                }}
              >
                EICR/FRA Template
              </button>
              <button
                className="rounded border border-navy-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-navy-600 transition-colors hover:bg-navy-50 active:bg-navy-100"
                onClick={() => {
                  setSubject(STALE_SUBJECT); setBody(STALE_BODY);
                  setChaseSubject(STALE_CHASE_SUBJECT); setChaseBody(STALE_CHASE_BODY);
                }}
                title="For 2+ year old leads — softer check-in copy, no renewal-date or prior-work claims"
              >
                Older Leads Template
              </button>
            </div>
          </div>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-navy-700">Message</label>
          <textarea className="input min-h-44" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-xs text-navy-500">
            Merge tags: {"{{name}} {{service}} {{address}} {{lastDone}} {{renewal}} {{lastInvoice}} {{suggested}} {{company}}"}
          </p>
        </div>

        {/* options */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-navy-600">Uplift</span>
            {[0, 5, 10, 15].map((u) => (
              <button key={u} onClick={() => setUplift(u)}
                className={`rounded-lg border px-2.5 py-1 ${uplift === u ? "border-brand-500 bg-brand-50 font-semibold" : "border-navy-200"}`}>
                {u}%
              </button>
            ))}
          </div>
          {canOverrideContacted ? (
            <label className="flex items-center gap-2 text-amber-700 dark:text-amber-400" title={`This recipient list is small enough (≤${OVERRIDE_MAX}) to allow a deliberate resend — check this to include people already marked contacted.`}>
              <input type="checkbox" checked={overrideContacted} onChange={(e) => setOverrideContacted(e.target.checked)} />
              Include already-contacted <span className="text-xs">(hand-picked resend, {recipients.length} recipient{recipients.length === 1 ? "" : "s"})</span>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-navy-500" title="Always on for lists this size — prevents re-emailing anyone already contacted. For a deliberate resend to a specific person, select ≤10 recipients to unlock an override.">
              <input type="checkbox" checked disabled />
              Skip already-contacted <span className="text-xs">(always on)</span>
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={bccSelf} onChange={(e) => setBccSelf(e.target.checked)} />
            BCC myself
          </label>
        </div>

        {/* Follow-up chase scheduling */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-500/30 dark:bg-brand-950/20">
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-800 dark:text-brand-200">
            <input type="checkbox" checked={chaseOn} onChange={(e) => setChaseOn(e.target.checked)} />
            Schedule a follow-up chase if no reply
          </label>
          <p className="mt-1 text-xs text-navy-500 dark:text-slate-400">
            The chase fires automatically after the delay below. Replies cancel it — no one
            who already responded gets pestered.
          </p>

          {chaseOn && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-navy-600 dark:text-slate-300">Send chase after</span>
                {[2, 3, 5, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setChaseDays(d)}
                    className={`rounded-lg border px-2.5 py-1 ${chaseDays === d ? "border-brand-500 bg-brand-50 font-semibold dark:bg-brand-900/40" : "border-navy-200 dark:border-white/10"}`}
                  >
                    {d}d
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={chaseDays}
                  onChange={(e) => setChaseDays(Math.max(1, Math.min(90, Number(e.target.value) || 0)))}
                  className="input w-20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-navy-700 dark:text-slate-200">Chase subject</label>
                <input className="input" value={chaseSubject} onChange={(e) => setChaseSubject(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-navy-700 dark:text-slate-200">Chase message</label>
                <textarea className="input min-h-32" value={chaseBody} onChange={(e) => setChaseBody(e.target.value)} />
                <p className="mt-1 text-xs text-navy-500">Same merge tags as the first email.</p>
              </div>
            </div>
          )}
        </div>

        {/* live preview */}
        {preview && (
          <div className="rounded-xl border border-navy-200">
            <div className="border-b border-navy-100 bg-navy-50 px-3 py-2 text-xs text-navy-500">
              Preview → {preview.to}
            </div>
            <div className="p-3">
              <p className="mb-2 font-semibold text-navy-900">{preview.subject}</p>
              <p className="whitespace-pre-wrap text-sm text-navy-700">{preview.body}</p>
            </div>
          </div>
        )}

        {/* blocked — server rejected every recipient, nothing was sent */}
        {progress && progress.blocked && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/40 dark:bg-amber-950/20">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              <FiAlertTriangle /> Nothing was sent — no email went out
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Every recipient in this list was rejected by the server&rsquo;s live check, even though
              this modal still showed them as eligible — their record has moved on since this page
              last loaded (most often: already emailed). Close and reopen the campaign to refresh
              against current data.
            </p>
            {progress.skipped && progress.skipped.total > 0 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Reason{progress.skipped.total === 1 ? "" : "s"}:
                {progress.skipped.alreadyEmailedRecently > 0 && ` ${progress.skipped.alreadyEmailedRecently} already emailed in last ${progress.skipped.dedupWindowDays}d;`}
                {progress.skipped.alreadyQueued > 0 && ` ${progress.skipped.alreadyQueued} already queued (pending send);`}
                {progress.skipped.alreadyContacted > 0 && ` ${progress.skipped.alreadyContacted} already contacted (live record);`}
                {progress.skipped.alreadyReplied > 0 && ` ${progress.skipped.alreadyReplied} already replied;`}
                {progress.skipped.wonOrBookedOrDnc > 0 && ` ${progress.skipped.wonOrBookedOrDnc} won/booked/dnc.`}
              </p>
            )}
          </div>
        )}

        {/* progress — post-send confirmation (immediate mode: real per-recipient result) */}
        {progress && progress.queued && !progress.blocked && progress.immediate && (
          <div className="rounded-xl border border-green-300 bg-green-50 p-3 dark:border-green-700/40 dark:bg-green-950/20">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
              <FiCheckCircle /> Sent — this already went out, not queued
            </div>
            <p className="text-xs text-green-700 dark:text-green-300">
              {progress.sent} of {progress.total} sent successfully{progress.failed ? ` · ${progress.failed} failed` : ""}
              {progress.scheduled ? ` · ${progress.scheduled} follow-up${progress.scheduled === 1 ? "" : "s"} queued for ${chaseDays}d from now` : ""}.
            </p>
            {progress.failures?.length > 0 && (
              <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-2 dark:border-rose-700/40 dark:bg-rose-950/20">
                <p className="mb-1 text-xs font-semibold text-rose-800 dark:text-rose-200">Why it failed:</p>
                {progress.failures.map((f, i) => (
                  <p key={i} className="text-xs text-rose-700 dark:text-rose-300">
                    <span className="font-mono">{f.to}</span> — {f.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* progress — post-queue confirmation (bulk mode: drips out over time) */}
        {progress && progress.queued && !progress.blocked && !progress.immediate && (
          <div className="rounded-xl border border-green-300 bg-green-50 p-3 dark:border-green-700/40 dark:bg-green-950/20">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
              <FiCheckCircle /> Queued in background — you can close this tab
            </div>
            <p className="text-xs text-green-700 dark:text-green-300">
              {progress.total} primary email{progress.total === 1 ? "" : "s"} queued
              {progress.scheduled ? ` · ${progress.scheduled} follow-up${progress.scheduled === 1 ? "" : "s"} in ${chaseDays}d` : ""}.
              The server drips them out — even if you shut your laptop or lock your phone.
              Track live progress in the Email log.
            </p>
            {progress.skipped && progress.skipped.total > 0 && (
              <p className="mt-2 text-xs text-green-700 dark:text-green-300">
                Skipped {progress.skipped.total}:
                {progress.skipped.alreadyEmailedRecently > 0 && ` ${progress.skipped.alreadyEmailedRecently} already emailed in last ${progress.skipped.dedupWindowDays}d;`}
                {progress.skipped.alreadyQueued > 0 && ` ${progress.skipped.alreadyQueued} already queued (pending send);`}
                {progress.skipped.alreadyContacted > 0 && ` ${progress.skipped.alreadyContacted} already contacted (live record);`}
                {progress.skipped.alreadyReplied > 0 && ` ${progress.skipped.alreadyReplied} already replied;`}
                {progress.skipped.wonOrBookedOrDnc > 0 && ` ${progress.skipped.wonOrBookedOrDnc} won/booked/dnc.`}
              </p>
            )}
          </div>
        )}
        {progress && !progress.queued && sending && (
          <div className="rounded-xl bg-navy-50 p-3 text-sm text-navy-700 dark:bg-white/5 dark:text-slate-300">
            {progress.immediate
              ? `Sending ${progress.sent + progress.failed} of ${progress.total}${progress.failed ? ` (${progress.failed} failed so far)` : ""}…`
              : `Queueing ${progress.total} recipient${progress.total === 1 ? "" : "s"}…`}
          </div>
        )}
      </div>
    </Modal>
  );
}
