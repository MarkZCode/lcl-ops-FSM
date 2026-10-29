# LCL Agent Knowledge Pack — source material

> **How to use this file:** paste the whole thing into Claude chat with the prompt at the very bottom. It is the raw, complete content for a new agent's training document for Landlord Compliance London (LCL). Everything here reflects how the business and the LCL Ops app actually work as of build v134 (2 October 2026).

---

## PART 1 — WHO WE ARE AND HOW THE BUSINESS WORKS

**Company:** Landlord Compliance London (LCL)
**Website:** landlordcompliancelondon.uk
**Phone / WhatsApp:** 07426 409342 (+44 7426 409342)
**Coverage:** all 32 London boroughs
**Appointment windows:** Monday–Friday, Morning 8am–1pm or Afternoon 1pm–6pm
**Client-facing names:** Lisa (default) and Olivia. Each job is signed by one name; use the name shown on the job ("Messages signed by" in Job details). Never switch names mid-conversation with a client.

**What we are:** a coordination business. We do not carry out the inspections ourselves. A client enquires, we collect the details, quote, find a qualified independent engineer, book the visit, receive and check the certificate, send it to the client, and collect payment. Never say "we inspected" or "I tested" — the engineer did. Our value is making compliance simple: one contact, fast answers, the right engineer, the paperwork checked.

**The app:** LCL Ops (the "FSM"), at lcl-ops.vercel.app. Every job, message, payment and certificate lives there. If something is not recorded in the app, for the rest of the team it did not happen.

---

## PART 2 — RULES THAT ARE NEVER BROKEN

