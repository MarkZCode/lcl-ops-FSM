// Default email/settings config for LCL Ops.
// In the prototype these persist to localStorage via the store; in Phase 2 the
// API key moves server-side and templates drive real Resend/SMTP sends.

import { site } from "./site";

export const EMAIL_PROVIDERS = [
  { value: "resend", label: "Resend (recommended)", hint: "Modern email API. Get a key at resend.com." },
  { value: "smtp", label: "SMTP", hint: "Any mailbox (Gmail, Outlook, your host)." },
  { value: "sendgrid", label: "SendGrid", hint: "High-volume transactional email." },
];

// Template variables the user can drop into subjects/bodies.
export const TEMPLATE_VARS = [
  { token: "{{client_name}}", desc: "Client's name" },
  { token: "{{company}}", desc: "Your business name" },
  { token: "{{job_id}}", desc: "Job reference" },
  { token: "{{service}}", desc: "Service(s) on the job" },
  { token: "{{property}}", desc: "Property address" },
  { token: "{{price}}", desc: "Job price" },
  { token: "{{date}}", desc: "Appointment date/time" },
  { token: "{{expiry}}", desc: "Certificate expiry date" },
  { token: "{{phone}}", desc: "Your phone number" },
];

// Which status transitions auto-send an email to the client.
// Users can toggle these in Settings → Notifications.
export const defaultAutoNotify = {
  scheduled: true,   // "Booking confirmed"
  in_progress: true, // "Engineer on the way"
  completed: false,  // "Work done"
  invoiced: true,    // "Invoice ready"
  paid: false,
};

export const AUTO_NOTIFY_LABELS = {
  scheduled: "Booking confirmed (Quote → Scheduled)",
  in_progress: "Engineer on the way (→ In progress)",
  completed: "Work completed (→ Completed)",
  invoiced: "Invoice sent (→ Invoiced)",
  paid: "Payment received (→ Paid)",
};

export const defaultEmailSettings = {
  provider: "resend",
  apiKey: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  fromName: site.name,
  fromEmail: site.email,
  replyTo: site.email,
  // Single canonical sign-off. Template bodies END at the call-to-action and do
  // NOT repeat the company name, so the signature appears exactly once.
  signature: `Kind regards,\nLisa\n${site.name}\n${site.phone}\n${site.email}`,
  bccSelf: true,
};

