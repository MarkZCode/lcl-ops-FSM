"use client";

// CampaignBuilder — bulk email + scheduled chase for cold leads.
//
// Mirrors ProspectCampaign's wire format and quota handling, but works on
// the cold-lead shape ({ name, email, address, phone, segment, ... }) and
// uses segment-aware default copy.
//
// Phase 2 plan: also wire AI-call campaigns and a manual-call dial queue
// behind a channel selector here, and migrate ProspectCampaign to be a thin
// preset over the same builder.

import { useEffect, useMemo, useRef, useState } from "react";
import { FiMail, FiPhoneCall, FiSend, FiX, FiAlertTriangle } from "react-icons/fi";
import Modal from "./Modal";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";
import { DEFAULT_SEGMENT, segmentMeta } from "@/lib/cold-leads";
import { EMAIL_PROVIDERS } from "@/lib/emailProviders";
import { useConfirm } from "@/components/ConfirmProvider";

// Cold-outreach segments route through Resend (isolated from Gmail's
// reputation) under a branded identity per audience. Anything not listed
// here (e.g. "residential") stays on the default "main" Gmail account.
const SEGMENT_PROVIDER = {
  commercial: { provider: "resend", identity: "commercial" },
  engineer_recruit: { provider: "resend", identity: "engineers" },
  letting_agent: { provider: "resend", identity: "agents" },
  estate_agent: { provider: "resend", identity: "agents" },
};

const DAILY_CAP = 400;
const SEND_DELAY_MS = 1500;
const CALL_DELAY_MS = 3000; // gentler — Vapi rate + give the network breathing room
const DEFAULT_CALL_CAP = 50; // soft per-session cap on AI calls
const BIG_BATCH_THRESHOLD = 100; // confirm before firing more than this

