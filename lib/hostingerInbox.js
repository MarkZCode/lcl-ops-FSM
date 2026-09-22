// Reading client replies out of the Hostinger mailboxes, over IMAP.
//
// Client mail now SENDS from bookings@ / accounts@ / certificates@ (see
// PURPOSE_MAILBOX in lib/emailProviders.js), so replies land there too —
// not in Gmail. "Check for replies" was still reading Gmail, which meant it
// would cheerfully report "no replies" while the reply sat in accounts@.
// This reads the right inboxes.
//
// A note on the risk, because it's already bitten this codebase once:
// /api/client-emails used to use IMAP against Gmail and failed in
// production with "Network error" — the TLS connection was being torn down
// by the serverless runtime. Mitigations here: connect to one mailbox at a
// time rather than in parallel, keep every timeout well inside the
// function's own budget, always log out in a finally, and return a
// structured per-mailbox error instead of throwing, so a single bad
// mailbox degrades to "couldn't read that one" rather than failing the
// whole check.

import { HOSTINGER_IDENTITIES, hostingerCredentials } from "./emailProviders";

const HOST = process.env.HOSTINGER_IMAP_HOST || "imap.hostinger.com";
const PORT = Number(process.env.HOSTINGER_IMAP_PORT || 993);

// Which mailboxes are actually usable — one entry per identity that has its
// own password set.
export function configuredMailboxes() {
  return Object.keys(HOSTINGER_IDENTITIES).filter((id) => hostingerCredentials(id)?.own);
}

async function withClient(identity, fn) {
  const creds = hostingerCredentials(identity);
  if (!creds) return { identity, ok: false, error: "no credentials" };

  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: PORT === 993,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
    // Fail fast rather than hanging until the serverless function is killed
    // — a killed function gives the browser a raw connection drop with no
    // error to show, which is exactly how this looked "broken" before.
    socketTimeout: 20000,
    greetingTimeout: 10000,
    connectionTimeout: 10000,
  });

  try {
    await client.connect();
    const out = await fn(client);
    return { identity, mailbox: creds.user, ok: true, ...out };
  } catch (err) {
    return { identity, mailbox: creds.user, ok: false, error: String(err?.message || err) };
  } finally {
    try { await client.logout(); } catch { /* already gone */ }
  }
}

// Connectivity check only — proves login works without reading anyone's mail.
export async function testMailboxes(identities = configuredMailboxes()) {
  const results = [];
  for (const id of identities) {
    results.push(
      await withClient(id, async (client) => {
        const box = await client.mailboxOpen("INBOX", { readOnly: true });
        return { messages: box.exists };
      })
    );
  }
  return results;
}

// Recent messages from one client address, newest first, across the given
// mailboxes. Read-only — nothing is marked as seen, so opening a job in the
// FSM never changes what looks unread in the actual inbox.
export async function fetchRepliesFrom(clientEmail, { identities = configuredMailboxes(), limit = 10, sinceDays = 180 } = {}) {
  const address = String(clientEmail || "").trim().toLowerCase();
  if (!address) return { messages: [], mailboxes: [] };

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const messages = [];
  const mailboxes = [];

  for (const id of identities) {
    const res = await withClient(id, async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      const uids = await client.search({ from: address, since }, { uid: true });
      if (!uids?.length) return { found: 0 };

      // Newest few only. A chatty client over six months is not worth
      // downloading in full to show the last couple of replies.
      const wanted = uids.slice(-limit);
      const { simpleParser } = await import("mailparser");
      for await (const msg of client.fetch(wanted, { uid: true, source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        messages.push({
          // The RFC Message-ID header, NOT a mailbox-and-UID string.
          //
          // Activity dedupe keys on this. A UID is only unique within one
          // mailbox on one server, so switching the reader from Gmail to
          // IMAP gave every already-logged reply a brand-new id and logged
          // it a second time — four "G Taliana" rows for one conversation.
          // The Message-ID is assigned by the sender and is the same string
          // whichever way the message is read.
          id: parsed.messageId || `${id}-${msg.uid}`,
          mailbox: hostingerCredentials(id)?.user || id,
          from: parsed.from?.text || address,
          subject: parsed.subject || "(no subject)",
          date: (parsed.date || new Date()).toISOString(),
          text: (parsed.text || "").trim(),
        });
      }
      return { found: wanted.length };
    });
    mailboxes.push(res);
  }

  messages.sort((a, b) => b.date.localeCompare(a.date));
  return { messages: messages.slice(0, limit), mailboxes };
}
