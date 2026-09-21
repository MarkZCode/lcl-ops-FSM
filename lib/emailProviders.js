// Registry for the multi-channel outreach setup:
//   - "main"   — Gmail (landlordcompliancelondon@gmail.com). Real clients,
//                prospect chasing, job-module emails. Unchanged from before.
//   - "resend" — ONE Resend integration, shared 90/day pool (kept a little
//                under Resend's free-tier 100/day hard cap so a real send
//                never gets rejected). Used for bulk/cold outreach that
//                could tank Gmail's reputation if sent from it: commercial
//                cold-call data, engineer recruiting, letting-agent
//                prospecting. Branded per audience via a distinct "from"
//                identity below, but all three draw from the SAME daily
//                pool — they're one account, not three.
//
// Requires RESEND_API_KEY + a verified domain in Resend (see RESEND_DOMAIN).
// Falls back to "main" (Gmail) automatically if RESEND_API_KEY isn't set,
// so nothing breaks before the domain/account is actually set up.
const RESEND_DOMAIN = process.env.RESEND_DOMAIN || "landlordcompliancelondon.uk";
const REPLY_TO_INBOX = process.env.GMAIL_USER || "landlordcompliancelondon@gmail.com";

export const EMAIL_PROVIDERS = {
  main: { kind: "gmail", label: "Gmail — day-to-day", dailyCap: 400 },
  resend: { kind: "resend", label: "Resend — outreach", dailyCap: 90 },
  // Hostinger mailboxes on the company domain. EVERYTHING a real client
  // sees should come from here rather than a gmail.com address: booking
  // confirmations, appointment reminders, certificates, job-completion and
  // invoices. Cold outreach and prospect chasing deliberately stay on
  // Gmail/Resend so bulk sending can never damage the domain's reputation
  // — the domain is what client mail is judged on.
  hostinger: { kind: "smtp", label: "Hostinger — client mail", dailyCap: 500 },
};

// One mailbox per purpose, all on the company domain. `identity` picks one.
export const HOSTINGER_IDENTITIES = {
  bookings: { label: "Bookings", mailbox: "bookings" },
  certificates: { label: "Certificates", mailbox: "certificates" },
  info: { label: "General", mailbox: "info" },
  engineers: { label: "Engineers", mailbox: "engineers" },
  accounts: { label: "Accounts / invoices", mailbox: "accounts" },
};

const HOSTINGER_DOMAIN = process.env.HOSTINGER_DOMAIN || "landlordcompliancelondon.uk";

export function hostingerConfigured() {
  return !!(process.env.HOSTINGER_SMTP_USER && process.env.HOSTINGER_SMTP_PASSWORD);
}

// The address a given purpose sends from. Falls back to the authenticated
// mailbox, because most SMTP servers reject a From the account can't own.
export function hostingerFrom(identity, fromName) {
  const entry = HOSTINGER_IDENTITIES[identity];
  const addr = entry
    ? `${entry.mailbox}@${HOSTINGER_DOMAIN}`
    : process.env.HOSTINGER_SMTP_USER;
  return fromName ? `${fromName} <${addr}>` : addr;
}

// One entry per outreach purpose. `identity` selects one of these; all of
// them send via the shared "resend" provider/quota above.
export const RESEND_IDENTITIES = {
  commercial: {
    label: "Commercial leads",
    from: `Landlord Compliance London <commercial@${RESEND_DOMAIN}>`,
    replyTo: REPLY_TO_INBOX,
  },
  engineers: {
    label: "Engineer recruiting",
    from: `Landlord Compliance London <engineers@${RESEND_DOMAIN}>`,
    replyTo: REPLY_TO_INBOX,
  },
  agents: {
    label: "Letting / estate agents",
    from: `Landlord Compliance London <agents@${RESEND_DOMAIN}>`,
    replyTo: REPLY_TO_INBOX,
  },
};

export function resendConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// Resolve which provider a queue/send request should actually use. Always
// "main" until Resend is genuinely configured — so flipping a campaign to
// resend before the account/domain exists degrades to Gmail instead of
// silently failing every send.
export function resolveProvider(requested) {
  if (requested === "resend" && resendConfigured()) return "resend";
  // Client mail asks for Hostinger; until those credentials exist it
  // degrades to Gmail rather than failing, so switching over is a matter of
  // setting env vars with no code change and no dropped sends in between.
  if (requested === "hostinger" && hostingerConfigured()) return "hostinger";
  return "main";
}
