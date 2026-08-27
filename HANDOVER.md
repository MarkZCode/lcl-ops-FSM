# LCL Ops + Website — Project Handover

This document lets a new Claude (or developer) pick up both projects with **zero context loss**. Read this first.

---

## 1. The two projects

| Project | Path | What it is | Runs on |
|---|---|---|---|
| **Website** | `/Users/macbookpro/Claude LCL` | Public marketing site for Landlord Compliance London | http://localhost:3100 |
| **Ops tool (FSM)** | `/Users/macbookpro/Claude LCL Ops` | Internal ServiceM8-style field-service mgmt app | http://localhost:3200 |

Both: **Next.js 14 (App Router), JavaScript (no TypeScript), Tailwind, framer-motion, react-icons.** Ops also uses `date-fns`, `jspdf`, `nodemailer`.

---

## 2. How to run (IMPORTANT — Node is NOT installed system-wide)

A **portable Node** lives at `~/.lcl-node/node-v20.18.0-darwin-x64/`. `npm`/`node` are NOT on the default PATH — that's why "it won't run" happened before.

**Easiest:** double-click `START.command` (Ops) or `START_WEBSITE.command` (website).

**Manual:**
```bash
export PATH="$HOME/.lcl-node/node-v20.18.0-darwin-x64/bin:$PATH"
cd "/Users/macbookpro/Claude LCL Ops"   # or "Claude LCL"
npm run dev -- -p 3200                    # website uses 3100
```
On a normal machine with Node installed, just `npm install && npm run dev`.

---

## 3. Business facts (single sources of truth)

- **Company:** Landlord Compliance London — "Fast. Reliable. Compliant."
- **Brand colours:** navy `#14213D`, green `#3FA34D`, white. (In Tailwind: green is under the `teal` key on the website, `brand` key in Ops.)
- **Phone:** 07426 409342  ·  **Email:** landlordcompliancelondon@gmail.com
- **Registered office:** 100 Barbirolli Square, Manchester, M2 3BD · **Company reg:** 15900987
- **Bank (Clear Bank, GB):** Usman Ghani · Acct 00978194 · Sort 04-09-72 · IBAN GB30CLRB04097200978194
- **Coverage:** all 32 London boroughs + M25 corridor
- Edit these in: website `lib/site.js`; Ops `lib/site.js` + `lib/invoiceConfig.js`.