// Segment-specific default copy. Each entry: { subject, body, chaseSubject, chaseBody }.
// Rewritten to be longer, more specific, more credible — the previous versions
// read as generic outreach spam. These name our specific certifications,
// reference what we actually do day-to-day, and close with a concrete CTA
// (reply with a property count / postcode / job spec — not "happy to chat").
const TEMPLATES = {
  letting_agent: {
    subject: "Compliance backup for your branch — Gas, EICR, EPC (London)",
    body:
      "Hi {{name}},\n\n" +
      "I'm Lisa from {{company}}. I'm not looking to replace whoever you already use for compliance — " +
      "I just wanted to put our details in front of you as a reliable backup option.\n\n" +
      "We cover Gas Safety (CP12), EICRs, EPCs and Fire Risk Assessments across all 32 London boroughs, " +
      "and we specialise in fast turnaround: same-day or next-day slots for urgent jobs, overflow " +
      "work, and situations where your usual contractor isn't available.\n\n" +
      "A lot of the agencies we work with just keep our number saved and call us when they need a " +
      "quick cert sorted — no contract, no commitment required.\n\n" +
      "Worth keeping our details handy? Happy to send our trade pricing if useful.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
    chaseSubject: "Quick follow-up — compliance backup for your branch",
    chaseBody:
      "Hi {{name}},\n\n" +
      "It's Lisa from {{company}} — just following up on my note last week.\n\n" +
      "No pressure at all. We're just here as a fast, dependable backup for urgent jobs or when your " +
      "usual contact can't get out quickly — Gas Safety, EICR, EPC, FRA, same-day turnaround " +
      "wherever possible.\n\n" +
      "If it's useful I can send our trade price list. Just reply here.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
  },
  estate_agent: {
    subject: "Compliance backup for your branch — fast certs, all London",
    body:
      "Hi {{name}},\n\n" +
      "I'm Lisa from {{company}}. I know most branches already have contractors they rely on — " +
      "I'm not looking to change that.\n\n" +
      "We work with estate and letting branches across London as a backup option: urgent Gas Safety, " +
      "EICR, EPC or FRA where the usual contractor can't get out in time, a cert needed before " +
      "a let can proceed, overflow when you're busy. Same-day or next-day slots, certificate " +
      "issued same day wherever possible.\n\n" +
      "A lot of agents just keep our number saved and call when they need something sorted quickly. " +
      "No contract, no volume commitment.\n\n" +
      "Worth keeping our details? Happy to send trade pricing.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
    chaseSubject: "Re: Compliance backup — {{company}}",
    chaseBody:
      "Hi {{name}},\n\n" +
      "It's Lisa from {{company}} — following up on my note last week.\n\n" +
      "If there's ever a cert needed urgently — Gas Safety, EICR, EPC, FRA — we can usually get " +
      "someone out same day or next day and have the certificate issued the same day too.\n\n" +
      "Happy to send our trade price list if that's useful. Just reply here.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
  },
  residential: {
    subject: "Landlord compliance certs — Gas, EICR, EPC, FRA",
    body:
      "Hi {{name}},\n\n" +
      "I'm Lisa from {{company}}. We're a London landlord-compliance specialist — Gas " +
      "Safety (CP12), EICRs, EPCs, Fire Risk Assessments, PAT testing and any remedial work " +
      "flagged on the certs.\n\n" +
      "What you'd get with us:\n" +
      "  • Gas Safe / NICEIC registered engineers, fully insured\n" +
      "  • Same-day certificates emailed to you and your tenant\n" +
      "  • Transparent fixed pricing (no surprise call-out fees)\n" +
      "  • Direct tenant booking — we coordinate access so you don't have to chase\n\n" +
      "If you've got a property due for a cert, reply with the address and the type you need and " +
      "I'll send a quote back today. We can usually fit you in within the week.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
    chaseSubject: "Quick follow-up — landlord compliance cert",
    chaseBody:
      "Hi {{name}},\n\n" +
      "It's Lisa from {{company}} — following up on my note last week. If the renewal is sitting on your to-do list, just reply " +
      "with the property address and what's needed — I'll send a quote and a booking slot within " +
      "the hour.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
  },
  commercial: {
    subject: "Commercial compliance — Gas, EICR, FRA, emergency lighting",
    body:
      "Hi {{name}},\n\n" +
      "I'm Lisa from {{company}}. We handle commercial compliance across London — " +
      "Commercial Gas (CP15 / CP17), EICR, FRA Type 1–4, emergency-lighting tests, fire-alarm " +
      "servicing and PAT — single sites and multi-site portfolios.\n\n" +
      "We work with restaurants, retail units, offices, HMOs, religious buildings and small-medium " +
      "commercial landlords. What we bring:\n" +
      "  • Engineers qualified for commercial work specifically (not just domestic-trained)\n" +
      "  • One contractor across cert types — saves you juggling three suppliers\n" +
      "  • Reports formatted to fit insurer / local-authority requirements\n" +
      "  • Trade account with monthly invoicing on portfolios\n\n" +
      "If anything's coming up — a renewal, a remedial, a new site survey — reply with the " +
      "address and what you need certified and I'll send a quote today.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
    chaseSubject: "Following up — commercial compliance",
    chaseBody:
      "Hi {{name}},\n\n" +
      "It's Lisa from {{company}} — following up on my note last week. If there's any compliance work on the horizon — single " +
      "site, portfolio renewal, or insurer-required remedials — reply with what you need certified " +
      "and I'll have a quote across to you today.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
  },
  engineer_recruit: {
    subject: "Subcontract compliance work — flexible, weekly pay, London",
    body:
      "Hi {{name}},\n\n" +
      "I'm Lisa, reaching out from Landlord Compliance London.\n\n" +
      "We're expanding our engineer network and onboarding qualified engineers for ongoing " +
      "landlord compliance work across London. Jobs are ad-hoc and flexible — you choose what " +
      "to accept based on your availability and area coverage.\n\n" +
      "What we provide:\n" +
      "  • Regular compliance job opportunities across London\n" +
      "  • Clear job details upfront — no surprises on site\n" +
      "  • Weekly payments via BACS — no chasing invoices\n" +
      "  • No exclusivity or long-term commitment required\n" +
      "  • Direct dispatch — no middle-layer calling you while you're on a job\n\n" +
      "We're currently placing work for:\n" +
      "  • Gas Safety (CP12 / CP15 / CP17)\n" +
      "  • Electrical (EICR, Minor Works, EV charging)\n" +
      "  • Fire Risk Assessments (FRA Type 1–4)\n" +
      "  • EPCs, PAT testing, emergency-lighting, fire-alarm servicing\n\n" +
      "Would you be open to a quick chat about this?\n\n" +
      "Kind regards,\nLisa\n{{company}}",
    chaseSubject: "Quick follow-up — subcontract work, weekly pay",
    chaseBody:
      "Hi {{name}},\n\n" +
      "Just following up on my message about subcontract compliance work in London.\n\n" +
      "If you're open to flexible work with weekly pay and no exclusivity, reply with your " +
      "trade and the areas you cover — I can send the rate card over today. Takes about 10 " +
      "minutes to get onboarded.\n\n" +
      "Kind regards,\nLisa\n{{company}}",
  },
};