// Template bodies deliberately END at the call-to-action — the sign-off comes
// from email.signature so it is never duplicated. Keep this pattern for any new
// templates you add.
export const defaultTemplates = {
  quote: {
    name: "Quote",
    subject: "Your quote from {{company}} — {{service}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Thank you for your enquiry. Here is your quote:

Service: {{service}}
Property: {{property}}
Price: {{price}}

To book, just reply to this email or call {{phone}}. We cover all 32 London boroughs and can usually offer a same-day or next-day appointment.`,
  },
  booking: {
    name: "Booking confirmation",
    subject: "Booking confirmed — {{service}} on {{date}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Your appointment is confirmed:

Job: {{job_id}}
Service: {{service}}
Property: {{property}}
Date & time: {{date}}

Our accredited engineer will arrive within the booked window. Please make sure there is access to the property and any relevant appliances. If you need to rearrange, just reply or call {{phone}}.`,
  },
  reminder: {
    name: "Appointment reminder",
    subject: "Reminder: your appointment on {{date}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

A quick reminder of your upcoming appointment:

Service: {{service}}
Property: {{property}}
Date & time: {{date}}

Please ensure the engineer can access the property and any appliances being tested. If anything has changed, reply here or call {{phone}}.`,
  },
  on_the_way: {
    name: "Engineer on the way",
    subject: "Your engineer is on the way — {{job_id}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Good news — our engineer is on the way to {{property}} for your {{service}}. They will be with you within the booked window.

If you have any access instructions, reply to this message or call {{phone}}.`,
  },
  job_completed: {
    name: "Job completed",
    subject: "Your {{service}} is complete — invoice attached ({{job_id}})",
    // Now sends WITH the invoice attached (see docType handling in
    // SendEmailModal.js / changeStatus in app/jobs/[id]/page.js) — the body
    // used to say "we'll send your invoice shortly", which stopped being
    // true the moment it started going out attached to this same email.
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Great news — the work is complete for your {{service}} at {{property}}.

Job: {{job_id}}
Amount due: {{price}}

Your certificate will be issued and sent to you within 24–48 hours.

Please find your invoice attached — payment can be made by bank transfer (BACS) using the details on the invoice, quoting {{job_id}} as the reference.

If you have any questions in the meantime, just reply to this email or call {{phone}}.`,
  },
  invoice: {
    name: "Invoice",
    subject: "Invoice for {{job_id}} — {{company}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Thank you — the work is complete. Please find your invoice attached.

Job: {{job_id}}
Service: {{service}}
Property: {{property}}
Amount due: {{price}}

Payment can be made by bank transfer (BACS) using the details on the invoice, quoting {{job_id}} as the reference. Your certificate will be issued once payment is received.`,
  },
  receipt: {
    name: "Payment received",
    subject: "Payment received — thank you ({{job_id}})",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Thank you — we can confirm your payment for {{job_id}} has been received in full.

Your certificate for {{service}} at {{property}} is attached / will follow shortly. Please keep it safe for your records and for any future inspections.`,
  },
  renewal: {
    name: "Renewal reminder",
    subject: "Reminder: your {{service}} certificate expires {{expiry}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

This is a friendly reminder that the {{service}} certificate for {{property}} is due to expire on {{expiry}}.

To stay compliant and avoid any gap, we recommend rebooking 4–6 weeks before expiry. Reply to this email or call {{phone}} and we'll arrange a convenient time.`,
  },
  followup: {
    name: "Quote follow-up",
    subject: "Following up on your {{service}} quote",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I wanted to follow up on the quote we sent for {{service}} at {{property}} ({{price}}).

The appointment is still available if you'd like to go ahead — just reply to this email or call {{phone}} and we'll get you booked in.`,
  },
  review_request: {
    name: "Review request",
    subject: "How did we do? — {{company}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Thank you for choosing {{company}} for your {{service}}. We hope everything went smoothly.

If you have a moment, we'd really appreciate a short review — it helps other landlords find us and means a lot to our small team. Just reply to this email and we'll send you the link.`,
  },

  // ── Engineer recruitment pipeline ──
  // Used when reaching out to (and onboarding) gas / electrical engineers
  // discovered via the engineer_recruit cold-lead segment. Lives in the same
  // templates table so it surfaces wherever the user picks a template.
  recruit_outreach: {
    name: "Recruit — outreach",
    subject: "Gas/electrical engineer opportunity in London — {{company}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

We're growing our team of accredited gas and electrical engineers across London and have steady, well-priced jobs ready to assign.

If you're open to picking up extra work — flexible scheduling, fast payouts, friendly back-office — reply to this email and we'll send the next steps. Takes about 10 minutes to get set up.

Kind regards,
Lisa
{{company}}`,
  },
  recruit_chase: {
    name: "Recruit — follow-up",
    subject: "Quick follow-up — engineer opportunity",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Just following up on my note last week. If you're interested in picking up some work with {{company}}, reply here and I'll walk you through how we onboard new engineers — it's quick and we have jobs ready to go.

Kind regards,
Lisa
{{company}}`,
  },
  recruit_interview: {
    name: "Recruit — interview invite",
    subject: "Quick call to get you set up — {{company}}",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Thanks for the reply. Let's jump on a short call (15–20 min) to:

  • Walk through how we assign and pay for jobs
  • Confirm your tickets (Gas Safe / NICEIC / NAPIT) and insurance
  • Set up your engineer profile

When's a good time over the next couple of days? I'll send a calendar invite.

Kind regards,
Lisa
{{company}}`,
  },
  recruit_docs: {
    name: "Recruit — docs request",
    subject: "Next step — docs to send across",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Great speaking. To get you live on the platform, please send across:

  • Gas Safe / NICEIC / NAPIT registration number
  • Public liability insurance certificate
  • Photo ID + a recent utility bill (proof of address)
  • Bank details for payouts (sort code + account number)

Reply to this email with the attachments and we'll have your engineer profile live within 24h, with jobs starting to come through right after.

Kind regards,
Lisa
{{company}}`,
  },
  recruit_onboarded: {
    name: "Recruit — onboarded",
    subject: "You're live on {{company}} 🎉",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

You're all set up — your engineer profile is live and you'll start seeing jobs assigned over the next few days.

A few useful pointers:
  • Jobs are sent via the LCL Ops engineer portal — log in to see what's on for the day
  • Update job status as you go (on the way / arrived / completed) so we and the customer stay in the loop
  • Payments are settled weekly — statements land in your inbox every Monday

Welcome aboard,
{{company}}`,
  },

  // ── Letting / estate agents (B2B) ──
  // Positioning: backup compliance contractor. Not replacing their current provider —
  // just getting saved as a fast, reliable option for urgent jobs and overflow.
  agent_intro: {
    name: "Agent — first intro",
    subject: "Compliance backup for your branch — Gas, EICR, EPC (London)",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I'm not looking to replace whoever you already use for compliance — I just wanted to put our details in front of you as a reliable backup option.

We cover Gas Safety (CP12), EICRs, EPCs and Fire Risk Assessments across all 32 London boroughs, and we specialise in fast turnaround: same-day or next-day slots for urgent jobs, overflow work, and situations where your usual contractor isn't available.

A lot of the agents we work with just keep our number saved and call us when they need a quick turnaround on a cert — no contract, no commitment.

Worth keeping our details handy? Happy to send a short rundown of what we cover and our trade pricing.`,
  },
  agent_followup: {
    name: "Agent — follow-up",
    subject: "Quick follow-up — compliance backup for your branch",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Just following up on my note last week. No pressure at all — I know most agencies have contractors they already rely on.

We're just here as a fast, dependable backup for the moments when your usual contact can't get out quickly — Gas Safety, EICR, EPC, FRA, same-day turnaround wherever possible.

If it's useful I can send our trade price list. Just reply here and I'll get it over.`,
  },
  agent_proposal: {
    name: "Agent — proposal",
    subject: "Trade proposal for {{company}} — managed portfolios",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Following our chat — here's a quick summary of what we offer to letting and estate agents:

  • Gas Safety (CP12), EICR, EPC, Fire Risk Assessment, PAT testing
  • Same-day or next-day appointments across all 32 London boroughs
  • Certificates issued same day (where possible)
  • Trade pricing — no volume commitment needed
  • Single point of contact for booking, certs and invoices
  • Flexible: works for both landlord-managed and tenant-occupied properties

We work best as a backup or overflow option — so no need to swap your existing contractors. Just keep our number saved and call when you need a fast turnaround.

Happy to do a 10-min call to run through how we work. Reply with a time that suits and I'll send a calendar invite.`,
  },

  // ── Prospect renewal — service-specific ──
  prospect_renewal_gas: {
    name: "Prospect renewal — Gas",
    subject: "Your Gas Safety certificate is due for renewal",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I noticed your Gas Safety certificate renewal is coming up. If you'd like, we can get that sorted out for you and make sure your property is fully compliant — same-day appointment slots available.

Just reply to book a convenient time, or call {{phone}}.`,
  },
  prospect_renewal_eicr: {
    name: "Prospect renewal — EICR",
    subject: "Checking in on your EICR",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I wanted to check in on your EICR (Electrical Installation Condition Report) and see how it's going. If anything needs to be changed, fixed, or if a new inspection needs to be done, we can get it covered for you.

Reply to book or call {{phone}}.`,
  },
  prospect_renewal_epc: {
    name: "Prospect renewal — EPC",
    subject: "Your EPC certificate is approaching renewal",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Your EPC (Energy Performance Certificate) is approaching its renewal date. If you'd like, we can get that sorted out for you and make sure your property is fully compliant — DEA assessor out within a couple of days and the certificate issued same-day.

Reply to book or call {{phone}}.`,
  },
  prospect_renewal_fra: {
    name: "Prospect renewal — FRA",
    subject: "Checking in on your Fire Risk Assessment",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I wanted to check in on your Fire Risk Assessment and see how it's going. If anything needs to be changed, fixed, or if a new inspection needs to be done, we can get it covered for you.

Reply to book or call {{phone}}.`,
  },
  prospect_renewal_pat: {
    name: "Prospect renewal — PAT",
    subject: "Your PAT test is due for renewal",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Your PAT (Portable Appliance Testing) is due. If you'd like, we can get that sorted out for you and make sure your property is fully compliant — we can test all appliances on a single visit and issue the certificate same-day.

Reply to book or call {{phone}}.`,
  },
  prospect_renewal_generic: {
    name: "Prospect renewal — generic",
    subject: "Your {{service}} certificate is due for renewal",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I noticed your {{service}} is due for renewal. If you'd like, we can get that sorted out for you and make sure your property is fully compliant.

Just reply to book or call {{phone}}.`,
  },

  // ── Cold outreach (sequence of 3 touches) ──
  cold_outreach_1: {
    name: "Cold outreach — touch 1",
    subject: "Landlord compliance certificates — quick intro",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

I'm from {{company}}. We provide gas safety, EICR, EPC and fire safety certificates for London landlords — same-day certificates, certified engineers, transparent pricing.

If you've got a property coming up for renewal, reply with the address and what's needed and I'll send a quote.`,
  },
  cold_outreach_2: {
    name: "Cold outreach — touch 2",
    subject: "Quick follow-up — compliance certificate",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Just checking in on my note from last week. If the renewal is on your list, reply with the address and I'll send a quote in minutes.`,
  },
  cold_outreach_3: {
    name: "Cold outreach — touch 3",
    subject: "Last note — compliance pricing list",
    body: `Hi {{client_name}}, this is Lisa from {{company}}.

Last note from me — sharing our price list in case it's useful for future renewals. We're here whenever you need:

  • Gas Safety (CP12): from £60
  • EICR: from £77.99
  • EPC: from £99.99
  • Fire Risk Assessment: from £84

Reply or call {{phone}} when you're ready.`,
  },
};