### Pricing note (UNRESOLVED — confirm with owner)
Gas Safety is currently **£30 per appliance** in the Ops tool (user's explicit instruction; matches Invoice #344 "2 appliances £60"). BUT the official PRICINGS PDF says £60/£70/£80 for 1/2/3 appliances. **Confirm which is correct.** Other prices (EICR £64.99, EPC £52, etc.) live in `lib/constants.js` (Ops) and `lib/services.js` (website).

---

## 4. Ops tool — current feature state (all built & verified working)

- **Auth/login** — `lib/auth.js`. Roles: **admin** (sees all) and **agent/engineer** (Dashboard, Dispatch, Jobs, Clients, Help only). Default logins `admin/admin123`, `james/engineer123`. Admin manages users in Settings.
- **Dashboard** — stats, recent jobs, renewals panel.
- **Dispatch** (`/dispatch`) — ServiceM8-style: compact mini-calendar (left rail, navigate year/month/day) + engineer columns; drag job cards between engineers to reassign.
- **Jobs** (`/jobs`, `/jobs/[id]`) — searchable list + board, status filter; detail has status workflow, Email, Invoice (admin), Payment panel (admin), edit/delete.
- **Clients** (`/clients`, `/clients/[id]`) — CRM with multiple properties, job history, lifetime value. New clients can be created inline while making a job.
- **Reports** (`/reports`, admin) — Day/Week/Month/Year periods + prev/next nav, revenue/collected/outstanding, bar chart, breakdowns by service/engineer/status.
- **Invoices** — `components/InvoiceModal.js` + `lib/generateInvoice.js` (jsPDF port of the owner's real generator; logo embedded, new bank details, quick-add presets, VAT, auto-incrementing number). Opens prefilled from a job.
- **Email** — LIVE via Gmail SMTP. `app/api/send-email/route.js` (nodemailer). "Send email" on a job sends for real. Templates in `lib/settings.js`, editable at `/settings/email`.
- **WhatsApp** — click-to-send buttons (`lib/whatsapp.js`, wa.me links), API-ready for future automation.
- **Payments** — bank transfer + Mark-as-paid/invoiced workflow (Nsave can't take cards; Stripe optional future).
- **Help & Docs** (`/help`) — user guide, editable document templates, company document storage with **real file upload** (stored as data URLs in localStorage).
- **Settings** (admin) — users, engineer roster, service catalogue, integrations roadmap, email config, reset demo data.

### Data layer (the key architectural fact)
All data is in **localStorage via React context** (`lib/store.js` for jobs/clients/templates/docs; `lib/auth.js` for users). The API is deliberately DB-like (addJob/updateJob/etc.) so it can be swapped for a real backend **without changing UI components**. Seed data in `lib/seed.js`.

---

## 5. Secrets / env

`Claude LCL Ops/.env.local` (gitignored, NOT committed) currently holds:
```
GMAIL_USER=landlordcompliancelondon@gmail.com
GMAIL_APP_PASSWORD=<16-char Gmail app password>
```
Env vars load only at server START — restart after any change. `.env.local.example` documents the format.

---

## 6. THE BIG NEXT STEP: real database (do this on the Pro plan)

Right now data lives in one browser. To make it multi-user / multi-device:

1. **Supabase** (recommended, free tier): Postgres + auth + file storage.
   - Tables: `clients`, `properties`, `jobs`, `users`, `doc_templates`, `company_docs`, `email_templates`, `settings`.
   - Replace the internals of `lib/store.js` and `lib/auth.js` with Supabase calls — the component API stays the same.
   - Move auth to Supabase Auth (real hashed passwords + sessions) — replaces the prototype gate in `lib/auth.js`.
   - File uploads → Supabase Storage (instead of localStorage data URLs).
2. Then unlock: **automatic renewal reminders** (cron + email), **engineer mobile logins**, shared live data.
3. Optional: **Stripe** for card payments.

---

## 7. How to hand off to the new Claude (do this)

1. **Keep both folders** (`Claude LCL`, `Claude LCL Ops`) and `~/.lcl-node` — they're self-contained. Don't delete `node_modules` unless you'll re-run `npm install`.
2. In the new chat, **paste this file's path** and say: *"Read HANDOVER.md in /Users/macbookpro/Claude LCL Ops and continue the LCL Ops project."*
3. Also mention the **memory file** exists at `~/.claude/projects/-Users-macbookpro-Claude-LCL/memory/` (lcl-ops-tool.md + lcl-website-project.md) — it has the detailed running log.
4. First task to give it: **migrate Ops data layer to Supabase** (Section 6). You'll need to create a free Supabase account and share the project URL + anon key.
5. **Back up** before big changes: zip both folders, or `git init` each and commit (a `.gitignore` is already present in both).

### What to tell the new Claude on day one
- "Node isn't installed system-wide; use the portable one at ~/.lcl-node or install Node."
- "Don't put secrets in client code; .env.local only."
- "Verify builds with `next build` and test live before claiming things work."
- "Confirm the gas pricing question (Section 3) before touching pricing."

---

## 8. Known open items / TODO
- [ ] Confirm gas pricing (£30/appliance vs £60/£70/£80).
- [ ] Real database (Supabase) — replaces localStorage.
- [ ] Real auth (hashed, server-side) — current login is a client-side prototype gate.
- [ ] Automatic renewal reminders (needs DB + cron).
- [ ] Engineer mobile logins (needs DB auth).
- [ ] Replace sample testimonials on the website with real reviews.
- [ ] Website: legal pages (privacy/terms) are templates — owner should review.
- [ ] Optional: Stripe card payments; WhatsApp Business API (auto-send).
- [ ] Bump Next.js (14.2.5 has a flagged security advisory) before production deploy.
