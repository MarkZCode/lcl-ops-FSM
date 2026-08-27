# Outreach architecture

LCL Ops separates outreach into **two pipelines** depending on the relationship
with the lead:

| Pipeline | Audience | Tone | Channels |
|---|---|---|---|
| **Prospects** (`/prospects`) | Past compliance clients nearing renewal | Light — single email + one chase, optional call | Email, manual call, optional AI call |
| **Cold Leads** (`/cold-leads`) | Internet-scraped contacts with no prior relationship | Heavy — sequences, AI calls, full sales pipeline | Bulk email + chase, AI call, manual call, WhatsApp |

Both pipelines write to the **same** `email_sends` and `email_queue` tables, so
the Email log (`/email-log`) is the single source of truth for what went out
and what came back.

## Lead segments (Cold Leads)

Segments are stored on each `cold_leads` row as `segment`:

| Code | Label | Default cadence | Purpose |
|---|---|---|---|
| `letting_agent` | Letting agents | heavy | Property managers — recurring portfolio compliance work |
| `estate_agent` | Estate agents | heavy | Sales agents — EPCs + certs for listings |
| `residential` | Residential | medium | Individual landlords |
| `commercial` | Commercial | medium | Commercial premises managers |
| `engineer_recruit` | Engineer recruitment | medium | Cold outreach to recruit gas/electrical engineers |

The segment drives:
- Which **default email template** the CampaignBuilder loads
- The **default chase delay** (heavy = 3 days, medium = 5 days)
- The label shown in the Cold Leads table

To **add a new segment**, edit `lib/cold-leads.js` `SEGMENTS` array and add a
template entry in `components/CampaignBuilder.js` `TEMPLATES`.

## Letting-agent classification (Prospects)

Letting agents in the **Prospects** pipeline are NOT auto-detected from
multi-property ownership — that produced false positives where landlords with
multiple properties were misclassified. Instead:

- A prospect is treated as a letting agent **only** when `isAgent === true`
- The Prospects → Letting agents tab shows two lists:
  - **Letting agents**: contacts explicitly flagged
  - **Suggested**: multi-property contacts (≥2 properties) not yet flagged — one click to confirm

The flag is set from the prospect's caller card (`Mark as agent` button) or by
clicking `Mark as agent` on a suggested card.

## Campaign mechanics

`components/CampaignBuilder.js` is used by Cold Leads for bulk sends. Each send
goes through `/api/send-email` which:

1. Verifies the user session
2. Enforces the daily quota (`DAILY_CAP = 400` — keeps headroom under Gmail's
   ~500/day soft limit; the cap is shared across all senders, all segments)
3. Rate-limits per user (`sendEmail` limit in `lib/rateLimit.js`)
4. Logs every send to `email_sends` with the campaign label and prospect/lead id

If a chase is enabled, queue rows are inserted into `email_queue` after the
initial run completes. The chase worker (`/api/email-queue/process`) runs
daily at 09:00 UTC (Vercel Hobby cron limit) and:

- Skips queued rows whose lead has replied (the Gmail webhook auto-cancels
  pending chases when it sees a reply)
- Skips rows whose lead has moved to `dnc | won | booked`
- Throttles at one send every 0.8s
- Respects the same `DAILY_CAP`

A "Process now" button on `/email-log` lets you trigger the worker on demand
between the daily cron firings.

## Phase 2 (shipped)

- **AI call channel in CampaignBuilder** — bulk Vapi outbound to the selected
  segment. The same modal that handles email also handles AI calls; channel
  selector at the top toggles the relevant fields. `/api/vapi/call` accepts
  both `prospectId` and `coldLeadId`. Per-session call cap (default 60), 3s
  spacing between calls. Each call is logged to the lead's `contactLog` and
  bumps stage to `contacted` if it was `new`.
- **Manual dialer modal** (`components/ManualDialerModal.js`) — single-lead
  click-to-call. Opens the device `tel:` handler, then surfaces a fixed list
  of outcomes (no answer / voicemail / spoke — interested / spoke — not now /
  booked / DNC). Each outcome maps to a deterministic stage transition and
  writes a structured note to the lead's contact log.
- **Recruitment email templates** — five named templates in `lib/settings.js`:
  `recruit_outreach`, `recruit_chase`, `recruit_interview`, `recruit_docs`,
  `recruit_onboarded`. These cover the full recruitment funnel from first
  cold email through onboarding confirmation.
- **Engineer Applicants tab** (`/engineers` → Applicants) — surfaces
  `engineer_recruit` cold leads who have replied/booked, grouped by phase
  (Outreached → In conversation → Interview booked → Ready to onboard).
  "Onboard" button opens the EngineerModal pre-filled with the applicant's
  contact details. Saving creates the engineer and marks the source lead as
  `won` so it drops off the applicants list.

## Phase 3 (planned)

- **CampaignBuilder unification** — fold `ProspectCampaign` into a thin preset
  over `CampaignBuilder` so there's only one bulk-send modal in the codebase
- **Reply-aware AI calling** — auto-skip AI call campaigns for leads that
  replied in the last N days (currently only the email chase auto-cancels)
- **Onboarding checklist** — once an engineer is onboarded, surface a 5-step
  checklist (Gas Safe ID, NICEIC/NAPIT, public liability, ID + utility bill,
  bank details) so the user can tick them off and the engineer record holds
  the docs
- **Stripe customer pay-links** on invoices
- **Twilio SMS** for booking reminders