1. **Never say "booked" before the engineer has confirmed.** Until then the wording is "we are arranging your appointment". The app will not let the booking confirmation go out before the engineer confirms — do not work around it by typing it yourself.
2. **Never mention VAT to a client.** Not in a message, quote, invoice or call. A price is just the price. (VAT on an engineer's fee appears on internal screens only — that is fine and stays internal.)
3. **No bundle discounts.** Several services together are priced as the sum of each.
4. **Bank transfer only.** We do not take card payments. The bank details are on the invoice; the client uses the job reference (e.g. JOB-4821) as the payment reference.
5. **Engineer pay and rate cards are confidential.** Never tell a client what an engineer is paid, and never forward an engineer's rate.
6. **Parking and the congestion charge are added automatically** (parking £5; congestion charge £18 when the postcode is inside the zone). Use the wording on the quote. Do not offer receipts or proof, and do not apologise for the charge.
7. **Never put the price in the WhatsApp message that goes with the quote.** The price is in the quote email only.
8. **Encourage the client to book soon, but never promise same-day or next-day attendance** unless an engineer has actually confirmed it for that job.
9. **Never invent or predict a result.** Do not promise a "pass", do not interpret a report, do not change anything on a certificate. Engineer findings are passed on exactly as written.
10. **Never move a job forward by hand to skip a step.** The status changes when the real thing happens: accepted, engineer confirmed, completed, paid, certificate sent.
11. **Record everything.** Every call is logged, every message is sent from (or noted on) the job.
12. **Certificates are sent only after they have been checked** against the job (name, address, date, service, result).
13. **Share with the engineer only what they need.** Scope and area first; client and access details after they accept.

---

## PART 3 — EMAIL ADDRESSES, NUMBERS, AND WHICH ONE IS USED FOR WHAT

We have two kinds of email: the **company-domain mailboxes hosted at Hostinger** (@landlordcompliancelondon.uk) and a **Gmail account**.

**Rule of thumb: anything a real client sees about their own job goes from the company domain (Hostinger). Bulk outreach and prospecting never go from the company domain — they go from Gmail (or Resend), so that mass sending can never damage the reputation of the domain our invoices are judged on.**

| Address | Host | Used for | A client's reply lands in |
|---|---|---|---|
| info@landlordcompliancelondon.uk | Hostinger | Quotes, quote follow-ups, review requests, general enquiries. This is the address shown on quotes. | info@ |
| bookings@landlordcompliancelondon.uk | Hostinger | Booking confirmations, appointment reminders, "engineer on the way", renewal reminders | bookings@ |
| accounts@landlordcompliancelondon.uk | Hostinger | Invoices, receipts, job-completed emails, payment chasers, statements. This is the address shown on invoices. The weekly backup is also sent here. | accounts@ |
| certificates@landlordcompliancelondon.uk | Hostinger | Sending certificates and reports | certificates@ |
| engineers@landlordcompliancelondon.uk | Hostinger identity (sent via Resend, or Gmail if Resend is not set up) | Engineer recruitment: outreach, chasing, interview, documents, onboarding | engineers@ |
| landlordcompliancelondon@gmail.com | Gmail | (a) Cold outreach and prospect / renewal campaigns. (b) The inbox the app reads — the Inbox screen and "new email enquiry" detection read this Gmail. (c) Fallback: if a Hostinger mailbox is not connected, that kind of email is sent from Gmail instead so nothing is blocked. | Gmail |

**What the agent actually does:** you do not choose the mailbox. When you send an email from a job in the app and pick the template (Quote, Booking confirmation, Invoice, Certificate…), the app sends it from the correct mailbox automatically. Only use the template that matches what you are sending — sending an invoice with the "Quote" template would send it from the wrong address and the reply would land where nobody is looking.

**Replies:** a client replying to a quote lands in info@, to an invoice in accounts@, and so on. Replies and enquiries show in the app's Inbox; you can reply from there and save attachments onto the job.

**Daily limits:** there is a daily cap per mailbox (Settings → Rules). If the app refuses to send because the cap is reached, stop — do not switch to a personal email.

**WhatsApp:** one business number, 07426 409342. Tapping a client's number in the app opens their chat with the message typed. WhatsApp Business has been restricted before for sending too many similar messages — the app caps outreach WhatsApps per day. Respect the cap; never bulk-paste the same message to many people.

**If a client says "I never got your email":** check the Messages tab on the job (it shows exactly what was sent, when, from where). Do not argue. Resend it, and offer to send on WhatsApp as well.

---

## PART 4 — LCL OPS: FINDING YOUR WAY AROUND

- **Jobs** — opens on Quote → All quotes and remembers your last filter. Quotes are grouped: New enquiry, Details required, Quote sent, Following up, Will get back, Accepted · booking. Other statuses: Scheduled, In progress, Completed, Invoiced, Paid, Certified, Cancelled. The **Next step** column tells you what each job needs; red = urgent.
- **Job page** — tabs: Overview, Booking, Money, Documents, Messages, Everything. The **Next step card** at the top is the single thing to do now; its main button does it, the smaller button means "I already did this another way".
- **Job details panel** (on the job) — the questions that service needs, what is still missing, "Ask on WhatsApp", "Copy the message", "Copy staff note", name on the certificate, who signs messages, urgency reason, client deadline, no-access fee.
- **Inbox** — emails in and out; reply with a template; save attachments to the job.
- **Tasks** — created automatically from each job's next step and shared across the team by workload. Clear your tasks by doing the step on the job, not by ticking the task.
- **Dispatch** — the day by engineer; tray of accepted jobs needing a date; suggested route; map.
- **Clients / Engineers / Reports / Settings** — records, performance, and (admins) the rules.
- **Notifications** — every signed-in device is notified of a new enquiry and of a client accepting a quote. Held 9pm–7am and delivered in the morning.

**Job reference:** every job has a reference like JOB-4821. It is used on the quote, invoice and as the bank payment reference. References are never reused.

---

## PART 5 — SOP: QUOTE MANAGEMENT (enquiry → accepted)

### 5.1 Where enquiries come from
- **Website form / email** — the app creates the client and a draft quote automatically: services, size, parking, and the congestion charge if the postcode is in the zone. All devices are notified.
- **Phone / WhatsApp** — you create it: Jobs → New job. Pick the postcode from the dropdown (avoids typos and applies the congestion charge correctly).

### 5.2 The three steps for an automatic enquiry (target: first reply within 15 minutes in office hours)
1. **Step 1 — Check the quote.** Read what the client actually wrote. Check service, number of appliances / bedrooms / floors, and price. Fix anything wrong. Press **Quote checked**.
2. **Step 2 — Reply on WhatsApp.** Press **Open WhatsApp**. The message is typed for you. (No phone number → this step is skipped.)
3. **Step 3 — Send the quote** by email from the job (template: Quote). Then the next step becomes **Send the WhatsApp message with the quote** — do it straight away.

### 5.3 What must be known before quoting (it changes the price)
| Service | Must know to price | Also needed before booking |
|---|---|---|
| Gas Safety (CP12) | Number of gas appliances | Which appliances (boiler, cooker/hob, gas fire), full address, certificate name, access contact, preferred date/time |
| EICR (residential) | Bedrooms, number of consumer units (fuse boxes) | Same booking details |
| EICR (commercial) | Consumer units, approximate number of circuits | Same |
| EPC | — (property type is helpful) | Same |
| Fire Risk Assessment | Bedrooms/flats, floors, whether there are communal areas | Same; for commercial also what fire safety is already in place |
| PAT | Approximate number of appliances | Same |
| Emergency lighting | Floors/areas, approximate number of fittings | Same |
| Asbestos | — (building age, areas to survey are helpful) | Same |

A **postcode alone is enough to quote**. The full address is needed before booking, not before quoting.

If something price-critical is missing, the next step is **Ask for the missing details**. Use **Ask on WhatsApp** in Job details — it asks only for what is missing. When the client answers, type the answers into Job details; the quote then becomes ready. No answer in 2 days → the job asks you to chase once.

### 5.4 Sending the quote
- Email from the job with the **Quote** template. It attaches the quote PDF, includes the link where the client can accept online, and ends with the line asking them to reply today so the earliest slot can be held (wording set in Settings → Rules).
- Then send the **WhatsApp that goes with the quote** (next step button). It contains: what was quoted, the property, the customer name, the list of what we still need to book it, and the same reply-today line. **It never contains the price.**
- If you sent the quote some other way, press **Sent on WhatsApp / phone** so the job knows.
- Quotes are valid for 30 days.

### 5.5 After the quote is sent
| What happens | What you do |
|---|---|
| No decision after 2 days | **Chase the quote** (template: Quote follow-up). Urgent at 5 days. |
| Client: "I'll get back to you" / "after the handover" / "next month" | **Client will get back…** → enter the date → **Park until then**. The job stays quiet, then asks you to follow up on that date. |
| Client wants it done but later ("in two weeks") | That is a yes. Mark it accepted and agree a date. |
| Client says no / went elsewhere / too expensive | **Client declined**, choose the reason. Do not argue on price and do not offer a discount. |
| Chased, silent for 3 weeks | The job suggests closing it. Close it. |
| 30 days since the quote | Expired — send a fresh quote or close it. |
| Client asks a question | "Reply to the client" becomes the top step. Answer, from the job. |
| Client accepts on their link | Everyone is notified; the job moves to Accepted · booking. |
| Client accepts by phone/WhatsApp | Press **Client accepted**. |

**Accepted does not mean booked.** Nothing is booked yet.

---

## PART 6 — SOP: JOB MANAGEMENT (accepted → certificate)

### 6.1 Booking details (Booking tab / Job details)
Before a date can be fixed we need: full property address, the name to go on the certificate, who gives access and their phone number, and the client's preferred date and window. The job shows "Add the booking details" until these are in.

### 6.2 Assign and get the engineer's confirmation
- Pick the date and window (Morning 8–1, Afternoon 1–6) and the engineer. The app suggests an engineer and warns about days off, clashes, daily capacity and expired paperwork (e.g. a Gas Safe card).
- The engineer receives an offer with a link to **confirm or decline**. If they tell you directly, press **Mark confirmed**.
- Until then the job reads "Pending — engineer hasn't confirmed". **Tell the client nothing is fixed yet.**
- Declined → assign another engineer. No confirmation and the visit is within 48 hours → confirm by phone or reschedule with the client.

### 6.3 Tell the client
Only once the engineer has confirmed: **Send the booking confirmation** (date, arrival window, engineer attending, what to have ready). The day before: **Send the appointment reminder**. Within two days of the visit: **Confirm access** — check someone will be there, then tick **Access confirmed for the appointment**.

### 6.4 The visit
At the appointment time the job shows In progress. Afterwards mark it complete. If the day passes with nothing recorded, the job turns urgent: **Mark it complete**, or use **Not done…** to record what was not finished.

### 6.5 Invoice
Money tab → invoice. Choose the account in **Pay into** before generating — the choice stays selected until someone picks the other account. Send with the Invoice template (goes from accounts@). A completed job not invoiced after 2 days is urgent.

### 6.6 Payment
- Record it in the ledger on the Money tab. Part payments are fine; the balance is shown.
- Jobs → Invoiced → **Match bank payments to invoices**: paste the rows from online banking; the app matches by reference and amount; confirm each one.
- Wrong amount or wrong reference → flag the mismatch, resolve it with the client, press **Resolved**. Credit note if we owe money back.
- Unpaid at 7 days: chase. 14 days: urgent. 30 days: call.

### 6.7 Certificate
- The engineer's document is uploaded on the Documents tab. No document a day after the work → **Chase the engineer for the certificate**.
- Tick the checklist in the Certificate panel: correct property, correct name, correct date, correct service, engineer details present, result recorded.
- Send it (template: Certificate, from certificates@). Sending it marks the job **Certified** — the finish line.
- Standard turnaround to tell clients: **approximately 24–36 hours after payment has cleared**. Only say sooner if it is actually ready.
- Mistake on a certificate → request a correction in the Certificate panel. We never edit a certificate ourselves; the engineer or certifying party corrects it. Press **Corrected document received**, re-check, resend.

### 6.8 Afterwards
Three days after the certificate goes out the job suggests asking for a review. A renewal job can be created for when the certificate expires (GSC 12 months, EICR 5 years, EPC 10 years, FRA normally reviewed every 12 months).

### 6.9 When the inspection fails (remedial work)
1. Open **Remedial work** on the job. Enter the engineer's findings **exactly as reported** (EICR codes C1 danger present, C2 potentially dangerous, C3 improvement recommended, FI further investigation; gas defects).
2. Enter the engineer's cost; the app adds our margin. **Create the remedial job.**
3. The remedial job is a new quote: send it, get acceptance, book, confirm, complete, invoice, and obtain the updated satisfactory document.
4. Tell the client plainly: what the engineer found, what it means for them (an Unsatisfactory EICR or an unsafe gas appliance must be put right), and the quote. Do not soften or reinterpret the findings.

---

## PART 7 — WHAT TO DO WHEN… (every situation)

| Situation | What to do | What to say |
|---|---|---|
| Client wrote and nobody answered | Always first. Reply from the job or inbox. If you answered by phone, press the "handled" button. | — |
| No email or phone on the client | Add one; nothing can be sent otherwise. | — |
| Client gives a deadline (tenant moving in, council, sale) | Enter deadline + reason in Job details. The job warns you 5 days out. | "Thanks — I've noted you need this by [date] and we'll arrange it inside that." (never "guaranteed") |
| Engineer has not confirmed | Chase the engineer. No booking confirmation to the client. | "We're arranging your appointment and will confirm the date and time shortly." |
| Engineer declines / cancels | Reassign on the Booking tab; new engineer must confirm. If the date must move, agree it with the client first. | "There's been a change with the engineer's availability. The latest confirmed option is [option]. Apologies for the inconvenience." |
| Appointment date passed, never confirmed | **Reschedule** — agree a new date with the client. | — |
| Client wants to move the appointment | **Reschedule**; the engineer confirms again; then send the new confirmation. Clients can also request it from their link. | "No problem — we're checking the new time with the engineer and will confirm." |
| Engineer's paperwork expired | Do not send them. Assign someone else or get the document updated. | — |
| Nobody in / no access | **No access** on the Booking tab. The no-access fee (default £20) applies only if it was on the quote. Rebook. | "Our engineer attended at [time] but couldn't get access. As set out on your quote a £[fee] no-access fee applies. When would suit to rebook?" |
| Only part of the work done | **Not done…** — bill what is done, the rest is split into its own job and rebooked. | — |
| Client cancels one service | Cancel that service line; the price updates. | — |
| Client cancels the job | **Cancel**, choose the reason (client cancelled, price, no access, duplicate, no engineer, rebooked, raised in error, other). Can be restored. | — |
| Inspection failed | Part 6.9. | — |
| Work done, no certificate from engineer | Chase the engineer (urgent at 3 days). | To client: "The inspection is complete and the engineer is finalising the report. We'll send it as soon as it's been checked." |
| Certificate has a mistake | Request a correction; never edit it. | "Thank you for flagging that — we've asked for it to be corrected and will send the updated document." |
| Client says they paid, nothing shows | Check the bank, then **Handle a problem… → Payment / bank account problem**. | "Thanks — could you confirm the date, amount and reference used so I can trace it?" |
| Payment wrong amount/reference | Record it, flag mismatch, resolve. | — |
| Client can't pay into the account | Check whether the other approved account can be used (invoice **Pay into**), reissue the invoice. Never give bank details from memory or an old invoice. | — |
| Client asks for a discount / "do a deal for all three" | No bundle discount. | "Our prices are fixed per service and already all-inclusive, so the total is simply each service added together." |
| Client asks "is that including VAT?" | Do not discuss VAT. | "The price on the quote is the full amount to pay — there's nothing added on top apart from what's listed." |
| Client asks why parking / congestion charge | Use the quote wording. | "It's a standard charge for attending your postcode and is shown on the quote up front." |
| Client asks "can you come today/tomorrow?" | Never promise. Check with an engineer first. | "Let me check engineer availability for your area and come straight back to you." |
| Client asks "will it pass?" | Never predict. | "The engineer can only confirm that on the day once it's been tested. If anything needs attention we'll explain it and quote before any work is done." |
| Client asks a technical question you can't answer | Don't guess. | "Good question — let me check with the engineer and come back to you." |
| Client is upset | **Handle a problem… → Upset or angry customer**: acknowledge, state verified facts, say what has been done, say the next action, log it. Never argue or blame. | — |
| Client says "you never replied" | Check Messages tab for the real timeline; resend; offer WhatsApp. | "I'm sorry you've not seen it — I've just resent it to [address] and here on WhatsApp too." |
| Same client, new property / repeat job | **Duplicate** the job or add a new job under the same client. | — |
| Possible duplicate client | Merge the clients (jobs are kept). | — |
| Job not moved in two weeks | Decide: chase, book or close. | — |
| The app will not let you send something | Read the reason shown (missing detail, engineer not confirmed, certificate not checked). Fix that — do not send it outside the app instead. | — |

---

## PART 8 — CLIENT COMMUNICATION

**Style:** UK English. Professional, short, clear, warm, human. Greeting by time of day ("Good morning…"), first name, your sender name, "from Landlord Compliance London". WhatsApp: short paragraphs, no asterisks/markdown, one clear next action. Email: clear subject, facts, the action needed.

**Never write:** VAT, "booked" before confirmation, "guaranteed", "will pass", a price in the WhatsApp that goes with a quote, an engineer's rate, same-day promises, blame.

**Saved WhatsApp replies in the app (WhatsApp a saved reply…):** New enquiry — received · Quote · Ask for a preferred slot · Booking confirmed · Who gives access? · Payment follow-up · Bank details · Certificate completed · Delay update · Ask for a review.

**Calls:** always **Log a call** — Spoke to the client / No answer / Voicemail / Missed their call. Write one line on what was agreed.

### Standard messages

**1. First reply to an enquiry (details missing)**
> Good morning [Name], Lisa here from Landlord Compliance London. Thank you for your enquiry regarding a [service, e.g. Gas Safety Certificate (CP12) for 3 gas appliances] at [postcode].
>
> We'd be happy to arrange this for you. Could you please confirm:
> • [only what is missing]
>
> Once confirmed, we can provide the exact quote and available appointment times.

**2. First reply to an enquiry (nothing missing)**
> Good morning [Name], this is Lisa from Landlord Compliance London. Thank you for your enquiry regarding the [service] at [postcode].
>
> We'd be happy to arrange this for you and will come back to you with the quote shortly.

**3. WhatsApp sent with the quote (no price)**
> Hi [Name], Lisa here from Landlord Compliance London.
>
> We've prepared your quote for the [service].
>
> Job: [service – scope]
> Property: [postcode or address]
> Customer: [full name]
>
> To arrange the booking, please send us:
> • Full property address
> • Certificate name
> • Tenant/access contact name and number
> • Preferred date and time
>
> Once we have these details, we can confirm the appointment with the engineer.
>
> Our diary for this week is filling up quickly, so if you'd like to go ahead, just reply today and I'll hold the earliest available slot for you.

**4. Internal staff note (team chat, never to the client)**
> NEW GSC ENQUIRY
>
> Customer: [name]
> Postcode: [postcode]
> Phone: [phone]
> Email: [email]
> Service: [service]
> Appliances: [n]
> Job: [JOB-ref]
>
> Need to confirm:
> • [what is missing]

**5. Arranging, engineer not yet confirmed**
> Hi [Name], thank you — we have everything we need. We're arranging your appointment with the engineer for [day, window] and will confirm as soon as it's fixed.

**6. Payment follow-up**
> Good morning [Name], just a quick follow-up regarding the invoice sent for [service]. Kindly check the invoice and arrange payment using the bank details shown, with [JOB REFERENCE] as the payment reference. Once payment is received, we can proceed with the certificate.

**7. Certificate**
> Hi [Name], your [certificate/report] has now been completed. Please find the document attached. Thank you for your cooperation.

**8. Delay**
> Hi [Name], just an update regarding your [service]. There has been a delay due to [verified reason]. The latest confirmed option is [confirmed option]. We apologise for the inconvenience and will keep you updated.

---

## PART 9 — WHAT CLIENTS SAY AND WHAT THEY MEAN

| The client says… | They mean | In the app |
|---|---|---|
| "gas cert", "gas safety", "CP12", "landlord gas certificate", "LGSR", "annual gas check" | Gas Safety Certificate (CP12). Never call it "GST". Ask: how many gas appliances, and which. | GAS |
| "gas cert for my restaurant / café / shop", "CP42", "catering gas cert" | Commercial Gas Safety Certificate | GAS_COM |
| "boiler service", "service my boiler" | Boiler Service — not the same as a CP12. Often booked together in one visit. | BOILER |
| "new boiler", "boiler replacement" | Boiler Installation | BOILER_INSTALL |
| "electrical cert", "EICR", "electrical safety certificate", "5-year electrical", "periodic", "fixed wire test", "landlord electrical report" | EICR. Ask: bedrooms and how many fuse boxes. | EICR / EICR_COM |
| "fuse box", "consumer unit", "new fuse board" | Fuse Box (consumer unit) Installation — often follows a failed EICR | CU_INSTALL |
| "my electrics keep tripping", "no power", "sockets not working" | Electrical Diagnostic & Fault Finding | ELEC_DIAG |
| "EPC", "energy certificate", "energy rating" | Energy Performance Certificate | EPC / EPC_COM |
| "PAT test", "appliance testing", "test the kettle and fridge" | PAT Testing. Ask: roughly how many appliances. | PAT / PAT_COM |
| "fire risk assessment", "FRA", "fire assessment for my HMO / block / shop" | Fire Risk Assessment. Ask: bedrooms/flats, floors, communal areas. | FRA / FRA_COM |
| "fire certificate", "smoke alarm certificate", "fire alarm cert", "fire safety certificate", "FSC" | Fire Safety Check (smoke & heat alarm certificate) — clarify they don't mean a Fire Risk Assessment | FSC / FSC_COM |
| "emergency lights", "emergency lighting test" | Emergency Lighting Certificate. Ask: floors/areas and number of fittings. | EMLIGHT |
| "fire alarms fitted", "interlinked alarms", "smoke alarms installed", "HMO alarm system" | Fire Alarm Installation / interlinked alarms. Photos of the existing setup help. | FIRE_ALARM_INSTALL, ALARM_INTERLINK, ALARM |
| "carbon monoxide alarm", "CO alarm" | Carbon Monoxide Alarm Installation | CO_ALARM |
| "fire doors checked" | Fire Door Certificate & Inspection | FIRE_DOOR |
| "extinguishers serviced" | Fire Extinguisher Testing | FIRE_EXT_TEST |
| "asbestos survey", "asbestos report" | Asbestos Survey & Sample Testing | ASBESTOS |
| "HMO licence pack", "everything for my HMO", "all certificates for a new tenancy" | Several services. Typically Gas Safety + EICR + EPC; an HMO usually also needs a Fire Risk Assessment, fire alarms/emergency lighting and often PAT. Confirm each one — do not assume. Each is priced separately. | multiple lines on one job |
| "my certificate failed", "remedial", "fix the C2s" | Remedial work after a failed inspection | GAS_REMEDIAL / ELEC_REMEDIAL |
| "it's urgent", "tenant moves in Friday" | A real deadline — record it, do not promise | Deadline + reason |
| "how long is it valid?" | See the validity line under each service below | — |
| "do I need to be there?" | Someone must give access for the whole arrival window; it can be the tenant | Access contact |
| "how long does it take?" | See the duration under each service below | — |

---

## PART 10 — SERVICE KNOWLEDGE (what each service is, what happens at the inspection, prices, common questions)

> Prices below are the current website list prices. **The price on the live quote in the app always wins.** Parking (£5) and, inside the zone, the congestion charge (£18) are added automatically. Certificate turnaround to quote to clients is "approximately 24–36 hours after payment has cleared" unless the document is already in hand.

### Gas Safety Certificate (CP12)
*Annual landlord gas safety checks by Gas Safe registered engineers.*

**What it is:** A Gas Safety Certificate — universally known as the CP12 — records that every gas appliance, flue and section of pipework in a rented property has been checked and is safe to use.

**Why the client needs it:** Carbon monoxide has no colour, no smell and no taste, and the appliances that produce it give no warning that anything is wrong. A poorly burning boiler or a partially blocked flue can fill a property with CO while continuing to heat it normally. The annual gas safety check exists precisely because the danger is undetectable by the people living with it — and it is the single compliance obligation where the consequence of skipping it is most often fatal.

**The legal position:** Under the Gas Safety (Installation and Use) Regulations 1998, landlords in England, Scotland and Wales must ensure that every gas appliance, flue and installation pipe they are responsible for is checked for safety at intervals of no more than twelve months by a Gas Safe registered engineer. A copy of the record must be given to existing tenants within 28 days of the check and to any new tenant before they occupy the property. Records must be kept for at least two years. There is no grace period and no exemption for short tenancies. Breach is a criminal offence carrying unlimited fines and, where a death results, prosecution for corporate or gross negligence manslaughter.

**What happens, step by step:**
1. Book a convenient slot — Choose a morning or afternoon appointment that suits your tenant. Evenings and weekends available.
2. Tightness and appliance testing — The installation is tested for leaks, then each appliance is run and checked for correct operation and combustion.
3. Flue and ventilation checks — Flue flow and spillage testing confirms combustion products leave the building, and air vents are verified as adequate.

**What the engineer checks / what is included:**
- Gas tightness test on the installation
- Operational and combustion checks on every gas appliance
- Flue flow and spillage testing
- Ventilation adequacy verified for each appliance
- Safety devices proved to operate correctly
- Carbon monoxide alarm presence, position and expiry checked

**Prices:**

| Appliances | Price |
|---|---|
| 1 appliance | £60.00 |
| 2 appliances | £70.00 |
| 3 appliances | £80.00 |
| 4 appliances | £90.00 |
| Each additional appliance | +£10.00 |

A boiler, a gas hob and a gas fire count as three appliances. Add a full boiler service in the same visit — it is the most popular combination with landlords and saves a second appointment.

**Warning signs that need immediate action:** A lazy yellow or orange flame instead of a crisp blue one; Black, brown or sooty staining around an appliance or flue; Excessive condensation on windows in the room containing the appliance; A pilot light that repeatedly blows out for no obvious reason; Headaches, dizziness, nausea or drowsiness that improve when occupants leave the property; The smell of gas — leave the property, turn off at the meter and call 0800 111 999; A carbon monoxide alarm sounding, even briefly; Blocked, painted-over or deliberately sealed air vents.

**Questions clients ask, and the answer:**
- **"How often do I need a Gas Safety Certificate?"** — Every twelve months. You can carry out the check in the two months before expiry without losing your original renewal date, so we recommend booking four to six weeks ahead to leave room for any remedial work.
- **"How long does the inspection take?"** — A property with one or two appliances typically takes 30–45 minutes. Add roughly 15 minutes per additional appliance, and allow longer if the boiler is in an awkward or boxed-in position.
- **"Is a CP12 the same as a boiler service?"** — No, and this is the most costly misunderstanding in the sector. A CP12 confirms an appliance is safe on the day. A service cleans and maintains it for reliability and efficiency, and is usually what your manufacturer's warranty requires. Many landlords assume the CP12 preserves their warranty — it does not.
- **"What happens if an appliance fails?"** — It is classified as Immediately Dangerous or At Risk. With your permission we turn it off and cap it, explain exactly what was found, and provide a no-obligation quote for the repair. We never carry out chargeable work without your approval.
- **"What if my tenant won't give access?"** — You remain responsible, so the law expects documented reasonable steps. Write to the tenant explaining the legal position, offer several dates including evenings and weekends, and keep records of every attempt. We confirm attendance and non-access in writing so your file stands up to scrutiny.
- **"Do I need a carbon monoxide alarm too?"** — Yes, in any room used as living accommodation that contains a fixed combustion appliance — a boiler, a gas fire, or any solid fuel appliance. Gas cookers are excluded. This applies to all tenancies, and we check alarm presence, position and expiry on every visit.

### Commercial Gas Safety Certificate (CP42)
*Non-domestic gas safety certification for restaurants, shops and commercial premises.*

**What it is:** The CP42 is the commercial equivalent of the domestic CP12, covering gas installations in non-domestic premises: restaurant and takeaway kitchens, pubs, offices, shops, care settings and industrial units. Commercial gas work requires different engineer qualifications from domestic — catering appliances, larger plant and commercial pipework each have their own competencies — and the check is correspondingly more involved, covering gas interlocks, extract ventilation and emergency control valve arrangements alongside appliance safety.

**Why the client needs it:** A commercial kitchen concentrates every gas risk in one room: multiple high-output burners, heavy extract ventilation that can pull combustion products the wrong way, and staff working beside open flame for hours at a time. The consequences of a failure extend well past the premises — to employees, customers and adjoining buildings. It is also the certificate most likely to be demanded at short notice, by an insurer at renewal, an environmental health officer during an inspection, or a landlord at lease assignment.

**The legal position:** The Gas Safety (Installation and Use) Regulations 1998 apply to commercial premises as well as domestic, and require that gas appliances and installations are maintained in a safe condition. Where the premises is a workplace, the Health and Safety at Work etc. Act 1974 and the Management of Health and Safety at Work Regulations 1999 add duties to employees and to anyone else affected. Only an engineer registered with Gas Safe in the specific commercial categories relevant to the appliances present may lawfully carry out the work — domestic qualification is not sufficient for commercial catering equipment. Most commercial leases and virtually all insurers require an annual certificate.

**What happens, step by step:**
1. Confirm appliances and categories — Send us an appliance list so we attend with an engineer registered in the right commercial categories — and a fixed price.
2. Installation and tightness testing — The emergency control valve, meter and pipework are checked and the installation tested for tightness.
3. Appliance, interlock and ventilation checks — Each appliance is combustion-tested, the gas interlock is proved to operate, and ventilation is assessed against total heat input.
4. Certificate within 24 hours — Your CP42 is issued with any defects classified and explained, ready for your insurer, EHO or landlord.

**What the engineer checks / what is included:**
- Tightness test on the commercial installation
- Emergency control valve and meter installation check
- Combustion analysis and operational check on each appliance
- Gas interlock operation proved where fitted
- Ventilation and extract adequacy assessed against total heat input
- Flue and spillage testing on open-flued appliances
- Certificate issued within 24 hours, insurer- and EHO-ready

**Prices:**

| Installation | Price |
|---|---|
| Meter only | £30.00 |
| 1 Gas Appliance | £169.99 |
| 2 Gas Appliances | £209.99 |
| 3 Gas Appliances | £249.99 |
| 4 Gas Appliances | £299.99 |
| 5 Gas Appliances | £349.99 |

More than five appliances, or a multi-site portfolio?

**Commercial gas warning signs:** Yellow or lazy flames on any catering burner instead of crisp blue; Sooting or heat discolouration on appliances, canopies or the ceiling; The gas interlock bypassed, taped over or disabled by staff; Extract fans that are noisy, weak, or not running when burners are lit; Staff reporting headaches, drowsiness or nausea during shifts; Air vents or make-up air grilles blocked by stock or shelving; Any smell of gas — evacuate, turn off at the emergency control valve, call 0800 111 999; Appliances added since the last ventilation assessment.

**Questions clients ask, and the answer:**
- **"What is the difference between a CP12 and a CP42?"** — A CP12 covers domestic gas installations in residential property. A CP42 covers non-domestic and commercial installations — restaurants, pubs, shops, offices and industrial units. Commercial work needs different Gas Safe qualifications, and a domestic-only engineer cannot lawfully certify commercial catering equipment.
- **"Why is meter-only just £30?"** — Because many commercial premises have a gas supply but no live appliances — an office, a shop, or a unit with a capped supply. That check covers the emergency control valve, meter installation and a tightness test, which is genuinely quicker than a full appliance inspection.
- **"How often does a commercial kitchen need certifying?"** — Annually as a minimum. Many multi-site operators inspect six-monthly because catering equipment runs hard and ventilation balance changes as appliances are added or moved. Your insurer or lease may also specify a shorter interval.
- **"What is a gas interlock and do we need one?"** — An interlock prevents gas flowing unless the kitchen ventilation is proved to be running. BS 6173 requires one on new and substantially altered commercial kitchen installations. If yours has been bypassed — which we find regularly — that is an immediate fail, because it allows burners to run with no extraction.
- **"Who is responsible, us or our landlord?"** — It depends on the lease. Typically the landlord retains the incoming supply and meter while the tenant covers appliances they installed and pipework beyond the emergency control valve. Where the split is unclear, certify the whole installation and apportion the cost — it is far cheaper than a dilapidations dispute later.

### Boiler Service
*Full annual boiler servicing to keep heating safe, efficient and under warranty.*

**What it is:** A full boiler service is genuine maintenance rather than a safety check. The engineer strips down and cleans the key components, carries out a flue gas analysis to measure combustion efficiency, tests the safety and control devices, checks system pressure and the condition of the expansion vessel, and records the results. It is what manufacturers require to keep a warranty valid, and it is the single most effective way to avoid a boiler failing in the middle of winter.

**Why the client needs it:** Boilers rarely fail without warning — they fail after months of small, ignored deterioration: a fouled heat exchanger working harder each week, an expansion vessel slowly losing its charge, a condensate trap gradually silting up. A service catches those things while they are adjustments rather than replacements. It also protects two things landlords consistently lose by accident: manufacturer warranty cover, which almost always requires documented annual servicing, and efficiency, since a poorly maintained boiler can burn noticeably more gas for the same heat.

**The legal position:** There is no statute requiring an annual boiler service in the way the Gas Safety (Installation and Use) Regulations 1998 require an annual safety check. However, the Landlord and Tenant Act 1985 requires you to keep installations for space heating and hot water in repair and proper working order, and the Homes (Fitness for Human Habitation) Act 2018 allows tenants to act directly where a property is unfit — a boiler failing in winter is a serious hazard under the Housing Health and Safety Rating System. Separately, manufacturer warranties are contractual: virtually all require a documented annual service by a Gas Safe registered engineer, and a missing service history is the most common reason a warranty claim is refused.

**What happens, step by step:**
1. Book, ideally alongside your CP12 — One appointment covers both the statutory safety check and the maintenance your warranty requires.
2. Strip down and clean — Casing removed, combustion chamber, heat exchanger and burner inspected and cleaned, condensate trap cleared.
3. Analyse and adjust — Flue gas analysis confirms correct combustion, with the burner set where needed. Expansion vessel and inhibitor tested.
4. Prove safety devices and record

**What the engineer checks / what is included:**
- Casing removed for full internal inspection and cleaning
- Combustion chamber, heat exchanger, burner and injectors cleaned
- Flue gas analysis with CO, CO₂ and ratio readings recorded
- Condensate trap cleared and refilled
- Expansion vessel charge tested and re-pressurised where required
- Safety devices, controls and pressure relief valve proved
- Inhibitor level tested and magnetic filter cleaned where fitted
- Manufacturer-specification service record issued for warranty purposes

**Prices:**

| Service | Price |
|---|---|
| Full boiler service | £99.99 |
| Boiler service + Gas Safety Certificate (CP12) | Ask for combined price |

Booking your service alongside your CP12 is our most popular landlord option — one visit, one tenant appointment, both records issued together.

**Signs your boiler needs servicing now:** Banging, gurgling or whistling — 'kettling' — from the boiler or pipework; System pressure repeatedly dropping and needing topping up; Radiators cold at the bottom or needing frequent bleeding; Hot water that runs lukewarm, or fluctuates during a shower; The boiler locking out and needing a manual reset; Visibly increased gas consumption for the same heating pattern; Any yellow flame, sooting or staining around the appliance; Water dripping from or beneath the boiler.

**Questions clients ask, and the answer:**
- **"Is a boiler service the same as a gas safety check?"** — No. A CP12 confirms the appliance is safe on the day of the visit. A service cleans and maintains it for reliability and efficiency, and is what your manufacturer's warranty requires. Many landlords assume the CP12 covers both — it does not, and that assumption is the most common reason warranty claims get refused.
- **"How long does a service take?"** — Between 45 minutes and an hour and a half depending on the appliance and how accessible it is. Anything much shorter than that is not a full service.
- **"Will servicing keep my warranty valid?"** — Yes, provided it is a full service by a Gas Safe registered engineer and documented. Nearly every manufacturer requires annual servicing as a condition of warranty, and asks for the service history when a claim is made. We issue a manufacturer-specification record on every visit.
- **"Do I need a power flush?"** — Only if your system genuinely needs it — heavily sludged systems with persistently cold radiators and repeated blockages. We test inhibitor levels and clean any fitted filter as part of the standard service, and we will tell you honestly if a flush is warranted rather than selling one by default.
- **"How often should a boiler be serviced?"** — Annually. Most manufacturers require it for warranty purposes, and in a rented property it is the single most effective way to avoid a mid-winter breakdown and the disrepair claim that can follow.
- **"Can you service my boiler at the same time as the CP12?"** — Yes, and it is by far the most sensible way to book. One visit, one appointment for your tenant, and both the safety certificate and the service record issued together.

### Boiler Installation
*New boiler supply and installation by Gas Safe engineers, fully commissioned and registered.*

**What it is:** A complete boiler replacement: survey and correct sizing, supply of the appliance, removal of the old unit, installation, system treatment, commissioning to manufacturer specification, Building Regulations notification and warranty registration. We size the boiler to the property's actual heat loss rather than simply matching whatever was there before, because an oversized boiler cycles constantly, wastes gas and wears out faster.

**Why the client needs it:** A boiler replacement is the largest single mechanical investment most landlords make in a property, and the quality of the installation matters more than the badge on the front. The same appliance can deliver fifteen years of trouble-free service or fail repeatedly within three, depending on whether it was correctly sized, whether the system was cleaned and treated before the new unit went on, and whether it was properly commissioned. Those three things are where installations are quietly cut short to win on price.

**The legal position:** Installing a boiler is notifiable work under Part L and Part J of the Building Regulations. Because our engineers are Gas Safe registered, the installation is self-certified and the Building Regulations Compliance Certificate is issued to you and lodged with your local authority automatically — you do not need to arrange separate building control involvement. Under the Boiler Plus standard in force in England, new gas boiler installations must achieve a minimum seasonal efficiency of 92% ErP and include time and temperature controls, plus at least one additional energy-saving measure such as load compensation, weather compensation, flue gas heat recovery or smart controls. We register your warranty with the manufacturer on completion.

**What happens, step by step:**
1. Survey and specify — We calculate heat loss, measure mains flow rate and recommend the right boiler type and output — then quote a fixed price.
2. Remove and prepare — The old appliance is removed and disposed of, and the system is cleaned and dosed with inhibitor before anything new goes on.
3. Install and commission — The new boiler, controls and magnetic filter are installed and commissioned to manufacturer specification with combustion readings recorded.
4. Certify and register — Building Regulations notification is lodged, your warranty is registered, and we walk you and your tenant through the controls.

**What the engineer checks / what is included:**
- Full survey with heat loss calculation and mains flow rate measurement
- Supply of the new appliance, correctly sized for the property
- Removal and responsible disposal of the old boiler
- Full system clean and dosing with corrosion inhibitor to BS 7593
- Magnetic system filter fitted as standard
- Commissioning to manufacturer specification with combustion readings recorded
- Building Regulations notification and compliance certificate
- Manufacturer warranty registered on your behalf

**Prices:**

| Installation | Price |
|---|---|
| New boiler supplied and installed | From £2,509.00 |
| Relocation, type conversion or cylinder work | Quoted after survey |

The starting price covers a like-for-like combi replacement in the same position, including system clean, filter, commissioning, Building Regulations notification and warranty registration. We survey before quoting and the fixed price we give you is the price you pay.

**Signs it is time to replace rather than repair:** The boiler is more than 12–15 years old; Two or more repairs in the last two years; Parts becoming difficult or expensive to source; A repair quote approaching a third or more of replacement cost; An efficiency rating below current standards, showing in the gas bills; Repeated lockouts or a boiler that needs frequent resetting; Visible corrosion or leaks from the appliance body; Your EPC is being held back by an inefficient heating system.

**Questions clients ask, and the answer:**
- **"How much does a new boiler cost?"** — Relocations, type conversions and cylinder work are quoted after survey.
- **"How long does installation take?"** — A straightforward like-for-like swap is usually a single day. Relocating the boiler, converting between types or replacing a cylinder typically takes two days. We will confirm before starting and let your tenant know how long they will be without heating.
- **"Which boiler type do I need?"** — It depends on bathroom count, occupancy and incoming mains flow rate. Combis suit flats and smaller homes with a single bathroom. System boilers with an unvented cylinder suit larger houses and HMOs where several outlets run at once. We measure the mains flow rate rather than guessing.
- **"Do I need Building Regulations approval?"** — Yes, boiler installation is notifiable work — but you do not need to arrange it. Our Gas Safe registration allows us to self-certify, and the compliance certificate is issued to you and lodged with your local authority automatically.
- **"Will the system be cleaned before the new boiler goes on?"** — Always. A full system clean, inhibitor dosing to BS 7593 and a magnetic filter are included as standard. Fitting a new boiler to a dirty system is the fastest way to destroy the heat exchanger, and most manufacturers make warranty cover conditional on it.
- **"How long is the warranty?"** — It depends on the appliance, but seven to twelve years is common. The conditions are enforced: registration within the manufacturer's window, correct system treatment at installation, and documented annual servicing. We register the warranty for you and issue the paperwork you will need later.

### EICR Certificate (Electrical Installation Condition Report)
*Electrical Installation Condition Reports by NICEIC / NAPIT certified electricians.*

**What it is:** An Electrical Installation Condition Report (EICR) is a formal inspection and test of the fixed wiring in a property — the consumer unit, circuits, sockets, switches, light fittings and earthing and bonding arrangements. Our NICEIC / NAPIT certified electricians dead-test and live-test the installation against BS 7671, record every observation with a classification code, and issue a clear Satisfactory or Unsatisfactory report. Since 1 April 2021 this has been a legal requirement for every tenanted residential property in England.

**Why the client needs it:** Electrical faults are the single largest cause of accidental house fires in England, and the dangerous ones are almost always invisible — degraded insulation inside a wall, a loose connection warming up behind a socket, a missing earth on a lighting circuit. An EICR is the only way to find them before they cause a shock or a fire. It also protects you: without a valid report you are in breach of the Electrical Safety Standards Regulations, your landlord insurance may not respond to a claim, and local authorities can impose a financial penalty of up to £30,000.

**The legal position:** The Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020 require landlords to have the fixed electrical installation inspected and tested by a qualified person at intervals of no more than five years. You must give a copy of the report to existing tenants within 28 days of the inspection, to any new tenant before they move in, and to the local authority within seven days if requested. If the report requires remedial or further investigative work, it must be completed within 28 days (or sooner if the report specifies), and you must obtain written confirmation that the work has been carried out. Non-compliance carries a financial penalty of up to £30,000 per breach.

**What happens, step by step:**
1. Book a convenient slot — Choose a morning or afternoon appointment that works for your tenant. Confirmed in under two minutes.
2. Isolation and dead testing — The supply is safely isolated so we can test continuity, insulation resistance and polarity across every circuit.
3. Live testing and inspection — Supply restored to measure loop impedance and RCD trip times, alongside a full visual inspection of the installation.

**What the engineer checks / what is included:**
- Full dead and live testing of the fixed installation to BS 7671
- Visual inspection of the consumer unit, accessories, earthing and bonding
- RCD trip-time testing on every protective device
- Every observation classified C1 / C2 / C3 / FI with a plain-English explanation
- Immediate make-safe of any C1 danger found on the day
- Itemised, no-obligation quote for any remedial work identified

**Prices:**

| Property size | Price |
|---|---|
| Studio | £77.99 |
| 1–3 Bedrooms | £104.99 |
| 4 Bedrooms | £114.99 |
| 5 Bedrooms | £149.99 |
| 6 Bedrooms | £169.99 |
| 7 Bedrooms | £189.99 |
| 8 Bedrooms | £209.99 |

Larger properties, HMOs and multi-consumer-unit buildings are quoted on the commercial EICR scale.

**Signs your electrics need attention before the five years are up:** Breakers or RCDs that trip repeatedly, or a fuse that keeps blowing; A burning or 'fishy' plastic smell near sockets, switches or the consumer unit; Scorch marks, discolouration or heat damage around a socket or plug; Lights that flicker or dim when a kettle, shower or washing machine starts; A fuse box with rewireable fuses, cast-iron switches or no RCD protection at all; Sockets that feel warm, are loose in the wall, or spark when a plug is removed; A mild tingle or shock from an appliance, tap or metal fitting — treat this as urgent; Cabling with black rubber, fabric or lead sheathing, which indicates pre-1960s wiring.

**Questions clients ask, and the answer:**
- **"How often does a rented property need an EICR?"** — At least every five years, or sooner if the report specifies a shorter interval. We also recommend one at every change of tenancy — you become responsible for any alterations the previous tenant made.
- **"How long does an EICR take?"** — A studio or one-bedroom flat typically takes 1.5–2 hours. A three-bedroom house is usually 2.5–3 hours. Larger properties and those with more than one consumer unit take longer, and we will tell you the expected duration when you book.
- **"Does the power need to be off?"** — Yes, for part of the visit. Dead testing requires the supply to be isolated, usually in stages so the whole property is not off at once. Please let your tenant know, and tell us in advance about medical equipment, home working or anything else that needs planning around.
- **"What happens if my property fails?"** — An Unsatisfactory result means at least one C1, C2 or FI observation. We make any immediate danger safe on the day, then send an itemised quote for the remaining items. The law gives you 28 days to complete the work, and we issue written confirmation of the remedial works once done.
- **"Do C3 observations mean I failed?"** — No. C3 means 'improvement recommended' — the installation complied with an earlier edition of the wiring regulations but would be done differently today. C3 items do not make a report Unsatisfactory and there is no legal obligation to act on them.
- **"Is an EICR the same as a PAT test?"** — No. An EICR covers the fixed wiring — everything behind the walls, plus the consumer unit and sockets. PAT testing covers plug-in appliances such as kettles, lamps and washing machines. Furnished lets and HMOs generally need both.

### Commercial EICR (Electrical Installation Condition Report)
*Fixed-wiring inspection and testing for shops, offices, HMOs and commercial premises.*

**What it is:** A commercial EICR applies the same BS 7671 inspection and testing regime as a domestic report, but to the larger and more complex installations found in offices, retail units, restaurants, warehouses, HMOs and blocks with communal supplies. Pricing is based on the number of distribution boards rather than bedrooms, because that is what actually drives the volume of circuits to be tested. We work evenings and weekends at no premium where a daytime shutdown would disrupt trading.

**Why the client needs it:** In a commercial setting an electrical failure does not just risk injury — it stops trading, voids business interruption cover and puts you in breach of duties you hold as an employer and as the person in control of the premises. Insurers increasingly ask for a current EICR before renewing, and most commercial leases place the testing obligation squarely on the tenant or the managing agent. A clean, current report is the document that settles all of it.

**The legal position:** The Electricity at Work Regulations 1989 require that electrical systems are maintained so far as reasonably practicable to prevent danger, and that duty sits with the employer, the self-employed person or whoever is in control of the premises. Unlike the private rented sector there is no single fixed interval set in law, so the standard of proof is a documented, risk-based maintenance regime — and an EICR at the interval recommended by IET Guidance Note 3 is the accepted way of demonstrating it. For HMOs, the Electrical Safety Standards Regulations 2020 also apply and impose the same five-year maximum as a single-family let.

**What happens, step by step:**
1. Scope the installation — Tell us the number of distribution boards, or send a photo of the intake. We confirm a fixed price before attending.
2. Attend at a time that suits trading — Daytime, evening or weekend — we plan staged isolation so as little of the premises goes off as possible.
3. Board-by-board inspection and testing — Every circuit is tested and recorded, with agreed limitations documented where a supply genuinely cannot be interrupted.
4. Report and prioritised remedials — Digital EICR within 24 hours, with remedial items separated into urgent and planned so you can budget properly.

**What the engineer checks / what is included:**
- Full inspection and testing to BS 7671 across all distribution boards quoted
- Individual circuit testing with a complete schedule of results
- RCD trip-time verification on every protective device
- Coded observations with a prioritised, plain-English remedial summary
- Out-of-hours and weekend attendance at no premium
- Digital report within 24 hours, insurer- and licence-ready

**Prices:**

| Installation size | Price |
|---|---|
| 1 Consumer Unit | £159.99 |
| 2 Consumer Units | £289.99 |
| 3 Consumer Units | £428.99 |
| 4 Consumer Units | £558.99 |
| 5 Consumer Units | £715.99 |
| 6 Consumer Units | £859.99 |
| 7 Consumer Units | £1,008.99 |
| 8 Consumer Units | £1,165.99 |

More than eight boards, or a three-phase distribution system?

**When to bring a commercial inspection forward:** Nuisance tripping that staff have started working around rather than reporting; A change of use, refit, or new plant added since the last inspection; Extension leads and multi-way adaptors in permanent use — a sign of insufficient circuits; Any evidence of overheating, scorching or burning smells at a distribution board; Water ingress, roof leaks or flooding anywhere near electrical equipment; You have taken on a lease and hold no report from the outgoing tenant; Your insurer or licensing authority has asked for current certification.

**Questions clients ask, and the answer:**
- **"How often does a commercial property need an EICR?"** — IET Guidance Note 3 recommends five years for offices and shops, three years for industrial units, and annually for higher-risk premises such as commercial kitchens, laundries and swimming pools. Your insurer or lease may require a shorter interval, and that shorter interval takes precedence.
- **"Do you have to switch the power off?"** — For part of the inspection, yes. We stage the isolation so only one board or floor is off at a time, and we attend evenings and weekends at no extra charge where a daytime shutdown is not workable.
- **"How do I know how many consumer units I have?"** — Send us a photograph of your electrical intake and any sub-boards you know about and we will confirm the count and the price before you commit. Restaurants and converted buildings very often have more boards than owners expect.
- **"Does my HMO need a commercial EICR?"** — If the property is fed from more than one consumer unit — which is common in converted houses — it is priced on this scale. The legal interval remains a maximum of five years under the Electrical Safety Standards Regulations 2020, and most London boroughs attach further conditions through HMO licensing.
- **"Can you test a three-phase supply?"** — Yes. Three-phase distribution is common in restaurants, workshops and buildings with lifts or large plant. Send us the intake details and we will quote specifically rather than applying the single-phase scale.

### Fuse Box Installation (Consumer Unit Replacement)
*Metal 18th-Edition consumer units supplied, installed, tested and certified.*

**What it is:** The consumer unit — still widely called the fuse box — is the control centre of a property's electrical system. It takes the incoming supply and divides it into individual circuits, each protected by a device designed to disconnect automatically in a fault. We replace outdated boards with modern metal-clad units carrying RCD or RCBO protection, install them to the current edition of BS 7671, test the whole installation afterwards, and issue the Electrical Installation Certificate you need as proof.

**Why the client needs it:** An old fuse box is the single most common reason a property fails its EICR. Rewireable fuse carriers and plastic enclosures were compliant decades ago but offer no protection against electric shock, no protection against fire spreading from the board itself, and no way to isolate a single faulty circuit. Replacing the board is often the difference between an Unsatisfactory report and a Satisfactory one — and between a fault that trips a breaker and a fault that starts a fire.

**The legal position:** Replacing a consumer unit is notifiable work under Part P of the Building Regulations in England, which means it must either be carried out by an installer registered with a competent person scheme, or notified to and inspected by building control. Our electricians are NICEIC / NAPIT registered, so the work is self-certified and the notification is handled for you. Amendment 3 to BS 7671, in force since January 2016, requires consumer units in domestic premises to be manufactured from non-combustible material or enclosed in a non-combustible cabinet — in practice, steel. You will receive an Electrical Installation Certificate on completion, which you should keep with your EICR.

**What happens, step by step:**
1. Assess the existing installation — We check the intake, earthing arrangement and circuit count to confirm the right board and a fixed price.
2. Isolate and remove the old board — Supply is isolated safely, the old unit removed and every existing circuit identified and labelled.
3. Install and connect the new unit — The new metal board is mounted and each circuit connected to its own protective device, with earthing and bonding upgraded where required.
4. Test, certify and hand over — The full installation is tested, your Electrical Installation Certificate is issued, and we walk you through the new board before leaving.

**What the engineer checks / what is included:**
- Supply and installation of a new metal 18th-Edition consumer unit
- RCBO protection per circuit as standard — one fault does not black out the property
- Surge protection assessed and fitted where the installation requires it
- Full circuit identification and a new labelled schedule
- Testing of the complete installation after installation
- Electrical Installation Certificate issued on completion
- Part P notification handled under our competent person scheme

**Prices:**

| Board type | Price |
|---|---|
| 6 Way Consumer Unit | £730.00 |
| 10 Way Consumer Unit | £790.00 |
| 15 Way Consumer Unit | £870.00 |
| Skeleton Board | £990.00 |

Prices include the board, installation, full testing and your Electrical Installation Certificate. Where existing circuits are found to be faulty during installation, any additional work is quoted and agreed before we proceed — never added afterwards.

**Signs your fuse box needs replacing:** A plastic enclosure, which means the board predates the January 2016 requirement for metal; Rewireable fuse wire or cartridge fuses instead of switched circuit breakers; No test button anywhere on the board — no RCD protection at all; A cast-iron or wooden-backed board, indicating pre-1960s installation; Every way occupied, with no capacity for an EV charger or electric shower; Repeated nuisance tripping that takes out the whole property rather than one circuit; Buzzing, warmth or scorch marks at the board itself; A C2 observation on your EICR relating to the distribution board.

**Questions clients ask, and the answer:**
- **"How long does a fuse box replacement take?"** — Most domestic replacements are completed within a single working day, typically four to six hours. Where earthing or bonding also needs upgrading, or circuits are found to be faulty once the old board is off, it can extend into a second day — we will tell you as soon as we know rather than at the end.
- **"Will my power be off all day?"** — No, but it will be off for a significant part of it. We isolate at the main switch to remove and install the board, then restore supply for testing. Plan for several hours without power and let your tenant know in advance.
- **"Do I legally have to replace a plastic fuse box?"** — There is no law requiring you to replace a compliant-when-installed board retrospectively. However, the metal enclosure requirement applies to any board installed since January 2016, and an old plastic unit without RCD protection will usually attract a C2 on an EICR — which makes the report Unsatisfactory and must be remedied within 28 days.
- **"Can I replace a consumer unit myself?"** — No. Consumer unit replacement is notifiable work under Part P of the Building Regulations and must be carried out by a registered competent person or notified to building control. Beyond the legal position, the work involves the unfused supply tails and carries a genuine risk of fatal injury.
- **"What is the difference between an RCD board and RCBOs?"** — On an RCD board, circuits are grouped behind one or two RCDs, so a single fault takes out everything on that group. With RCBOs, each circuit has its own combined device, so a fault on the shower trips only the shower. We fit RCBOs as standard because in a tenanted property it prevents most out-of-hours call-outs.
- **"Will a new board fix my tripping problem?"** — Sometimes, but not always. If the tripping is caused by a genuine fault on a circuit or a faulty appliance, a new board will simply detect the same fault more precisely. We diagnose the cause first — see our electrical diagnostic service — so you are not paying for a board that was never the problem.

### Electrical Diagnostic & Fault Finding
*Systematic fault finding for tripping, dead circuits and intermittent electrical faults.*

**What it is:** When a breaker keeps tripping, a circuit is dead, or lights flicker for no obvious reason, the job is not installation — it is investigation. Our diagnostic service is a structured hunt for the root cause: splitting the installation down, insulation-resistance testing circuit by circuit, and isolating the specific cable, accessory or appliance responsible. You are charged for the time taken, most faults are traced within the first hour, and you get a written explanation of what was found rather than a guess and a replacement part.

**Why the client needs it:** Electrical faults are almost never cosmetic. A circuit that trips intermittently is telling you that current is escaping somewhere it should not — into a damp wall, through damaged insulation, or via a deteriorating connection that is quietly heating up. Guessing at the cause wastes money on parts that were never the problem, and leaves the actual fault in place. Diagnosing it properly is both cheaper over the life of the property and the only way to know the danger has actually gone.

**The legal position:** Under the Landlord and Tenant Act 1985 you are responsible for keeping the installation for the supply of electricity in repair and proper working order, and that duty is triggered by a reported fault regardless of when the last EICR was carried out. The Homes (Fitness for Human Habitation) Act 2018 allows tenants to take direct action where a property is unfit, and an unresolved electrical fault is a recognised hazard under the Housing Health and Safety Rating System. In short: once a fault is reported to you, the clock is running, and a documented diagnostic visit is the evidence that you responded.

**What happens, step by step:**
1. Describe the symptom — Tell us what happens and when. The pattern — after rain, under load, at a particular time — often halves the time on site.
2. Reproduce and confirm — We verify the fault is present and establish whether it is continuous or conditional before touching the installation.
3. Isolate systematically — The installation is split down circuit by circuit with insulation testing at each stage until the fault is located precisely.
4. Explain and quote — You get a plain-English explanation of the root cause and a fixed-price quote for the repair before any further work.

**What the engineer checks / what is included:**
- Systematic fault isolation using insulation resistance and continuity testing
- Confirmation of the fault by independent second measurement before any repair
- Immediate make-safe of any dangerous condition found
- Written explanation of the root cause, not just the symptom
- Fixed-price quote for the repair before any further work proceeds

**Prices:**

| Service | Price |
|---|---|
| Fault finding and diagnosis | £99.99 per hour |
| Minimum charge | 1 hour |
| Additional time | Charged in 30-minute increments |

The majority of faults are traced within the first hour. Any repair work identified is quoted as a fixed price and agreed with you before it starts — diagnostic time is never used to run up an open-ended bill.

**When you need a diagnostic visit:** A breaker or RCD trips repeatedly, whether or not it resets afterwards; A circuit is completely dead but the breaker appears to be on; Lights flicker, dim or brighten when other appliances start up; There is a burning smell, buzzing or crackling from any socket, switch or the board; Sockets, switches or faceplates feel warm to the touch; Anyone has felt a tingle or shock from an appliance, tap or metal fitting; An EICR returned an FI — further investigation required — observation; The fault appears only in certain weather, or only when specific appliances run.

**Questions clients ask, and the answer:**
- **"How much will it cost to find my fault?"** — Most faults are traced within that first hour. Any repair is quoted separately as a fixed price and agreed before we proceed.
- **"Why does my RCD trip only sometimes?"** — Intermittent tripping is usually thermal, moisture-related or cumulative. A connection that loses contact as it warms, water finding its way into an outdoor socket, or the combined small leakage of many appliances creeping over the trip threshold on a cold morning are the three most common causes. Each needs a different fix, which is exactly why diagnosis matters.
- **"Can I just keep resetting the breaker?"** — No. A breaker that trips is doing its job — it has detected a fault. Repeatedly resetting it leaves the fault live and, if the cause is an overheating connection, allows it to keep deteriorating. Never hold a breaker in or replace a fuse with a higher rating.
- **"Do you fix the fault on the same visit?"** — Wherever we can. If the repair is straightforward and we have the parts, we quote and complete it there and then. Larger repairs — a damaged buried cable, a full circuit replacement — are quoted for a return visit at a time that suits your tenant.
- **"Will you make it safe if you find something dangerous?"** — Always, and at no extra cost. Any immediately dangerous condition is isolated and made safe before we leave, and we explain exactly what has been disconnected and why.

### PAT Testing (Portable Appliance Testing)
*In-service inspection and testing of plug-in appliances for furnished lets and HMOs.*

**What it is:** PAT testing — now formally called in-service inspection and testing — checks that the plug-in electrical appliances you supply with a property are safe to use. Every item receives a formal visual inspection and, where appropriate, electrical testing for earth continuity, insulation resistance and correct polarity. Each appliance is labelled with its result and retest date, and you receive a certificate plus a full asset register listing every item tested.

**Why the client needs it:** Anything you supply with a let property is your responsibility, and appliances are the part of an installation that gets moved, dropped, overloaded and repaired by tenants. A frayed kettle lead or a washing machine with degraded earth continuity is a genuine shock and fire risk, and it is precisely the kind of item that never appears on an EICR because an EICR only covers fixed wiring. For HMOs it is also a licensing matter — most London boroughs require appliance testing as a condition of the licence.

**The legal position:** There is no statute that says 'you must PAT test annually'. What exists is a duty: the Electricity at Work Regulations 1989 require electrical equipment to be maintained so as to prevent danger, and for landlords the Landlord and Tenant Act 1985 and the Housing Health and Safety Rating System place responsibility for the safety of supplied appliances on you. The Management of Houses in Multiple Occupation (England) Regulations 2006 go further and require HMO managers to have every supplied appliance inspected at intervals, with a declaration available to the local authority on request. Testing and a written asset register are the accepted way of demonstrating that duty has been discharged.

**What happens, step by step:**
1. Book with an appliance estimate — Give us a rough count. We price on the band that actually applies on the day, so an estimate is enough to get started.
2. Formal visual inspection — Every appliance, flex, plug and fuse is inspected — where most genuine faults are found.
3. Electrical testing by class — Earth continuity, insulation resistance and polarity tested as appropriate to each appliance's class.
4. Label, register and certify

**What the engineer checks / what is included:**
- Formal visual inspection of every appliance, flex and plug
- Earth continuity, insulation resistance and polarity testing as appropriate to class
- Correct fuse rating checked and replaced where wrong
- Pass / fail label with retest date applied to each appliance
- Full asset register listing every item tested with its result
- Failed items clearly identified with a repair-or-replace recommendation

**Prices:**

| Number of appliances | Price |
|---|---|
| Up to 10 appliances | £59.99 |
| 10–15 appliances | £69.99 |
| 15–20 appliances | £79.99 |
| 20–25 appliances | £99.99 |
| 25–30 appliances | £129.99 |
| 30–35 appliances | £169.99 |
| 35–40 appliances | £199.99 |
| 40–45 appliances | £229.99 |
| 45–50 appliances | £259.99 |

Not sure of the count? Estimate high — we charge the band that actually applies on the day, not the one you booked.

**Appliance faults worth acting on immediately:** Any cut, split, crushed or taped-up section of flex; A flex that has pulled out of the plug or appliance body, exposing coloured cores; Cracked casings, or an appliance that rattles as if something inside has come loose; Scorch marks or discolouration on a plug, socket or plug pins; A plug that feels warm after use, or pins that are bent or loose; Burning smells, buzzing or sparking when an appliance is switched on; Any appliance that has been dropped, got wet, or been repaired by a tenant; An appliance that trips the RCD when plugged in.

**Questions clients ask, and the answer:**
- **"Is PAT testing a legal requirement for landlords?"** — There is no statute mandating an annual PAT test by name. There is a legal duty to ensure supplied appliances are safe, under the Electricity at Work Regulations 1989 and your obligations as a landlord. For HMOs, the Management of HMO Regulations 2006 require supplied appliances to be inspected and a declaration made available to the council. Testing with a written register is the standard way of proving compliance.
- **"How often should I have appliances tested?"** — Annually for a standard furnished let, and annually for most HMOs as a licence condition. Higher-use environments such as commercial kitchens and laundries justify more frequent testing. We set a retest date per appliance based on type and setting.
- **"Which appliances need testing?"** — Anything you supply that plugs in — kettles, microwaves, fridges, washing machines, lamps, TVs, vacuum cleaners, extension leads and chargers. Hardwired items such as electric showers, cookers and extractor fans are covered by your EICR instead.
- **"Do tenants' own appliances need testing?"** — Legally they are the tenant's responsibility, not yours. In an HMO we would still recommend offering it, because a faulty tenant appliance on a shared circuit affects every other occupant and will keep tripping the supply.
- **"What happens if an appliance fails?"** — It is labelled as failed, removed from service and recorded on your register with the reason. Where the fault is a flex or a fuse we can often repair it on the spot; where the appliance itself is faulty we recommend replacement rather than repair, which is almost always cheaper.
- **"Can you do PAT testing at the same time as my EICR?"** — Yes, and it is the sensible way to book. One visit, one appointment for your tenant, and both certificates issued together.

### Commercial PAT Testing
*Workplace appliance inspection and testing for offices, shops and commercial premises.*

**What it is:** Commercial PAT testing applies the same in-service inspection and testing regime to a workplace, where the duty sits with the employer rather than the landlord. We test everything from desk equipment and kitchen appliances to power tools, salon equipment and IT hardware, label each item with its result and retest date, and issue a certificate with a complete asset register that satisfies both your insurer and an HSE inspector.

**Why the client needs it:** In a workplace the risk profile is higher than in a home: equipment is used harder, by more people, often for longer hours, and frequently in tougher environments. It is also a legal duty you hold personally as an employer. Where an employee is injured by faulty equipment, the first document requested is the testing record — and its absence is treated as evidence that the duty to maintain was never discharged.

**The legal position:** The Electricity at Work Regulations 1989 require that electrical systems and equipment be maintained so far as reasonably practicable to prevent danger, and that duty falls on the employer and on any self-employed person. The Provision and Use of Work Equipment Regulations 1998 add a requirement that work equipment is maintained in efficient working order and in good repair, with a maintenance log kept where appropriate. The HSE's position is that the duty is risk-based rather than interval-based — but that documented inspection and testing at an appropriate frequency is how a business demonstrates it has complied.

**What happens, step by step:**
1. Scope your equipment — Give us an approximate count and the type of premises. We confirm price and the right retest intervals up front.
2. Attend around your trading hours — Daytime, evening or weekend at no premium, so testing never interrupts business.
3. Inspect, test and label — Every item is visually inspected, tested to its class and labelled with its result and next due date.
4. Register and certify

**What the engineer checks / what is included:**
- Formal visual inspection of every appliance, flex and plug
- Class-appropriate earth continuity, insulation resistance and polarity testing
- Risk-based retest interval assigned per asset class
- Individual asset labelling with result and next test date
- Full asset register formatted for insurer and HSE inspection
- Out-of-hours and weekend attendance at no premium
- Failed equipment removed from service and documented

**Prices:**

| Number of appliances | Price |
|---|---|
| Up to 10 appliances | £79.99 |
| 10–20 appliances | £99.99 |
| 20–40 appliances | £119.99 |

More than 40 appliances, or multiple sites? We quote per site with volume pricing — get in touch with an approximate count.

**Warning signs in a commercial setting:** Extension leads in permanent use rather than as a temporary measure; Leads daisy-chained together or adaptors stacked in one socket; Cable drums used while still coiled, particularly with heaters or tools; Leads run through doorways, under carpet or across walkways; Equipment brought in from home by staff and never recorded; Any item with a taped flex, missing label or overdue retest date; Repeated tripping in one area of the premises; Equipment used in wet, hot or dusty conditions it was not rated for.

**Questions clients ask, and the answer:**
- **"How often does commercial equipment need testing?"** — It depends on the equipment and the environment. Handheld tools in a workshop may need six-monthly testing; kitchen and salon equipment is typically annual; stationary office IT can run to two or four years with visual inspection in between. We assign intervals per asset class using the IET Code of Practice.
- **"Is PAT testing a legal requirement for businesses?"** — The Electricity at Work Regulations 1989 and PUWER 1998 require you to maintain electrical equipment so it does not cause danger. They do not name PAT testing specifically, but documented inspection and testing is the recognised way to demonstrate compliance — and it is the first record requested after an incident.
- **"Do you need to test brand new equipment?"** — New items do not need a full electrical test before first use, but they should receive a formal visual inspection and be added to your asset register. Second-hand and refurbished equipment should always be tested before entering service.
- **"Can you test outside business hours?"** — Yes, at no additional charge. Evenings and weekends are often easier for retail and hospitality premises, and we would rather work around your trading than disrupt it.
- **"What about equipment staff bring from home?"** — If it is used at work, it falls within your duty as an employer and should be recorded and tested. Personal fans, heaters, chargers and kettles are the single most common gap we find on commercial asset registers.

### Emergency Lighting Certificate
*Annual duration testing and certification of emergency lighting to BS 5266.*

**What it is:** Emergency lighting is the system that keeps escape routes visible when the normal supply fails. Each luminaire contains a battery designed to run it for a defined period — normally three hours — after a power loss. Testing verifies that every unit actually achieves that duration, because a battery that has silently degraded looks identical to one that works. We carry out the full annual duration test, inspect the coverage of the system, and issue the certificate and log-book entries required by BS 5266.

**Why the client needs it:** A fire that cuts the power leaves a communal staircase in complete darkness, and that is precisely the moment people need to find their way out. Emergency lighting batteries degrade continuously and invisibly from the day they are installed — the healthy green LED on the fitting confirms the unit is charging, not that it will stay lit for three hours. Duration testing is the only way to know, and it is the single most common failure we find in blocks that believed they were compliant.

**The legal position:** The Regulatory Reform (Fire Safety) Order 2005 requires that emergency routes and exits requiring illumination are provided with emergency lighting of adequate intensity in case of failure of their normal lighting, and places the duty on the responsible person — the landlord, freeholder, managing agent or employer. BS 5266-1 sets the technical standard and the testing regime: a monthly short functional test of every luminaire, and a full-duration annual test in which each unit must remain adequately illuminated for its full rated period. Results must be recorded in a fire safety log book. For licensed HMOs, emergency lighting to communal areas and escape routes is routinely a condition of the licence.

**What happens, step by step:**
1. Survey the system — We count and identify every luminaire, note its type, and check coverage against BS 5266 requirements.
2. Functional check — Charge indicators and switch-over are verified on every fitting before the duration test begins.
3. Full duration test — Supply is isolated and the system runs for its full rated period, with each luminaire verified at the end — not the start.
4. Certify and log

**What the engineer checks / what is included:**
- Full annual duration test with every luminaire verified at the end of the period
- Functional test and charge indicator check on each fitting
- Coverage assessment against BS 5266 — exits, stairs, changes of direction
- Fitting type and battery age recorded per luminaire
- Fire safety log book completed and updated
- Quote for any failed luminaires or batteries identified

**Prices:**

| Number of emergency lights | Price |
|---|---|
| Up to 3 emergency lights | £65.00 |
| 3–6 emergency lights | £100.00 |
| 6–9 emergency lights | £135.00 |
| 9–12 emergency lights | £170.00 |
| 12–15 emergency lights | £205.00 |
| 15–18 emergency lights | £240.00 |
| 18–21 emergency lights | £275.00 |

More than 21 fittings?

**Signs your emergency lighting needs attention:** A charge indicator LED that is off, red, or flashing on any fitting; A luminaire that fails to illuminate during a monthly functional test; Fittings that light up but visibly dim within minutes of the supply being cut; Escape routes altered, extended or subdivided since the system was designed; No emergency lighting at a change of direction, staircase or final exit; No log book, or no record of a duration test within the last twelve months; Fittings obscured by new signage, storage, ducting or suspended ceilings; Batteries more than four years old, regardless of apparent condition.

**Questions clients ask, and the answer:**
- **"How often does emergency lighting need testing?"** — BS 5266-1 requires a short functional test every month and a full-duration test annually. The monthly test can be done by a building manager; the annual duration test and certificate should be carried out by a competent person.
- **"Why does the annual test take three hours?"** — Because the standard requires each luminaire to remain adequately illuminated for its full rated duration, normally three hours. A degraded battery lights up perfectly for the first minute — only a full-duration test reveals it. Each fitting is checked at the end of the period.
- **"Does my HMO need emergency lighting?"** — Most licensed HMOs in London do, particularly where there are shared escape routes, internal staircases or corridors without natural light. The specific requirement comes from your fire risk assessment and your borough's licensing conditions — we can advise on both.
- **"The green light is on, so it works — doesn't it?"** — No. The green indicator confirms the battery is receiving charge. It says nothing about whether that battery still holds enough capacity to run the fitting for three hours. This is the single most common misunderstanding we encounter, and degraded batteries with healthy green LEDs are the most common failure we find.
- **"How long do emergency lighting batteries last?"** — Typically four to five years, though this shortens in warm locations such as a boiler room or a top-floor landing. Replacing batteries proactively at four years is significantly cheaper than replacing whole luminaires that have been allowed to fail.

### Commercial Emergency Lighting Certificate
*BS 5266 duration testing and certification for offices, shops and commercial buildings.*

**What it is:** Commercial emergency lighting testing covers the escape lighting in offices, shops, restaurants, warehouses and other business premises. The regime is the same as residential — a monthly functional test and an annual full-duration test — but the systems are larger, frequently panel-monitored, and the coverage requirements more demanding because open-plan areas, high-risk task areas and larger occupancy loads all carry their own standards. We test out of hours as standard so the duration test never runs during trading.

**Why the client needs it:** In a commercial building the responsible person under fire safety law is you, and emergency lighting is one of the first things a fire officer inspects because it is one of the easiest to verify and one of the most commonly neglected. Beyond enforcement, the practical risk is real: an open-plan office or a warehouse with racking is genuinely disorienting in darkness, and occupants are far less familiar with the escape routes than residents of a building they live in.

**The legal position:** Under the Regulatory Reform (Fire Safety) Order 2005 the responsible person — normally the employer, occupier or the person in control of the premises — must ensure that emergency routes and exits requiring illumination are provided with emergency lighting of adequate intensity in the event of the normal lighting failing. BS 5266-1 defines the testing regime and BS EN 1838 sets the minimum illuminance: not less than 1 lux along the centre line of a defined escape route, 0.5 lux in open anti-panic areas, and 15 lux in high-risk task areas. Records must be kept in the fire safety log book and produced on request.

**What happens, step by step:**
1. Survey and categorise — We identify every luminaire and categorise each area as escape route, open area or high-risk task area.
2. Panel check and functional test — Monitoring panels are interrogated and switch-over verified on every fitting before the duration test starts.
3. Out-of-hours duration test — The full rated period is run outside trading hours, with each luminaire verified at the end and the recharge window planned in.
4. Certify, log and advise

**What the engineer checks / what is included:**
- Full annual duration test with luminaires verified at the end of the period
- Panel interrogation on monitored and self-testing systems
- Coverage assessment against escape route, open area and high-risk task categories
- Central battery system inspection where applicable
- Fire safety log book completed on site
- Out-of-hours and weekend attendance at no premium

**Prices:**

| Number of emergency lights | Price |
|---|---|
| Up to 3 emergency lights | £65.00 |
| 3–5 emergency lights | £89.00 |
| 5–8 emergency lights | £125.00 |
| 8–12 emergency lights | £170.00 |

**When a commercial system needs reassessment:** Partitioning, racking or fit-out changes since the system was designed; A change of use — office to workshop, retail to hospitality; New suspended ceilings or ductwork obscuring existing fittings; Any escape route, corridor or stairwell with no emergency luminaire; Fault or fail indications on the monitoring panel; No duration test recorded in the log book within twelve months; Fire officer or insurer has raised emergency lighting at inspection; Central battery system more than five years old with no battery replacement recorded.

**Questions clients ask, and the answer:**
- **"How often does commercial emergency lighting need testing?"** — A short functional test monthly and a full-duration test annually, under BS 5266-1. The monthly test can be carried out in-house by a duty manager; the annual test and certificate should be done by a competent person.
- **"Can you test outside business hours?"** — Yes, at no additional charge — and we recommend it. The duration test isolates the lighting supply for three hours and leaves batteries needing a recharge cycle afterwards, so running it during trading is disruptive and leaves the building temporarily under-protected.
- **"What illuminance does the standard actually require?"** — BS EN 1838 requires not less than 1 lux along the centre line of a defined escape route, 0.5 lux across open anti-panic areas over roughly 60 m², and 10% of normal illuminance — never less than 15 lux — in high-risk task areas such as commercial kitchens and workshops.
- **"We have a self-testing system — do we still need you?"** — Yes. Self-testing removes the labour of routine functional tests, but a competent person must still verify coverage remains adequate, confirm the self-test regime is genuinely operating, physically check a sample of fittings, and complete the log book. A panel reports what its sensors say, not whether a fitting is obscured by new ductwork.
- **"We've refitted the office — is the existing system still valid?"** — Probably not without reassessment. New partitions create corridors that were never lit, and a change of use can move an area into a higher illuminance category. We assess coverage against the building as it stands today and report any gaps.

### Fire Risk Assessment (Residential)
*Compliant fire risk assessments for HMOs, flats, blocks and communal areas.*

**What it is:** A Fire Risk Assessment is a structured survey of a building that identifies fire hazards, the people at risk, and the measures needed to reduce that risk to an acceptable level. It follows the recognised five-step method, examines means of escape, compartmentation, detection and warning, emergency lighting and management arrangements, and produces a written report with a prioritised action plan. For HMOs and any building with communal areas, holding a current, suitable and sufficient assessment is a legal requirement.

**Why the client needs it:** A Fire Risk Assessment is the document from which every other fire safety decision in a building flows — how many alarms you need and to what grade, whether emergency lighting is required, what fire doors must achieve, how people get out. Without one you are guessing, and after an incident the assessment is the first document the fire authority asks for. Since the Grenfell inquiry, enforcement in London has tightened considerably, and 'we didn't think it applied to us' is no longer treated as a mitigating explanation.

**The legal position:** The Regulatory Reform (Fire Safety) Order 2005 requires the responsible person — the landlord, freeholder or managing agent — to carry out and keep up to date a suitable and sufficient fire risk assessment of the common parts of any building containing two or more sets of domestic premises, and of any HMO. Since the Fire Safety Act 2021 the assessment must expressly include the building's structure, external walls, cladding, balconies and flat entrance doors. Where five or more people are employed, or the premises is licensed, the significant findings must be recorded in writing. The Fire Safety (England) Regulations 2022 added further duties for buildings above 11 metres and for high-rise residential buildings. Failure to comply carries unlimited fines and up to two years' imprisonment.

**What happens, step by step:**
1. Building walk-through — The assessor surveys escape routes, compartmentation, doors, detection and emergency lighting throughout the building.
2. Hazard and occupancy evaluation — Fire hazards are identified and the people at risk assessed, including anyone who would need help to evacuate.
3. Written report and action plan — Significant findings are recorded with each action risk-rated and given a realistic timescale for completion.
4. Remedials and review — We can carry out any work identified, and set a review date so the assessment never silently expires.

**What the engineer checks / what is included:**
- Full five-step assessment by a competent, experienced assessor
- Means of escape, travel distances and final exits reviewed
- Compartmentation and fire door inspection, including flat entrance doors
- Detection, warning and emergency lighting provision assessed against LACORS
- External wall, balcony and structure considerations per the Fire Safety Act 2021
- Lithium-ion battery storage and charging risk addressed
- Written report with a risk-rated, prioritised action plan and timescales
- Log book template and guidance on the routine checks you must record

**Prices:**

| Property type | Price |
|---|---|
| Studio apartment | £84.00 |
| 1–3 Bedrooms | £149.99 |
| 4 Bedrooms | £189.99 |
| 5 Bedrooms | £199.99 |
| 6 Bedrooms | £259.99 |
| 7 Bedrooms | £309.99 |
| 8 Bedrooms | £359.99 |
| Communal areas · 1–3 floors | £139.99 |
| Communal areas · 3–6 floors | £159.99 |

Larger blocks and mixed-use buildings are priced on the commercial scale.

**When you need an assessment — or a new one:** You own or manage a building with two or more flats and any shared area; The property is an HMO, whether licensed or not; Building work, a loft conversion or a layout change since the last assessment; A change of use, or a significant change in who lives there; A resident whose mobility or cognitive ability affects how they would escape; Bin stores, bike stores or e-bike charging introduced anywhere in the building; The last assessment is more than a year old, or you cannot find it at all; Any fire or near miss, however minor it seemed at the time.

**Questions clients ask, and the answer:**
- **"Do I legally need a Fire Risk Assessment?"** — If your building contains two or more sets of domestic premises with any shared area, or is an HMO, then yes — the Regulatory Reform (Fire Safety) Order 2005 requires the responsible person to have a suitable and sufficient assessment and keep it up to date. A single self-contained house let to one household does not require one, though the smoke and CO alarm regulations still apply.
- **"How often does it need reviewing?"** — Review annually as standard practice, with a fresh assessment typically every three years for lower-risk residential buildings. More importantly, review immediately after any material change — building work, a change of occupancy, new fuel loads such as bike stores, or any fire or near miss.
- **"Does it cover inside individual flats?"** — For a block, the assessment covers the common parts plus the elements that protect them — most importantly flat entrance doors, which are now expressly within scope following the Fire Safety Act 2021. For an HMO, the assessment covers the whole property including bedrooms, because occupants sleep off a shared escape route.
- **"What happens if the assessment identifies problems?"** — You get a prioritised action plan, with each item risk-rated and given a timescale rather than a single undifferentiated list. We can carry out the remedial work ourselves — fire doors, alarms, emergency lighting, compartmentation sealing — so nothing stalls waiting for another contractor.
- **"Can I do my own fire risk assessment?"** — The law requires the assessment to be carried out by a competent person, and for anything beyond the simplest premises that means demonstrable training and experience. For an HMO or any building with communal areas, a self-assessment is very unlikely to be accepted by a council or a fire officer, and it will not protect you after an incident.
- **"Do you cover e-bike and e-scooter battery risks?"** — Yes, explicitly. Lithium-ion battery fires are among the fastest-growing residential fire risks in London. We assess where batteries are stored and charged — charging in an escape route is the critical failure — and can provide policy wording for your tenancy agreements.

### Commercial Fire Risk Assessment
*Fire risk assessments for offices, retail, hospitality and mixed-use buildings.*

**What it is:** A commercial Fire Risk Assessment applies the same statutory duty to workplaces and mixed-use buildings, where the responsible person must also account for employees, customers and visitors who do not know the building. The assessment covers escape routes and travel distances, occupancy capacity, detection and warning systems, extinguisher provision, signage, staff training and emergency planning, and produces a written report with a risk-rated action plan.

**Why the client needs it:** In a commercial building most of the people inside are unfamiliar with it. They do not know where the second staircase is, they will instinctively try to leave the way they came in, and in a retail or hospitality setting many of them will be moving in the opposite direction from your fire exits. That changes the assessment fundamentally: escape strategy, signage, staff training and alarm audibility all matter far more than they do in a residential block where people know their own home.

**The legal position:** Under the Regulatory Reform (Fire Safety) Order 2005 the responsible person in a workplace is the employer, together with anyone else who has control of the premises. Where five or more people are employed, or the premises is licensed, or an alterations notice is in force, the significant findings of the assessment must be recorded in writing. The Order also requires an emergency plan, appropriate staff training and the appointment of competent persons to assist.

**What happens, step by step:**
1. Scope the premises — Tell us the building type, floor count and use. We confirm a fixed price and attend at a time that suits trading.
2. Survey and measure — Escape routes, travel distances, exit widths, detection, extinguishers and signage are surveyed and measured.
3. Assess management arrangements — Emergency plan, training records, drill history and log book are reviewed alongside the physical measures.
4. Report and action plan — A risk-rated action plan is issued within 48 hours, with responsibilities and timescales for every item.

**What the engineer checks / what is included:**
- Full assessment against the RRO 2005 by a competent assessor
- Travel distance, exit capacity and occupancy capacity calculations
- Alarm system category reviewed against BS 5839-1
- Extinguisher provision, signage and emergency lighting assessed
- Compartmentation and mixed-use interface review where applicable
- Emergency plan and staff training requirements set out, with a template plan
- Risk-rated written action plan with responsibilities and timescales

**Prices:**

| Building | Price |
|---|---|
| Communal areas · up to 3 floors | £159.99 |
| Communal areas · 3–5 floors | £199.99 |
| Communal areas · 5–10 floors | £289.99 |
| Building · 1–3 floors | £259.99 |
| Building · 3–5 floors | £379.99 |
| Building · 5–8 floors | £469.99 |
| Building · 8–12 floors | £549.99 |
| Building · more than 12 floors | Price on application |

Buildings above 12 floors, high-rise residential and complex mixed-use sites are quoted individually — contact us and we will scope it properly.

**When a commercial assessment needs redoing:** Any fit-out, partitioning or layout change since the last assessment; A change of use — retail to hospitality, office to workshop; Increased occupancy, new seating layouts or new shift patterns; Fire exits obstructed, locked during trading, or repurposed for storage; New processes or materials introducing significant fuel or ignition sources; Alterations to the alarm system, or persistent false alarms; A fire officer visit, insurer inspection or licence review has raised concerns; Any fire or near miss on the premises.

**Questions clients ask, and the answer:**
- **"Who is the responsible person in a commercial building?"** — Normally the employer, together with anyone else in control of the premises — which can include the freeholder, a managing agent and individual tenants. In mixed-use buildings there is usually more than one, and the Order requires them to cooperate and coordinate with each other.
- **"Do we have to record the assessment in writing?"** — If you employ five or more people, hold a licence, or an alterations notice is in force, then yes — the significant findings must be recorded. In practice we recommend a written assessment in every case, because an unwritten one is impossible to evidence after an incident.
- **"How often should a commercial assessment be reviewed?"** — Annually as standard, and immediately after any fit-out, change of use, change in occupancy, alarm system alteration, or any fire or near miss. An assessment that no longer matches the building offers no protection.
- **"What alarm system category do we need?"** — It depends on the building and its risks. Category M is manual call points only, suitable for some small low-risk premises. Category L systems protect life, from L5 for a specific risk up to L1 for whole-building coverage. The assessment determines the appropriate category rather than assuming one.
- **"Can we keep fire exits locked while we're trading?"** — No. Final exits must be openable without a key whenever the premises is occupied. Locked and obstructed exits are the single most common finding at commercial fire inspections, and they attract enforcement action quickly. Panic hardware or approved release devices are the correct solution where security is a concern.
- **"Do you assess buildings over 12 floors?"** — Yes, but they are quoted individually rather than on the published scale. High-rise residential buildings carry additional duties under the Fire Safety (England) Regulations 2022 and the Building Safety Act, and they need scoping properly rather than being priced from a table.

### Fire Safety Check (Smoke & Heat Alarm Certificate)
*Smoke, heat and carbon monoxide alarm testing and certification to BS 5839-6.*

**What it is:** The Fire Safety Check is a formal inspection and test of the fire detection in a property: smoke alarms, heat alarms and carbon monoxide alarms. We verify that each device is the correct type for its location, correctly positioned, within its expiry date, properly interlinked where required, and actually functional when tested with real smoke or heat rather than just the test button. You receive a certificate listing every device with its type, location, age and result.

**Why the client needs it:** Working smoke alarms roughly halve the risk of dying in a house fire, and the fires that kill people are overwhelmingly those where the alarm was missing, expired, or had been disabled. Alarms also have a finite life that almost nobody tracks: the sensor degrades and every unit carries an expiry date, typically ten years from manufacture, after which it may test fine on the button while failing to detect actual smoke. Pressing the test button proves the sounder and battery work — it does not prove the sensor still does.

**The legal position:** The Smoke and Carbon Monoxide Alarm (England) Regulations 2015, as amended in 2022, require a smoke alarm on every storey of a rented property used as living accommodation, and a carbon monoxide alarm in any room used as living accommodation containing a fixed combustion appliance other than a gas cooker. Alarms must be tested and confirmed working on the first day of a new tenancy, and must be repaired or replaced once the landlord is informed of a fault. The 2022 amendment extended the duties to social housing and made the repair obligation explicit. Licensed HMOs face additional requirements — usually a Grade A or interlinked Grade D system to BS 5839-6 — set through licence conditions and the fire risk assessment. Local authorities can impose a penalty of up to £5,000 for breach.

**What happens, step by step:**
1. Locate and identify — Every smoke, heat and CO alarm is located and recorded with its type, position, grade and manufacture date.
2. Check siting and coverage — Positions are checked against BS 5839-6 and any storey or room lacking required detection is identified.
3. Live function and interlink test — Each device is tested with smoke or heat, and interlinking is proved by confirming all devices respond.
4. Certify and advise

**What the engineer checks / what is included:**
- Every smoke, heat and CO alarm located, identified and recorded
- Detector type verified as correct for each room
- Position checked against BS 5839-6 siting requirements
- Live function testing with smoke or heat, not just the test button
- Interlinking verified by activating one device and confirming all respond
- Manufacture and expiry dates recorded for every device
- Certificate listing every device with type, location, age and result
- Replacement quote for any expired, missing or incorrectly sited devices

**Prices:**

| Number of alarms | Price |
|---|---|
| Up to 3 alarms | £65.00 |
| 3–6 alarms | £100.00 |
| 6–9 alarms | £135.00 |
| 9–12 alarms | £170.00 |
| 12–15 alarms | £205.00 |
| 15–18 alarms | £240.00 |
| 18–21 alarms | £275.00 |

Fire alarm panel systems and new alarm installations are quoted after this inspection, once we know what the property actually needs.

**Alarm problems that need attention now:** Any alarm past its printed expiry date, typically ten years from manufacture; An alarm that chirps intermittently — usually a failing backup battery; A device that has been removed, covered, or had its battery taken out; A smoke alarm inside a kitchen, which will always be disabled by a tenant eventually; No alarm on one or more storeys, including cellars and loft conversions; No CO alarm in a room containing a boiler, gas fire or solid fuel appliance; Alarms that sound individually but do not trigger the others; Yellowed or discoloured casings, indicating age and heat exposure.

**Questions clients ask, and the answer:**
- **"How many alarms does my rental property need?"** — At minimum, a smoke alarm on every storey used as living accommodation, and a carbon monoxide alarm in any room containing a fixed combustion appliance other than a gas cooker. HMOs and properties with communal areas usually need more, specified by the fire risk assessment and your licence conditions.
- **"Isn't pressing the test button enough?"** — No. The test button proves the sounder and power supply work. It does not prove the sensor can still detect smoke, which is exactly what degrades with age. We test with real smoke or heat and record each device's expiry date.
- **"How long do smoke alarms last?"** — Typically ten years from manufacture for smoke and heat alarms, and five to seven years for carbon monoxide alarms depending on the model. The date is printed on the device. Past it, the alarm may still beep on test while no longer reliably detecting a fire.
- **"Can I put a smoke alarm in the kitchen?"** — You should not. A smoke alarm in a kitchen will be triggered by cooking and will be disabled by the occupants within weeks. Kitchens need a heat alarm, which responds to a rapid rise in temperature rather than smoke. This is one of the most common faults we find.
- **"Do alarms need to be interlinked?"** — In most rented properties, yes — and it is required in HMOs. Interlinking means any activation sounds every alarm, so someone asleep upstairs is warned about a fire that starts downstairs. Radio interlinking avoids lifting floors in an occupied property.
- **"What about the alarm test at the start of a tenancy?"** — The regulations require alarms to be tested and confirmed working on the first day of a new tenancy. This is the requirement landlords most often fail to evidence. Record it in writing and keep it with the tenancy file — our certificate covers the inspection itself.

### Commercial Fire Safety Check
*Fire detection testing and certification for offices, shops and commercial premises.*

**What it is:** Commercial fire detection testing covers the alarm and detection system in a workplace — call points, detectors, sounders and, where fitted, the control panel. We test devices, verify audibility across the premises, interrogate the panel for faults and disablements, and complete the log book entries that BS 5839-1 requires. Testing is available outside trading hours so a full alarm test never disrupts customers.

**Why the client needs it:** A commercial alarm system has to warn people who do not know the building, may be distracted, and in a retail or hospitality setting may initially assume the sound is something else. That places real weight on audibility and on staff knowing what to do — the two things most often untested. Panels are also routinely left with zones disabled after a false alarm and never re-enabled, which means part of the premises has no detection at all while the panel appears normal.

**The legal position:** The Regulatory Reform (Fire Safety) Order 2005 requires that fire safety equipment is subject to a suitable system of maintenance and kept in efficient working order and good repair. BS 5839-1 sets out what that means for a fire detection and alarm system: a weekly test of at least one manual call point, rotating around the building so every call point is tested over time, with the results recorded in a log book; and a periodic inspection and test by a competent person at intervals not exceeding six months, covering a proportion of devices so that every device is tested at least annually. The log book must be available for inspection by the fire authority.

**What happens, step by step:**
1. Interrogate the panel — Faults, disablements and isolated zones are identified before any testing begins — this is where hidden gaps show up.
2. Test devices and call points — Detectors and manual call points are tested across the premises, with results recorded device by device.
3. Measure audibility — Sound level readings are taken in occupied areas to verify the alarm meets BS 5839-1 levels everywhere it needs to.
4. Log, certify and set the routine

**What the engineer checks / what is included:**
- Control panel interrogation for faults, disablements and isolated zones
- Manual call point and detector testing across the premises
- Sound level readings to verify audibility against BS 5839-1
- Panel standby battery condition checked
- Root cause identified for any recurring false alarms
- Log book completed and weekly test rotation set up
- Out-of-hours attendance so full alarm tests never disrupt trading

**Prices:**

| Number of alarms | Price |
|---|---|
| Up to 3 alarms | £65.00 |
| 3–5 alarms | £89.00 |
| 5–8 alarms | £125.00 |
| 8–12 alarms | £170.00 |

**Signs your commercial system needs attention:** Fault, disablement or zone-isolated indications on the control panel; Recurring false alarms, especially from the same detector or zone; Any area where the alarm cannot be clearly heard — plant rooms, toilets, stores; Partitioning, fit-out or extension since the system was designed; No weekly test entries in the log book, or entries always naming the same call point; Detectors obscured, painted over, covered with bags, or removed; Panel batteries more than four years old; Staff who could not say what to do if the alarm sounded right now.

**Questions clients ask, and the answer:**
- **"How often does a commercial fire alarm need testing?"** — Staff should test one manual call point weekly on a rotating basis and log it. A competent person should inspect and service the system at intervals not exceeding six months, and every device should be tested at least once a year across those visits.
- **"Who does the weekly test?"** — You do — it is a user responsibility. Operate a different call point each week with the test key, confirm the alarm sounds throughout, reset, and record which point was tested. We set up the rotation schedule and log book so the routine is straightforward and defensible.
- **"How loud does the alarm have to be?"** — At least 65 dB(A) in all accessible areas, or 5 dB above persistent background noise, whichever is greater. Where people sleep it must reach 75 dB(A) at the bedhead. We take actual sound readings rather than assuming coverage.
- **"Our alarm keeps going off for no reason — can you fix it?"** — Yes, and it is worth fixing properly. Recurring false alarms are usually caused by the wrong detector type in the wrong place — an optical smoke detector near a kitchen, shower room or loading bay. We identify the specific devices responsible and recommend the correct technology rather than just resetting the panel.
- **"Can you test outside opening hours?"** — Yes, at no additional charge. A full alarm test is disruptive in a shop or restaurant, so most commercial customers prefer early mornings, evenings or weekends.

### Fire Alarm Installation
*Mains-powered interlinked fire alarm systems designed and installed to BS 5839.*

**What it is:** We design and install fire detection systems to BS 5839, from a small interlinked domestic system to a panel-based system in a larger HMO or commercial premises. Pricing is per alarm and includes the device, mains wiring, interlinking, commissioning and certification. The number and type of devices is determined by your fire risk assessment or Fire Safety Check, so the system matches what the building actually needs rather than a guess.

**Why the client needs it:** Detection is the measure that buys people time, and time is the only thing that matters in the first two minutes of a fire. A correctly designed system warns everybody in the building simultaneously, from a detector positioned where a fire will actually reach it, using a technology suited to the room it is in. Systems that are installed to the wrong grade, sited badly or left un-interlinked provide the appearance of protection without the substance, and they fail licensing inspections routinely.

**The legal position:** Fire detection in dwellings is designed to BS 5839-6, and in commercial buildings to BS 5839-1. The required grade and category come from your fire risk assessment, and for licensed HMOs from the licence conditions your local authority applies — most London boroughs follow the LACORS housing fire safety guidance. Mains-powered alarm installation is electrical work within scope of Part P of the Building Regulations in England, so it must be carried out by a registered competent person or notified to building control; our NICEIC / NAPIT registration means it is self-certified. On completion you receive a design, installation and commissioning certificate identifying the grade and category achieved.

**What happens, step by step:**
1. Determine grade and category — We work from your fire risk assessment or Fire Safety Check to establish exactly what grade and coverage the building requires.
2. Design the layout — Device positions are set to BS 5839 siting rules, with the right detector technology chosen for each room.
3. Install and interlink — Each alarm is mains-connected and interlinked — hard-wired or radio, whichever suits an occupied property best.
4. Commission and certify — Interlinking is proved device by device, and your design, installation and commissioning certificate is issued on completion.

**What the engineer checks / what is included:**
- System design to BS 5839-6 or BS 5839-1 to the required grade and category
- Supply and installation of each alarm, mains-connected
- Hard-wired or radio interlinking across the whole system
- Siting to BS 5839 clearance and coverage requirements
- Correct detector type selected for each room — heat alarms in kitchens
- Full commissioning with interlink verification
- Design, installation and commissioning certificate identifying grade and category
- Part P notification handled under our competent person scheme

**Prices:**

| Installation | Price |
|---|---|
| Per alarm — supplied, installed, interlinked and certified | £219.99 |
| Grade A panel system | Quoted after survey |

The number and type of devices is determined by your Fire Safety Check or fire risk assessment, so the system matches what the building genuinely requires. Panel-based Grade A systems are quoted individually after survey.

**When a property needs a new system:** Alarms are battery-only, where a mains-powered interlinked system is required; Devices are not interlinked, so one activation does not warn the whole property; Most or all alarms are at or past their ten-year expiry date; A fire risk assessment or licence condition specifies a higher grade or category; The property is being converted to an HMO or the storey count is increasing; Coverage is incomplete — a storey, hallway or risk room with no detection; A refurbishment or loft conversion has changed the escape route; Existing devices are the wrong type for their room, particularly in kitchens.

**Questions clients ask, and the answer:**
- **"How many alarms will my property need?"** — It depends on the storey count, layout and use. As a minimum, one on every storey plus a heat alarm in the kitchen, but HMOs and properties with communal areas usually need more. Your fire risk assessment or our Fire Safety Check determines the exact number, which is why we inspect before quoting.
- **"What is the difference between Grade D1 and Grade A?"** — Grade D1 is mains-powered interlinked alarms with sealed backup batteries — the standard for most rented houses and smaller HMOs. Grade A is a full system with a control panel, separate detectors and sounders and a standby supply, required for larger HMOs and most commercial premises. Your licence conditions determine which applies.
- **"Do you need to lift floors to interlink the alarms?"** — Not usually. Radio interlinking uses an encrypted radio link between devices and is fully compliant with BS 5839-6, which means no cable runs, no lifting floors and no making good. In an occupied property it turns a multi-day job into a single visit.
- **"Can I install mains-powered alarms myself?"** — No. Mains-connected alarm installation is electrical work notifiable under Part P of the Building Regulations and must be carried out by a registered competent person or notified to building control. Battery-only alarms you can fit yourself, but they are not acceptable for most rented accommodation.
- **"Why £219.99 per alarm rather than a property price?"** — Because per-device pricing scales honestly with what the building actually needs. A studio requiring two devices should not be subsidising an eight-bedroom HMO requiring twelve. You pay for the coverage your property genuinely requires and nothing more.

### Fire Door Certificate & Inspection
*Fire door inspection and certification for communal areas, HMOs and flat entrance doors.*

**What it is:** A fire door only performs if every part of it is right — the leaf, the frame, the intumescent and smoke seals, the hinges, the closer, the gaps around the edges and the glazing. Our inspection assesses each door against the recognised checks, records the condition of every component, identifies which doors are compliant and which are not, and issues a certificate with a schedule of any remedial work required.

**Why the client needs it:** Fire doors are the most misunderstood element of a building's fire strategy, and the most consistently defective. They are the barriers that hold a fire inside the room it started in and keep an escape route usable, which is the entire premise of the stay-put strategy in a block of flats. Yet a fire door is disabled by things that look trivial: a wedge holding it open, a closer removed because it slammed, a hole drilled through the leaf for a cable, an intumescent seal painted over. In each case the door looks completely normal and provides almost none of the protection it was rated for.

**The legal position:** The Fire Safety (England) Regulations 2022 introduced explicit fire door duties. In buildings above 11 metres with two or more sets of domestic premises, the responsible person must carry out quarterly checks of all fire doors in communal areas, and must make best endeavours to carry out annual checks of flat entrance doors. In all multi-occupied residential buildings, residents must be given information about the importance of fire doors and about not tampering with self-closing devices. Beyond those specific duties, the general obligation under the Regulatory Reform (Fire Safety) Order 2005 to maintain fire safety measures in efficient working order applies to fire doors in every building within its scope, including HMOs.

**What happens, step by step:**
1. Schedule the doors — We identify every fire door in scope — communal doors, flat entrance doors, and doors to risk rooms in HMOs.
2. Component-by-component inspection — Leaf, frame, seals, hinges, glazing, closer and any penetrations are each assessed and recorded per door.
3. Measure and test — Gaps are measured at multiple points and every self-closer is tested from several opening angles for full latching.
4. Certify and remediate

**What the engineer checks / what is included:**
- Every door inspected against the recognised fire door checks
- Gap measurement at multiple points on each door
- Intumescent and cold smoke seal condition assessed
- Self-closing device tested from several opening angles for full latching
- Hinges, glazing, letterplates and any penetrations inspected
- Certification labels and evidence of rating identified where present
- Door-by-door schedule with pass, fail and defect detail

**Prices:**

| Service | Price |
|---|---|
| Fire door inspection and certificate | £130.00 |
| Remedial works — seals, closers, hinges | Quoted per door after inspection |

The flat rate covers inspection and certification. Most defects we find — seals, closers, hinge screws, threshold gaps — are inexpensive to correct, and we quote them per door so you can prioritise rather than facing a single undifferentiated bill.

**Fire door defects to look for:** Any door wedged, tied, hooked or propped open; A self-closer disconnected, removed, or too weak to latch the door fully; Gaps around the leaf visibly wider than a £1 coin's thickness, or uneven; Intumescent or smoke seals missing, damaged, or painted over; Holes drilled through the leaf for cables, or filled with ordinary filler; Fewer than three hinges per leaf, or loose, damaged or missing screws; A letterplate, cat flap or vent cut into a flat entrance door; Cracked, non-fire-rated or loose glazing, or missing glazing beads; Damage to the leaf or frame from trolleys, deliveries or moves.

**Questions clients ask, and the answer:**
- **"How often do fire doors need checking?"** — In buildings above 11 metres with two or more dwellings, the Fire Safety (England) Regulations 2022 require quarterly checks of communal fire doors and annual checks of flat entrance doors. In other buildings, including HMOs, the general duty to maintain fire safety measures applies and quarterly walk-round checks are the sensible standard.
- **"What is the difference between FD30 and FD30S?"** — FD30 means the door assembly resisted fire for at least 30 minutes under test. The S suffix adds cold smoke sealing, which blocks smoke at ambient temperature before there is enough heat to activate the intumescent strip. Most flat entrance doors and doors onto protected escape routes need FD30S.
- **"How big should the gap around a fire door be?"** — Generally 2 to 4 mm at the top and sides, measured at several points, and normally no more than 8 mm at the threshold — less where cold smoke sealing is required. Too tight and the door binds and gets wedged open; too loose and hot gases pass through before the intumescent seal expands.
- **"Can I fit a letterplate or cat flap in a fire door?"** — Only using a certified intumescent unit specifically tested for fire doors. An ordinary letterplate or cat flap cut into a fire door destroys its integrity, and this is one of the most common defects we find on flat entrance doors.
- **"Someone drilled a hole through our fire door for a cable — is that a problem?"** — Yes, a serious one. Any unsealed penetration through the leaf breaches its integrity and allows fire and smoke through. It cannot be repaired with ordinary filler. Depending on size and position, the door may be repairable with a certified system or may need replacing — we will tell you which on the day.
- **"Do you carry out the repairs as well?"** — Yes. Most defects — seals, closers, hinge screws, threshold adjustments — are inexpensive and we quote them per door so you can prioritise. Where a leaf is beyond repair we will say so plainly rather than patching something that will not perform.

### Fire Extinguisher Testing & Servicing
*Annual extinguisher servicing and certification to BS 5306-3 for commercial premises.*

**What it is:** Annual extinguisher servicing to BS 5306-3 covers inspection of every unit, verification of pressure and weight, checking of hoses, horns and safety pins, replacement of seals, and confirmation that each extinguisher is the right type and correctly located for the risks in its area. We record every unit individually and issue a certificate listing each one with its type, location, service date and next due date.

**Why the client needs it:** Extinguishers are the fire safety equipment people are most likely to actually reach for, and the ones most likely to have been sitting untouched for years. Pressure leaks away invisibly, powder compacts into a solid cake that will not discharge, and units get moved, hidden behind stock or quietly taken away during a refit. The other recurring problem is type: using the wrong extinguisher on a fire — water on an electrical fire, or anything but a wet chemical unit on a deep fat fryer — makes the situation dramatically worse rather than better.

**The legal position:** The Regulatory Reform (Fire Safety) Order 2005 requires the responsible person to provide appropriate firefighting equipment where necessary, to ensure it is maintained in efficient working order and good repair, and to make sure staff are trained to use it where their duties require. BS 5306-3 sets out the maintenance regime: a basic service annually by a competent person, an extended service every five years for water, foam, powder and wet chemical extinguishers, and a ten-yearly overhaul for CO₂ units. BS 5306-8 governs selection and positioning. The number and type required comes from your fire risk assessment rather than a general rule.

**What happens, step by step:**
1. Survey the premises — Every extinguisher is located and recorded, and provision is checked against the risks and travel distances in each area.
2. Service each unit — Pressure, weight, hose, horn, pin and seal are checked, with seals and pins replaced as required.
3. Verify type and position — Each unit is confirmed as the correct type for its area — particularly wet chemical provision in kitchens — and correctly mounted and signed.
4. Label and certify — Service labels are applied with the next due date, and your certificate lists every unit individually.

**What the engineer checks / what is included:**
- Every extinguisher inspected and recorded individually
- Pressure gauge verified and weight checked against stated full weight
- Hose, horn, safety pin and anti-tamper seal inspected and replaced as needed
- Extinguisher type verified as correct for the risks in each area
- Position, mounting height, travel distance and signage checked to BS 5306-8
- Service label applied with date and next due date
- Extended service and overhaul requirements flagged before they fall due
- Certificate listing every unit with type, location, service date and next due date

**Prices:**

| Number of extinguishers | Price |
|---|---|
| 1–3 extinguishers | £90.00 |
| 3–6 extinguishers | £110.00 |
| 6–10 extinguishers | £145.00 |
| 10–15 extinguishers | £185.00 |
| 15–20 extinguishers | £215.00 |

Five-yearly extended services, ten-yearly CO₂ overhauls and replacement units are quoted separately and always flagged in advance of falling due.

**Extinguisher problems to look for:** Pressure gauge needle outside the green band, low or high; A missing, broken or already-released anti-tamper seal or safety pin; Corrosion, dents, or damage to the cylinder, hose or horn; A cracked, perished or blocked hose; Units on the floor rather than mounted on a bracket or stand; Extinguishers hidden behind stock, furniture or doors; No service label, or a service date more than twelve months old; A water or foam extinguisher as the only unit in a kitchen with a fryer; Missing signage above the extinguisher position.

**Questions clients ask, and the answer:**
- **"How often do fire extinguishers need servicing?"** — A basic service annually by a competent person. In addition, water, foam, powder and wet chemical units need an extended service every five years involving discharge, internal inspection and recharge, and CO₂ units need a ten-yearly overhaul with hydraulic testing.
- **"What extinguisher does a commercial kitchen need?"** — A wet chemical extinguisher, which is the only type suitable for Class F cooking oil fires, plus a fire blanket. Using water or foam on a burning fryer causes a violent steam explosion that throws burning oil across the kitchen. A powder unit by the back door is not a substitute.
- **"How many extinguishers do we need?"** — It comes from your fire risk assessment and BS 5306-8, based on the risks present and travel distances — generally no more than 30 metres to a Class A extinguisher, and around 10 metres to a Class F unit in a kitchen. We assess provision as part of the service rather than just servicing what happens to be there.
- **"Does a landlord need extinguishers in a rented house?"** — For a single-family let, usually not — the priority is detection and escape rather than firefighting, and untrained occupants should be leaving, not fighting a fire. HMOs and buildings with communal areas often do require them, as specified by the fire risk assessment. We will tell you honestly if you do not need them.
- **"The gauge is in the green — isn't that enough?"** — No. The gauge shows pressure at that moment; it says nothing about whether the powder inside has compacted, whether the hose has perished internally, or whether the unit is due its five-yearly extended service. Compacted powder in a unit showing perfect pressure is a common and dangerous failure.

### EPC (Energy Performance Certificate)
*Accredited Energy Performance Certificates for lettings and sales.*

**What it is:** An Energy Performance Certificate rates a property's energy efficiency from A to G and sets out the measures that would improve it. An accredited domestic energy assessor surveys the property, recording construction, insulation, glazing, heating, controls and hot water, then produces the certificate and lodges it on the national EPC register. You legally need a valid EPC before marketing a property to let or sell, and you need at least an E rating to let it at all.

**Why the client needs it:** The EPC has quietly become one of the most consequential documents a landlord holds. Under the Minimum Energy Efficiency Standards it is not just a disclosure document — a rating of F or G makes the property unlettable, and the penalties for letting one anyway reach £5,000 per property. It also determines eligibility for grant funding, affects mortgage and remortgage decisions as lenders increasingly weight energy performance, and increasingly influences what tenants will pay given how directly the rating maps onto their running costs.

**The legal position:** The Energy Performance of Buildings (England and Wales) Regulations 2012 require a valid EPC before a property is marketed for sale or let, with the rating shown in any advertisement and a copy given to the tenant or buyer. An EPC is valid for ten years. Separately, the Energy Efficiency (Private Rented Property) (England and Wales) Regulations 2015 — the MEES regulations — make it unlawful to let a domestic property with an EPC rating below E, and since April 2020 that applies to all existing tenancies, not just new ones. Where you cannot reach E, you must register a valid exemption on the PRS Exemptions Register; you cannot simply let it anyway. Penalties for letting a sub-standard property reach £5,000 per property, and non-compliance is published on the register.

**What happens, step by step:**
1. Book and gather paperwork — Dig out any insulation, boiler, glazing or solar certificates — they can be worth a full band on the rating.
2. Property survey — The assessor measures the property and records construction, insulation, glazing, heating, controls and hot water.
3. RdSAP assessment — The data is run through the government methodology, with your evidenced upgrades applied rather than pessimistic defaults.
4. Lodged and delivered — Your EPC is lodged on the national register within 24 hours and emailed with a prioritised recommendation report.

**What the engineer checks / what is included:**
- Full survey by an accredited domestic energy assessor
- All measurements, construction, insulation, glazing and heating recorded
- Existing insulation and upgrade evidence reviewed and applied to the assessment
- RdSAP calculation and certificate production
- Lodgement on the national EPC register within 24 hours
- Recommendation report showing the measures that would improve the rating
- Plain-English MEES advice on where you stand and what to do next

**Prices:**

| Property size | Price |
|---|---|
| Studio | £99.99 |
| 1–3 Bedrooms | £129.99 |
| 4 Bedrooms | £149.99 |
| 5 Bedrooms | £169.99 |

Larger properties and commercial premises are quoted on the commercial EPC scale.

**When you need a new EPC:** You are marketing the property to let or sell — it must be in place before marketing begins; Your existing EPC is approaching or past ten years old; The current rating is F or G, which makes the property unlettable; You have carried out insulation, boiler, glazing or heating upgrades worth reflecting; The rating is a low E and you want headroom before standards tighten; A lender, agent or insurer has asked for a current certificate; You are applying for grant funding that depends on the current rating; You hold no EPC at all, or cannot locate it on the register.

**Questions clients ask, and the answer:**
- **"How long is an EPC valid?"** — Ten years. You do not need a new one during that period unless you want to reflect improvements you have made — for example after a new boiler or insulation work, where a fresh certificate can meaningfully improve the rating.
- **"What EPC rating do I need to let a property?"** — At least band E. Since April 2020 that applies to all tenancies, not just new ones. Letting below E without a registered exemption can attract a penalty of up to £5,000 per property.
- **"How long does the assessment take?"** — Typically 30 to 60 minutes depending on property size. The assessor needs access to every room, plus the loft, the boiler and the hot water cylinder if there is one.
- **"How can I improve my rating?"** — In rough order of impact: loft insulation to 270 mm, cavity wall insulation where the construction allows, a modern condensing boiler, proper heating controls, low-energy lighting throughout, and cylinder insulation. Window replacement generally moves the score less than people expect for the cost.
- **"Why does paperwork matter so much?"** — Because where a measure cannot be seen or evidenced, the methodology assumes a pessimistic default based on the property's age. Cavity insulation installed twenty years ago with no documentation is assessed as if it does not exist — which can cost you a whole band. Bring guarantees, FENSA certificates and installation paperwork to the visit.
- **"Are listed buildings exempt?"** — Not automatically, and this is a common and expensive misunderstanding. The exemption applies only where compliance would unacceptably alter the building's character or appearance, and that must be demonstrated. Many listed properties can take loft insulation, better heating and secondary glazing without affecting protected features.

### Commercial EPC (Energy Performance Certificate)
*Non-domestic Energy Performance Certificates for offices, shops and commercial units.*

**What it is:** A commercial or non-domestic EPC rates the energy efficiency of a business premises and is required before letting or selling. Non-domestic assessment uses SBEM rather than the domestic RdSAP methodology, which means building services — heating, cooling, ventilation, lighting and controls — carry far more weight than they do in a home. Pricing is by floor area, and assessments are carried out by accredited non-domestic energy assessors at the appropriate certification level for the building.

**Why the client needs it:** Commercial MEES has the same teeth as the domestic regime but substantially larger penalties, reaching £150,000 for the worst breaches on larger properties. Beyond compliance, energy performance now materially affects commercial value: institutional investors and corporate tenants increasingly have their own minimum standards, lenders weight EPC ratings in commercial lending decisions, and a poorly rated unit takes longer to let and achieves less rent. The rating has moved from a compliance box to a valuation input.

**The legal position:** A valid EPC is required before a non-domestic property is marketed for sale or let, with the rating shown in advertising. Certificates are valid for ten years. Under the Energy Efficiency (Private Rented Property) Regulations 2015, it has been unlawful since April 2018 to grant a new lease on a commercial property rated F or G, and since April 2023 that prohibition extends to all existing commercial leases — meaning continuing to let a sub-standard property is itself a breach. Where the standard cannot be met, an exemption must be registered on the PRS Exemptions Register. Penalties are calculated on rateable value and reach £150,000 for breaches of more than three months on larger properties, alongside publication on the register.

**What happens, step by step:**
1. Scope the building — Floor area and building services determine the required assessment level, so we confirm both and quote a fixed price.
2. Survey and zone — The assessor measures the building and classifies each area by activity type, recording heating, cooling, ventilation and lighting.
3. SBEM modelling — A zoned model is built and calculated against the notional reference building to produce the rating.
4. Lodge and advise — The certificate is lodged within 48 hours, with recommendations prioritised by rating uplift and clear MEES advice.

**What the engineer checks / what is included:**
- Survey by an accredited non-domestic energy assessor at the correct level
- Zoned SBEM model built from actual building geometry and activity types
- Heating, cooling, ventilation, lighting and controls assessed and recorded
- Certificate production and lodgement on the national register within 48 hours
- Recommendation report prioritised by rating impact
- Plain-English commercial MEES position and next steps
- Advice on the measures with the best uplift per pound spent

**Prices:**

| Floor area | Price |
|---|---|
| Up to 50m² | £260.00 |
| 50–100m² | £330.00 |
| 100–250m² | £409.00 |

**When you need a commercial EPC:** You are marketing a commercial unit to let or sell; An existing lease continues on a property rated F or G — now unlawful; Your certificate is approaching or past ten years old; A fit-out has materially changed the building's heating, cooling or lighting; The current rating is a marginal E with no headroom; A lender, investor or corporate tenant has asked for current certification; You are planning an LED or plant upgrade and want a baseline to measure against; You hold no certificate, or cannot locate it on the register.

**Questions clients ask, and the answer:**
- **"What EPC rating does a commercial property need?"** — At least band E. Since April 2018 it has been unlawful to grant a new lease on an F or G rated commercial property, and since April 2023 that extends to all existing leases — so continuing to let a sub-standard unit is itself a breach.
- **"How much are the penalties?"** — They are calculated on rateable value and reach £150,000 for breaches of more than three months on larger properties, alongside publication of the non-compliance on the PRS Exemptions Register.
- **"Why is a commercial EPC more expensive than a domestic one?"** — Because the methodology is substantially more involved. SBEM builds a zoned model of the building with each area classified by activity type and every building service recorded, rather than applying a limited set of standard domestic inputs. It requires more survey time and a differently certified assessor.
- **"What improvements raise a commercial rating most?"** — LED lighting replacement is consistently the best value, particularly in retail and offices, followed by lighting controls such as occupancy detection and daylight dimming, then heating and cooling plant upgrades with proper zoning. Because SBEM weights services heavily, these usually beat fabric work per pound spent.
- **"Do we need a new EPC after a fit-out?"** — If the fit-out materially changed heating, cooling, ventilation or lighting, the existing certificate may no longer describe the building — and a fresh assessment is worth commissioning, especially if the original rating was a marginal E.
- **"Are all commercial assessors the same?"** — No. Assessors are certified at Levels 3, 4 and 5 depending on the complexity of a building's services. An assessment carried out below the level a building requires produces an invalid certificate, which is a genuine risk with unusually cheap quotes. We confirm the required level before attending.

### Asbestos Survey & Sample Testing
*Asbestos sampling and survey reports with UKAS-accredited laboratory analysis.*

**What it is:** Asbestos was used extensively in UK construction until it was fully banned in 1999, and any building constructed or refurbished before 2000 may contain it. Our surveyors identify suspected asbestos-containing materials, take controlled samples, and have them analysed by a UKAS-accredited laboratory. You receive a formal report identifying what was found, where it is, its condition, the risk it presents, and clear recommendations on whether to manage it in place or remove it.

**Why the client needs it:** Asbestos remains the single largest cause of work-related deaths in the UK, and the exposures causing deaths today happened decades ago — the latency between exposure and disease runs from fifteen to sixty years. The material is not dangerous while it is intact and undisturbed; it becomes dangerous when fibres are released, which is exactly what happens when someone drills, cuts, sands or breaks it without knowing it is there. That is why identification matters more than removal: most asbestos is safest left in place and properly managed, provided everyone who might disturb it knows precisely where it is.

**The legal position:** The Control of Asbestos Regulations 2012 impose a duty to manage asbestos in non-domestic premises, and that duty extends to the common parts of domestic buildings — the entrance halls, stairwells, corridors, lift shafts, boiler rooms and roof spaces of blocks of flats and HMOs. The dutyholder must take reasonable steps to find asbestos-containing materials, presume materials contain asbestos unless there is strong evidence otherwise, record their location and condition, assess the risk, prepare and implement a written management plan, review it regularly, and provide the information to anyone liable to disturb the material. Separately, Regulation 5 requires that no work is carried out that could disturb asbestos until a suitable and sufficient assessment has been made — which in practice means a refurbishment and demolition survey before intrusive work.

**What happens, step by step:**
1. Scope the survey — We establish the building's age, the work planned and whether you need a management or a refurbishment and demolition survey.
2. Survey and identify — The surveyor inspects the property and identifies suspected asbestos-containing materials by location and condition.
3. Controlled sampling — Samples are taken with the area protected, the material wetted to suppress fibres, and every sample point sealed afterwards.
4. Analysis and report — UKAS-accredited analysis confirms presence and fibre type, and your report, register and management plan framework follow within 48 hours.

**What the engineer checks / what is included:**
- Site survey by an experienced asbestos surveyor
- Identification of suspected asbestos-containing materials by location
- Controlled sampling with the area protected and sample points sealed
- UKAS-accredited laboratory analysis identifying presence and fibre type
- Condition and risk assessment for each material found
- Manage-in-place or removal recommendation with reasoning for each item
- Formal survey report with photographs and a location plan
- Asbestos register and management plan framework supplied

**Prices:**

| Samples collected | Price |
|---|---|
| 1 sample collected | £249.99 |
| 2 samples collected | £279.99 |
| 3 samples collected | £309.99 |
| 4 samples collected | £339.99 |
| 5 samples collected | £369.99 |

Refurbishment and demolition surveys, which are fully intrusive and require the area to be unoccupied, are quoted separately after scoping.

**When you need a survey:** The building was constructed or refurbished before the year 2000; You are the dutyholder for a non-domestic premises or the common parts of a block; Any refurbishment, conversion, rewire or demolition work is planned; Textured coatings such as Artex on ceilings or walls; Corrugated cement roofing on garages, sheds or outbuildings; Old vinyl floor tiles, particularly with black bitumen adhesive beneath; Insulating board around boilers, in airing cupboards or meter cupboards; Damaged or deteriorating material you suspect may contain asbestos; No asbestos register exists, or it has not been reviewed in over a year.

**Questions clients ask, and the answer:**
- **"Do I need an asbestos survey?"** — If the building was constructed or refurbished before 2000 and you are the dutyholder for a non-domestic premises or the common parts of a block of flats or HMO, then yes — the Control of Asbestos Regulations 2012 require you to take reasonable steps to find it. You also need one before any refurbishment or intrusive work in a pre-2000 building.
- **"What is the difference between a management survey and a refurbishment survey?"** — A management survey is non-destructive and supports normal occupation, locating materials that could be disturbed during ordinary use and maintenance. A refurbishment and demolition survey is fully intrusive, opening up the fabric to find hidden material, and is required before any intrusive work. The area must be unoccupied for it. Relying on a management survey before refurbishment is a common and serious mistake.
- **"Is asbestos always dangerous?"** — No. Asbestos in good condition, undisturbed and in a location where it will not be damaged, presents minimal risk. It becomes dangerous when fibres are released — by drilling, cutting, sanding, breaking or deterioration. That is why identification and management usually matter more than removal.
- **"Should I have it removed?"** — Often not. Removal is disruptive and, done badly, releases far more fibre than leaving intact material alone. Removal is right where material is damaged, in a location subject to frequent disturbance, a higher-risk product such as insulating board or lagging, or where planned work makes disturbance unavoidable. Our report explains the reasoning for each material rather than defaulting to removal.
- **"Does the duty to manage apply to my rented house?"** — The duty to manage applies to non-domestic premises and to the common parts of domestic buildings — so a block of flats or an HMO with shared halls, stairs and plant rooms is in scope. A single self-contained rented house is not, but you still have general duties to your tenants and to any contractor you send in, and you must not cause exposure through work you commission.
- **"How long do results take?"** — Laboratory analysis is completed and your formal report issued within 48 hours of sampling. Where a result is urgent — for example work already halted on site — tell us when you book and we will prioritise it.

---

## PART 11 — DAILY ROUTINE

1. Open Tasks and Jobs. Everything red first — clients waiting for a reply before anything else.
2. New enquiries: check → WhatsApp reply → quote email → WhatsApp with the quote. Copy the staff note to the team chat.
3. Accepted jobs: booking details → assign → engineer confirmation → booking confirmation.
4. Tomorrow's visits: reminder sent, access confirmed.
5. Yesterday's visits: marked complete, invoiced.
6. Payments: recorded or matched to the bank. Certificates: checked and sent.
7. Quotes to chase.
8. Before you finish: nothing red left unexplained; calls logged; notes on anything you are handing over.

## PART 12 — GLOSSARY

- **CP12 / GSC** — Gas Safety Certificate (landlord gas safety record). **CP42** — commercial catering gas certificate.
- **EICR** — Electrical Installation Condition Report. Result is Satisfactory or Unsatisfactory. Codes: **C1** danger present, **C2** potentially dangerous, **C3** improvement recommended (does not fail), **FI** further investigation. Any C1, C2 or FI makes it Unsatisfactory.
- **EPC** — Energy Performance Certificate, rated A–G.
- **FRA** — Fire Risk Assessment. **FSC** — Fire Safety Check (smoke and heat alarm certificate).
- **PAT** — Portable Appliance Testing.
- **HMO** — House in Multiple Occupation.
- **Consumer unit** — the fuse box.
- **Remedial** — work to put right what an inspection found.
- **No access** — the engineer attended and could not get in.
- **Certified** — the job is paid and the certificate has been sent. Finished.

---

## PROMPT TO PASTE INTO CLAUDE CHAT WITH THIS FILE

> Using the source material above, write the complete LCL Agent Training Manual and SOPs for a brand-new agent at Landlord Compliance London. Requirements:
> 1. Keep every fact, rule, price, email address, button name and message exactly as given — do not invent, soften, or add anything not in the source. If something is unclear, flag it in a "Questions for the manager" list at the end rather than guessing.
> 2. Structure: (1) Welcome and how the business works, (2) The rules that are never broken, (3) Contact details and which email is used for what, (4) The app tour, (5) Quote management SOP as numbered steps, (6) Job management SOP as numbered steps, (7) "What to do when…" decision tables, (8) Client communication with the exact message templates in copy-ready boxes, (9) What clients say and what they mean, (10) A one-page sheet per service: what it is, what happens at the inspection, what to ask the client, prices, validity, common client questions with the answer to give, (11) Daily checklist, (12) Glossary, (13) A 20-question quiz with answers to test a new agent.
> 3. Write in plain UK English that someone on their first day can follow with no prior knowledge. Short sentences. Explain every abbreviation the first time.
> 4. Never mention VAT in anything the agent would say to a client, never include a price in the WhatsApp that goes with a quote, never say "booked" before engineer confirmation, never promise same-day attendance.
> 5. Format it as a clean, printable document with a table of contents, numbered sections, tables, and checklists.
