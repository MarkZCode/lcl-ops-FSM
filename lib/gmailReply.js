// SERVER-ONLY. Shared inbound-reply handling for Gmail — used by BOTH
// /api/gmail/webhook (real-time push) and /api/gmail/poll (daily fallback
// cron). One codepath, one behavior, so a reply is logged the same way no
// matter which path catches it first.
//
// Previously these were two independent, drifted implementations:
//   - webhook wrote to job.activity AND email_sends/prospects, but only if
//     `findJobForEmail` found an existing job — if the sender was still a
//     bare prospect (no job created yet, the common case for a first-touch
//     campaign reply), the webhook did an early `continue` and skipped
//     EVERYTHING below it, including the prospect update. The reply vanished
//     with no trace anywhere.
//   - poll only ever wrote to email_sends/prospects, never to job.activity,
//     so a reply from someone who HAD progressed to a job never showed on
//     the job's communication thread, only on the prospect record.
// This module does both, independently, every time — a job lookup failing
// never blocks the prospect/email_sends update and vice versa.

export async function getGmailAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error(d.error_description || "Could not get Gmail access token");
  return d.access_token;
}

export function headerVal(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export function decodeBody(msg) {
  const parts = msg?.payload?.parts || (msg?.payload ? [msg.payload] : []);
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      return Buffer.from(p.body.data, "base64url").toString("utf-8").slice(0, 700);
    }
  }
  return "";
}

export function cleanSnippet(raw) {
  return (raw || "")
    .split("\n")
    .reduce((s, line) => {
      if (s.done) return s;
      if (/^On .{10,} wrote:/.test(line.trim())) return { done: true, acc: s.acc };
      if (/^\s*>/.test(line)) return s;
      return { ...s, acc: s.acc + (s.acc ? "\n" : "") + line };
    }, { done: false, acc: "" })
    .acc
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 700);
}

export function getAttachments(msg) {
  const parts = msg?.payload?.parts || [];
  return parts
    .filter((p) => p.filename && p.filename.length > 0)
    .map((p) => ({ name: p.filename, type: p.mimeType || "application/octet-stream", size: p.body?.size || 0 }));
}

export function extractFromEmail(fromHeader) {
  return (fromHeader.match(/<(.+?)>/) || [, fromHeader])[1].trim().toLowerCase();
}

async function findJobForEmail(supabase, fromEmail) {
  const { data: clients } = await supabase
    .from("clients")
    .select("data")
    .contains("data", { email: fromEmail });
  if (!clients?.length) return null;
  const clientId = clients[0].data.id;
  const { data: jobs } = await supabase
    .from("jobs")
    .select("data")
    .contains("data", { clientId });
  if (!jobs?.length) return null;
  return jobs.sort((a, b) => new Date(b.data.createdAt) - new Date(a.data.createdAt))[0].data;
}

// The single entry point both routes call per inbound message. Every branch
// is independent and best-effort — one failing (or simply not applying,
// e.g. no job exists yet) never blocks the others.
//
// Returns { loggedToJob: bool, loggedToProspect: bool }.
export async function logInboundReply(supabase, {
  fromEmail, fromHeader, subject, date, snippet, msgId, attachments,
}) {
  const result = { loggedToJob: false, loggedToProspect: false };

  // 1. Job thread — only applies if this sender already has a job.
  try {
    const job = await findJobForEmail(supabase, fromEmail);
    if (job) {
      const seen = new Set((job.activity || []).map((a) => a.meta?.messageId).filter(Boolean));
      if (!seen.has(msgId)) {
        const entry = {
          id: "act-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          at: date,
          type: "email",
          direction: "in",
          title: "Reply from client",
          detail: snippet || subject,
          by: fromHeader,
          attachments: attachments?.length ? attachments : undefined,
          meta: { messageId: msgId },
        };
        const activity = [...(job.activity || []), entry];
        await supabase.from("jobs").update({ data: { ...job, activity } }).eq("id", job.id);
        result.loggedToJob = true;
      }
    }
  } catch (err) {
    console.error("[gmailReply] job-thread logging failed:", err?.message || err);
  }

  // 2. email_sends + prospect record — independent of whether a job exists.
  // This is what makes a first-touch campaign reply (no job yet) actually
  // show up somewhere, which was the exact bug being fixed here.
  try {
    const { data: lastSends } = await supabase
      .from("email_sends")
      .select("id, prospect_id, replied_at")
      .eq("to_email", fromEmail)
      .in("status", ["sent", "replied"])
      .order("sent_at", { ascending: false })
      .limit(1);
    const match = lastSends?.[0];
    if (match && !match.replied_at) {
      await supabase
        .from("email_sends")
        .update({ status: "replied", replied_at: date, reply_snippet: (snippet || subject || "").slice(0, 500) })
        .eq("id", match.id);

      if (match.prospect_id) {
        // Cancel pending chases — they replied, don't pester them.
        await supabase
          .from("email_queue")
          .update({ status: "cancelled", cancelled_reason: "replied" })
          .eq("prospect_id", match.prospect_id)
          .eq("status", "pending")
          .then(() => {}, () => {});

        const { data: pRow } = await supabase
          .from("prospects")
          .select("data")
          .eq("id", match.prospect_id)
          .maybeSingle();
        if (pRow?.data) {
          const p = pRow.data;
          const nextStage = (p.stage === "contacted" || p.stage === "new") ? "interested" : p.stage;
          await supabase
            .from("prospects")
            .update({
              data: {
                ...p,
                stage: nextStage,
                lastRepliedAt: date,
                contactLog: [
                  { at: date, channel: "email", direction: "in", note: "Replied: " + (snippet || subject || "").slice(0, 200) },
                  ...(Array.isArray(p.contactLog) ? p.contactLog : []),
                ],
              },
            })
            .eq("id", match.prospect_id);
        }
        result.loggedToProspect = true;
      }
    }
  } catch (err) {
    console.error("[gmailReply] email_sends/prospect logging failed:", err?.message || err);
  }

  return result;
}