function mergeFields(tpl, l, { company, segment }) {
  // For business/commercial names, first-word split gives awkward "Hi A," — use "there".
  const firstWord = l.name?.split(/\s+/)[0] || "";
  const isPersonName = firstWord.length > 2 && segment !== "commercial" && segment !== "letting_agent" && segment !== "estate_agent";
  const map = {
    name: isPersonName ? firstWord : (l.contact_name?.split(/\s+/)[0] || "there"),
    fullname: l.contact_name || l.name || "there",
    company: company || "Landlord Compliance London",
    company: company || "Landlord Compliance London",
    address: l.address || "",
    postcode: l.postcode || "",
    portfolio: l.portfolioSize ? `${l.portfolioSize} properties` : "",
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (map[k] != null ? map[k] : ""));
}

// Append the configured signature so every campaign email signs off as Lisa.
// Pre-strips any signature already in the template body to avoid doubling.
function withSignature(body, signature) {
  if (!signature) return body;
  // Strip a leading-of-final-block "Kind regards, …" so we never duplicate.
  const stripped = body.replace(/\n+Kind regards,?[\s\S]*$/i, "").trimEnd();
  return `${stripped}\n\n${signature}`;
}

export default function CampaignBuilder({ open, onClose, recipients, segment, email, leadKind = "cold", onLog, title }) {
  const ask = useConfirm();
  const seg = segmentMeta(segment || DEFAULT_SEGMENT);
  const { provider: emailProvider, identity: emailIdentity } = SEGMENT_PROVIDER[seg.code] || { provider: "main", identity: undefined };
  const defaults = TEMPLATES[seg.code] || TEMPLATES[DEFAULT_SEGMENT];

  // Channel selector: 'email' (bulk send + optional chase) or 'ai_call' (Vapi).
  const [channel, setChannel] = useState("email");

  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [campaignLabel, setCampaignLabel] = useState("");
  const [bccSelf, setBccSelf] = useState(true);
  // Default OFF — see note in ProspectCampaign.js. The pre-R1 false-positive
  // "lastContactedAt" stamps would otherwise hide every real prospect.
  const [skipContacted, setSkipContacted] = useState(false);
  const [chaseOn, setChaseOn] = useState(true);
  const [chaseDays, setChaseDays] = useState(seg.cadence === "heavy" ? 3 : 5);
  const [chaseSubject, setChaseSubject] = useState(defaults.chaseSubject);
  const [chaseBody, setChaseBody] = useState(defaults.chaseBody);
  const [callCap, setCallCap] = useState(DEFAULT_CALL_CAP);
  const [testTarget, setTestTarget] = useState("");
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState(false);
  const [sending, setSending] = useState(false);
  // Once a send/call run has completed, retire the button for this modal
  // instance so a re-click can't fire the same batch again — see the same
  // guard (and the reasoning) in ProspectCampaign.js.
  const [sentOnce, setSentOnce] = useState(false);
  const [progress, setProgress] = useState(null);
  const [quota, setQuota] = useState(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (open) { setSentOnce(false); setProgress(null); }
  }, [open]);

  // Reset defaults whenever segment changes
  useEffect(() => {
    if (!open) return;
    setSubject(defaults.subject);
    setBody(defaults.body);
    setChaseSubject(defaults.chaseSubject);
    setChaseBody(defaults.chaseBody);
    setChaseDays(seg.cadence === "heavy" ? 3 : 5);
    setTestOk(false);
  }, [open, seg.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the test target to the configured sender on first open.
  useEffect(() => {
    if (!open) return;
    if (channel === "email" && !testTarget && email?.fromEmail) setTestTarget(email.fromEmail);
  }, [open, channel, email?.fromEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live quota
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
        const q = json?.quotaByProvider?.[emailProvider] || json?.quota;
        if (!cancelled && q) setQuota(q);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [open, progress, emailProvider]);

  const eligible = useMemo(() => {
    return (recipients || []).filter((l) => {
      if (channel === "email") {
        if (!l.email || !/@/.test(l.email)) return false;
      } else if (channel === "ai_call") {
        if (!l.phone) return false;
      }
      if (l.stage === "dnc" || l.stage === "booked" || l.stage === "won") return false;
      if (skipContacted && l.lastContactedAt) return false;
      return true;
    });
  }, [recipients, skipContacted, channel]);

  const providerDailyCap = EMAIL_PROVIDERS[emailProvider]?.dailyCap ?? DAILY_CAP;
  const remainingToday = quota ? quota.remaining : providerDailyCap;
  const willExhaustQuota = eligible.length > remainingToday;
  const effectiveLabel = (campaignLabel.trim() || `${seg.label} · ${subject}`).slice(0, 120);

  // TEST MODE — one message/call to a number/email of the user's choice.
  // Uses a dummy "lead" so merge tags resolve and the user can see the actual output.
  const sendTest = async () => {
    const tgt = testTarget.trim();
    if (!tgt) { toast.error("Enter your own email or phone for the test"); return; }
    setTesting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || "";
      const fakeLead = {
        id: "test-" + Date.now(),
        name: "Test Recipient",
        address: "Your test address",
        postcode: "",
        portfolioSize: null,
      };

      if (channel === "email") {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            to: tgt,
            subject: "[TEST] " + mergeFields(subject, fakeLead, { company: email?.fromName, segment: seg.code }),
            text: mergeFields(body, fakeLead, { company: email?.fromName, segment: seg.code }),
            fromName: email?.fromName,
            replyTo: email?.replyTo,
            campaignLabel: "test",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          toast.success(`Test email sent to ${tgt}`);
          setTestOk(true);
        } else {
          toast.error(data.error || "Test send failed");
        }
      } else {
        // AI call test — fire a single Vapi call to the entered number.
        const res = await fetch("/api/vapi/test-call", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ phone: tgt, segment: seg.code }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          toast.success(`Test call started to ${tgt}`);
          setTestOk(true);
        } else if (data.notConfigured) {
          toast.error("Vapi isn't configured yet");
        } else {
          toast.error(data.error || "Test call failed");
        }
      }
    } catch {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  };

  const sendCalls = async () => {
    if (sending || sentOnce) return; // already run (or mid-run) — refuse a second fire
    if (!eligible.length) { toast.error("No eligible recipients"); return; }
    if (!testOk) {
      const proceed = await ask(`You haven't run a TEST yet. Fire ${Math.min(eligible.length, Number(callCap) || DEFAULT_CALL_CAP)} live AI calls anyway?`);
      if (!proceed) return;
    }
    if (eligible.length > BIG_BATCH_THRESHOLD) {
      const proceed = await ask(`You're about to start AI calls to ${Math.min(eligible.length, Number(callCap) || DEFAULT_CALL_CAP)} leads (cap is ${callCap}). Continue?`);
      if (!proceed) return;
    }
    const cap = Math.max(1, Math.min(eligible.length, Number(callCap) || DEFAULT_CALL_CAP));
    const queue = eligible.slice(0, cap);
    setSending(true);
    stopRef.current = false;
    let started = 0, failed = 0, notConfigured = false;
    setProgress({ sent: 0, failed: 0, total: queue.length, scheduled: 0 });

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token || "";

    for (const l of queue) {
      if (stopRef.current) break;
      try {
        const res = await fetch("/api/vapi/call", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(
            leadKind === "cold"
              ? { coldLeadId: l.id }
              : { prospectId: l.id }
          ),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          started++;
          onLog?.(l.id, { channel: "ai-call", note: `AI call campaign · ${effectiveLabel}`, callId: data.callId }, l.stage === "new" ? "contacted" : undefined);
        } else {
          failed++;
          if (data.notConfigured) {
            notConfigured = true;
            toast.error("Vapi isn't configured. Stopping.");
            break;
          }
          if (res.status === 429) {
            toast.error("Rate limited. Stopping.");
            break;
          }
        }
      } catch {
        failed++;
      }
      setProgress({ sent: started, failed, total: queue.length, scheduled: 0 });
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
    }

    setSending(false);
    setSentOnce(true);
    if (!notConfigured) {
      toast.success(`AI call campaign done — ${started} started${failed ? `, ${failed} failed` : ""}`);
    }
  };

  const send = async () => {
    if (channel === "ai_call") return sendCalls();
    if (sending || sentOnce) return; // already run (or mid-run) — refuse a second fire
    if (!eligible.length) { toast.error("No eligible recipients"); return; }
    if (!testOk) {
      const proceed = await ask(`You haven't run a TEST yet. Send ${eligible.length} live emails anyway?`);
      if (!proceed) return;
    }
    if (eligible.length > BIG_BATCH_THRESHOLD) {
      const proceed = await ask(`Sending to ${eligible.length} recipients. Continue?`);
      if (!proceed) return;
    }
    setSending(true);
    stopRef.current = false;
    let sent = 0, failed = 0, quotaHit = false;
    const chasePending = [];
    const overflowPending = []; // recipients that didn't make today's cap — queued for tomorrow
    setProgress({ sent, failed, total: eligible.length, scheduled: 0 });

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token || "";

    for (const l of eligible) {
      if (stopRef.current) break;
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            to: l.email,
            subject: mergeFields(subject, l, { company: email?.fromName, segment: seg.code }),
            text: withSignature(mergeFields(body, l, { company: email?.fromName, segment: seg.code }), email?.signature),
            fromName: email?.fromName,
            replyTo: email?.replyTo,
            bcc: bccSelf ? email?.fromEmail : undefined,
            prospectId: l.id, // shared log table — `prospectId` is the recipient id
            campaignLabel: effectiveLabel,
            provider: emailProvider,
            identity: emailIdentity,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          sent++;
          onLog?.(l.id, { channel: "email", note: `Campaign: ${effectiveLabel}` }, l.stage === "new" ? "contacted" : undefined);
          if (data.sentToday != null) {
            setQuota((q) => ({ ...(q || { dailyCap: data.dailyCap }), sentToday: data.sentToday, remaining: Math.max(0, data.dailyCap - data.sentToday) }));
          }
          if (chaseOn && chaseSubject.trim() && chaseBody.trim()) {
            chasePending.push({
              prospectId: l.id,
              toEmail: l.email,
              subject: mergeFields(chaseSubject, l, { company: email?.fromName, segment: seg.code }),
              body: withSignature(mergeFields(chaseBody, l, { company: email?.fromName, segment: seg.code }), email?.signature),
              fromName: email?.fromName,
              replyTo: email?.replyTo,
              bcc: bccSelf ? email?.fromEmail : undefined,
              campaignLabel: `${effectiveLabel} · chase`,
              parentSendId: data.id || null,
              stepIndex: 2,
              delayDays: Number(chaseDays) || 3,
              provider: emailProvider,
              identity: emailIdentity,
            });
          }
        } else {
          failed++;
          if (data.quotaReached) {
            quotaHit = true;
            // Schedule overflow for tomorrow at 1am UTC — the queue cron fires then,
            // right after midnight resets the daily Gmail cap.
            const next1amUtc = new Date();
            next1amUtc.setUTCDate(next1amUtc.getUTCDate() + 1);
            next1amUtc.setUTCHours(1, 0, 0, 0);
            const remainingFromHere = eligible.slice(eligible.indexOf(l));
            for (const r of remainingFromHere) {
              overflowPending.push({
                prospectId: r.id,
                toEmail: r.email,
                subject: mergeFields(subject, r, { company: email?.fromName, segment: seg.code }),
                body: withSignature(mergeFields(body, r, { company: email?.fromName, segment: seg.code }), email?.signature),
                fromName: email?.fromName,
                replyTo: email?.replyTo,
                bcc: bccSelf ? email?.fromEmail : undefined,
                campaignLabel: `${effectiveLabel} · overflow`,
                parentSendId: null,
                stepIndex: 1,
                scheduledFor: next1amUtc.getTime(), // fires at tomorrow 1am UTC when cap resets
                provider: emailProvider,
                identity: emailIdentity,
              });
            }
            break;
          }
          if (data.notConfigured) {
            toast.error("Email isn't configured. Stopping.");
            break;
          }
          if (res.status === 429) {
            toast.error("Rate limited. Stopping.");
            break;
          }
        }
      } catch {
        failed++;
      }
      setProgress({ sent, failed, total: eligible.length, scheduled: chasePending.length });
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }

    let scheduledCount = 0;
    let overflowCount = 0;
    // Queue overflow recipients first so they get tomorrow's quota.
    if (overflowPending.length) {
      try {
        const res = await fetch("/api/email-queue/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items: overflowPending }),
        });
        const data = await res.json().catch(() => ({}));
        overflowCount = data?.scheduled || 0;
      } catch {
        toast.error("Cap hit and the overflow queue save failed too. Try the campaign again later.");
      }
    }
    if (chasePending.length) {
      try {
        const res = await fetch("/api/email-queue/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items: chasePending }),
        });
        const data = await res.json().catch(() => ({}));
        scheduledCount = data?.scheduled || 0;
        setProgress((pp) => ({ ...(pp || {}), scheduled: scheduledCount }));
        if (!res.ok) {
          toast.error("Sends went out, but follow-ups couldn't be scheduled.");
        }
      } catch {
        toast.error("Sends went out, but follow-ups couldn't be scheduled.");
      }
    }

    setSending(false);
    setSentOnce(true);
    if (quotaHit) {
      toast.success(`Cap hit cleanly — ${sent} sent today, ${overflowCount} queued for tomorrow morning. No need to come back.`);
    } else {
      const chaseBit = scheduledCount ? ` · ${scheduledCount} chase email${scheduledCount === 1 ? "" : "s"} queued for ${chaseDays}d` : "";
      toast.success(`Campaign done — ${sent} sent${failed ? `, ${failed} failed` : ""}${chaseBit}`);
    }
  };

  const close = () => {
    if (sending) { stopRef.current = true; return; }
    setProgress(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={title || `${channel === "ai_call" ? "AI call" : "Email"} campaign · ${seg.label}`} wide
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
            disabled={sending || sentOnce || !eligible.length}
          >
            {sentOnce ? (
              <>Done — close or reopen to run again</>
            ) : (
              <><FiSend /> {sending ? (channel === "ai_call" ? "Calling…" : "Sending…") : `${channel === "ai_call" ? "Start calls to" : "Send to"} ${eligible.length}`}</>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Channel selector */}
        <div className="inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
          <button
            type="button"
            onClick={() => setChannel("email")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              channel === "email" ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <FiMail className="h-3.5 w-3.5" /> Email
          </button>
          <button
            type="button"
            onClick={() => setChannel("ai_call")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              channel === "ai_call" ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            <FiPhoneCall className="h-3.5 w-3.5" /> AI call
          </button>
        </div>

        {/* TEST MODE — verify before firing at every lead */}
        <div className={`rounded-xl border p-3 ${testOk ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={`text-sm font-bold ${testOk ? "text-emerald-800 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200"}`}>
              {testOk ? "✓ Test sent — safe to send live" : "Step 1: Test it on yourself first"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="input flex-1 min-w-[200px]"
              placeholder={channel === "ai_call" ? "Your phone (e.g. 07xxx xxxxxx)" : "Your email"}
              value={testTarget}
              onChange={(e) => { setTestTarget(e.target.value); setTestOk(false); }}
            />
            <button className="btn-secondary" onClick={sendTest} disabled={testing || !testTarget.trim()}>
              {testing ? "Testing…" : `Send test ${channel === "ai_call" ? "call" : "email"}`}
            </button>
          </div>
          <p className={`mt-2 text-[11px] ${testOk ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
            One {channel === "ai_call" ? "call" : "email"} goes to you — no leads are touched. Edit copy and re-test until you&rsquo;re happy.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-navy-50 p-3 text-sm dark:bg-white/5">
          {channel === "ai_call" ? <FiPhoneCall className="text-brand-600" /> : <FiMail className="text-brand-600" />}
          <span className="text-navy-700 dark:text-slate-300">
            <strong>{eligible.length}</strong> eligible · segment <strong>{seg.label}</strong>
            {recipients && recipients.length !== eligible.length && (
              <span className="text-navy-400 dark:text-slate-500"> · {recipients.length - eligible.length} skipped ({channel === "ai_call" ? "no phone" : "no email"} / already contacted / opted out)</span>
            )}
          </span>
        </div>

        {quota && channel === "email" && (
          <div className="rounded-lg border border-navy-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-navy-900">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-semibold text-navy-700 dark:text-slate-200">
                Today&rsquo;s quota: {quota.sentToday} / {quota.dailyCap}
              </span>
              <span className="text-navy-500 dark:text-slate-400">{quota.remaining} remaining</span>
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

        {willExhaustQuota && !sending && channel === "email" && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            <span>
              You have <strong>{eligible.length}</strong> eligible but only{" "}
              <strong>{remainingToday}</strong> sends remain in today&rsquo;s {EMAIL_PROVIDERS[emailProvider]?.label || "Gmail"} cap ({providerDailyCap}/day).
              The first <strong>{remainingToday}</strong> go out today. The remaining{" "}
              <strong>{eligible.length - remainingToday}</strong> are queued and continue
              automatically tomorrow morning — no need to come back and re-send. The
              cap resets at midnight UTC.
            </span>
          </div>
        )}

        <div>
          <label className="label">Campaign label (optional)</label>
          <input className="input" value={campaignLabel} onChange={(e) => setCampaignLabel(e.target.value)}
            placeholder={`e.g. ${seg.label} · ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`} />
        </div>

        {channel === "email" && (
        <>
        <div>
          <label className="label">Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input min-h-44" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-xs text-navy-500 dark:text-slate-400">
            Merge tags: {"{{name}} {{fullname}} {{company}} {{address}} {{postcode}} {{portfolio}}"}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-navy-700 dark:text-slate-300">
            <input type="checkbox" checked={bccSelf} onChange={(e) => setBccSelf(e.target.checked)} className="h-4 w-4" />
            BCC myself ({email?.fromEmail || "—"})
          </label>
          <p className="ml-6 mt-1 text-[11px] text-navy-500 dark:text-slate-400">
            If on, you&rsquo;ll receive a hidden copy of every send to your inbox — useful as a deliverability check.
            The recipient does NOT see this — just you, in your Sent + Inbox. Reply tracking still works either way
            (replies from the recipient hit /api/gmail/poll and update the email log).
          </p>
        </div>
        </>
        )}

        <label className="flex items-center gap-2 text-sm text-navy-700 dark:text-slate-300">
          <input type="checkbox" checked={skipContacted} onChange={(e) => setSkipContacted(e.target.checked)} className="h-4 w-4" />
          Skip leads already contacted
        </label>

        {channel === "ai_call" && (
          <div className="rounded-xl border border-navy-200 p-3 dark:border-white/10">
            <label className="flex items-center justify-between text-sm font-semibold text-navy-800 dark:text-slate-100">
              <span className="flex items-center gap-2"><FiPhoneCall /> Session call cap</span>
              <input type="number" min="1" max="500" value={callCap}
                onChange={(e) => setCallCap(e.target.value)}
                className="input w-20 py-1 text-center" />
            </label>
            <p className="mt-2 text-xs text-navy-500 dark:text-slate-400">
              First {Math.min(eligible.length, Number(callCap) || DEFAULT_CALL_CAP)} eligible leads are queued.
              Calls fire one at a time at {(CALL_DELAY_MS / 1000).toFixed(0)}s intervals so Vapi handles the load.
            </p>
          </div>
        )}

        {channel === "email" && (
        /* Chase */
        <div className="rounded-xl border border-navy-200 p-3 dark:border-white/10">
          <label className="flex items-center justify-between text-sm font-semibold text-navy-800 dark:text-slate-100">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={chaseOn} onChange={(e) => setChaseOn(e.target.checked)} className="h-4 w-4" />
              Schedule follow-up chase
            </span>
            {chaseOn && (
              <span className="flex items-center gap-1 text-xs font-medium text-navy-500 dark:text-slate-400">
                in
                <input type="number" min="1" max="30" value={chaseDays}
                  onChange={(e) => setChaseDays(e.target.value)}
                  className="input w-14 py-1 text-center" />
                days
              </span>
            )}
          </label>
          {chaseOn && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="label">Chase subject</label>
                <input className="input" value={chaseSubject} onChange={(e) => setChaseSubject(e.target.value)} />
              </div>
              <div>
                <label className="label">Chase message</label>
                <textarea className="input min-h-32" value={chaseBody} onChange={(e) => setChaseBody(e.target.value)} />
              </div>
              <p className="text-[11px] text-navy-500 dark:text-slate-400">
                Chases auto-cancel if the lead replies to the original email.
              </p>
            </div>
          )}
        </div>
        )}

        {progress && (
          <div className="rounded-lg border border-navy-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-navy-900">
            <div className="flex items-center justify-between">
              <span className="text-navy-700 dark:text-slate-200">
                Sent {progress.sent} / {progress.total}{progress.failed ? ` · ${progress.failed} failed` : ""}
              </span>
              {progress.scheduled > 0 && (
                <span className="text-xs text-navy-500 dark:text-slate-400">{progress.scheduled} chases queued</span>
              )}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-navy-100 dark:bg-white/10">
              <div className="h-full bg-brand-500" style={{ width: `${(progress.sent / progress.total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
