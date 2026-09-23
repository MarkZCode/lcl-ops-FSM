// Default document templates for the Help & Docs library.
// These are customisable, fillable text documents (quotes, letters, terms).
// Document PDFs / certificates plug in here later (invoice generator code TBD).

export const defaultDocTemplates = [
  {
    id: "doc-quote",
    name: "Written quote",
    category: "Sales",
    body: `LANDLORD COMPLIANCE LONDON
Written Quotation

Date: {{date}}
Client: {{client_name}}
Property: {{property}}

We are pleased to quote for the following:

Service(s): {{service}}
Total price: {{price}} (inc VAT)

This quote is valid for 30 days. All work is carried out by accredited engineers and backed by our 12-month workmanship guarantee.

To accept, reply to this quote or call {{phone}}.

Landlord Compliance London`,
  },
  {
    id: "doc-booking",
    name: "Booking confirmation letter",
    category: "Operations",
    body: `Dear {{client_name}},

This confirms your appointment with Landlord Compliance London.

Job reference: {{job_id}}
Service(s): {{service}}
Property: {{property}}
Date & time: {{date}}

Our engineer will carry photo ID. Please ensure access is available. To rearrange, call {{phone}}.

Kind regards,
Landlord Compliance London`,
  },
  {
    id: "doc-reminder",
    name: "Renewal reminder letter",
    category: "Operations",
    body: `Dear {{client_name}},

Our records show the {{service}} certificate for {{property}} is due to expire on {{expiry}}.

To remain compliant, we recommend rebooking 4–6 weeks before expiry. Call {{phone}} or reply to arrange a convenient time.

Kind regards,
Landlord Compliance London`,
  },
  {
    id: "doc-agent-call-script",
    name: "Letting / Estate Agent — Cold Call Script",
    category: "Scripts & Training",
    body: `LETTING / ESTATE AGENT COLD CALL SCRIPT
Landlord Compliance London — Lisa speaking

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PURPOSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Position LCL as a BACKUP compliance contractor — not replacing whoever they
already use. Goal: get our number saved as the fast, reliable option they call
when their usual contractor can't get out quickly.

Services we offer: Gas Safety (CP12), EICR, EPC, Fire Risk Assessment (FRA),
PAT testing — all 32 London boroughs, same-day or next-day turnaround.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE YOU CALL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Check if they're marked as isAgent in Prospects — review contact history.
• Know who you're calling (branch name, area, manager name if possible).
• Have the trade price list ready to send by WhatsApp or email.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Hi, is that [name / manager]? Great — my name's Lisa, I'm calling from
Landlord Compliance London. Quick question for you — who do you currently
use when you need a fast turnaround on compliance certs? Gas Safety, EICRs,
that kind of thing."

[Let them answer.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IF THEY HAVE A CONTRACTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"That's great — I'm not looking to replace them at all. The reason I'm calling
is that a lot of agencies we work with just keep our details as a backup —
for when their usual person is busy or can't get out quickly. We cover all 32
London boroughs, we typically get someone out same day or next day, and the
certificate is issued the same day too.

Does that sound like something worth having in your back pocket?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IF THEY SAY YES / SHOW INTEREST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Brilliant. Can I send you our trade pricing by WhatsApp or email? It's a
short list — Gas Safety, EICR, EPC, FRA — with our trade rates.

What's the best number / email to send it to?"

→ Send the intro WhatsApp message (use the WhatsApp button on their Prospect
  record — the intro message is pre-filled).
→ Log the contact in their Prospect record and move stage to "contacted."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IF THEY ASK WHAT WE DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"We provide all the main compliance certificates for landlords and letting
agents — Gas Safety (CP12), EICRs, EPCs, Fire Risk Assessments, PAT testing.
We're Gas Safe and NICEIC accredited, all engineers are fully insured, and
certs are issued same day wherever possible.

We work a lot with agents who just need something sorted quickly — a tenant
moving in, a cert that's lapsed, a property that needs a cert before it can
be re-let. That's kind of our bread and butter."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IF THEY PUSH BACK / "WE'RE FINE THANKS"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Totally fine — I just wanted to make sure you had our details in case it's
ever useful. Can I send a quick WhatsApp with our number and what we cover?
That way you've got it if you ever need a fast turnaround and your usual
person isn't available."

→ If they agree: send intro WhatsApp.
→ If they decline: thank them, log the contact, mark stage as DNC.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLOSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"Thanks so much for your time. I'll get that over to you now. If you ever
need anything sorted quickly, just give us a call — we're usually able to
help on the day.

Have a great day!"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AFTER THE CALL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Log the contact on their Prospect record (call icon → add note).
2. Move pipeline stage (New → Contacted, Contacted → Interested etc.).
3. If they gave contact details — send the WhatsApp intro (pre-filled on
   the record) or the "Agent — first intro" email from the Campaigns tab.
4. Set a follow-up reminder for 5–7 days if no reply.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY POINTS TO REMEMBER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• We are a BACKUP option — do not pitch as a replacement.
• Same-day / next-day is our key differentiator.
• Certificates issued same day wherever possible.
• Trade pricing available (no volume commitment).
• All 32 London boroughs.
• Gas Safe + NICEIC accredited, fully insured engineers.`,
  },
  {
    id: "doc-agent-wa-full",
    name: "Letting / Estate Agent — WhatsApp Full Info (on reply)",
    category: "Scripts & Training",
    body: `WHATSAPP — FULL INFO (send when they reply and ask for more)

Hi [name], thanks for getting back to me!

Here's a quick overview of what we cover:

SERVICES & TRADE PRICING
━━━━━━━━━━━━━━━━━━━━━━━
• Gas Safety Certificate (CP12): from £60
• EICR (Electrical Safety Report): from £77.99
• EPC (Energy Performance Certificate): from £99.99
• Fire Risk Assessment: from £84
• PAT Testing: from £50

HOW IT WORKS
━━━━━━━━━━━
• You call or message us with the property address and what's needed.
• We book an engineer — usually same day or next day.
• The engineer attends, carries out the inspection, and the cert is
  emailed to you (and the landlord if needed) the same day.
• We invoice you at trade rate — no credit card needed, we can invoice
  monthly if that's easier.

WHAT WE COVER
━━━━━━━━━━━━
All 32 London boroughs. Gas Safe registered engineers, NICEIC accredited
electricians, fully insured.

We work best as your backup or overflow option — so no need to change
your existing setup. Just keep our number saved and call when you need
something sorted quickly.

Any questions just ask — always happy to help.

Lisa
Landlord Compliance London
[phone]`,
  },
];

// Categories used to organise company document storage.
export const DOC_CATEGORIES = [
  "Insurance",
  "Accreditations",
  "Certificates",
  // Separate from the generic "Certificates" above — this is specifically
  // for each engineer's own Gas Safe / NICEIC / NAPIT card and other
  // accreditation documents, so they're easy to find and check against
  // their renewal date instead of mixed in with company-level paperwork.
  // Use the Note field for the registration number and the renewal/next
  // inspection due date.
  "Engineer Certificates",
  "Contracts",
  "Scripts & Training",
  "Other",
];
