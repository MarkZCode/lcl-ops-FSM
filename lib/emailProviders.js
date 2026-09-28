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

// Which mailbox each kind of client email goes out from. A landlord
// replying to an invoice should land in accounts@, a booking query in
// bookings@ — and a reply that lands in the wrong inbox is a reply nobody
// answers. Anything not listed falls back to info@.
export const PURPOSE_MAILBOX = {
  // A quote is pre-booking correspondence — it goes out from info@, the
  // general business address, and a reply to it lands there. bookings@ is
  // for mail about an appointment that actually exists (confirmations,
  // reminders, "engineer on the way"); a quote reply sitting in that inbox
  // is a reply nobody is looking for.
  quote: "info",
  followup: "info",
  booking: "bookings",
  reminder: "bookings",
  on_the_way: "bookings",
  job_completed: "accounts",
  invoice: "accounts",
  receipt: "accounts",
  renewal: "bookings",
  review: "info",
  review_request: "info",
  certificate: "certificates",
  recruit_outreach: "engineers",
  recruit_chase: "engineers",
  recruit_interview: "engineers",
  recruit_docs: "engineers",
  recruit_onboarded: "engineers",
};

// Where a given template purpose should send from.
//
// Client-facing mail goes out over the company domain once Hostinger is
// configured; cold outreach deliberately does not, because bulk sending is
// what damages a domain's reputation and the domain is what an invoice is
// judged on. Until the SMTP credentials exist this returns the Gmail
// provider, so every send path keeps working unchanged.
export function mailboxForPurpose(purpose) {
  const identity = PURPOSE_MAILBOX[purpose] || "info";
  if (identity === "engineers" || String(purpose || "").startsWith("cold_")) {
    return { provider: resendConfigured() ? "resend" : "main", identity: "engineers" };
  }
  if (!hostingerConfigured(identity)) return { provider: "main", identity: undefined };
  return { provider: "hostinger", identity };
}

// Each mailbox authenticates as ITSELF.
//
// One login sending as five different From addresses is the setup that
// fails: most SMTP servers reject a From the authenticated account doesn't
// own, and the ones that accept it get the mail filed as spam at the
// receiving end because the envelope and the header disagree. So every
// mailbox has its own password — HOSTINGER_PASSWORD_ACCOUNTS,
// HOSTINGER_PASSWORD_BOOKINGS, and so on — and we log in as whichever one
// is actually sending.
//
// HOSTINGER_SMTP_USER / _PASSWORD stay supported as a single-account
// fallback, so a half-finished setup still sends rather than silently
// doing nothing.
export function hostingerCredentials(identity) {
  const entry = HOSTINGER_IDENTITIES[identity];
  if (entry) {
    const pass = process.env[`HOSTINGER_PASSWORD_${entry.mailbox.toUpperCase()}`];
    if (pass) return { user: `${entry.mailbox}@${HOSTINGER_DOMAIN}`, pass, own: true };
  }
  const user = process.env.HOSTINGER_SMTP_USER;
  const pass = process.env.HOSTINGER_SMTP_PASSWORD;
  if (user && pass) return { user, pass, own: false };
  return null;
}

// Configured at all? True if ANY mailbox has credentials — a partial setup
// routes the mailboxes that are ready over the domain and leaves the rest
// on Gmail, rather than blocking everything until the last password is in.
export function hostingerConfigured(identity) {
  if (identity) return !!hostingerCredentials(identity);
  if (process.env.HOSTINGER_SMTP_USER && process.env.HOSTINGER_SMTP_PASSWORD) return true;
  return Object.values(HOSTINGER_IDENTITIES).some(
    (e) => !!process.env[`HOSTINGER_PASSWORD_${e.mailbox.toUpperCase()}`]
  );
}

// The address a given purpose sends from. Falls back to the authenticated
// mailbox, because most SMTP servers reject a From the account can't own.
// The address a given purpose sends from — which must be an address the
// connection is actually authenticated as, or the server will refuse it.
export function hostingerFrom(identity, fromName) {
  const creds = hostingerCredentials(identity);
  const entry = HOSTINGER_IDENTITIES[identity];
  const addr = creds?.own && entry
    ? `${entry.mailbox}@${HOSTINGER_DOMAIN}`
    : creds?.user || process.env.HOSTINGER_SMTP_USER;
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
